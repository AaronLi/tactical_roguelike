'use strict';
// The hangar: where the squad spends the time between levels. A real place on the same map machinery as a level
// (G.Level.generateHub: walls, floor, lights, collision, rays), dressed by hand here:
//   the workshop (west): a bench for each officer, with a computer that opens the gunsmith, and a rack of the
//     gunsmith's parts for sale;
//   the store (middle): Vex at his counter (his till opens the whole stock), the kit for sale on pedestals,
//     a shelf of pouches, and a vending machine (medical gear and grenades; ammunition's at his till);
//   the stash (east, at the back, by the walkway to the lounge): your crates in a cage, and a console that opens your stash and loadout;
//   Nightjar Optronics (east, at the back, where the warehouse was): a special-operations outfitter behind a glass front,
//     night vision in glass cases (G.Shop.offers.nvg), a counter with their rep behind it;
//   the lounge (east, at the front, by the hangar door): sofas in front of a big screen showing the highlights of the
//     level just played (js/highlights.ts);
//   the helipad (out the front): hold F on the helicopter to climb in and ready up; hold F again to get out.
// Everything for sale can be bought by looking at it (F); the till, the bench computers, the console and the
// machines' screens open the same shop panels (js/shop.ts) a menu would. Nothing here is on the host: the hangar
// is the same on every machine, bought stock is a matter for each player, and where everyone stands is what
// they already tell the host.
// What never changes is a baked glTF scene (assets/models/scenes/hangar.glb, in the model bundle: tools/bake_hangar.mjs runs
// fixtures() below, js/range.ts and js/course.ts fixtures and the shell's fixed pieces (js/level.ts buildMesh) in a page and
// exports them); the game loads it once and adds what changes on its anchors (docs/hangar-data.md, the contract for the Bevy
// port). The solids (decorate) and what you can look at and press F on (the targets) stay here, as data.
// one thing for sale or to use (see addTarget); the fields vary with its kind
interface HangarTarget {
  id: string; kind: HangarKind; box: number[]; what?: HangarWhat; key?: string | null; sold?: boolean; reach?: number; // (reach: further, a TV on the wall)
  label?: string; title?: string; tab?: string; who?: string; mine?: boolean; run?: () => void; runText?: string; // (a use target: 'pos')
  disp?: THREE.Group; sign?: THREE.Mesh<any, any>; spin?: THREE.Object3D | null; signTop?: number; slot?: THREE.Group; idx?: number; // (a thing on show)
  vendOf?: HangarMachine; name?: string; price?: number; item?: GItem; // (one in a vending machine)
}
type HangarKind = 'pos' | 'buy' | 'heli';
type HangarWhat = 'gear' | 'part' | 'pouch' | 'ammo' | 'svc';
interface HangarRig { rig: Rig; x: number; z: number; yaw: number; vex?: boolean; y?: number; }
interface HangarVend { id: string; title: string; x: number; z: number; cols: number; rows: number; tab: string; }
interface HangarMachine { v: HangarVend; group: THREE.Group; key: string; slots: unknown[]; }
interface HangarShip { group: THREE.Group; rotors: THREE.Group[]; tail: THREE.Group; glow: THREE.MeshBasicMaterial; thrust: THREE.MeshBasicMaterial; }
interface HangarHeli extends HangarShip { rotor: THREE.Group; speed: number; spin: number; }
interface HangarState {
  root: THREE.Group; map: LvMap; targets: HangarTarget[]; items: HangarTarget[]; stands: HangarTarget[]; rigs: HangarRig[]; heli: HangarHeli | null; vend: HangarMachine[];
  hover: HangarTarget | null; hold: number; hl: THREE.Object3D | null; t: number; vexQuip: number; key: string;
  rosterKey: string | undefined; partStands: HangarTarget[] | undefined; precStands: HangarTarget[] | undefined; njStands?: HangarTarget[]; njPart?: HangarTarget | null; pouchSlots: THREE.Group[] | undefined;
  anchors?: Map<string, THREE.Object3D> | null; live?: THREE.Object3D[]; loadMs?: number; // (the baked scene's anchors, by name; what the live parts added; how long the baked scene took to parse)
}

const G_Hangar = (() => {
  const T = THREE;
  // ------------------------------------------------------------------------ the plan (metres)
  // Everything below is in the hall's own coordinates (its north wall at z 0..2, the range beyond it at negative z). The
  // map has the range's rows first: RZ is how far the hall sits from the map's origin. The scene hangs from a group set
  // RZ in (so meshes just use the hall's), and what's in the world (solids, targets, where you stand) adds it.
  const RZ = G.HANGAR_ROWS * 2;
  const HELI = { x: 26, z: 36.2, floor: 0.55, seats: 6 };
  const BENCH = (i: number) => ({ x: 2.1, x1: 3.25, z: 4 + i * 4 });
  const COUNTER = { x0: 22, x1: 28, z0: 4, z1: 5, h: 1.05 }, VEX = { x: 25, z: 2.9 };
  const STAND = { z: 12.5, xs: [20.5, 23, 25.5, 28, 30.5], top: 0.95 };
  const POUCH = { x0: 17.2, x1: 18.0, z0: 8.7, step: 1.12, n: 5 };
  const ZERO = { x0: 6.3, x1: 8.1, z0: 13.1, z1: 14.9, h: 0.9 }; // the zeroing table, in the middle of the workshop floor
  const PARTS = { x0: 12.9, z: 3.5, step: 1.15, n: 7, top: 0.9 }; // the gunsmith's parts, on pedestals along the north wall (east of the range's garage door)
  const VEND: HangarVend[] = [{ id: 'supply', title: 'FIELD SUPPLIES', x: 35.0, z: 12.2, cols: 3, rows: 3, tab: 'svc' }];
  const CONSOLE = { x0: 36.7, x1: 37.5, z0: 2.5, z1: 4.9 }; // the stash console, beside its cage, turned to the store
  const STACK = { x: 38.9, z: 3.4 }; // (the stash's cage, against the back wall)
  // Nightjar Optronics: the back of the east side (the warehouse's floor, x 40 to the east wall, the back wall to the lounge's),
  // behind a glass front with its doors (door: z from, to) onto the walkway by the stash. Its cases, [x, z, which way the
  // card faces (1: south)], in two rows either side of the aisle from the door to the counter at the far end; top: the
  // cases' tops; rep: where their rep stands, behind the counter
  const NJ = { x0: 40, x1: 50, z0: 2, z1: 14, door: [6.4, 9.0], cases: [[42.4, 4.4, 1], [45.2, 4.4, 1], [42.4, 11.2, -1], [45.2, 11.2, -1]] as [number, number, number][], top: 0.95, counter: { x0: 47.2, x1: 48.0, z0: 5.2, z1: 10.6, h: 1.0 }, rep: [48.75, 7.6] };
  // the lounge: the front of the east side, walled off from the warehouse (a gap by the store to walk through), a big
  // screen on the east wall (js/highlights.ts TVS) and two rows of sofas facing it
  const LOUNGE = { x0: 36, x1: 50, z0: 14.2, z1: 26, wall: 38, sofas: [{ x: 43.4, z0: 17.6, z1: 22.4 }, { x: 40.4, z0: 17.2, z1: 22.8 }], table: [45.0, 19.3, 46.0, 20.7, 0.42], bar: [37.0, 23.4, 38.0, 25.8, 1.0] };
  // the precision showcase: the front of the workshop side, by the hangar door, done up as a hunting superstore (Timberline
  // Outfitters): a plank floor inside log rails (a way in off the hall, and one from the workshop), six tree stumps (two rows of three) with the
  // scopes, the bipod and the match barrels for sale turning on them (G.Gunsmith.rollPrecision), fibreglass rockwork along the
  // front wall with a waterfall into a pond, a stuffed grizzly reared up on a boulder, pines, a canoe hung from the roof
  const OUT = { x0: 5.4, x1: 16.6, z0: 16.4, z1: 26, rows: [18.6, 21.6], xs: [7.6, 10.9, 14.2], top: 0.9, size: 0.9, rocks: 24.9, pond: [10.0, 23.0, 14.8, 25.4], bear: [7.0, 24.0], pines: [[15.9, 25.0], [6.1, 17.2]], door: [19.0, 21.2], back: 8.4 };
  const REACH = 3.2, HELI_REACH = 4.2, HOLD = 1.1;

  const S: HangarState = { root: null as unknown as THREE.Group, map: null as unknown as LvMap, targets: [], items: [], stands: [], rigs: [], heli: null, vend: [], hover: null, hold: 0, hl: null, t: 0, vexQuip: 0, key: '', rosterKey: undefined, partStands: undefined, precStands: undefined, pouchSlots: undefined };

  // The rockwork (fibreglass boulders stacked along the front wall, the bear's boulder, the pond's rim): each rock an
  // icosphere, placed, turned and stretched (its matrix, in the hall's coordinates), and its colour. From a seed of its own,
  // so what's drawn (outfitters) and the solids (decorate: rays meet each rock as drawn, js/world.ts hullOf) are the same.
  let ROCKS: { m: number[]; c: number }[] | null = null, ROCK_G: THREE.BufferGeometry | null = null;
  const rockG = () => ROCK_G || (ROCK_G = new THREE.IcosahedronGeometry(1, 1));
  function rockwork() {
    if (ROCKS) return ROCKS;
    const T = THREE, O = OUT, rnd = G.U.rng(0x70c4e5), cols = [0x9a8468, 0x8a7a66, 0xa89276, 0x7a7064, 0xb09a7c], at: number[][] = [], m4 = new T.Matrix4(), e = new T.Euler();
    for (let x = O.x0 + 0.3; x < O.x1; x += 0.9) for (let k = 0; k < 3; k++) at.push([x + (rnd() - 0.5) * 0.5, 0.35 + k * 0.85 + rnd() * 0.2, O.rocks + 0.55 + (rnd() - 0.5) * 0.3, 0.75 - k * 0.12 + rnd() * 0.25]);
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = rnd() * 0.7; at.push([O.bear[0] + Math.cos(a) * d, 0.2 + rnd() * 0.15, O.bear[1] + Math.sin(a) * d, 0.55 + rnd() * 0.25]); } // (the bear's boulder)
    for (let x = O.pond[0]; x <= O.pond[2]; x += 0.6) at.push([x, 0.15, O.pond[1] + 0.15, 0.32 + rnd() * 0.12]); // (the pond's rim)
    for (let z = O.pond[1]; z <= O.rocks; z += 0.6) for (const x of [O.pond[0], O.pond[2]]) at.push([x, 0.15, z, 0.32 + rnd() * 0.12]);
    return (ROCKS = at.map(([x, y, z, s]) => ({ m: m4.compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(e.set(rnd() * 3, rnd() * 3, rnd() * 3)), new T.Vector3(s * (0.9 + rnd() * 0.4), s * (0.7 + rnd() * 0.3), s * (0.8 + rnd() * 0.3))).toArray(), c: cols[Math.floor(rnd() * cols.length)] })));
  }

  // ------------------------------------------------------------------------ the solids (every machine's map has them)
  function decorate(map: LvMap) {
    const w = map.world, add = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o?: Record<string, unknown>) => G.World.add(w, G.World.box(x0, y0, z0 + RZ, x1, y1, z1 + RZ, Object.assign({ kind: 'prop' }, o || {})));
    for (let i = 0; i < 6; i++) { const b = BENCH(i); add(b.x, 0, b.z - 1.1, b.x1, 0.9, b.z + 1.1); }
    for (let i = 0; i < PARTS.n; i++) { const x = PARTS.x0 + i * PARTS.step; add(x - 0.36, 0, PARTS.z - 0.34, x + 0.36, 1.5, PARTS.z + 0.34); } // (a parts pedestal, and the air its part turns in)
    add(ZERO.x0, 0, ZERO.z0, ZERO.x1, ZERO.h + 0.05, ZERO.z1); // (the zeroing table)
    // the precision showcase: its stumps (and the air their pieces turn in), the rockwork, the pond, the bear on its boulder,
    // the pines, the log rails (gaps to walk in by: off the hall, and from the workshop)
    for (const z of OUT.rows) for (const x of OUT.xs) add(x - 0.44, 0, z - 0.44, x + 0.44, 1.5, z + 0.44);
    // (the rockwork: each rock as it's drawn for rays, and boxes fitted to it (20 cm columns) that stop you and that you don't climb; behind them
    // the wall, and the pond: you can't walk into it, and a round meets its water)
    const tri = (rockG().attributes.position as THREE.BufferAttribute).array, m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    for (const k of rockwork()) {
      m4.fromArray(k.m);
      const t: number[] = []; for (let i = 0; i < tri.length; i += 3) { v.set(tri[i], tri[i + 1], tri[i + 2]).applyMatrix4(m4); t.push(v.x, v.y, v.z + RZ); }
      const h = G.World.hullOf(t, [[0, -1, 0, 0]], { kind: 'prop', move: false });
      G.World.add(w, h);
      for (const b of G.World.fitBoxes(h, 0, 0.2)) G.World.add(w, G.World.box(b[0], b[1], b[2], b[3], b[4], b[5], { kind: 'prop', ray: false, nostep: true }));
    }
    add(OUT.x0, 0, OUT.rocks + 0.6, OUT.x1, 2.8, OUT.z1, { ray: false }); // (behind the rocks, between them and the wall)
    add(OUT.pond[0], 0, OUT.pond[1], OUT.pond[2], 0.5, OUT.pond[3], { ray: false }); add(OUT.pond[0], 0, OUT.pond[1], OUT.pond[2], 0.32, OUT.pond[3], { move: false });
    add(OUT.bear[0] - 0.5, 0.4, OUT.bear[1] - 0.5, OUT.bear[0] + 0.5, 2.85, OUT.bear[1] + 0.5); // (the bear, up on its boulder: the boulder's its rocks)
    for (const [x, z] of OUT.pines) add(x - 0.35, 0, z - 0.35, x + 0.35, 3.2, z + 0.35);
    add(OUT.back, 0, OUT.z0 - 0.1, OUT.x1, 0.95, OUT.z0 + 0.1);
    add(OUT.x1 - 0.1, 0, OUT.z0, OUT.x1 + 0.1, 0.95, OUT.door[0]); add(OUT.x1 - 0.1, 0, OUT.door[1], OUT.x1 + 0.1, 0.95, OUT.rocks);
    add(COUNTER.x0, 0, COUNTER.z0, COUNTER.x1, COUNTER.h, COUNTER.z1);
    add(COUNTER.x0 - 0.1, 0, 2, COUNTER.x0 + 0.1, 2.2, COUNTER.z1); add(COUNTER.x1 - 0.1, 0, 2, COUNTER.x1 + 0.1, 2.2, COUNTER.z1);
    add(COUNTER.x0, 0, 2, COUNTER.x1, 2.2, 2.45);
    if (G.Range) G.Range.decorate(map, add);
    for (const x of STAND.xs) add(x - 0.5, 0, STAND.z - 0.45, x + 0.5, 2.0, STAND.z + 0.45); // (a pedestal, and the air its piece hangs in)
    add(POUCH.x0, 0, POUCH.z0 - 0.2, POUCH.x1, 1.9, POUCH.z0 + POUCH.n * POUCH.step);
    for (const v of VEND) add(v.x, 0, v.z - 0.55, v.x + 1.1, 1.95, v.z + 0.55);
    add(CONSOLE.x0, 0, CONSOLE.z0, CONSOLE.x1, 1.2, CONSOLE.z1);
    add(STACK.x - 1.05, 0, STACK.z - 1.05, STACK.x + 1.05, 1.8, STACK.z + 1.05);
    // Nightjar's: the glass front either side of its doors, the cases (and the air their pieces turn in), the counter, the
    // shelves behind it
    add(NJ.x0 - 0.06, 0, NJ.z0, NJ.x0 + 0.06, 3.0, NJ.door[0]); add(NJ.x0 - 0.06, 0, NJ.door[1], NJ.x0 + 0.06, 3.0, NJ.z1);
    for (const [x, z] of NJ.cases) add(x - 0.72, 0, z - 0.52, x + 0.72, NJ.top + 0.85, z + 0.52);
    add(NJ.counter.x0 - 0.06, 0, NJ.counter.z0 - 0.05, NJ.counter.x1 + 0.04, NJ.counter.h, NJ.counter.z1 + 0.05);
    add(NJ.x1 - 0.67, 0, NJ.counter.z0 - 0.3, NJ.x1, 2.7, NJ.counter.z1 + 0.3);
    // the lounge: its wall, the sofas (seat and back), the coffee table, the snack bar
    const L = LOUNGE;
    add(L.wall, 0, L.z0 - 0.2, L.x1, 2.8, L.z0);
    for (const s of L.sofas) add(s.x - 0.45, 0, s.z0, s.x + 0.45, 0.9, s.z1);
    add(L.table[0], 0, L.table[1], L.table[2], L.table[4], L.table[3]);
    add(L.bar[0], 0, L.bar[1], L.bar[2], L.bar[4], L.bar[3]);
    // the helicopter: the cabin and nose, and the tail boom (above head height at its end, but there's no walking through it)
    add(HELI.x - 3.4, 0, HELI.z - 1.35, HELI.x + 2.4, 2.8, HELI.z + 1.35);
    add(HELI.x + 2.4, 1.5, HELI.z - 0.3, HELI.x + 8.3, 2.5, HELI.z + 0.3);
  }

  // ------------------------------------------------------------------------ drawing helpers
  const mats: Record<string, THREE.MeshStandardMaterial> = {};
  const M = (c: number, o?: THREE.MeshStandardMaterialParameters) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.15 }, o || {}))); };
  const box = (parent: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material) => {
    const m = new T.Mesh(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(m); return m;
  };
  const cyl = (parent: THREE.Object3D, r: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 14) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m; };
  function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  const fit = (g: CanvasRenderingContext2D, text: string, max: number) => { let s = 1; while (s < 60 && g.measureText(text).width > max) { s++; g.font = g.font.replace(/\d+px/, (n) => (parseInt(n) - 1) + 'px'); } };
  // a sign: lines of text on a coloured board (a line starting with ! is a warning, in orange). The name and the price
  // are as big as fit; the lines under them share one size, the smallest any of them needs.
  function signMat(lines: string[], w: number, h: number, bg: string, fg: string, sub?: string) {
    return new T.MeshBasicMaterial({ map: canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = lines.length, lh = h / n, text = (l: string) => (l[0] === '!' ? l.slice(1) : l);
      const ys = n === 1 ? [0.5] : n === 2 ? [0.33, 0.72] : lines.map((_, i) => (i + 0.5) / n);
      const want = n === 1 ? [0.5 * h] : n === 2 ? [0.42 * h, 0.28 * h] : lines.map((_, i) => (i < 2 ? 0.6 : 0.44) * lh);
      const size = (t: string, px: number, bold: boolean) => { g.font = `${bold ? 'bold ' : ''}${Math.round(px)}px sans-serif`; const m = g.measureText(t).width; return m > w - 24 ? Math.max(8, Math.floor(px * (w - 24) / m)) : Math.round(px); };
      const detail = lines.length > 2 ? Math.min(...lines.slice(2).map((l) => size(text(l), want[2], false))) : 0;
      lines.forEach((l, i) => {
        const warn = l[0] === '!', px = i >= 2 ? detail : size(text(l), want[i], i === 0);
        g.font = `${i === 0 ? 'bold ' : ''}${px}px sans-serif`; g.fillStyle = warn ? '#ff9a5a' : i && sub ? sub : fg;
        g.fillText(text(l), w / 2, h * ys[i]);
      });
    }) });
  }
  // a screen: a title, and a few lines
  function screenMat(title: string, lines: string[], w = 256, h = 160, color = '#7fe0ff') {
    return new T.MeshBasicMaterial({ map: canvasTex(w, h, (g) => {
      g.fillStyle = '#05121a'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(80,200,255,0.06)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.round(h * 0.2)}px monospace`; fit(g, title, w - 20); g.fillText(title, w / 2, h * 0.28);
      g.font = `${Math.round(h * 0.12)}px monospace`; g.fillStyle = '#a8e8ff';
      lines.forEach((ln, i) => g.fillText(ln, w / 2, h * (0.55 + i * 0.17)));
    }) });
  }
  const texCache = new Map<string, THREE.MeshBasicMaterial>();
  function iconMat(url: string) {
    if (!texCache.has(url)) { const t = new T.TextureLoader().load(url); t.anisotropy = 4; const m = new T.MeshBasicMaterial({ map: t, transparent: true }); m.userData.keep = true; texCache.set(url, m); }
    return texCache.get(url);
  }
  // take everything out of a group, signs' textures and all (the shared icon materials stay)
  function clear(g: THREE.Object3D) {
    while (g.children.length) {
      const c = g.children[0]; g.remove(c);
      c.traverse((o: THREE.Object3D & Record<string, any>) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m && !m.userData.keep) { if (m.map) m.map.dispose(); m.dispose(); } });
    }
  }
  const money = (n: number) => '¢' + G.U.fmt(n);

  // a product on display: a card with the item's icon, `s` metres per cell of it, and a tag under it
  function product(parent: THREE.Object3D, item: GItem, x: number, y: number, z: number, yaw: number, tag: THREE.Material | null, s = 0.13, tagMat: THREE.Material | null = null) {
    const [cw, ch] = G.Gear.size(item), w = Math.max(0.22, cw * s), h = Math.max(0.22, ch * s), g = new T.Group();
    g.position.set(x, y, z); g.rotation.y = yaw;
    const back = new T.Mesh(new T.BoxGeometry(w + 0.04, h + 0.04, 0.03), M(0x1b1e22)); back.position.z = 0; g.add(back);
    const ic = new T.Mesh(new T.PlaneGeometry(w, h), iconMat(G.Icons.of(item, cw, ch, false))); ic.position.z = 0.0165; g.add(ic);
    parent.add(g);
    if (tag) { const t = new T.Mesh(new T.PlaneGeometry(0.46, 0.17), tag); t.position.set(0, -h / 2 - 0.14, 0.02); g.add(t); }
    return g;
  }

  // ------------------------------------------------------------------------ what's for sale: one row per thing
  // A thing for sale or to use: its box (what you look at), what it says, and what F does.
  function addTarget(t: HangarTarget) { t.box = [t.box[0], t.box[1], t.box[2] + RZ, t.box[3], t.box[4], t.box[5] + RZ]; S.targets.push(t); return t; } // (boxes are said in the hall's coordinates, kept in the world's)
  const gearOf = (id: string) => G.Gear.DEFS[id];
  // what a piece of gear fits on that isn't part of the sale (a plate goes in a carrier, a face guard on a helmet)
  const needs = (d: GearDef) => (d.kind === 'plate' || d.kind === 'shoulder' || d.kind === 'groin' ? 'carrier not included' : d.kind === 'face' || d.kind === 'nvg' ? 'helmet not included' : d.kind === 'legs' ? 'belt not included' : null);
  // The piece on show, on its own. The same models the squad wears (js/rig.ts setKit makes them in the frames of a body):
  // built on a body that's thrown away, each part lifted out by what it is (helmet, face guard, carrier, belt, pack) and
  // set down where it hung. A plate isn't part of a carrier's model: it's drawn here, to stand beside it.
  const PLATE_COL: Record<string, number> = { 'p.soft': 0x5a6a78, 'p.steel': 0x3d4044, 'p.pe': 0xcfd2d6, 'p.ceramic': 0xb8a888, 'p.ceramic2': 0xd6cdb4 };
  function plateMesh(id: string, k = 1) {
    const g = new T.Group(), c = PLATE_COL[id] || 0x4a4f55;
    box(g, -0.14 * k, 0, -0.012 * k, 0.14 * k, 0.36 * k, 0.012 * k, M(c, { roughness: 0.5, metalness: 0.4 }));
    box(g, -0.115 * k, 0.02 * k, 0.012 * k, 0.115 * k, 0.34 * k, 0.017 * k, M(c, { roughness: 0.9 })); // (its face: a raised panel)
    return g;
  }
  const SHOW: Record<string, string[]> = { carrier: ['carrier'], helmet: ['helmet', 'face'], face: ['face'], shoulder: ['shoulder'], groin: ['groin'], legs: ['legs'], belt: ['belt'], pack: ['pack'] }, SCALE: Record<string, number> = { carrier: 1.45, helmet: 1.9, face: 2.1, shoulder: 1.5, groin: 2, legs: 1.1, belt: 1.7, pack: 1.5 };
  function showPiece(id: string) {
    const d = gearOf(id), O = (G.Shop.offers || {}) as ShopOffers, np = (d.pouches || []).length, root = new T.Group();
    if (d.kind === 'plate') { const p = plateMesh(id, 2.3); p.position.y = STAND.top + 0.14; p.rotation.x = -0.14; root.add(p); return { root, spin: null }; }
    const kit = d.kind === 'carrier' ? { carrier: id, plate: 0, cp: np } : d.kind === 'helmet' ? { helmet: id, face: O.faces && O.faces[id] || 0 }
      : d.kind === 'face' ? { helmet: 'h.fast', face: id } : d.kind === 'shoulder' ? { sh: id } : d.kind === 'groin' ? { gr: id } : d.kind === 'legs' ? { lg: id } : d.kind === 'belt' ? { belt: id, bp: np } : { pack: id };
    const rig = G.Rig.create({ style: 'tactical', bare: true, mannequin: true, look: { top: 'tshirt', topC: 0xb4bac0, pants: 'jeans', pantsC: 0x9aa1a8, eyes: 'none', gloves: 'none' }, seed: 5 });
    rig.setKit(kit); rig.root.updateMatrixWorld(true);
    const g = new T.Group();
    for (const m of rig.kitParts) {
      if (!SHOW[d.kind].includes(m.userData.part)) continue;
      const c = new T.Mesh((m as THREE.Mesh).geometry, (m as THREE.Mesh).material); m.updateWorldMatrix(true, false); m.matrixWorld.decompose(c.position, c.quaternion, c.scale); g.add(c);
    }
    // a plate that comes with a carrier stands beside it, in the same turning group (so they turn together)
    const pl = d.kind === 'carrier' && O.plates && O.plates[id];
    if (pl) {
      const b0 = new T.Box3().setFromObject(g), p = plateMesh(pl, 1);
      p.rotation.set(-0.12, Math.PI + 0.35, 0); // (its face to the front, leaning a little)
      p.position.set(b0.max.x + 0.2, b0.min.y, (b0.min.z + b0.max.z) / 2);
      g.add(p);
    }
    const bb = new T.Box3().setFromObject(g), ctr = bb.getCenter(new T.Vector3());
    g.position.set(-ctr.x, -bb.min.y, -ctr.z);
    const pivot = new T.Group(); pivot.add(g); pivot.scale.setScalar(SCALE[d.kind] || 1.5); pivot.position.y = STAND.top + 0.12; pivot.rotation.y = Math.PI; // (worn, its front's -z: turned to face the aisle)
    root.add(pivot);
    return { root, spin: pivot };
  }
  // A gunsmith's part on show, on its own: built on a gun it fits (in a slot it takes there), all but the part left
  // out. If it can't be (a receiver kit, a dot that sits on a riser), its card instead.
  // (size: how long it's drawn, its longest side; top: what it stands over. The showcase's are bigger: OUT)
  function partPiece(id: string, size = 0.5, top = PARTS.top) {
    const GS = G.Gunsmith, p = GS.PARTS[id], root = new T.Group(), pivot = new T.Group();
    root.add(pivot);
    // the guns it fits, and the build with it on each (the first that shows it is used: the models are baked glTF that may still be coming in, so this goes one gun at a time)
    const cands: { gid: string; b: Record<string, string>; slot: string }[] = [];
    for (const gid of GS.fits(p.mount)) {
      const b = GS.defaultBuild(gid), sl = GS.slotFor(gid, b, p);
      if (!sl) continue;
      b[sl.slot] = id; GS.prune(gid, b);
      if (b[sl.slot] !== id) continue;
      cands.push({ gid, b, slot: sl.slot });
    }
    const card = () => { product(root, G.Gear.partItem(id), 0, top + 0.24, 0, 0, null, 0.1); };
    const attempt = (i: number) => {
      if (i >= cands.length) return card();
      const c = cands[i], { group } = G.GunModels.display(GS.compile(c.gid, c.b)), keep: THREE.Mesh<any, any>[] = [];
      G.GunModels.whenReady(group, (ok) => {
        if (!ok) return attempt(i + 1);
        group.updateMatrixWorld(true);
        group.traverse((o: any) => { if (o.isMesh && o.userData.slot === c.slot) keep.push(o); });
        let g: THREE.Group | null = null;
        if (keep.length) {
          g = new T.Group();
          for (const m of keep) { const q = new T.Mesh(m.geometry, m.material); m.matrixWorld.decompose(q.position, q.quaternion, q.scale); m.material.userData.keep = true; g.add(q); } // (the guns' own materials: shared, kept)
        }
        group.traverse((o: any) => { if (o.isMesh && !keep.includes(o)) o.geometry.dispose(); });
        if (!g) return attempt(i + 1);
        const bb = new T.Box3().setFromObject(g), ctr = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
        g.position.copy(ctr).negate();
        const k = Math.min(4.5 * size / 0.5, size / Math.max(sz.x, sz.y, sz.z, 0.02));
        pivot.add(g); pivot.scale.setScalar(k); pivot.position.y = top + 0.08 + Math.min(Math.max(sz.y, sz.x, sz.z) * k / 2, size === 0.5 ? 1 : 0.3); // (the showcase's: lying long, not stood up on end)
        pivot.rotation.x = 0; pivot.rotation.y = Math.PI / 2; // (side on to the aisle to start)
      });
    };
    attempt(0);
    return { root, spin: pivot };
  }
  // what's on the sign: the name, the price, and everything that comes with it (or doesn't)
  function signFor(id: string, sold: boolean) {
    const d = gearOf(id), Sh = G.Shop, O = Sh.offers!, L = [d.name, sold ? 'SOLD' : money(Sh.gearPrice(id))];
    if (sold) return L;
    const pl = O.plates && O.plates[id] && gearOf(O.plates[id]), fc = O.faces && O.faces[id] && gearOf(O.faces[id]);
    if (d.kind === 'carrier') {
      if (d.molle) L.push('comes with: ' + Sh.issued(d));
      if (pl) L.push('plate included: ' + pl.name); else if (d.plate) L.push('!plate pocket: plate not included');
    } else if (d.kind === 'helmet') {
      if (fc) L.push('face guard included: ' + fc.name); else if (d.face) L.push('!face guard not included');
    } else if (d.kind === 'belt') L.push('comes with: ' + Sh.issued(d));
    else if (d.kind === 'pack') { const [w, h] = d.grids![0]; L.push(`holds ${w}×${h}`); }
    else if (needs(d)) L.push('!' + needs(d));
    return L;
  }

  // ------------------------------------------------------------------------ the baked scene (docs/hangar-data.md)
  // What never changes is baked: the hall's fittings (the floor's markings, the signs hung over it, the light fittings), the
  // workshop's benches, Timberline's rockwork, stumps and the rest of its corner, Vex's counter, pedestals, shelves and
  // machine, the stash's console and cage, Nightjar's glass front, cases and counter, the lounge, the helipad, the range's
  // fixed structure, and the shell's own fixtures (the floor, the ceiling, the roof, the lamps' fittings, the roller doors:
  // js/leveldesc.ts hf, js/levelview.ts build hubFixed). tools/bake_hangar.mjs runs fixtures() below in a page and writes the scene to
  // assets/models/scenes/hangar.glb (in the model bundle); the game parses it once (load) and draws a copy of it on each
  // visit (enter), adding what changes (live: the stock, the signs that say what it is, the people, the helicopter, the
  // screens with names on them, the range's targets and screens, the TVs) on its anchors: empties named a_<kind>_<i>, their
  // userData { anchor: kind, i } (the file's extras).
  const FILE = 'assets/models/scenes/hangar.glb';
  let BAKED: THREE.Object3D | null = null, loadP: Promise<boolean> | null = null, loadMs = 0;
  /** Parses the baked hangar (once; the bundle must be in: js/modelbundles.ts). Resolves to whether it's there. */
  function load(): Promise<boolean> {
    if (loadP) return loadP;
    const t0 = performance.now();
    return (loadP = G.Models.loadFile(FILE).then((scene: THREE.Object3D) => { BAKED = prep(scene); loadMs = performance.now() - t0; S.loadMs = Math.round(loadMs); return true; },
      (e: any) => { console.error('[hangar] ' + FILE + ': ' + (e && e.message || e)); loadP = null; return false; }));
  }
  // a quantised attribute (normals, UVs: tools/model_emit.mjs compression) as float32 (what G.LevelView.batchStatic batches)
  function floatAttr(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
    const n = a.count, s = a.itemSize, f = new Float32Array(n * s);
    for (let i = 0; i < n; i++) { f[i * s] = a.getX(i); if (s > 1) f[i * s + 1] = a.getY(i); if (s > 2) f[i * s + 2] = a.getZ(i); if (s > 3) f[i * s + 3] = a.getW(i); }
    return new T.BufferAttribute(f, s);
  }
  // The loaded scene made what the code drew: float attributes; what glTF has no word for, from the extras the bake wrote
  // (a node's layers, a material's depth writing, polygon offset, alpha test, its picture's anisotropy: bakeExtras); the
  // shell's solid meshes cast a weapon light's shadow, as js/render.ts setLevel has a level's; every material kept (shared by
  // every visit: js/render.ts clearLevel throws away a level's own).
  function prep(scene: THREE.Object3D) {
    const root = scene.getObjectByName('hangar');
    if (!root) throw new Error('no node "hangar"');
    root.removeFromParent();
    const mats = new Set<THREE.Material>(), shell = root.getObjectByName('shell');
    root.traverse((o: any) => {
      if (o.userData.layers) o.layers.mask = o.userData.layers;
      if (!o.isMesh) return;
      const g = o.geometry as THREE.BufferGeometry;
      for (const [n, a] of Object.entries(g.attributes)) if (!((a as any).array instanceof Float32Array) || (a as any).isInterleavedBufferAttribute) g.setAttribute(n, floatAttr(a as THREE.BufferAttribute));
      o.userData.keepMat = true;
      mats.add(o.material);
    });
    for (const m of mats as Set<THREE.Material & { map?: THREE.Texture | null }>) {
      const x = m.userData.rt; if (!x) continue;
      m.transparent = !!x.tr; m.depthWrite = x.dw !== 0; m.alphaTest = x.at || 0;
      if (x.po) { m.polygonOffset = true; m.polygonOffsetFactor = x.po[0]; m.polygonOffsetUnits = x.po[1]; }
      if (x.an && m.map) m.map.anisotropy = x.an;
      if (x.op != null) m.opacity = x.op;
      m.needsUpdate = true;
    }
    if (shell) shell.traverse((o: any) => { if (o.isMesh) o.castShadow = !o.material.transparent && !o.material.alphaTest; });
    return root;
  }
  // an anchor (bake time): an empty where the game adds something, named for it
  function anchor(r: THREE.Object3D, kind: string, i: number | null, x: number, y: number, z: number, ry = 0, extra?: Record<string, unknown>) {
    const a = new T.Object3D(); a.name = 'a_' + kind + (i == null ? '' : '_' + i); a.position.set(x, y, z); a.rotation.y = ry;
    a.userData = Object.assign({ anchor: kind }, i == null ? {} : { i }, ry ? { ry } : {}, extra || {}); r.add(a); return a; // (ry in the extras too: a node's turn, read back as Euler angles, may come out as another set)
  }
  // where an anchor is (run time; the hall's coordinates): the empty itself
  const warned = new Set<string>();
  function at(kind: string, i?: number): THREE.Object3D {
    const n = 'a_' + kind + (i == null ? '' : '_' + i), a = S.anchors && S.anchors.get(n);
    if (a) return a;
    if (!warned.has(n)) { warned.add(n); console.error('[hangar] no anchor ' + n + ' (the baked hangar: npm run bake:hangar)'); }
    return new T.Object3D();
  }

  // ------------------------------------------------------------------------ building the scene
  function enter(map: LvMap) {
    leave();
    S.map = map; S.targets = []; S.items = []; S.stands = []; S.rigs = []; S.vend = []; S.t = 0; S.hold = 0; S.vexQuip = 3; S.key = ''; S.rosterKey = rosterKey();
    if (!BAKED) console.error('[hangar] the baked hangar is not loaded (' + FILE + '): only what changes is drawn');
    S.root = (BAKED ? BAKED.clone() : new T.Group()) as THREE.Group; S.root.position.set(0, 0, RZ);
    S.anchors = new Map(); S.root.traverse((o) => { if (o.userData.anchor) S.anchors!.set(o.name, o); });
    G.R.levelRoot.add(S.root);
    workshop(); outfitters(); store(); stash(); nightjar(); helicopter(); if (G.Range) G.Range.build(S.root, S, { box, M, signMat, canvasTex, addTarget, at }); outline();
    if (G.Highlights) G.Highlights.mount(S.root, { addTarget, at }); // (the TVs, showing the level just played, F to record it: js/highlights.ts)
    refresh(true);
    batch();
  }
  // The baked part, drawn (bake time only: tools/bake_hangar.mjs calls this in a page, on the hangar's map, and exports what it
  // returns). Each part of the hall a group of its own (zones, workshop, outfitters, store, stash, nightjar, lounge, helipad,
  // range, course), in the hall's coordinates under the root (set RZ in); the anchors among them.
  function fixtures(map: LvMap) {
    const root = new T.Group(); root.name = 'hangar'; root.position.z = RZ;
    const sec = (name: string) => { const g = new T.Group(); g.name = name; root.add(g); return g; };
    S.map = map;
    zonesFixed(sec('zones')); workshopFixed(sec('workshop')); outfittersFixed(sec('outfitters')); storeFixed(sec('store')); stashFixed(sec('stash')); nightjarFixed(sec('nightjar')); loungeFixed(sec('lounge')); helipadFixed(sec('helipad'));
    if (G.Range) G.Range.fixtures(sec('range'), sec('course'), { box, M, signMat, canvasTex, anchor });
    if (G.Highlights) G.Highlights.TVS.forEach(([x, y, z, ry, w]: number[], i: number) => anchor(root.getObjectByName('lounge')!, 'tv', i, x, y, z, ry, { w })); // (the TVs: js/highlights.ts mount)
    return root;
  }
  // The hall's fixtures and what's added to them (the floor's markings, the benches, counters, shelves, the stash's cage,
  // the rails, the bear and the canoe, the range's lines and posts...) drawn a BatchedMesh a material, as a level's are
  // (js/levelview.ts batchStatic): about half the hangar's draw calls. Not anything that's kept hold of to be moved or changed
  // later, nor what's under it: what's on show and turning, its sign, the vending machines' slots, the pouch shelf, the
  // helicopter (its rotors), the people, the range's plates, carriers and screens, the course's stage, the TVs.
  //   (G.LevelView.batchStatic leaves alone anything with a material of its own, as a sign's or a screen's is.)
  function batch() {
    const keep = new Set<THREE.Object3D>(), hold = (o: unknown, d = 0) => {
      if (!o || typeof o !== 'object' || d > 2) return;
      if ((o as THREE.Object3D).isObject3D) { keep.add(o as THREE.Object3D); return; }
      for (const v of Array.isArray(o) ? o : Object.values(o)) if (v && typeof v === 'object') hold(v, d + 1);
    };
    for (const t of S.targets) hold(t);
    hold(S.rigs.map((r) => r.rig.root)); hold(S.vend); hold(S.heli); hold(S.pouchSlots); hold(S.hl); hold(S.live);
    if (G.Range) { hold(G.Range.S.tg); hold(G.Range.S.lanes); hold(G.Range.S.live); }
    if (G.Course) { const C = G.Course.S; hold([C.grp, C.tg, C.board, C.screens, C.live]); }
    if (G.Highlights && (G.Highlights as any).P) hold((G.Highlights as any).P.tvs);
    keep.delete(S.root);
    G.LevelView.batchStatic(S.root, keep);
  }
  function leave() {
    if (G.Range) G.Range.leave();
    if (G.Highlights) G.Highlights.unmount();
    if (S.root && S.root.parent) S.root.parent.remove(S.root);
    S.root = null as unknown as THREE.Group; S.map = null as unknown as LvMap; S.targets = []; S.items = []; S.rigs = []; S.heli = null; S.hover = null; S.njStands = []; S.njPart = null; S.anchors = null; S.live = [];
  }
  const rosterKey = () => Object.keys(G.Game.roster || {}).sort().join(',');
  // what the live parts added that nothing else keeps hold of (batch: not to be batched)
  const live = <O extends THREE.Object3D>(o: O) => { (S.live || (S.live = [])).push(o); return o; };

  // floor markings and the signs hung over each part of the hall (all baked)
  function zonesFixed(r: THREE.Object3D) {
    const stripe = (x0: number, z0: number, x1: number, z1: number, c: number) => { const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), new T.MeshBasicMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); r.add(m); };
    for (const x of [16, 36]) for (let z = 3; z < 26; z += 1.2) stripe(x - 0.06, z, x + 0.06, z + 0.6, 0xe8c030); // (dashed yellow between the three parts)
    for (let x = 18; x < 34; x += 1.2) stripe(x, 26.7, x + 0.6, 26.86, 0x303438);
    const hang = (text: string, sub: string, x: number, z: number, color: string) => {
      const m = new T.Mesh(new T.PlaneGeometry(4.2, 0.95), signMat([text, sub], 512, 128, '#0f1215', color, '#cfd6dc'));
      m.position.set(x, 3.15, z); r.add(m);
      const b = m.clone(); b.rotation.y = Math.PI; b.position.z = z - 0.02; r.add(b);
      for (const dx of [-1.9, 1.9]) box(r, x + dx - 0.015, 3.5, z - 0.01, x + dx + 0.015, 4, z + 0.01, M(0x30343a));
    };
    hang('WORKSHOP', 'a bench for each of you', 9, 7.5, '#ffb43a');
    hang('STORE', 'look at it, press F', 26, 8.2, '#58b8ff');
    hang('LOUNGE', 'the highlights, on the big screen', 43, 14.6, '#ff7ac8');
    // light fittings over the hall (the real lights are in the map: these are what they hang from)
    for (const L of S.map.lights || []) { if (L.porch || L.kind) continue; box(r, L.x - 0.45, 3.82, L.z - RZ - 0.12, L.x + 0.45, 3.96, L.z - RZ + 0.12, new T.MeshBasicMaterial({ color: 0xfff6e0 })); }
  }

  // ---- the workshop: six benches, a computer on each, and the gunsmith's parts on the wall
  function workshopFixed(r: THREE.Object3D) {
    for (let i = 0; i < 6; i++) {
      const b = BENCH(i);
      box(r, b.x, 0, b.z - 1.1, b.x1, 0.84, b.z + 1.1, M(0x4a4f55));                  // the cabinet
      box(r, b.x - 0.02, 0.84, b.z - 1.15, b.x1 + 0.1, 0.9, b.z + 1.15, M(0x9a7a50, { roughness: 0.6 })); // the top
      box(r, b.x, 0.9, b.z - 1.1, b.x + 0.1, 1.45, b.z + 1.1, M(0x3b3f44));           // the splashback
      for (const dz of [-0.7, 0, 0.7]) box(r, b.x + 0.12, 0.2, b.z + dz - 0.3, b.x1 + 0.01, 0.78, b.z + dz + 0.3, M(0x363a3f)); // drawers
      // the computer: a monitor on the top, turned to whoever stands at the bench (its screen says whose it is: workshop)
      box(r, b.x + 0.2, 0.9, b.z - 0.12, b.x + 0.5, 0.98, b.z + 0.12, M(0x25282c));
      box(r, b.x + 0.34, 0.98, b.z - 0.03, b.x + 0.4, 1.12, b.z + 0.03, M(0x25282c));
      box(r, b.x + 0.3, 1.1, b.z - 0.34, b.x + 0.38, 1.42, b.z + 0.34, M(0x16181a));
      // a vice, a lamp and a few parts about
      box(r, b.x + 0.65, 0.9, b.z + 0.55, b.x + 0.95, 1.0, b.z + 0.85, M(0x6b7076, { metalness: 0.6 }));
      box(r, b.x + 0.7, 1.0, b.z + 0.62, b.x + 0.9, 1.08, b.z + 0.78, M(0x6b7076, { metalness: 0.6 }));
      box(r, b.x + 0.5, 0.9, b.z - 0.85, b.x + 1.0, 0.94, b.z - 0.45, M(0x2a3a2a));
      const lamp = new T.Mesh(new T.ConeGeometry(0.1, 0.12, 12, 1, true), M(0xcfa030, { side: T.DoubleSide })); lamp.position.set(b.x + 0.45, 1.72, b.z + 0.9); lamp.rotation.z = Math.PI; r.add(lamp);
      box(r, b.x + 0.44, 0.95, b.z + 0.89, b.x + 0.46, 1.65, b.z + 0.91, M(0x303438));
      // a pegboard of tools above it
      box(r, 2.02, 1.5, b.z - 1.0, 2.1, 2.5, b.z + 1.0, M(0x5a4a38));
      for (let k = 0; k < 6; k++) box(r, 2.1, 1.7 + (k % 3) * 0.25, b.z - 0.8 + k * 0.3, 2.14, 1.9 + (k % 3) * 0.25, b.z - 0.76 + k * 0.3, M(k % 2 ? 0x9aa0a6 : 0xb04a2a));
      anchor(r, 'bench', i, b.x, 0, b.z, 0, { x1: b.x1 }); // (its screen and nameplate: whose bench it is)
    }
    // the zeroing table: a shooting bench with a rest on it and a screen drawing a round's path against the line of sight
    {
      const Z = ZERO, cx = (Z.x0 + Z.x1) / 2, cz = (Z.z0 + Z.z1) / 2;
      box(r, Z.x0, Z.h - 0.06, Z.z0, Z.x1, Z.h, Z.z1, M(0x6a5a44, { roughness: 0.6 }));
      for (const [x, z] of [[Z.x0 + 0.08, Z.z0 + 0.08], [Z.x1 - 0.08, Z.z0 + 0.08], [Z.x0 + 0.08, Z.z1 - 0.08], [Z.x1 - 0.08, Z.z1 - 0.08]]) box(r, x - 0.04, 0, z - 0.04, x + 0.04, Z.h - 0.06, z + 0.04, M(0x3b3f44));
      box(r, cx - 0.12, Z.h, Z.z1 - 0.55, cx + 0.12, Z.h + 0.12, Z.z1 - 0.25, M(0x6b6a4a, { roughness: 1 })); // (a sandbag rest)
      box(r, cx - 0.1, Z.h, Z.z0 + 0.25, cx + 0.1, Z.h + 0.1, Z.z0 + 0.5, M(0x6b6a4a, { roughness: 1 }));
      box(r, Z.x0 + 0.15, Z.h, cz - 0.05, Z.x0 + 0.3, Z.h + 0.35, cz + 0.05, M(0x25282c)); // (the screen's stand)
      const scr = new T.Mesh(new T.PlaneGeometry(0.9, 0.5), new T.MeshBasicMaterial({ map: canvasTex(360, 200, (g) => {
        g.fillStyle = '#05121a'; g.fillRect(0, 0, 360, 200);
        g.fillStyle = '#ffb43a'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText('ZEROING', 180, 28);
        g.strokeStyle = '#3a5060'; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(20, 110); g.lineTo(340, 110); g.stroke(); g.setLineDash([]);
        g.strokeStyle = '#ffb43a'; g.lineWidth = 3; g.beginPath();
        for (let x = 0; x <= 320; x += 4) { const d = x / 320, y = 128 - 70 * d * 1.9 + 120 * d * d * 1.9; x ? g.lineTo(20 + x, y) : g.moveTo(20, y); }
        g.stroke(); g.fillStyle = '#a8e8ff'; g.font = '15px monospace'; g.fillText('F: zero your sights', 180, 182);
      }) }));
      scr.position.set(Z.x0 + 0.24, Z.h + 0.55, cz); scr.rotation.y = Math.PI / 2; r.add(scr);
      const back = new T.Mesh(new T.BoxGeometry(0.03, 0.54, 0.94), M(0x16181a)); back.position.set(Z.x0 + 0.22, Z.h + 0.55, cz); r.add(back);
    }
    // the gunsmith's parts: a pedestal for each (the part turning on top and its sign on the front: workshop), the name over
    // them on the wall behind
    const ps = new T.Mesh(new T.PlaneGeometry(2.6, 0.5), signMat(['GUNSMITH PARTS', 'bought into your stash'], 512, 100, '#101418', '#ffb43a', '#cfd6dc'));
    ps.position.set(PARTS.x0 + (PARTS.n - 1) * PARTS.step / 2, 2.6, 2.02); r.add(ps);
    for (let i = 0; i < PARTS.n; i++) {
      const x = PARTS.x0 + i * PARTS.step, z = PARTS.z, top = PARTS.top;
      box(r, x - 0.48, 0, z - 0.46, x + 0.48, 0.08, z + 0.46, M(0x30353b));
      box(r, x - 0.46, 0.08, z - 0.44, x + 0.46, 0.092, z + 0.44, M(0xe8c030, { emissive: 0x302400 }));
      box(r, x - 0.32, 0.08, z - 0.3, x + 0.32, top - 0.03, z + 0.3, M(0x3a3f45, { roughness: 0.5 }));
      box(r, x - 0.35, top - 0.03, z - 0.33, x + 0.35, top, z + 0.33, M(0xe8c030, { emissive: 0x302400 }));
      anchor(r, 'part', i, x, 0, z);
    }
  }
  function workshop() {
    const r = S.root, ids = Object.keys(G.Game.roster || {}).sort();
    for (let i = 0; i < 6; i++) {
      const a = at('bench', i), x = a.position.x, z = a.position.z, x1 = a.userData.x1 as number, owner = ids[i] ? G.Game.roster[ids[i]] : null, mine = ids[i] === G.Net.myId;
      const scr = new T.Mesh(new T.PlaneGeometry(0.62, 0.3), screenMat('GUNSMITH', [owner ? owner.name.toUpperCase() : 'FREE BENCH', mine ? 'F: work on your guns' : owner ? 'their bench' : ''], 256, 124));
      scr.rotation.y = Math.PI / 2; scr.position.set(x + 0.385, 1.26, z); r.add(live(scr));
      // the nameplate on the front edge
      const np = new T.Mesh(new T.PlaneGeometry(0.7, 0.16), signMat([owner ? owner.name : 'free bench'], 256, 64, mine ? '#17331f' : '#16181c', mine ? '#7dff9a' : '#c8d0d8'));
      np.rotation.y = Math.PI / 2; np.position.set(x1 + 0.012, 0.74, z); r.add(live(np));
      addTarget({ id: 'bench' + i, kind: 'pos', box: [x, 0.9, z - 0.55, x1, 1.5, z + 0.55], label: owner ? (mine ? 'your bench' : owner.name + "'s bench") : 'a free bench', who: ids[i], tab: 'gunsmith', title: 'the gunsmith', mine });
    }
    { const Z = ZERO; addTarget({ id: 'zero', kind: 'pos', box: [Z.x0, Z.h, Z.z0, Z.x1, Z.h + 0.9, Z.z1], label: 'the zeroing table', tab: 'zero', title: 'the zeroing table' }); }
    // the gunsmith's parts this visit: the part turning on its pedestal, its sign on the front
    S.partStands = [];
    for (let i = 0; i < PARTS.n; i++) {
      const p = at('part', i).position, x = p.x, z = p.z;
      const sign = new T.Mesh(new T.PlaneGeometry(0.6, 0.4), new T.MeshBasicMaterial({ color: 0x000000 })); sign.position.set(x, 0.5, z + 0.302); r.add(sign);
      const disp = new T.Group(); disp.position.set(x, 0, z); r.add(disp);
      const tg = addTarget({ id: 'part' + i, kind: 'buy', box: [x - 0.4, 0.1, z - 0.36, x + 0.4, 1.6, z + 0.36], what: 'part', key: null, sign, disp, spin: null });
      S.partStands.push(tg); S.items.push(tg);
    }
  }

  // ---- the precision showcase (OUT): a hunting superstore's corner. What's for sale is on the stumps (refresh: S.precStands).
  function outfittersFixed(r: THREE.Object3D) {
    const O = OUT, rnd = G.U.rng(0x7b3a5e);
    // a log from (x0, y0, z0) to (x1, y1, z1), bark on it
    const bark = M(0x5a3f28, { roughness: 1 }), barkD = M(0x46301e, { roughness: 1 }), up = new T.Vector3(0, 1, 0);
    const log = (a: [number, number, number], b: [number, number, number], rad: number, mat: THREE.Material = bark) => {
      const A = new T.Vector3(...a), B = new T.Vector3(...b), m = new T.Mesh(new T.CylinderGeometry(rad, rad, A.distanceTo(B), 10), mat);
      m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(up, B.clone().sub(A).normalize()); r.add(m); return m;
    };
    // the plank floor
    const planks = canvasTex(512, 512, (g, w, h) => {
      for (let i = 0; i < 8; i++) { const v = 0.85 + rnd() * 0.3; g.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(104 * v)},${Math.round(62 * v)})`; g.fillRect(0, i * 64, w, 64); g.fillStyle = 'rgba(40,20,5,0.55)'; g.fillRect(0, i * 64, w, 3); for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(60,30,10,${0.08 + rnd() * 0.1})`; g.fillRect(0, i * 64 + 6 + rnd() * 50, w, 1.5); } g.fillStyle = 'rgba(40,20,5,0.5)'; g.fillRect(rnd() * w, i * 64, 3, 64); }
    });
    planks.wrapS = planks.wrapT = T.RepeatWrapping; planks.repeat.set((O.x1 - O.x0) / 3, (O.z1 - O.z0) / 3);
    const fl = new T.Mesh(new T.PlaneGeometry(O.x1 - O.x0, O.z1 - O.z0), new T.MeshStandardMaterial({ map: planks, roughness: 0.8 }));
    fl.rotation.x = -Math.PI / 2; fl.position.set((O.x0 + O.x1) / 2, 0.014, (O.z0 + O.z1) / 2); r.add(fl);
    // the log rails: posts, two rails between each, along the north side (from the gap by the workshop) and the east (a gap to walk in)
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.6));
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; log([x, 0, z], [x, 1.05, z], 0.07, barkD); }
      for (const y of [0.45, 0.88]) log([x0, y, z0], [x1, y, z1], 0.055);
    };
    rail(O.back, O.z0, O.x1, O.z0); rail(O.x1, O.z0, O.x1, O.door[0]); rail(O.x1, O.door[1], O.x1, O.rocks);
    // the rockwork along the front wall: fibreglass boulders stacked to above head height, sandstone and grey, a pine each end
    const rocks = rockwork(), rk = new T.InstancedMesh(rockG(), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), rocks.length), m4 = new T.Matrix4(), col = new T.Color();
    rocks.forEach((k, i) => { rk.setMatrixAt(i, m4.fromArray(k.m)); rk.setColorAt(i, col.setHex(k.c)); });
    rk.name = 'rockwork'; r.add(rk);
    // the waterfall down the rocks into the pond, the pond, a lily pad or two
    const fx = (O.pond[0] + O.pond[2]) / 2 + 0.4;
    const fall = new T.Mesh(new T.PlaneGeometry(0.8, 2.3), new T.MeshStandardMaterial({ color: 0xcfe8f0, emissive: 0x4a6a78, transparent: true, opacity: 0.7, roughness: 0.1 })); fall.position.set(fx, 1.5, O.rocks + 0.05); r.add(fall);
    const pond = new T.Mesh(new T.PlaneGeometry(O.pond[2] - O.pond[0] - 0.4, O.rocks - O.pond[1] - 0.2), new T.MeshStandardMaterial({ color: 0x2a5a6a, roughness: 0.05, metalness: 0.3 })); pond.rotation.x = -Math.PI / 2; pond.position.set((O.pond[0] + O.pond[2]) / 2, 0.32, (O.pond[1] + O.rocks) / 2 + 0.1); r.add(pond);
    const foam = new T.Mesh(new T.CircleGeometry(0.5, 16), new T.MeshBasicMaterial({ color: 0xe8f4f8, transparent: true, opacity: 0.6 })); foam.rotation.x = -Math.PI / 2; foam.position.set(fx, 0.33, O.rocks - 0.2); r.add(foam);
    for (const [x, z] of [[O.pond[0] + 0.9, O.pond[1] + 0.8], [O.pond[0] + 1.6, O.pond[1] + 1.3]]) { const lp = new T.Mesh(new T.CircleGeometry(0.16, 10), M(0x3a6a2a)); lp.rotation.x = -Math.PI / 2; lp.position.set(x, 0.335, z); r.add(lp); }
    // the pines: stacked cones on a short trunk
    for (const [x, z] of O.pines) {
      log([x, 0, z], [x, 0.7, z], 0.1, barkD);
      for (let k = 0; k < 4; k++) { const c = new T.Mesh(new T.ConeGeometry(0.75 - k * 0.15, 1.1, 9), M([0x2e4a2a, 0x355432, 0x2a4426][k % 3], { roughness: 1, flatShading: true })); c.position.set(x, 0.95 + k * 0.6, z); r.add(c); }
    }
    // the bear: a stuffed grizzly reared up on its hind legs on its boulder, arms up, claws out, turned to the way in
    {
      const b = new T.Group(), fur = M(0x5a3a22, { roughness: 1 }), furL = M(0x7a5434, { roughness: 1 }), dark = M(0x1a1410, { roughness: 0.4 }), claw = M(0xd8ceb4, { roughness: 0.5 });
      const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); b.add(m); return m; };
      const limb = (a: [number, number, number], c: [number, number, number], rad: number, mat: THREE.Material = fur) => { const A = new T.Vector3(...a), B = new T.Vector3(...c), m = new T.Mesh(new T.CylinderGeometry(rad, rad * 1.1, A.distanceTo(B), 10), mat); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(up, B.clone().sub(A).normalize()); b.add(m); };
      const sph = (rad: number) => new T.SphereGeometry(rad, 14, 10);
      for (const s of [-1, 1]) { limb([s * 0.22, 0.05, 0.05], [s * 0.22, 0.75, 0], 0.17); part(new T.BoxGeometry(0.26, 0.1, 0.36), fur, s * 0.22, 0.05, 0.12); }
      part(sph(0.44), fur, 0, 0.85, 0, 1, 0.85, 0.85); // the haunches
      part(sph(0.46), fur, 0, 1.45, 0.02, 1, 1.45, 0.85); // the body
      part(sph(0.34), furL, 0, 1.4, 0.2, 0.85, 1.1, 0.5); // the lighter chest
      part(sph(0.32), fur, 0, 1.98, -0.1, 1.2, 0.8, 1); // the shoulder hump
      part(sph(0.27), fur, 0, 2.18, 0.12); // the head
      part(new T.CylinderGeometry(0.09, 0.12, 0.24, 10), furL, 0, 2.12, 0.36).rotation.x = Math.PI / 2; // the muzzle
      part(sph(0.045), dark, 0, 2.15, 0.48); // the nose
      for (const s of [-1, 1]) { part(sph(0.07), fur, s * 0.18, 2.4, 0.06); part(sph(0.028), dark, s * 0.1, 2.25, 0.33); } // ears, eyes
      part(new T.BoxGeometry(0.16, 0.05, 0.12), M(0x7a2a2a), 0, 2.03, 0.4); // the open mouth
      for (const s of [-1, 1]) { // the arms up and out, a paw on each with its claws
        limb([s * 0.4, 1.85, 0.05], [s * 0.62, 2.25, 0.3], 0.13);
        part(sph(0.14), fur, s * 0.66, 2.33, 0.36, 1, 0.8, 1);
        for (let k = 0; k < 4; k++) { const c = part(new T.ConeGeometry(0.018, 0.1, 6), claw, s * (0.6 + k * 0.04), 2.42, 0.44); c.rotation.x = 0.9; }
      }
      b.name = 'bear'; b.position.set(O.bear[0], 0.42, O.bear[1]); b.rotation.y = Math.atan2(0.85, -0.55); r.add(b);
    }
    // the canoe hung from the roof over the aisle: a red hull, its gunwales and thwarts, on two ropes
    {
      const c = new T.Group(), hull = new T.Mesh(new T.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M(0xa8302a, { roughness: 0.5, side: T.DoubleSide }));
      hull.scale.set(2.5, 0.34, 0.42); c.add(hull);
      const gw = new T.Mesh(new T.TorusGeometry(1, 0.025, 6, 32), M(0x6a4a2a)); gw.rotation.x = Math.PI / 2; gw.scale.set(2.5, 0.42, 1); c.add(gw);
      for (const x of [-0.8, 0, 0.8]) { const t = new T.Mesh(new T.BoxGeometry(0.06, 0.03, 0.78 * Math.sqrt(1 - (x / 2.5) ** 2)), M(0x8a6a44)); t.position.set(x, -0.02, 0); c.add(t); }
      c.name = 'canoe'; c.position.set(11.0, 3.2, 20.1); c.rotation.z = 0.04; r.add(c);
      for (const x of [9.6, 12.4]) log([x, 3.2, 20.1], [x, 4.0, 20.1], 0.012, M(0xd8c8a0));
    }
    // the sign over the way in: a plank on two log posts, the name carved and the lines under it
    {
      const sx = O.x1, sz = (O.door[0] + O.door[1]) / 2;
      for (const z of [O.door[0] - 0.1, O.door[1] + 0.1]) log([sx, 0, z], [sx, 2.95, z], 0.09);
      log([sx, 2.9, O.door[0] - 0.3], [sx, 2.9, O.door[1] + 0.3], 0.07);
      const tex = canvasTex(768, 220, (g, w, h) => {
        g.fillStyle = '#6a4a2c'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,22,8,${0.1 + rnd() * 0.15})`; g.fillRect(0, rnd() * h, w, 1 + rnd() * 2); }
        g.strokeStyle = '#3a2614'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
        g.textAlign = 'center'; g.fillStyle = '#f0c870'; g.font = 'bold 74px Georgia, serif'; g.fillText('TIMBERLINE', w / 2, 92);
        g.font = 'bold 40px Georgia, serif'; g.fillText('OUTFITTERS', w / 2, 140);
        g.fillStyle = '#e8dcc0'; g.font = '24px Georgia, serif'; g.fillText('precision shooting · optics · bipods · match barrels', w / 2, 188);
      });
      for (const s of [1, -1]) { const p = new T.Mesh(new T.PlaneGeometry(2.6, 0.75), new T.MeshStandardMaterial({ map: tex, roughness: 0.8 })); p.rotation.y = s * Math.PI / 2; p.position.set(sx + s * 0.04, 2.45, sz); r.add(p); }
      box(r, sx - 0.035, 2.07, sz - 1.32, sx + 0.035, 2.83, sz + 1.32, M(0x4a3220));
    }
    // the stumps: what's for sale turns on top, its card on the face to the aisle between the rows (outfitters)
    O.rows.forEach((z, row) => O.xs.forEach((x, i) => {
      const top = O.top;
      const st = new T.Mesh(new T.CylinderGeometry(0.4, 0.46, top - 0.04, 14), bark); st.position.set(x, (top - 0.04) / 2, z); r.add(st);
      const ring = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.04, 14), M(0xc8a070, { roughness: 0.8 })); ring.position.set(x, top - 0.02, z); r.add(ring);
      const core = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.042, 14), M(0xa8804e, { roughness: 0.8 })); core.position.set(x, top - 0.02, z); r.add(core);
      for (let k = 0; k < 3; k++) { const a = rnd() * 6.28; log([x + Math.cos(a) * 0.4, 0.02, z + Math.sin(a) * 0.4], [x + Math.cos(a) * 0.62, 0.0, z + Math.sin(a) * 0.62], 0.06, barkD); } // (its roots)
      anchor(r, 'prec', row * O.xs.length + i, x, 0, z, 0, { face: row ? -1 : 1, top });
    }));
  }
  function outfitters() {
    const r = S.root;
    S.precStands = [];
    for (let k = 0; k < OUT.rows.length * OUT.xs.length; k++) {
      const a = at('prec', k), x = a.position.x, z = a.position.z, face = a.userData.face as number, top = a.userData.top as number;
      const sign = new T.Mesh(new T.PlaneGeometry(0.6, 0.4), new T.MeshBasicMaterial({ color: 0x000000 })); sign.position.set(x, 0.5, z + face * 0.47); if (face < 0) sign.rotation.y = Math.PI; r.add(sign);
      const disp = new T.Group(); disp.position.set(x, 0, z); r.add(disp);
      const tg = addTarget({ id: 'prec' + k, kind: 'buy', box: [x - 0.42, 0.1, z - 0.42, x + 0.42, 1.6, z + 0.42], what: 'part', key: null, sign, disp, spin: null, signTop: top });
      S.precStands!.push(tg); S.items.push(tg);
    }
  }

  // ---- the store: Vex, the pedestals, the pouch shelf, the machines
  function storeFixed(r: THREE.Object3D) {
    // the counter and the booth
    box(r, COUNTER.x0, 0, COUNTER.z0, COUNTER.x1, COUNTER.h - 0.06, COUNTER.z1, M(0x3c4046));
    box(r, COUNTER.x0 - 0.05, COUNTER.h - 0.06, COUNTER.z0 - 0.05, COUNTER.x1 + 0.05, COUNTER.h, COUNTER.z1 + 0.05, M(0x8a6b45, { roughness: 0.55 }));
    box(r, COUNTER.x0 - 0.1, 0, 2, COUNTER.x0 + 0.1, 2.2, COUNTER.z1, M(0x2e3236)); box(r, COUNTER.x1 - 0.1, 0, 2, COUNTER.x1 + 0.1, 2.2, COUNTER.z1, M(0x2e3236));
    box(r, COUNTER.x0, 0, 2, COUNTER.x1, 2.2, 2.45, M(0x2a2d31));
    for (let k = 0; k < 4; k++) { box(r, COUNTER.x0 + 0.1, 0.5 + k * 0.5, 2.45, COUNTER.x1 - 0.1, 0.53 + k * 0.5, 2.9, M(0x5a5f66)); for (let j = 0; j < 9; j++) box(r, COUNTER.x0 + 0.25 + j * 0.62, 0.53 + k * 0.5, 2.5, COUNTER.x0 + 0.65 + j * 0.62, 0.7 + k * 0.5 + (j % 3) * 0.05, 2.8, M([0x4a5639, 0x7a2e2a, 0x3a4048, 0x8a6a3a][(j + k) % 4])); } // shelves of stock behind him
    const sign = new T.Mesh(new T.PlaneGeometry(2.8, 0.7), signMat(['VEX', 'quartermaster · no weapons, no refunds'], 512, 128, '#14171a', '#ff9a2e', '#d0d6dc')); sign.position.set(25, 2.7, 2.48); r.add(sign);
    // the till
    box(r, 24.2, COUNTER.h, 4.1, 25.8, COUNTER.h + 0.06, 4.7, M(0x2a2d31));
    box(r, 24.85, COUNTER.h + 0.06, 4.3, 25.15, COUNTER.h + 0.2, 4.5, M(0x2a2d31));
    const till = new T.Mesh(new T.PlaneGeometry(0.8, 0.3), screenMat('VEX // STOCK', ['F: everything in stock', 'gear · parts · pouches · ammo'], 288, 108, '#ffb43a'));
    till.position.set(25, COUNTER.h + 0.3, 4.37); till.rotation.x = -0.3; r.add(till);
    anchor(r, 'vex', null, VEX.x, 0, VEX.z, Math.PI); // (Vex himself: store)
    // pedestals: one for each of the five pieces of gear for sale (the piece turning slowly on top, its sign on the front: store)
    STAND.xs.forEach((x, i) => {
      box(r, x - 0.8, 0, STAND.z - 0.8, x + 0.8, 0.1, STAND.z + 0.8, M(0x30353b));
      box(r, x - 0.78, 0.1, STAND.z - 0.78, x + 0.78, 0.115, STAND.z + 0.78, M(0xe8c030, { emissive: 0x302400 }));
      box(r, x - 0.5, 0.1, STAND.z - 0.45, x + 0.5, STAND.top - 0.04, STAND.z + 0.45, M(0x3a3f45, { roughness: 0.5 }));
      box(r, x - 0.54, STAND.top - 0.04, STAND.z - 0.49, x + 0.54, STAND.top, STAND.z + 0.49, M(0xe8c030, { emissive: 0x302400 }));
      anchor(r, 'stand', i, x, 0, STAND.z);
    });
    // the pouch shelf (a unit with a row of cards at eye height on its east face: store)
    box(r, POUCH.x0, 0, POUCH.z0 - 0.2, POUCH.x1, 1.9, POUCH.z0 + POUCH.n * POUCH.step, M(0x3b4046));
    for (const y of [0.45, 0.95, 1.45]) box(r, POUCH.x1, y, POUCH.z0 - 0.2, POUCH.x1 + 0.26, y + 0.04, POUCH.z0 + POUCH.n * POUCH.step, M(0x6a7076));
    const psign = new T.Mesh(new T.PlaneGeometry(1.5, 0.4), signMat(['POUCHES', 'MOLLE · one at a time'], 384, 100, '#101418', '#58b8ff', '#cfd6dc')); psign.position.set(POUCH.x1 + 0.012, 2.05, POUCH.z0 + 2.4); psign.rotation.y = Math.PI / 2; r.add(psign);
    for (let i = 0; i < POUCH.n; i++) anchor(r, 'pouch', i, POUCH.x1, 0, POUCH.z0 + i * POUCH.step + 0.5);
    // the machines (what's in them: vending)
    for (const v of VEND) {
      const x1 = v.x + 1.1;
      box(r, v.x, 0, v.z - 0.55, x1, 1.95, v.z + 0.55, M(0x2d3237));
      box(r, v.x - 0.02, 1.6, v.z - 0.55, v.x + 0.02, 1.95, v.z + 0.55, M(0x15181b));
      const ttl = new T.Mesh(new T.PlaneGeometry(1.0, 0.3), screenMat(v.title, ['F: the full list'], 256, 76, '#7dff9a'));
      ttl.rotation.y = -Math.PI / 2; ttl.position.set(v.x - 0.025, 1.78, v.z); r.add(ttl);
      const glass = new T.Mesh(new T.PlaneGeometry(0.98, 1.36), new T.MeshBasicMaterial({ color: 0x0b1620, transparent: true, opacity: 0.55 })); glass.rotation.y = -Math.PI / 2; glass.position.set(v.x - 0.02, 0.88, v.z); r.add(glass);
      box(r, v.x - 0.04, 0.12, v.z - 0.5, v.x + 0.02, 0.26, v.z + 0.5, M(0x0e0f10)); // the delivery flap
      anchor(r, 'vend', VEND.indexOf(v), v.x, 0, v.z, 0, { id: v.id });
    }
    // a few crates and a barrel or two to make it a place
    for (const [x, z] of [[18.6, 18.5], [19.8, 18.7], [33.2, 19]]) box(r, x - 0.4, 0, z - 0.4, x + 0.4, 0.8, z + 0.4, M(0x8a6a3a, { roughness: 0.9 }));
  }
  function store() {
    const r = S.root;
    addTarget({ id: 'vex', kind: 'pos', box: [COUNTER.x0, 0.0, 2.2, COUNTER.x1, 2.1, 5.0], label: 'Vex', tab: 'stock', title: 'Vex: the whole stock' });
    // Vex himself
    const va = at('vex'), vx = va.position.x, vz = va.position.z;
    const vex = G.Rig.create({ style: 'tactical', bare: true, vex: true, skinColor: 0x8a6e55, look: { top: 'hoodie', topC: 0x2b2a24, pants: 'cargo', pantsC: 0x23221c, eyes: 'none', gloves: 'leather' }, seed: 77, scale: 1.04 });
    vex.setKit({ carrier: 'c.recon', cp: 3, belt: 'b.battle', bp: 2, ifak: 1 });
    vex.root.position.set(vx, 0, vz); r.add(vex.root); S.rigs.push({ rig: vex, x: vx, z: vz, yaw: (va.userData.ry as number) || 0, vex: true });
    // the pedestals' pieces of gear: the piece turning slowly on top, its sign on the front
    S.stands = [];
    STAND.xs.forEach((_, i) => {
      const p = at('stand', i).position, x = p.x, z = p.z;
      const sign = new T.Mesh(new T.PlaneGeometry(0.94, 0.5), new T.MeshBasicMaterial({ color: 0x000000 })); sign.position.set(x, 0.5, z + 0.452); r.add(sign);
      const disp = new T.Group(); disp.position.set(x, 0, z); r.add(disp);
      const tg = addTarget({ id: 'stand' + i, kind: 'buy', box: [x - 0.55, 0.1, z - 0.5, x + 0.55, 2.1, z + 0.5], what: 'gear', key: null, sign, disp, spin: null, idx: i });
      S.stands.push(tg); S.items.push(tg);
    });
    // the pouch shelf's cards
    S.pouchSlots = [];
    for (let i = 0; i < POUCH.n; i++) {
      const p = at('pouch', i).position, z = p.z, slot = new T.Group(); slot.position.set(0, 0, z); r.add(slot); S.pouchSlots.push(slot);
      const tg = addTarget({ id: 'pouch' + i, kind: 'buy', box: [p.x - 0.1, 0.5, z - 0.5, p.x + 0.45, 1.7, z + 0.5], slot, what: 'pouch', key: null });
      S.items.push(tg);
    }
    // the machines
    VEND.forEach((v, i) => machine(v, at('vend', i).position));
  }
  // a vending machine: what's in its window of slots (vending), and its screen opens the list
  function machine(v: HangarVend, p: THREE.Vector3) {
    const r = S.root, g = new T.Group(); r.add(g);
    const m: HangarMachine = { v: Object.assign({}, v, { x: p.x, z: p.z }), group: g, key: '', slots: [] };
    S.vend.push(m);
    addTarget({ id: 'vend-' + v.id, kind: 'pos', box: [p.x - 0.5, 1.55, p.z - 0.55, p.x + 0.3, 2.0, p.z + 0.55], label: v.title.toLowerCase() + ' machine', tab: v.tab, title: v.title.toLowerCase() });
  }

  // ---- the stash, by the way into Nightjar's: crates in a cage against the back wall, and a console that opens your stash and loadout
  function stashFixed(r: THREE.Object3D) {
    // the console: two screens on a desk-high pedestal, turned to the store
    box(r, CONSOLE.x0, 0, CONSOLE.z0, CONSOLE.x1, 0.95, CONSOLE.z1, M(0x363b41));
    box(r, CONSOLE.x0 - 0.02, 0.95, CONSOLE.z0 - 0.05, CONSOLE.x1, 1.0, CONSOLE.z1 + 0.05, M(0x1c1f22));
    const cz = (CONSOLE.z0 + CONSOLE.z1) / 2;
    for (const [z, a, b] of [[cz - 0.45, 'STASH', 'your lockers'], [cz + 0.45, 'LOADOUT', 'what you carry']] as [number, string, string][]) {
      box(r, CONSOLE.x0 + 0.05, 1.0, z - 0.4, CONSOLE.x0 + 0.13, 1.5, z + 0.4, M(0x16181a));
      const s = new T.Mesh(new T.PlaneGeometry(0.76, 0.46), screenMat(a, [b, 'F: open'], 256, 152, '#ff9a5a')); s.rotation.y = -Math.PI / 2; s.position.set(CONSOLE.x0 + 0.045, 1.25, z); r.add(s);
    }
    // the stash itself: a cage (the crates in it: stash)
    const cage = new T.Group(); cage.name = 'cage'; cage.position.set(STACK.x, 0, STACK.z); r.add(cage);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(cage, dx - 0.04, 0, dz - 0.04, dx + 0.04, 1.75, dz + 0.04, M(0xf0c030)); // the cage's corner posts
    for (const y of [0.05, 1.7]) for (const [x0, z0, x1, z1] of [[-1, -1, 1, -0.96], [-1, 0.96, 1, 1], [-1, -1, -0.96, 1], [0.96, -1, 1, 1]]) box(cage, x0, y, z0, x1, y + 0.05, z1, M(0xf0c030)); // and its rails
    anchor(r, 'stash', null, STACK.x, 0, STACK.z);
    const sg = new T.Mesh(new T.PlaneGeometry(1.6, 0.4), signMat(['STASH', 'your lockers'], 384, 96, '#101418', '#ff9a5a', '#cfd6dc')); sg.position.set(STACK.x, 2.05, STACK.z + 1.05); r.add(sg);
  }
  function stash() {
    addTarget({ id: 'console', kind: 'pos', box: [CONSOLE.x0 - 0.1, 0.9, CONSOLE.z0, CONSOLE.x1, 1.6, CONSOLE.z1], label: 'the stash console', tab: 'kit', title: 'your stash and loadout' });
    // what's in the cage: crates two high
    const stack = new T.Group(); stack.position.copy(at('stash').position); S.root.add(live(stack));
    const crateCols = [0x8a6a3a, 0x6f8a52, 0x5a6a7a, 0x9a5a3a];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) box(stack, (i % 2 ? 0.02 : -0.86), k * 0.8, (i < 2 ? -0.86 : 0.02), (i % 2 ? 0.86 : -0.02), k * 0.8 + 0.78, (i < 2 ? -0.02 : 0.86), M(crateCols[(i + k) % 4], { roughness: 0.9 }));
  }

  // ---- Nightjar Optronics (NJ): a special-operations outfitter in what was the warehouse, selling night vision. A dark,
  // clean room behind a glass front (its doors open onto the walkway by the stash): a polished black floor edged in light,
  // the brand on the back wall over two rows of glass cases (one for each set they make, the set turning inside on a
  // mannequin's head, its card on the case's face to the aisle), a counter at the far end with their rep behind it (a
  // panoramic set flipped up on the helmet), shelves of boxed stock, a keypad at the door and a camera dome over it.
  // What's in stock this visit is the shop's (G.Shop.offers.nvg); a set not in this visit (or not yet: lv) says so on its card.
  function nightjarFixed(r: THREE.Object3D) {
    const N = NJ, cx = (N.x0 + N.x1) / 2, cz = (N.z0 + N.z1) / 2;
    const black = M(0x121416, { roughness: 0.45, metalness: 0.3 }), panel = M(0x1b1f23, { roughness: 0.6, metalness: 0.2 }), steel = M(0x3a4046, { roughness: 0.35, metalness: 0.7 });
    const led = new T.MeshBasicMaterial({ color: 0x7dffb0 }), white = new T.MeshBasicMaterial({ color: 0xe8f4ff });
    const glass = new T.MeshStandardMaterial({ color: 0x9ab8c8, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.4, depthWrite: false });
    // the floor: polished black tiles, a strip of light round the walls
    const tiles = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#121518'; g.fillRect(0, 0, w, h); g.strokeStyle = '#262b30'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); } });
    tiles.wrapS = tiles.wrapT = T.RepeatWrapping; tiles.repeat.set((N.x1 - N.x0) / 4.8, (N.z1 - N.z0) / 4.8);
    const fl = new T.Mesh(new T.PlaneGeometry(N.x1 - N.x0, N.z1 - N.z0), new T.MeshStandardMaterial({ map: tiles, roughness: 0.18, metalness: 0.35 })); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0.015, cz); r.add(fl);
    for (const [x0, z0, x1, z1] of [[N.x0 + 0.1, N.z0 + 0.05, N.x1 - 0.05, N.z0 + 0.09], [N.x0 + 0.1, N.z1 - 0.29, N.x1 - 0.05, N.z1 - 0.25], [N.x1 - 0.31, N.z0, N.x1 - 0.27, N.z1 - 0.25]]) box(r, x0, 0.016, z0, x1, 0.03, z1, led);
    // the walls inside: dark panels over the hangar's own, a black frieze along the top
    box(r, N.x0 + 0.1, 0, N.z0, N.x1, 3.4, N.z0 + 0.04, panel);
    box(r, N.x1 - 0.26, 0, N.z0, N.x1 - 0.22, 3.4, N.z1 - 0.2, panel); // (clear of the hall's windows)
    box(r, N.x0 + 0.1, 0, N.z1 - 0.25, N.x1, 3.4, N.z1 - 0.2, panel); // (over the lounge wall's window strip too)
    for (const z of [N.z0 + 0.04]) for (let x = N.x0 + 0.9; x < N.x1 - 0.5; x += 1.2) box(r, x - 0.012, 0.03, z, x + 0.012, 3.4, z + 0.02, M(0x262b30));
    // the glass front: panes in black mullions either side of the door, a fascia over it all with the name, the doors slid open
    // (its panes and doors are planes seen from both sides: from the walkway as much as from inside)
    const pane = glass.clone(); pane.side = T.DoubleSide;
    const front = (z0: number, z1: number) => {
      const n = Math.max(1, Math.round((z1 - z0) / 1.3)), w = (z1 - z0) / n;
      for (let i = 0; i < n; i++) { const p = new T.Mesh(new T.PlaneGeometry(w - 0.06, 2.85), pane); p.rotation.y = Math.PI / 2; p.position.set(N.x0, 1.47, z0 + (i + 0.5) * w); r.add(p); }
      for (let i = 0; i <= n; i++) box(r, N.x0 - 0.04, 0, z0 + i * w - 0.03, N.x0 + 0.04, 2.9, z0 + i * w + 0.03, black);
      box(r, N.x0 - 0.04, 0, z0, N.x0 + 0.04, 0.06, z1, black);
    };
    front(N.z0, N.door[0]); front(N.door[1], N.z1);
    for (const [z0, z1] of [[N.door[0] - 1.15, N.door[0] - 0.05], [N.door[1] + 0.05, N.door[1] + 1.15]]) { const p = new T.Mesh(new T.PlaneGeometry(z1 - z0, 2.6), pane); p.rotation.y = Math.PI / 2; p.position.set(N.x0 + 0.1, 1.33, (z0 + z1) / 2); r.add(p); box(r, N.x0 + 0.07, 2.6, z0, N.x0 + 0.13, 2.66, z1, steel); } // (the doors, slid back behind the panes)
    box(r, N.x0 - 0.08, 2.9, N.z0, N.x0 + 0.08, 3.5, N.z1, black); // the fascia
    const logo = (g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) => { // (the mark: a nightjar's swept wings across a ring, an eye in the middle)
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s * 0.07;
      g.beginPath(); g.arc(x, y, s * 0.42, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - s * 0.62, y - s * 0.02); g.quadraticCurveTo(x - s * 0.25, y - s * 0.3, x, y - s * 0.06); g.quadraticCurveTo(x + s * 0.25, y - s * 0.3, x + s * 0.62, y - s * 0.02); g.quadraticCurveTo(x + s * 0.25, y - s * 0.14, x, y + s * 0.08); g.quadraticCurveTo(x - s * 0.25, y - s * 0.14, x - s * 0.62, y - s * 0.02); g.fill();
      g.beginPath(); g.arc(x, y + s * 0.18, s * 0.07, 0, Math.PI * 2); g.fill();
    };
    const brand = (w: number, h: number, sub: string) => canvasTex(w, h, (g) => {
      g.fillStyle = '#0b0d0f'; g.fillRect(0, 0, w, h);
      logo(g, h * 0.55, h * 0.5, h * 0.8, '#8dffbe');
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#e8f4ff'; g.font = `600 ${Math.round(h * 0.42)}px sans-serif`;
      const t = 'N I G H T J A R'; g.fillText(t, h * 1.15, h * 0.4);
      g.fillStyle = '#8dffbe'; g.font = `${Math.round(h * 0.15)}px sans-serif`; g.fillText(sub, h * 1.18, h * 0.76);
    });
    const fasc = new T.Mesh(new T.PlaneGeometry(5.6, 0.56), new T.MeshBasicMaterial({ map: brand(1280, 128, 'OPTRONICS  ·  NIGHT VISION FOR SPECIAL OPERATIONS') })); fasc.rotation.y = -Math.PI / 2; fasc.position.set(N.x0 - 0.085, 3.2, (N.door[0] + N.door[1]) / 2); r.add(fasc);
    // the keypad by the door and the camera dome over it
    box(r, N.x0 - 0.07, 1.3, N.door[0] - 0.32, N.x0 - 0.04, 1.48, N.door[0] - 0.2, black); box(r, N.x0 - 0.075, 1.44, N.door[0] - 0.3, N.x0 - 0.07, 1.46, N.door[0] - 0.22, led);
    const dome = new T.Mesh(new T.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M(0x0a0b0c, { roughness: 0.1, metalness: 0.5 })); dome.position.set(N.x0 + 0.4, 3.4, (N.door[0] + N.door[1]) / 2); r.add(dome);
    box(r, N.x0 + 0.3, 3.4, dome.position.z - 0.1, N.x0 + 0.5, 3.44, dome.position.z + 0.1, black);
    // the brand on the back wall, lit, and a line under it
    const bw = new T.Mesh(new T.PlaneGeometry(6.0, 1.2), new T.MeshBasicMaterial({ map: brand(1280, 256, 'OPTRONICS  ·  SEE FIRST') })); bw.position.set(cx - 0.4, 2.55, N.z0 + 0.05); r.add(bw);
    box(r, cx - 3.4, 1.82, N.z0 + 0.04, cx + 2.6, 1.84, N.z0 + 0.06, led);
    // the cases: a black cabinet, a glass box on it lit from the top, a plinth inside for the piece to turn on (the piece and
    // its card on the face to the aisle: nightjar)
    N.cases.forEach(([x, z, face], i) => {
      const H = N.top, gx = 0.62, gz = 0.44;
      box(r, x - 0.7, 0, z - 0.5, x + 0.7, H - 0.04, z + 0.5, black);
      box(r, x - 0.72, H - 0.04, z - 0.52, x + 0.72, H, z + 0.52, steel);
      box(r, x - 0.68, 0.02, z - 0.48, x + 0.68, 0.035, z + 0.48, led); // (a light under its foot)
      for (const [w, d, px, pz, ry] of [[2 * gx, 0.8, x, z - gz, 0], [2 * gx, 0.8, x, z + gz, Math.PI], [2 * gz, 0.8, x - gx, z, -Math.PI / 2], [2 * gz, 0.8, x + gx, z, Math.PI / 2]] as number[][]) { const p = new T.Mesh(new T.PlaneGeometry(w, d), glass); p.position.set(px, H + 0.4, pz); p.rotation.y = ry; r.add(p); }
      box(r, x - gx, H + 0.8, z - gz, x + gx, H + 0.84, z + gz, black); box(r, x - gx + 0.06, H + 0.79, z - 0.02, x + gx - 0.06, H + 0.8, z + 0.02, white);
      box(r, x - 0.12, H, z - 0.12, x + 0.12, H + 0.1, z + 0.12, M(0x0c0d0e, { roughness: 0.3 }));
      anchor(r, 'nj', i, x, 0, z, 0, { face, top: H });
    });
    // the counter, a terminal on it (it opens the whole stock), shelves of boxed sets behind (their rep: nightjar)
    const C = N.counter;
    box(r, C.x0, 0, C.z0, C.x1, C.h - 0.05, C.z1, black);
    box(r, C.x0 - 0.06, C.h - 0.05, C.z0 - 0.05, C.x1 + 0.04, C.h, C.z1 + 0.05, steel);
    box(r, C.x0 - 0.01, 0.1, C.z0 + 0.1, C.x0, 0.14, C.z1 - 0.1, led);
    const tcz = (C.z0 + C.z1) / 2 - 1.2;
    box(r, C.x0 + 0.25, C.h, tcz - 0.18, C.x0 + 0.33, C.h + 0.32, tcz + 0.18, black);
    const term = new T.Mesh(new T.PlaneGeometry(0.34, 0.26), screenMat('NIGHTJAR', ['F: the stock', 'night vision'], 256, 180, '#8dffbe')); term.rotation.y = -Math.PI / 2; term.position.set(C.x0 + 0.245, C.h + 0.17, tcz); r.add(term);
    // on the counter's near end, under a glass cover: the thermal riflescope, when they have it (nightjar, refresh: S.njPart)
    { const pz = C.z1 - 0.55, px = (C.x0 + C.x1) / 2, H = C.h;
      for (const [w, d, ox, oz, ry] of [[0.56, 0.36, 0, -0.2, 0], [0.56, 0.36, 0, 0.2, Math.PI], [0.4, 0.36, -0.28, 0, -Math.PI / 2], [0.4, 0.36, 0.28, 0, Math.PI / 2]] as number[][]) { const p = new T.Mesh(new T.PlaneGeometry(w, d), glass); p.position.set(px + ox, H + 0.18, pz + oz); p.rotation.y = ry; r.add(p); }
      box(r, px - 0.28, H + 0.36, pz - 0.2, px + 0.28, H + 0.38, pz + 0.2, black);
      anchor(r, 'njpart', null, px, 0, pz, 0, { top: H }); }
    for (const y of [0.6, 1.2, 1.8, 2.4]) {
      box(r, N.x1 - 0.67, y, C.z0 - 0.3, N.x1 - 0.26, y + 0.03, C.z1 + 0.3, steel);
      for (let z = C.z0 - 0.2; z < C.z1 + 0.2; z += 0.42) { box(r, N.x1 - 0.62, y + 0.03, z, N.x1 - 0.32, y + 0.25, z + 0.34, M(0x16191c, { roughness: 0.5 })); box(r, N.x1 - 0.621, y + 0.11, z + 0.05, N.x1 - 0.62, y + 0.13, z + 0.29, led); }
    }
    anchor(r, 'njrep', null, N.rep[0], 0, N.rep[1], Math.PI / 2);
    // a poster by the door: what it looks like through them
    const post = new T.Mesh(new T.PlaneGeometry(1.1, 1.5), new T.MeshBasicMaterial({ map: canvasTex(220, 300, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.6); gr.addColorStop(0, '#5aff9a'); gr.addColorStop(0.7, '#0e4a24'); gr.addColorStop(1, '#020604');
      g.fillStyle = '#020604'; g.fillRect(0, 0, w, h); g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h * 0.45, w * 0.44, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#062a12'; g.beginPath(); g.ellipse(w * 0.56, h * 0.36, w * 0.06, w * 0.07, 0, 0, 7); g.fill(); g.fillRect(w * 0.5, h * 0.42, w * 0.12, h * 0.2); // (someone in a doorway)
      g.fillStyle = '#e8f4ff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('SEE FIRST.', w / 2, h * 0.86); g.fillStyle = '#8dffbe'; g.font = '13px sans-serif'; g.fillText('NIGHTJAR OPTRONICS', w / 2, h * 0.93);
    }) }));
    post.position.set(N.x0 + 1.6, 1.7, N.z1 - 0.19); post.rotation.y = Math.PI; r.add(post);
  }
  function nightjar() {
    const r = S.root, C = NJ.counter;
    // the cases' pieces and their cards
    S.njStands = [];
    NJ.cases.forEach((_, i) => {
      const a = at('nj', i), x = a.position.x, z = a.position.z, face = a.userData.face as number, H = a.userData.top as number;
      const sign = new T.Mesh(new T.PlaneGeometry(1.2, 0.5), new T.MeshBasicMaterial({ color: 0x000000 })); sign.position.set(x, 0.5, z + face * 0.502); if (face < 0) sign.rotation.y = Math.PI; r.add(sign);
      const disp = new T.Group(); disp.position.set(x, 0, z); r.add(disp);
      const tg = addTarget({ id: 'nj' + i, kind: 'buy', box: [x - 0.7, 0.1, z - 0.5, x + 0.7, H + 0.85, z + 0.5], what: 'gear', key: null, sign, disp, spin: null, idx: i });
      S.njStands!.push(tg); S.items.push(tg);
    });
    // the thermal riflescope under its glass cover on the counter, and its card on the counter's front
    { const a = at('njpart'), px = a.position.x, pz = a.position.z, H = a.userData.top as number;
      const sign = new T.Mesh(new T.PlaneGeometry(0.8, 0.4), new T.MeshBasicMaterial({ color: 0x000000 })); sign.rotation.y = -Math.PI / 2; sign.position.set(C.x0 - 0.065, 0.5, pz); r.add(sign);
      const disp = new T.Group(); disp.position.set(px, 0, pz); r.add(disp);
      S.njPart = addTarget({ id: 'njpart', kind: 'buy', box: [C.x0 - 0.1, 0.1, pz - 0.3, C.x1, H + 0.4, pz + 0.3], what: 'part', key: null, sign, disp, spin: null, signTop: H });
      S.items.push(S.njPart); }
    const tcz = (C.z0 + C.z1) / 2 - 1.2;
    addTarget({ id: 'njtill', kind: 'pos', box: [C.x0 - 0.1, C.h - 0.1, tcz - 0.3, C.x1, C.h + 0.45, tcz + 0.3], label: 'the Nightjar terminal', tab: 'stock', title: 'Nightjar: night vision (and the rest of the stock)' });
    // their rep, behind the counter
    const ra = at('njrep'), rx = ra.position.x, rz = ra.position.z;
    const rep = G.Rig.create({ style: 'tactical', bare: true, look: { top: 'combat', topC: 0x16181a, pants: 'combat', pantsC: 0x1c1e20, eyes: 'none', gloves: 'tactical' }, seed: 31, scale: 1 });
    rep.setKit({ helmet: 'h.rifle', nv: 'n.pano', nd: 0, carrier: 'c.slick', plate: 1, cp: 1, belt: 'b.duty', bp: 1 });
    rep.root.position.set(rx, 0, rz); r.add(rep.root); S.rigs.push({ rig: rep, x: rx, z: rz, yaw: (ra.userData.ry as number) || 0 });
  }

  // A set of night vision on show: on a mannequin's head (matte black) in a high-cut helmet, flipped down, as js/rig.ts
  // setKit makes it on a body (that body thrown away, the head and what's on it lifted out)
  function nvPiece(id: string) {
    const root = new T.Group(), rig = G.Rig.create({ style: 'tactical', bare: true, mannequin: true, look: { top: 'tshirt', topC: 0x202326, pants: 'jeans', pantsC: 0x202326, eyes: 'none', gloves: 'none' }, seed: 5 });
    rig.setKit({ helmet: 'h.fast', nv: id, nd: 1 }); rig.root.updateMatrixWorld(true);
    const g = new T.Group(), keep = ['helmet', 'nvg'];
    for (const m of rig.kitParts) {
      if (!keep.includes(m.userData.part)) continue;
      const c = m.clone(true); m.updateWorldMatrix(true, false); m.matrixWorld.decompose(c.position, c.quaternion, c.scale); g.add(c);
    }
    const head = new T.Mesh(new T.SphereGeometry(0.1, 18, 12), M(0x1a1c1f, { roughness: 0.85 })); head.scale.set(0.92, 1.18, 1.02);
    rig.head.updateWorldMatrix(true, false); head.position.set(0, 0.12, 0).applyMatrix4(rig.head.matrixWorld); g.add(head);
    const neck = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 0.12, 12), M(0x1a1c1f, { roughness: 0.85 })); neck.position.set(0, 0.01, 0.01).applyMatrix4(rig.head.matrixWorld); g.add(neck);
    const bb = new T.Box3().setFromObject(g), ctr = bb.getCenter(new T.Vector3());
    g.position.set(-ctr.x, -bb.min.y, -ctr.z);
    const pivot = new T.Group(); pivot.add(g); pivot.scale.setScalar(1.75); pivot.position.y = NJ.top + 0.1; pivot.rotation.y = Math.PI;
    root.add(pivot);
    return { root, spin: pivot };
  }
  // its card: the name, the price, what it is, and that the helmet's not in it (or why it's not on sale)
  function njSign(id: string, sold: boolean, out: string | null) {
    const d = gearOf(id), L = [d.name, out ? out : sold ? 'SOLD' : money(G.Shop.gearPrice(id))];
    if (!out && !sold) { L.push(G.Shop.nvField(d)); L.push('!helmet not included'); }
    else if (out) L.push(G.Shop.nvField(d));
    return L;
  }

  // ---- the lounge: carpet, a wall to the warehouse, two rows of sofas facing the big screen, a coffee table, a snack bar
  function loungeFixed(r: THREE.Object3D) {
    const L = LOUNGE;
    const carpet = new T.Mesh(new T.PlaneGeometry(L.x1 - L.x0 - 0.1, L.z1 - L.z0 - 0.1), M(0x2a2f3a, { roughness: 1 })); carpet.rotation.x = -Math.PI / 2; carpet.position.set((L.x0 + L.x1) / 2, 0.008, (L.z0 + L.z1) / 2); r.add(carpet);
    const rug = new T.Mesh(new T.PlaneGeometry(8.6, 7.4), new T.MeshStandardMaterial({ roughness: 1, map: canvasTex(256, 220, (g, w, h) => { g.fillStyle = '#5a2a3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8a84a'; g.lineWidth = 5; g.strokeRect(12, 12, w - 24, h - 24); g.strokeStyle = '#8a4a5a'; g.lineWidth = 3; g.strokeRect(26, 26, w - 52, h - 52); }) }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(44.4, 0.012, 20); r.add(rug);
    // the wall to the warehouse: plasterboard on a steel frame, a window strip along its top
    box(r, L.wall, 0, L.z0 - 0.2, L.x1, 2.0, L.z0, M(0x5a6068));
    box(r, L.wall, 2.0, L.z0 - 0.2, L.x1, 2.08, L.z0, M(0x30343a));
    const pane = new T.Mesh(new T.BoxGeometry(L.x1 - L.wall, 0.64, 0.04), new T.MeshStandardMaterial({ color: 0x8ab0c8, transparent: true, opacity: 0.25, roughness: 0.1 })); pane.position.set((L.wall + L.x1) / 2, 2.42, L.z0 - 0.1); r.add(pane);
    box(r, L.wall, 2.74, L.z0 - 0.2, L.x1, 2.8, L.z0, M(0x30343a));
    box(r, L.wall - 0.08, 0, L.z0 - 0.24, L.wall, 2.8, L.z0 + 0.04, M(0x30343a)); // (its end post)
    // the sofas: the seat, the cushions, the back on the side away from the screen (west), the arms
    const fab = [M(0x3a4a6a, { roughness: 0.95 }), M(0x6a3a3a, { roughness: 0.95 })], cush = [M(0x4a5a7c, { roughness: 0.95 }), M(0x7c4a4a, { roughness: 0.95 })];
    L.sofas.forEach((s, i) => {
      box(r, s.x - 0.45, 0, s.z0, s.x + 0.45, 0.42, s.z1, fab[i]);
      const n = Math.round((s.z1 - s.z0 - 0.4) / 0.95), cw = (s.z1 - s.z0 - 0.4) / n;
      for (let k = 0; k < n; k++) box(r, s.x - 0.3, 0.42, s.z0 + 0.2 + k * cw + 0.02, s.x + 0.43, 0.52, s.z0 + 0.2 + (k + 1) * cw - 0.02, cush[i]);
      box(r, s.x - 0.45, 0.42, s.z0, s.x - 0.25, 0.9, s.z1, fab[i]);
      for (const z of [s.z0, s.z1 - 0.2]) box(r, s.x - 0.45, 0.42, z, s.x + 0.45, 0.66, z + 0.2, fab[i]);
    });
    // the coffee table: a top on four legs, a bowl of popcorn
    const [tx0, tz0, tx1, tz1, th] = L.table;
    box(r, tx0, th - 0.05, tz0, tx1, th, tz1, M(0x6b4428, { roughness: 0.6 }));
    for (const x of [tx0 + 0.06, tx1 - 0.06]) for (const z of [tz0 + 0.06, tz1 - 0.06]) box(r, x - 0.03, 0, z - 0.03, x + 0.03, th - 0.05, z + 0.03, M(0x2a2a2a));
    cyl(r, 0.16, 0.1, M(0xd84a3a), (tx0 + tx1) / 2, th + 0.05, (tz0 + tz1) / 2);
    for (let k = 0; k < 9; k++) { const a = k * 2.4; cyl(r, 0.035, 0.05, M(0xfff0c0, { roughness: 1 }), (tx0 + tx1) / 2 + Math.cos(a) * 0.08 * (k % 3) / 2, th + 0.12, (tz0 + tz1) / 2 + Math.sin(a) * 0.08 * (k % 3) / 2, 6); }
    // the snack bar by the front wall: a counter, a popcorn machine (glowing), a drinks fridge
    const [bx0, bz0, bx1, bz1, bh] = L.bar;
    box(r, bx0, 0, bz0, bx1, bh - 0.05, bz1, M(0x3b3f44)); box(r, bx0 - 0.03, bh - 0.05, bz0 - 0.03, bx1 + 0.03, bh, bz1 + 0.03, M(0x9a7a50, { roughness: 0.6 }));
    const pz = bz0 + 0.55;
    box(r, bx0 + 0.15, bh, pz - 0.3, bx1 - 0.15, bh + 0.06, pz + 0.3, M(0xc0302a));
    const glass = new T.Mesh(new T.BoxGeometry(bx1 - bx0 - 0.34, 0.5, 0.56), new T.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0x6a4a10, transparent: true, opacity: 0.55 })); glass.position.set((bx0 + bx1) / 2, bh + 0.31, pz); r.add(glass);
    box(r, bx0 + 0.15, bh + 0.06, pz - 0.26, bx1 - 0.15, bh + 0.22, pz + 0.26, M(0xfff0c0, { roughness: 1 }));
    box(r, bx0 + 0.15, bh + 0.56, pz - 0.3, bx1 - 0.15, bh + 0.66, pz + 0.3, M(0xc0302a));
    const fz = bz1 - 0.6;
    box(r, bx0 + 0.1, bh, fz - 0.4, bx1 - 0.1, bh + 0.9, fz + 0.4, M(0x2d3237));
    const fg = new T.Mesh(new T.PlaneGeometry(0.66, 0.7), new T.MeshStandardMaterial({ color: 0x9adfff, emissive: 0x1a4a6a, transparent: true, opacity: 0.7 })); fg.rotation.y = Math.PI / 2; fg.position.set(bx1 - 0.08, bh + 0.45, fz); r.add(fg);
  }

  // ---- the helicopter: an armoured tiltrotor dropship, nose to the west, with ducted fans on stub wings
  function helipadFixed(r: THREE.Object3D) {
    const P = HELI;
    const pad = padMesh(true); pad.position.set(P.x + 0.4, 0.014, P.z); r.add(pad);
    const hs = new T.Mesh(new T.PlaneGeometry(2.4, 0.5), signMat(['READY ROOM', 'hold F to board'], 384, 80, '#101418', '#7dff9a', '#cfd6dc')); hs.rotation.y = Math.PI; hs.position.set(P.x - 0.5, 2.98, P.z - 1.36); r.add(hs);
    anchor(r, 'heli', null, P.x, 0, P.z); // (the machine itself: helicopter)
  }
  function helicopter() {
    const P = HELI, sh = ship(), h = sh.group, a = at('heli').position;
    h.position.set(a.x, 0, a.z); S.root.add(h);
    S.heli = Object.assign(sh, { rotor: sh.rotors[0], speed: 3, spin: 0 });
    addTarget({ id: 'heli', kind: 'heli', box: [P.x - 3.5, 0.2, P.z - 1.4, P.x + 2.5, 2.9, P.z + 1.4], label: 'the helicopter' });
  }
  // helipad: a painted H on the paving (lit: the hangar's own daylight; in a level, what's there)
  function padMesh(lit?: boolean) {
    const mat = { map: canvasTex(256, 220, (g, w, hh) => { g.fillStyle = '#34383d'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#e8c030'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, hh - 20); g.fillStyle = '#e8c030'; g.fillRect(w / 2 - 38, hh / 2 - 50, 14, 100); g.fillRect(w / 2 + 24, hh / 2 - 50, 14, 100); g.fillRect(w / 2 - 38, hh / 2 - 7, 76, 14); }) };
    const pad = new T.Mesh(new T.PlaneGeometry(13, 11), lit ? new T.MeshBasicMaterial(mat) : new T.MeshStandardMaterial(Object.assign(mat, { roughness: 0.9 })));
    pad.rotation.x = -Math.PI / 2;
    return pad;
  }
  // the machine itself, on the ground at the group's origin (the hangar's, and the one that brings you in: js/landing.ts)
  function ship(): HangarShip {
    const h = new T.Group(), P = HELI;
    const body = M(0x9aa7b3, { roughness: 0.5, metalness: 0.3, emissive: 0x20262c }), armor = M(0x56626e, { roughness: 0.55, metalness: 0.4, emissive: 0x12161a }), dark = M(0x2a3036), inside = M(0x6b7279, { emissive: 0x2a3036 });
    const accent = M(0xd9922a, { emissive: 0x3a2308 }), duct = M(0x56626e, { roughness: 0.55, metalness: 0.4, emissive: 0x12161a, side: T.DoubleSide });
    const glass = new T.MeshStandardMaterial({ color: 0x78a8c8, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.3 });
    const glow = new T.MeshBasicMaterial({ color: 0x1a6a40 }); // status strips: red to green as the squad gets in
    const thrust = new T.MeshBasicMaterial({ color: 0x5ad0ff, transparent: true, opacity: 0.2, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    const part = (g: THREE.Object3D, mesh: THREE.Mesh, x: number, y: number, z: number) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    // cabin: the floor, the roof, the back (south), the bulkheads; the north side is open (a door's length), with
    // a bench along the south wall facing out of it
    box(h, -3.2, P.floor - 0.1, -1.3, 2.4, P.floor, 1.3, inside);
    box(h, -2.4, 2.45, -1.3, 2.4, 2.65, 1.3, M(0x8a929a, { emissive: 0x555d66 }));
    box(h, -2.4, P.floor, 1.2, 2.4, 2.45, 1.32, body);
    box(h, 2.28, P.floor, -1.3, 2.4, 2.45, 1.3, body);
    box(h, -2.4, P.floor, -1.32, -1.5, 2.45, -1.2, body); box(h, 2.0, P.floor, -1.32, 2.4, 2.45, -1.2, body); // the door posts
    box(h, -2.5, P.floor, -1.3, -2.4, 2.45, 1.3, body);
    box(h, -2.4, 2.4, -1.3, 2.4, 2.45, -1.2, accent); // the door's lintel, with a light strip under it and one along the cabin roof
    box(h, -1.5, 2.37, -1.26, 2.0, 2.4, -1.22, glow); box(h, -2.2, 2.43, 0.42, 2.2, 2.45, 0.5, glow);
    // armour: plates over the door posts and along the flanks, a spine along the roof with a sensor dome and a mast
    for (const [x0, x1] of [[-2.45, -1.5], [2.0, 2.45]]) { box(h, x0, 0.9, -1.5, x1, 2.4, -1.32, armor); box(h, x0, 0.7, -1.4, x1, 0.9, -1.32, armor); box(h, x0 + 0.1, 1.2, -1.53, x1 - 0.1, 1.26, -1.5, accent); }
    for (const [x0, x1] of [[-2.2, -0.6], [-0.4, 1.2]]) { box(h, x0, 0.8, 1.32, x1, 2.3, 1.46, armor); box(h, x0 + 0.1, 1.7, 1.46, x1 - 0.1, 1.76, 1.5, glow); }
    box(h, -1.9, 2.65, -0.5, 2.3, 2.85, 0.5, armor); box(h, -2.4, 2.65, -0.7, -1.9, 2.75, 0.7, accent);
    part(h, new T.Mesh(new T.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark), -1.5, 2.85, 0);
    box(h, -1.0, 2.85, -0.02, -0.96, 3.5, 0.02, dark);
    // the nose: a faceted cockpit wedge, a visor, and a sensor ball under the chin
    const wedge = new T.CylinderGeometry(0.4, 1.7, 1.0, 4); wedge.rotateY(Math.PI / 4); wedge.rotateZ(Math.PI / 2);
    const nose = part(h, new T.Mesh(wedge, body), -2.95, 1.4, 0); nose.scale.set(1, 0.58, 0.97);
    const visor = part(h, new T.Mesh(new T.BoxGeometry(0.05, 0.55, 1.5), glass), -3.12, 1.92, 0); visor.rotation.z = -0.55;
    box(h, -3.3, 0.55, -0.45, -2.45, 0.85, 0.45, armor);
    part(h, new T.Mesh(new T.SphereGeometry(0.2, 12, 8), dark), -2.95, 0.55, 0);
    box(h, -3.12, 0.5, -0.08, -3.1, 0.6, 0.08, glow);
    // tail boom, a ducted fan on its end, and a canted pair of fins
    box(h, 2.4, 1.7, -0.22, 7.8, 2.3, 0.22, body); box(h, 2.4, 2.3, -0.16, 7.6, 2.4, 0.16, armor); box(h, 3.0, 1.9, 0.22, 6.8, 1.96, 0.25, glow);
    // the tail rotor: a vertical disc on the boom's right (south) side, in a plane parallel to the fuselage's side, spinning about
    // a sideways (z) axis. A gearbox stub carries its hub out clear of the boom, and a ring cowl rings the blades
    const TR = { x: 7.5, y: 1.95, z: 0.5 };
    box(h, TR.x - 0.12, TR.y - 0.12, 0.2, TR.x + 0.12, TR.y + 0.12, TR.z - 0.05, armor);
    part(h, new T.Mesh(new T.TorusGeometry(0.52, 0.04, 6, 20), duct), TR.x, TR.y, TR.z);
    for (const s of [-1, 1]) { const fin = part(h, new T.Mesh(new T.BoxGeometry(0.7, 0.9, 0.04), armor), 7.4, 2.9, s * 0.28); fin.rotation.x = s * 0.5; }
    const tail = new T.Group(); tail.position.set(TR.x, TR.y, TR.z); h.add(tail);
    for (let b = 0; b < 3; b++) { const arm = new T.Group(); arm.rotation.z = b * Math.PI / 3; tail.add(arm); part(arm, new T.Mesh(new T.BoxGeometry(0.12, 1.0, 0.03), dark), 0, 0, 0); }
    part(tail, new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.12, 10), accent), 0, 0, 0).rotation.x = Math.PI / 2;
    // stub wings, swept back, each with a ducted rotor at its tip, a missile pod underneath and a nav light (all above head height)
    const rotors = [];
    for (const s of [-1, 1]) {
      const wing = part(h, new T.Mesh(new T.BoxGeometry(1.3, 0.16, 3.5), armor), 1.45, 2.6, s * 1.75); wing.rotation.y = -s * 0.2;
      const pod = part(h, new T.Mesh(new T.BoxGeometry(0.9, 0.22, 0.28), dark), 1.5, 2.36, s * 2.3);
      pod.rotation.y = -s * 0.2;
      part(h, new T.Mesh(new T.CylinderGeometry(0.98, 0.98, 0.6, 20, 1, true), duct), 1.8, 2.8, s * 3.4);
      const lip = part(h, new T.Mesh(new T.TorusGeometry(0.98, 0.05, 6, 24), glow), 1.8, 3.1, s * 3.4); lip.rotation.x = Math.PI / 2;
      part(h, new T.Mesh(new T.CircleGeometry(0.9, 20), thrust), 1.8, 2.5, s * 3.4).rotation.x = Math.PI / 2;
      const rot = new T.Group(); rot.position.set(1.8, 2.85, s * 3.4); h.add(rot); rotors.push(rot);
      for (let b = 0; b < 3; b++) { const arm = new T.Group(); arm.rotation.y = b * Math.PI * 2 / 3; rot.add(arm); part(arm, new T.Mesh(new T.BoxGeometry(0.88, 0.03, 0.2), dark), 0.46, 0, 0); }
      part(rot, new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 0.14, 10), accent), 0, 0, 0);
      box(h, 1.7, 2.58, s * 3.4 + s * 0.98, 1.9, 2.66, s * 3.4 + s * 1.04, s < 0 ? M(0xff3030, { emissive: 0xc01010 }) : M(0x30ff60, { emissive: 0x10c030 }));
    }
    // skids
    for (const z of [-1.0, 1.0]) { box(h, -2.9, 0.08, z - 0.05, 2.6, 0.16, z + 0.05, dark); for (const x of [-1.8, 1.4]) box(h, x - 0.04, 0.16, z - 0.04, x + 0.04, P.floor - 0.1, z + 0.04, dark); }
    // the bench and its six seats along the south wall, facing the open side
    const seat = M(0x6a7076, { emissive: 0x202328 }), bench = M(0x3a3e43, { emissive: 0x15171a });
    box(h, -1.6, P.floor, 0.55, 1.75, P.floor + 0.42, 1.18, bench);
    box(h, -1.6, P.floor + 0.42, 1.12, 1.75, P.floor + 1.3, 1.2, bench);
    for (let i = 0; i < P.seats; i++) { const x = -1.3 + i * 0.5; box(h, x - 0.2, P.floor + 0.42, 0.6, x + 0.2, P.floor + 0.48, 1.1, seat); }
    for (let i = 0; i < P.seats; i++) { const x = -1.3 + i * 0.5; box(h, x - 0.2, P.floor + 0.55, 1.05, x + 0.2, P.floor + 1.0, 1.12, seat); } // seat backs
    return { group: h, rotors, tail, glow, thrust };
  }
  const seatPos = (i: number) => ({ x: HELI.x - 1.3 + i * 0.5, y: HELI.floor, z: RZ + HELI.z + 0.85, yaw: 0 });
  const exitPos = (i: number) => ({ x: HELI.x - 1.3 + i * 0.5, y: 0, z: RZ + HELI.z - 2.6 });

  // the outline shown round what you're looking at
  function outline() {
    const hl = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)), new T.LineBasicMaterial({ color: 0xffd24a, depthTest: false, transparent: true, opacity: 0.9 }));
    hl.renderOrder = 10; hl.visible = false; S.root.add(hl); S.hl = hl;
  }

  // ------------------------------------------------------------------------ what's on display, from the shop's stock
  // Called when the stock changes (and once on entering): puts each thing for sale in its place, taking away what's sold.
  function refresh(force?: boolean) {
    if (!S.root || !G.Shop.offers) return;
    const Sh = G.Shop, O = Sh.offers!;
    if (S.rosterKey !== rosterKey()) { enter(S.map); return; } // (someone joined or left: the benches are theirs)
    // only when something's changed (each change draws new signs)
    const parts0 = [...(Sh.partStock || [])].sort((a, b) => +Sh.wished(b as string) - +Sh.wished(a as string)), prec0 = [...(Sh.precStock || [])], key = JSON.stringify([O.gear, O.nvg, O.njParts, parts0, prec0, Sh.stock, parts0.concat(prec0).filter((i) => Sh.wished(i as string))]);
    if (!force && key === S.key) { vending(false); return; }
    S.key = key;
    // the pedestals: the five pieces of gear
    S.stands.forEach((tg: HangarTarget, i: number) => {
      const id = O.gear[i];
      tg.key = id || null;
      tg.sold = !id || !Sh.inStock('gear:' + id);
      clear(tg.disp!); tg.spin = null;
      if (id && !tg.sold) { const sh = showPiece(id); tg.disp!.add(sh.root); tg.spin = sh.spin; }
      const lines = id ? signFor(id, tg.sold) : ['—'], n = lines.length, SH = Math.min(0.78, 0.3 + 0.17 * n); // (as tall as its lines need)
      if (tg.sign!.material.map) tg.sign!.material.map.dispose(); tg.sign!.material.dispose();
      tg.sign!.material = signMat(lines, 512, Math.round(512 * SH / 0.94), '#101418', tg.sold ? '#ff6a5a' : '#ffd24a', '#ffffff');
      tg.sign!.scale.set(1, SH / 0.5, 1);
      tg.sign!.position.y = 0.1 + (STAND.top - 0.14) / 2;
    });
    // Nightjar's cases: one for each set they make, in stock this visit or not (and not yet, at this level: lv)
    const nvAll = G.Gear.LIST.filter((d) => d.kind === 'nvg');
    (S.njStands || []).forEach((tg: HangarTarget, i: number) => {
      const d = nvAll[i], stocked = !!d && (O.nvg || []).includes(d.id);
      tg.key = stocked ? d.id : null;
      tg.sold = !stocked || !Sh.inStock('gear:' + d.id);
      clear(tg.disp!); tg.spin = null;
      if (d && (!tg.sold || !stocked)) { const sh = nvPiece(d.id); tg.disp!.add(sh.root); tg.spin = sh.spin; } // (one not in this visit's still on show: it's their window)
      const out = !d ? null : stocked ? null : (Sh.level || 0) < (d.lv || 0) || d.tier > Math.min(4, 1 + Math.ceil((Sh.level || 0) / 2)) ? `from level ${Math.max(d.lv || 0, 2 * d.tier - 3)}` : 'NOT IN THIS VISIT';
      const lines = d ? njSign(d.id, tg.sold, out) : ['—'], SH = Math.min(0.62, 0.24 + 0.1 * lines.length);
      if (tg.sign!.material.map) tg.sign!.material.map.dispose(); tg.sign!.material.dispose();
      tg.sign!.material = signMat(lines, 600, Math.round(600 * SH / 1.2), '#0a0d0f', out ? '#7a8a90' : tg.sold ? '#ff6a5a' : '#8dffbe', '#ffffff');
      tg.sign!.scale.set(1, SH / 0.5, 1);
      tg.sign!.position.y = 0.06 + (NJ.top - 0.1) / 2;
    });
    // and the thermal sight on their counter
    if (S.njPart) {
      const tg = S.njPart, id = (O.njParts || [])[0], p = id && G.Gunsmith.PARTS[id], left = p ? Sh.count('part:' + id) : 0;
      tg.key = id || null; tg.sold = !p || !left;
      clear(tg.disp!); tg.spin = null;
      if (p && left) { const sh = partPiece(id, 0.36, NJ.counter.h); tg.disp!.add(sh.root); tg.spin = sh.spin; }
      const all = G.Gunsmith.LIST.find((q) => q.seller === 'nj'), lines = p ? (left ? [p.name, money(p.price), 'digital thermal · 2-4-8×'] : [p.name, 'SOLD']) : all ? [all.name, `from level ${2 * all.tier - 3}`] : ['—'];
      if (tg.sign!.material.map) tg.sign!.material.map.dispose(); tg.sign!.material.dispose();
      tg.sign!.material = signMat(lines, 512, 256, '#0a0d0f', p && left ? '#8dffbe' : p ? '#ff6a5a' : '#7a8a90', '#ffffff');
    }
    // the parts pedestals, and the precision showcase's stumps
    const onShow = (S.partStands || []).map((tg: HangarTarget, i: number) => [tg, parts0[i]]).concat((S.precStands || []).map((tg: HangarTarget, i: number) => [tg, prec0[i]])) as [HangarTarget, string][];
    onShow.forEach(([tg, id]: [HangarTarget, string]) => {
      const p = id && G.Gunsmith.PARTS[id];
      const left = p ? Sh.count('part:' + id) : 0, wish = !!p && Sh.wished(id);
      tg.key = id || null; tg.sold = !p || !left;
      clear(tg.disp!); tg.spin = null;
      if (p && left) { const sh = tg.signTop ? partPiece(id, OUT.size, tg.signTop) : partPiece(id); tg.disp!.add(sh.root); tg.spin = sh.spin; }
      const n = p ? G.Gunsmith.fitsPart(p).length : 0;
      const lines = !p ? ['—'] : !left ? [p.name, 'SOLD'] : [(wish ? '★ ' : '') + p.name, money(p.price) + (left > 1 ? ' · ' + left + ' left' : ''), `${G.Gunsmith.SLOT_LABEL[p.slot]}${n ? ' · fits ' + n + (n > 1 ? ' weapons' : ' weapon') : ''}`];
      const SH = Math.min(0.62, 0.22 + 0.12 * lines.length);
      if (tg.sign!.material.map) tg.sign!.material.map.dispose(); tg.sign!.material.dispose();
      tg.sign!.material = signMat(lines, 384, Math.round(384 * SH / 0.6), '#101418', left ? (wish ? '#ffffff' : '#ffd24a') : '#ff6a5a', '#ffffff');
      tg.sign!.scale.set(1, SH / 0.4, 1);
      tg.sign!.position.y = 0.08 + ((tg.signTop || PARTS.top) - 0.11) / 2;
    });
    // the pouch shelf
    S.pouchSlots!.forEach((slot: THREE.Group, i: number) => {
      clear(slot);
      const tg = S.items.find((q: HangarTarget) => q.id === 'pouch' + i), o = O.pouches[i], P = o && G.Gear.POUCHES[o.id];
      tg!.key = o ? o.id : null; tg!.sold = !o || !Sh.inStock('pouch:' + o.id);
      if (!P) return;
      const it = G.Gear.pouchItem(o.id), left = Sh.count('pouch:' + o.id);
      product(slot, it, at('pouch', i).position.x + 0.16, 1.0, 0, Math.PI / 2, signMat([P.name, left ? money(P.price) + ' · ' + left + ' left' : 'SOLD'], 400, 100, '#101418', left ? '#ffd24a' : '#ff6a5a', '#ffffff'), 0.16);
    });
    vending(force);
    // the gear and magazines Vex lists in his stock, that don't have a place on a shelf, are at his till
  }

  // the vending machine's contents: field supplies (medical items, flashbangs, frags and thermobarics)
  function vendList(_id: string) {
    const Sh = G.Shop, Gr = G.Gear, out = [], sv = Sh.services();
    for (const s of sv) {
      if (s.id.startsWith('med.')) out.push({ k: 'svc', key: s.id, item: Gr.medItem(s.id.slice(4)), name: s.name, price: s.price, sold: false });
      else if (s.id === 'flash') out.push({ k: 'svc', key: s.id, item: Gr.flashItem(), name: s.name, price: s.price, sold: false });
      else if (s.id === 'nade') out.push({ k: 'svc', key: s.id, item: Gr.fragItem(), name: s.name, price: s.price, sold: false });
      else if (s.id === 'tb') out.push({ k: 'svc', key: s.id, item: Gr.tbItem(), name: s.name, price: s.price, sold: false });
    }
    return out;
  }
  function vending(force?: boolean) {
    for (const m of S.vend) {
      const list = vendList(m.v.id), key = list.map((q) => q.k + q.key + (q.sold ? 's' : '')).join('|');
      if (!force && key === m.key) continue;
      m.key = key;
      clear(m.group);
      S.targets = S.targets.filter((t: HangarTarget) => t.vendOf !== m);
      S.items = S.items.filter((t: HangarTarget) => t.vendOf !== m);
      const { v } = m, cols = v.cols, rows = v.rows, cw = 0.9 / cols, ch = 1.3 / rows;
      list.slice(0, cols * rows).forEach((q, i) => {
        const c = i % cols, rw = Math.floor(i / cols), z = v.z - 0.45 + cw * (c + 0.5), y = 1.5 - ch * (rw + 0.5) + 0.05;
        const it = q.item, [iw, ih] = G.Gear.size(it), s = Math.min(cw * 0.7 / iw, ch * 0.55 / ih, 0.12);
        const g = new T.Group(); g.position.set(v.x - 0.06, y, z); g.rotation.y = -Math.PI / 2;
        if (!q.sold) {
          const ic = new T.Mesh(new T.PlaneGeometry(iw * s, ih * s), iconMat(G.Icons.of(it, iw, ih, false))); ic.position.z = 0.0; g.add(ic);
        }
        const tag = new T.Mesh(new T.PlaneGeometry(cw * 0.92, 0.1), signMat([q.sold ? 'SOLD' : money(q.price)], 160, 44, '#05121a', q.sold ? '#ff6a5a' : '#7dff9a')); tag.position.set(0, -ch * 0.42, 0.001); g.add(tag);
        m.group.add(g);
        const tg = addTarget({ id: `v-${v.id}-${i}`, kind: 'buy', box: [v.x - 0.3, y - ch / 2, z - cw / 2, v.x + 0.1, y + ch / 2, z + cw / 2], what: q.k as HangarWhat, key: q.key, vendOf: m, name: q.name, price: q.price, sold: q.sold, item: it });
        S.items.push(tg);
      });
    }
  }

  // ------------------------------------------------------------------------ every frame
  function update(dt: number) {
    if (!S.root) return;
    S.t += dt;
    const me = G.Me;
    // the kit on show, turning
    for (const tg of S.stands) if (tg.spin) tg.spin.rotation.y += dt * 0.5;
    for (const tg of (S.partStands || []).concat(S.precStands || [])) if (tg.spin) tg.spin.rotation.y += dt * 0.6;
    for (const tg of S.njStands || []) if (tg.spin) tg.spin.rotation.y += dt * 0.4;
    if (S.njPart && S.njPart.spin) S.njPart.spin.rotation.y += dt * 0.5;
    // Vex, standing about
    for (const o of S.rigs) {
      const idle = o.vex ? { yaw: o.yaw + Math.sin(S.t * 0.35) * 0.18 } : { yaw: o.yaw };
      o.rig.update(dt, { pos: new T.Vector3(o.x, o.y || 0, o.z), yaw: idle.yaw, pitch: 0, crouch: false, alert: false, lean: 0, state: 'alive' });
    }
    // the helicopter's rotor: slow at rest, faster the more of the squad are in their seats
    const H = S.heli;
    if (H) {
      const ids = Object.keys(G.Game.roster || {}), ready = ids.filter((id) => G.Game.roster[id].ready).length;
      const target = ids.length && ready === ids.length ? 38 : 2 + 14 * (ids.length ? ready / ids.length : 0);
      H.spin += (target - H.spin) * Math.min(1, dt * 0.8);
      H.rotors.forEach((o: THREE.Object3D, i: number) => { o.rotation.y += (i ? -1 : 1) * H.spin * dt; }); H.tail.rotation.z += H.spin * 1.6 * dt;
      const k = ids.length ? ready / ids.length : 0; H.glow.color.setRGB(0.9 - 0.8 * k, 0.15 + 0.75 * k, 0.1 + 0.2 * k); H.thrust.opacity = 0.08 + 0.4 * Math.min(1, H.spin / 38); // (status strips: red to green as the squad gets in)
      H.rotor.rotation.x = Math.sin(S.t * 0.7) * 0.004 * (1 + H.spin * 0.05);
    }
    if (G.Range) G.Range.update(dt);
    if (G.Highlights) G.Highlights.update(dt);
    // a word from Vex now and then, when you're in the store
    if (me.pos && me.pos.x > 16 && me.pos.x < 36 && me.pos.z - RZ < 26 && me.pos.z - RZ > 0 && (S.vexQuip -= dt) <= 0) { S.vexQuip = 40 + Math.random() * 30; if (!G.Game.shopOpen && Math.hypot(me.pos.x - VEX.x, me.pos.z - RZ - VEX.z) < 9) G.HUD.toast('VEX', G.VENDOR_QUIPS.hello[Math.floor(Math.random() * G.VENDOR_QUIPS.hello.length)], 2.4); }
  }
  // ------------------------------------------------------------------------ looking and pressing F
  const _o = new T.Vector3(), _d = new T.Vector3();
  function slab(b: number[], o: THREE.Vector3, d: THREE.Vector3) {
    let t0 = 0, t1 = 1e9;
    for (let a = 0; a < 3; a++) {
      const lo = b[a], hi = b[a + 3], oo = a === 0 ? o.x : a === 1 ? o.y : o.z, dd = a === 0 ? d.x : a === 1 ? d.y : d.z;
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return -1; continue; }
      let a1 = (lo - oo) / dd, a2 = (hi - oo) / dd; if (a1 > a2) { const q = a1; a1 = a2; a2 = q; }
      t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  // what's under the crosshair, in reach
  function aim() {
    const cam = G.R.camera;
    _o.copy(cam.position); _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bt = 1e9;
    for (const t of S.targets) {
      const reach = t.reach || (t.kind === 'heli' ? HELI_REACH : REACH), d = slab(t.box, _o, _d); // (t.reach: further, a TV on the wall)
      if (d >= 0 && d < reach && d < bt) { bt = d; best = t; }
    }
    return best;
  }
  const afford = (price: number) => G.Me.credits >= price;
  // what a thing says when you look at it, and what F does
  function describe(t: HangarTarget) {
    const Sh = G.Shop;
    if (t.kind === 'heli') return { html: '' };
    if (t.kind === 'pos') {
      if (t.id.startsWith('bench') && !t.mine) return { html: `${G.U.esc(t.label!)} <small>(you work at your own)</small>` };
      if (t.run) return { html: `Press <b>F</b> to ${G.U.esc(t.runText || 'use ' + t.label)}`, act: t.run };
      return { html: `Press <b>F</b> to use ${G.U.esc(t.label!)} <small>· ${G.U.esc(t.title!)}</small>`, act: () => open(t) };
    }
    // something for sale
    let name: string, price, sold = !!t.sold, extra = '', buy = null;
    if (t.what === 'gear') { if (!t.key) return { html: '' }; const d = gearOf(t.key); name = d.name; price = Sh.gearPrice(t.key); sold = !Sh.inStock('gear:' + t.key); extra = d.plate && Sh.offers!.plates![t.key] ? ' (plate fitted)' : needs(d) ? ` <small>(${needs(d)})</small>` : ''; buy = ['gear', t.key]; }
    else if (t.what === 'part') { if (!t.key) return { html: '' }; const p = G.Gunsmith.PARTS[t.key]; name = p.name; price = p.price; sold = !Sh.inStock('part:' + t.key); extra = ' <small>(to your stash)</small>'; buy = ['part', t.key]; }
    else if (t.what === 'pouch') { if (!t.key) return { html: '' }; const P = G.Gear.POUCHES[t.key]; name = P.name; price = P.price; sold = !Sh.inStock('pouch:' + t.key); buy = ['pouch', t.key]; }
    else if (t.what === 'ammo') { name = t.name!; price = t.price!; sold = !Sh.inStock('ammo:' + t.key); buy = ['ammo', t.key!]; }
    else if (t.what === 'svc') { const s = Sh.services().find((q) => q.id === t.key); if (!s) return { html: '' }; name = s.name; price = s.price; sold = !!s.disabled; extra = s.disabled ? ' <small>(no room, or nothing to do)</small>' : ''; buy = ['svc', t.key]; }
    if (!buy) return { html: '' };
    if (sold) return { html: `<b>${G.U.esc(name!)}</b> <small>sold out${t.what === 'gear' ? '' : extra}</small>` };
    return { html: `Press <b>F</b> to buy <b>${G.U.esc(name!)}</b>${extra} — <b${afford(price) ? '' : ' style="color:#ff6a5a"'}>${money(price)}</b>`, act: () => purchase(buy[0]!, buy[1]!, name!) };
  }
  function purchase(kind: string, key: string, name: string) {
    const Me = G.Me, before = Me.credits;
    G.Shop.buy(kind, key);
    if (Me.credits < before) G.HUD.toast('', `Bought ${G.U.esc(name)} <small>−${money(before - Me.credits)}</small>`, 1.4);
    refresh();
  }
  function open(t: HangarTarget) {
    G.Game.openShop(t.tab, t.title);
  }
  // seated: which seat is mine (the same on every machine: by position in the sorted roster)
  function mySeat() { const ids = Object.keys(G.Game.roster || {}).sort(); return Math.max(0, Math.min(HELI.seats - 1, ids.indexOf(G.Net.myId!))); }
  // F, from the player's interact(): returns { prompt, prog, label }; walking up to a thing and pressing F
  function interact(me: typeof G.Me, dt: number, held: boolean, edge: boolean) {
    const out = { prompt: '', prog: -1, label: '' };
    if (G.Game.shopOpen) return out;
    // seated in the helicopter: hold F to get out
    if (me.seat != null) {
      out.prompt = 'Hold <b>F</b> to leave your seat <small>(you\'re ready: the helicopter goes when everyone is)</small>';
      if (held && !me.fLatch) { S.hold += dt; out.prog = S.hold / HOLD; out.label = 'Getting out'; if (S.hold >= HOLD) { S.hold = 0; me.fLatch = true; unseat(me); } } else S.hold = 0;
      return out;
    }
    const t = aim();
    S.hover = t;
    if (!t) { S.hold = 0; return out; }
    if (t.kind === 'heli') {
      out.prompt = 'Hold <b>F</b> to climb in and ready up';
      if (held && !me.fLatch) { S.hold += dt; out.prog = S.hold / HOLD; out.label = 'Climbing in'; if (S.hold >= HOLD) { S.hold = 0; me.fLatch = true; seat(me); } } else S.hold = 0;
      return out;
    }
    S.hold = 0;
    const d = describe(t);
    out.prompt = d.html;
    if (edge && d.act) { me.fLatch = true; d.act(); }
    return out;
  }
  function seat(me: typeof G.Me) {
    const i = mySeat(), p = seatPos(i);
    me.seat = i; me.pos.set(p.x, p.y, p.z); me.vel.set(0, 0, 0); me.yaw = p.yaw; me.pitch = 0; me.crouch = true; me.stowed = true; me.mouse.l = me.mouse.r = false;
    G.Shop.setReady(true);
    G.Audio.click();
  }
  function unseat(me: typeof G.Me) {
    const p = exitPos(me.seat!);
    me.seat = null; me.pos.set(p.x, p.y, p.z); me.vel.set(0, 0, 0); me.crouch = false; me.stowed = false; me.yaw = Math.PI;
    G.Shop.setReady(false);
    G.Audio.click();
  }
  // the highlight round what you're looking at (called once a frame from the player's camera update)
  function mark() {
    const hl = S.hl;
    if (!hl) return;
    const t = G.Game.shopOpen || (G.Me && G.Me.seat != null) ? null : S.hover;
    if (!t || t.kind === 'heli' || (t.kind === 'buy' && !describe(t).act)) { hl.visible = false; return; }
    const b = t.box;
    hl.visible = true; hl.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2 - RZ); hl.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
  }
  // where you stand when you come in: on the pad, in front of the opening
  function spawnAt(i: number) { const x = 26 + (i % 3 - 1) * 1.6, z = RZ + 30.4 + Math.floor(i / 3) * 1.4; return { x, z }; }

  return { decorate, enter, leave, update, refresh, aim, interact, mark, seatPos, exitPos, spawnAt, ship, padMesh, load, fixtures, at, baked: () => !!BAKED, FILE, S, HELI, HOLD, RZ };
})();
G.Hangar = G_Hangar;
window.addEventListener('gunicons', () => { if (G_Hangar.S.root) G_Hangar.refresh(true); }); // (a gun's picture came in after its sign was drawn: js/icons.ts)
interface GameModules { Hangar: typeof G_Hangar; }
