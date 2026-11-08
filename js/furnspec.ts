'use strict';
// Furniture and home interiors as data (docs/furniture-data.md is the contract). Loaded by the page, the server's thread and
// the tools alike: nothing here draws, and there's no THREE in it.
//   piece()    - one piece's description: what it's made of (box, cylinder, sphere, icosahedron, a traced side profile), each
//                with its size, place, turn and material, in the piece's own frame; and its solids (js/furniture.ts solids).
//   describe() - a level's: every piece where it stands, and the rooms' floors, rugs, skirting, pictures and clocks, as
//                js/furnmesh.ts turns them into meshes on the page.
// What goes where, how big, what's on the shelves and what a festival's dressed with stays in code, seeded as ever (the
// pieces' recipes: js/furniture.ts R, js/homes.ts, js/residents.ts; the plan: js/furniture.ts plan, js/homes.ts fill): only
// what each piece is made of is data. Looks draw on random streams seeded by what they're the looks of (a piece by its own
// v, a room by the level's seed and where the room is: describe), so nothing looks as it does for what came before it.
// A texture, by what paints it (k) and with what (a: its colours), from the random stream's state (s) where its painting
// starts; rep, rot: its repeat over a face and its turn. 'crate' is the level's crate texture (js/level.ts _tex), 'pack'
// the stock's label atlas (packPaint).
interface FdTex { k: string; a?: (string | boolean)[]; s?: number; rep?: number[]; rot?: number }
// A material, by value: colour (c, sRGB hex), roughness (r), metalness (m) and what else it has (x: emissive,
// emissiveIntensity, flatShading, transparent, opacity, depthWrite; map: a texture's index in the level's tex).
interface FdMat { c: number; r: number; m: number; x?: Record<string, any> }
type FdPrimKind = 'box' | 'cyl' | 'sph' | 'ico' | 'side' | 'plane' | 'grid';
// A primitive: t its kind, m its material (an index; while it's being described, the material itself), s its size, p
// where (its centre), r its turn [rx, ry] (three's 'YXZ': turned to face first, then tilted), and by kind: seg (a
// cylinder's sides; a grid's [cols, rows]), lb (a label of the stock atlas over every face), pts, b (a side profile's
// outline and its rounded edges), uv (a plane's own uv, corner by corner), z (a grid's heights, corner by corner)
interface FdPrim { t: FdPrimKind; m: any; s: number[]; p: number[]; r?: number[]; seg?: number | number[]; lb?: number; uv?: number[]; pts?: number[][]; b?: number; z?: number[] }
// What stops people (boxes), rounds and eyes (ray, hulls), in the piece's frame: js/furniture.ts solids, worldBoxes
interface FdSolids { boxes: any[]; ray?: any[]; hulls?: number[][] }
// A group: primitives in one frame (at, turned q quarter-turns about y if q is there: a piece; else only moved), and the
// piece it is (piece, v, style; solids when asked for)
interface FdGroup { at: number[]; q?: number; piece?: string; v?: number; style?: any; room?: number; solids?: FdSolids; prims: FdPrim[] }
interface FdLevel { v: number; mats: FdMat[]; tex: FdTex[]; groups: FdGroup[] }
type FdRng = (() => number) & { st(): number };
type FdMk<R> = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => R;
interface FdKit {
  rnd(): number; pick<T>(a: T[]): T; tint(hex: number, f: number): number;
  mat(hex: number, rough?: number, metal?: number, extra?: Record<string, any>): FdMat;
  box(m: FdMat, w: number, h: number, d: number, x: number, y: number, z: number, ry?: number, rx?: number): void;
  cyl(m: FdMat, rt: number, rb: number, h: number, x: number, y: number, z: number, seg?: number, rx?: number): void;
  cylX(m: FdMat, rt: number, rb: number, h: number, x: number, y: number, z: number, seg?: number): void;
  sph(m: FdMat, r: number, x: number, y: number, z: number): void;
  ico(m: FdMat, r: number, x: number, y: number, z: number, ry?: number): void;
  side(m: FdMat, pts: number[][], w: number, x?: number, b?: number): void;
  leaf(): FdMat; screen(): FdMat; shade(): FdMat; crate(): FdMat;
  pack(kind: string, shade?: number): FdMat; label(): number;
  boxL(m: FdMat, lb: number, w: number, h: number, d: number, x: number, y: number, z: number, ry?: number, rx?: number): void;
  cylL(m: FdMat, lb: number, rt: number, rb: number, h: number, x: number, y: number, z: number, seg?: number): void;
  tableLamp(x: number, y: number, z: number): void; plantSmall(x: number, y: number, z: number): void; fruit(x: number, y: number, z: number): void;
}
const G_FurnSpec = (() => {
  const VERSION = 1;
  // G.U.rng's generator (mulberry32), its state readable: a texture's painting starts where the stream is (FdTex.s), and
  // srng(s) carries on from there exactly as the stream would have
  const srng = (seed: number): FdRng => {
    let a = seed >>> 0;
    const f = (() => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }) as FdRng;
    f.st = () => a >>> 0;
    return f;
  };
  // a colour made lighter or darker as three.js does it (in linear light: sRGB in, sRGB out, the same hex to the bit)
  const toLin = (c: number) => (c < 0.04045) ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
  const toSrgb = (c: number) => (c < 0.0031308) ? c * 12.92 : 1.055 * (Math.pow(c, 0.41666)) - 0.055;
  const byte = (c: number) => Math.round(Math.max(0, Math.min(255, toSrgb(c) * 255)));
  const tint = (hex: number, f: number) => {
    const r = Math.min(1, toLin((hex >> 16 & 255) / 255) * f), g = Math.min(1, toLin((hex >> 8 & 255) / 255) * f), b = Math.min(1, toLin((hex & 255) / 255) * f);
    return byte(r) * 65536 + byte(g) * 256 + byte(b);
  };
  // a canvas that paints nothing: a texture described, not painted, still draws on the stream as its painting would
  const NULL_CTX: any = new Proxy({}, { get: (_t, k) => (k === 'addColorStop' ? () => {} : () => NULL_CTX), set: () => true });
  const nullMk: FdMk<null> = (w, h, draw) => { draw(NULL_CTX, w, h); return null; };

  // ---------------------------------------------------------------- what paints the textures
  // Packaging: an atlas of printed labels, PACK_N x PACK_N of them, each a product's face (a colour, a band across it,
  // a maker's mark, lines of type, a printed edge), in the colours print has, not pure ones (made once, kept). A piece
  // of stock takes one of them over every face (k.boxL, k.cylL): it reads as a packet, a tin, a bottle with a label,
  // not a block of colour, and the light falls on card and paper, matte.
  const PACK_N = 8;
  function packPaint<R>(mk: FdMk<R>): R {
    const S = 128;
    return mk(S * PACK_N, S * PACK_N, (g) => {
    const rnd = G.U.rng(0x9ac4a6e);
    const INK = ['#b8392e', '#d8a632', '#2c5aa6', '#2f8a48', '#d0702c', '#6c3a9a', '#26262a', '#b8386e', '#3a9a9e', '#9a7238', '#e8e2d2', '#5a2a22', '#c8c03a', '#1e3a5e', '#e6d9b8', '#8a1e24'];
    const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
    for (let ty = 0; ty < PACK_N; ty++) for (let tx = 0; tx < PACK_N; tx++) {
      const x0 = tx * S, y0 = ty * S, bg = pick(INK);
      let a = pick(INK); while (a === bg) a = pick(INK);
      g.save(); g.beginPath(); g.rect(x0, y0, S, S); g.clip();
      g.fillStyle = bg; g.fillRect(x0, y0, S, S);
      const sh = g.createLinearGradient(0, y0, 0, y0 + S); sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(1, 'rgba(0,0,0,0.14)'); g.fillStyle = sh; g.fillRect(x0, y0, S, S);
      const style = rnd(), light = ['#e8e2d2', '#e6d9b8', '#c8c03a', '#d8a632'].includes(bg), type = light ? '#2a2420' : '#f0ebe0';
      if (style < 0.4) { // a band across the middle, the mark on it
        const by = y0 + S * (0.3 + rnd() * 0.15), bh = S * (0.22 + rnd() * 0.12);
        g.fillStyle = rnd() < 0.5 ? '#ece6d8' : a; g.fillRect(x0, by, S, bh);
        g.fillStyle = rnd() < 0.5 ? bg : '#26262a'; g.font = `bold ${Math.round(bh * 0.62)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(pick(['CRISP', 'ZAP', 'MAXI', 'GOLD', 'FRESH', 'KO', 'BOLT', 'RUSH', 'PURE', 'MEGA', 'SNAX', 'FIZZ']), x0 + S / 2, by + bh / 2, S * 0.9);
      } else if (style < 0.7) { // a round mark, a burst of colour behind it
        const cx = x0 + S * (0.35 + rnd() * 0.3), cy = y0 + S * (0.35 + rnd() * 0.2), r = S * (0.18 + rnd() * 0.1);
        g.fillStyle = a; g.beginPath(); g.ellipse(cx, cy, r * 1.3, r, 0, 0, 7); g.fill();
        g.fillStyle = '#ece6d8'; g.beginPath(); g.ellipse(cx, cy, r * 0.8, r * 0.55, 0, 0, 7); g.fill();
        g.fillStyle = a; g.font = `bold ${Math.round(r * 0.6)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pick(['Co', 'No.1', 'Hi', 'XL', 'OK', '99']), cx, cy, r * 1.4);
      } else { // a window onto the product: a lighter panel, a shape in it
        const px = x0 + S * 0.18, py = y0 + S * 0.3, pw = S * 0.64, ph = S * 0.4;
        g.fillStyle = '#e8dcc0'; g.fillRect(px, py, pw, ph);
        g.fillStyle = pick(['#a8642a', '#c89a4a', '#7a3a22', '#d8b060', '#6a8a3a']);
        for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(px + pw * (0.15 + rnd() * 0.7), py + ph * (0.25 + rnd() * 0.5), pw * 0.12, ph * 0.18, rnd() * 3, 0, 7); g.fill(); }
        g.fillStyle = a; g.fillRect(x0, y0 + S * 0.08, S, S * 0.16);
      }
      g.fillStyle = type; g.globalAlpha = 0.8; // lines of type
      for (let i = 0; i < 3; i++) g.fillRect(x0 + S * 0.14, y0 + S * (0.76 + i * 0.06), S * (0.3 + rnd() * 0.5), S * 0.025);
      g.globalAlpha = 1;
      g.fillStyle = a; g.fillRect(x0, y0 + S * 0.94, S, S * 0.06); // the printed edge
      g.restore();
    }
    });
  }
  // The floors', rugs' and pictures' textures, each kind painted on the canvas mk makes (rnd: the stream it draws on)
  function painters<R>(rnd: () => number, mk: FdMk<R>) {
    const speckle = (g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number) => { for (let i = 0; i < n; i++) { const v = rnd() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${rnd() * a})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); } };
    return {
      wood: (base: string) => mk(256, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        const rows = 8, rh = h / rows;
        for (let i = 0; i < rows; i++) {
          let x = -rnd() * 200;
          while (x < w) {
            const len = 120 + rnd() * 140, l = (rnd() - 0.5) * 0.16;
            g.fillStyle = l > 0 ? `rgba(255,240,220,${l})` : `rgba(0,0,0,${-l})`;
            g.fillRect(x, i * rh, len, rh);
            for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(40,20,5,${0.05 + rnd() * 0.08})`; g.fillRect(x, i * rh + rnd() * rh, len, 1); }
            g.fillStyle = 'rgba(20,10,0,0.55)'; g.fillRect(x, i * rh, 2, rh);
            x += len;
          }
          g.fillStyle = 'rgba(20,10,0,0.5)'; g.fillRect(0, i * rh, w, 2);
        }
      }),
      tile: (base: string, grout: string) => mk(128, 128, (g, w, h) => {
        g.fillStyle = grout; g.fillRect(0, 0, w, h);
        const n = 4, s = w / n;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          g.fillStyle = base; g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
          g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.06})`; g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
        }
        speckle(g, w, h, 300, 0.06);
      }),
      carpet: (base: string) => mk(128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 0.12); }),
      // bare concrete, cloudy, a few stains
      concrete: (base: string) => mk(256, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + rnd() * 0.05})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 14 + rnd() * 50, 0, 7); g.fill(); }
        for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(20,16,10,0.14)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 16, 0, 7); g.fill(); }
        speckle(g, w, h, 1800, 0.08);
      }),
      // lino in a check of two colours, scuffed
      lino: (base: string, other: string) => mk(128, 128, (g, w, h) => {
        const s = w / 2;
        g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = other; g.fillRect(0, 0, s, s); g.fillRect(s, s, s, s);
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.strokeRect(0, 0, s, s); g.strokeRect(s, s, s, s);
        speckle(g, w, h, 500, 0.08);
      }),
      // parquet in a herringbone: blocks four long by one wide, laid out on a lattice that repeats every eight
      parquet: (base: string) => mk(256, 256, (g, w, h) => {
        const u = w / 8, block = (x: number, y: number, bw: number, bh: number) => { const v = (rnd() - 0.5) * 0.2; g.fillStyle = base; g.fillRect(x, y, bw, bh); g.fillStyle = v > 0 ? `rgba(255,235,200,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(x, y, bw, bh); g.strokeStyle = 'rgba(30,15,0,0.55)'; g.lineWidth = 1.5; g.strokeRect(x, y, bw, bh); };
        for (let i = -16; i <= 16; i++) for (let j = -6; j <= 6; j++) {
          const x = (i + 4 * j) * u, y = (i - 4 * j) * u;
          if (x < -5 * u || y < -5 * u || x > w + u || y > h + 4 * u) continue;
          block(x, y, 4 * u, u); block(x + 4 * u, y - 3 * u, u, 4 * u);
        }
      }),
      // a lawn at night: dark green with blades and the odd bare patch
      grass: () => mk(256, 256, (g, w, h) => {
        g.fillStyle = '#2c4423'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${60 + rnd() * 30},${50 + rnd() * 20},30,0.25)`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 10 + rnd() * 25, 0, 7); g.fill(); }
        for (let i = 0; i < 5000; i++) { const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(20,40,15,${0.3 + rnd() * 0.4})` : `rgba(${80 + rnd() * 40},${110 + rnd() * 50},${50 + rnd() * 30},${0.25 + rnd() * 0.35})`; g.fillRect(rnd() * w, rnd() * h, 1, 2 + rnd() * 4); }
      }),
      // a mountain trail: decomposed granite, tan grit and pebbles, the odd tuft (soil: a garden's dark, worked earth)
      dirt: (base: string, dark?: boolean) => mk(256, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,24,12' : '255,236,210'},${0.04 + rnd() * 0.06})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 16 + rnd() * 50, 0, 7); g.fill(); }
        for (let i = 0; i < 2600; i++) { const v = rnd(); g.fillStyle = v < 0.4 ? `rgba(30,18,10,${0.2 + rnd() * 0.3})` : v < 0.8 ? `rgba(255,240,220,${0.12 + rnd() * 0.2})` : `rgba(190,120,100,${0.3 + rnd() * 0.3})`; const s = 1 + rnd() * 2.5; g.fillRect(rnd() * w, rnd() * h, s, s); }
        if (!dark) for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${90 + rnd() * 40},${100 + rnd() * 30},60,0.5)`; const x = rnd() * w, y = rnd() * h; for (let j = 0; j < 6; j++) g.fillRect(x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 3, 1, 3 + rnd() * 3); }
      }),
      // flagstones: irregular slabs of pinkish stone in grey mortar
      flag: (base: string) => mk(256, 256, (g, w, h) => {
        g.fillStyle = '#6e645c'; g.fillRect(0, 0, w, h);
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
          const x = i * 64 + (j % 2) * 20, y = j * 64, v = (rnd() - 0.5) * 0.18;
          g.fillStyle = base; g.beginPath(); g.moveTo(x + 3 + rnd() * 6, y + 3 + rnd() * 5); g.lineTo(x + 58 + rnd() * 5, y + 2 + rnd() * 6); g.lineTo(x + 61, y + 58 + rnd() * 4); g.lineTo(x + 2 + rnd() * 6, y + 60); g.closePath(); g.fill();
          g.fillStyle = v > 0 ? `rgba(255,235,220,${v})` : `rgba(0,0,0,${-v})`; g.fill();
        }
        speckle(g, w, h, 1500, 0.08);
      }),
      rug: (a: string, b: string, c: string) => mk(256, 256, (g, w, h) => {
        g.fillStyle = a; g.fillRect(0, 0, w, h);
        g.strokeStyle = b; g.lineWidth = 14; g.strokeRect(14, 14, w - 28, h - 28);
        g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(30, 30, w - 60, h - 60);
        g.fillStyle = b;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const x = 64 + i * 64, y = 64 + j * 64;
          g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 20, y); g.lineTo(x, y + 20); g.lineTo(x - 20, y); g.closePath(); g.fill();
        }
        speckle(g, w, h, 1500, 0.1);
      }),
      art: () => mk(128, 96, (g, w, h) => {
        if (rnd() < 0.5) { // landscape
          const sky = g.createLinearGradient(0, 0, 0, h);
          const top = U8(), hor = U8();
          sky.addColorStop(0, `rgb(${top})`); sky.addColorStop(1, `rgb(${hor})`);
          g.fillStyle = sky; g.fillRect(0, 0, w, h);
          g.fillStyle = `rgba(255,240,200,0.8)`; g.beginPath(); g.arc(20 + rnd() * 88, 18 + rnd() * 20, 6 + rnd() * 6, 0, 7); g.fill();
          for (let l = 0; l < 3; l++) {
            const y0 = h * (0.5 + l * 0.15), sh = 30 + l * 25;
            g.fillStyle = `rgb(${sh + rnd() * 30},${sh + 20 + rnd() * 40},${sh * 0.6 + rnd() * 20})`;
            g.beginPath(); g.moveTo(0, h);
            for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.05 + l * 2 + rnd()) * 8);
            g.lineTo(w, h); g.closePath(); g.fill();
          }
        } else { // abstract
          g.fillStyle = `rgb(${U8()})`; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 6; i++) {
            g.fillStyle = `rgba(${U8()},0.85)`;
            if (rnd() < 0.5) g.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 50, 10 + rnd() * 40);
            else { g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 22, 0, 7); g.fill(); }
          }
        }
      }),
    };
    function U8() { return `${Math.floor(40 + rnd() * 200)},${Math.floor(40 + rnd() * 200)},${Math.floor(40 + rnd() * 200)}`; }
  }
  const TEX_KINDS = ['wood', 'tile', 'carpet', 'concrete', 'lino', 'parquet', 'grass', 'dirt', 'flag', 'rug', 'art'];
  // The view out of a window (js/furnmesh.ts outsideMaterial): the sky and skyline panorama, then the near layer
  function outsidePaint<R>(rnd: () => number, mk: FdMk<R>): [R, R] {
    // sky + skyline panorama; the horizon sits at 62% down the canvas
    const sky = mk(2048, 512, (g, w, h) => {
      const hz = Math.round(h * 0.62);
      const gr = g.createLinearGradient(0, 0, 0, hz);
      gr.addColorStop(0, '#04070f'); gr.addColorStop(0.7, '#0e1626'); gr.addColorStop(1, '#3a2c26');
      g.fillStyle = gr; g.fillRect(0, 0, w, hz);
      g.fillStyle = '#07080a'; g.fillRect(0, hz, w, h - hz);
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.7})`; g.fillRect(rnd() * w, rnd() * hz * 0.75, rnd() < 0.1 ? 2 : 1, 1); }
      const mx = 300 + rnd() * 1400, my = 70 + rnd() * 60;
      const mg = g.createRadialGradient(mx, my, 0, mx, my, 60); mg.addColorStop(0, 'rgba(220,225,240,0.35)'); mg.addColorStop(1, 'rgba(220,225,240,0)');
      g.fillStyle = mg; g.fillRect(mx - 60, my - 60, 120, 120);
      g.fillStyle = '#e8ecf4'; g.beginPath(); g.arc(mx, my, 13, 0, 7); g.fill();
      // skyline: far, then nearer and taller, with lit windows and aircraft-warning lights
      for (const [col, minH, maxH, lit] of [['#0d121c', 15, 55, 0.05], ['#090c13', 25, 120, 0.22], ['#06080c', 10, 60, 0.3]] as [string, number, number, number][]) {
        let x = -20;
        while (x < w) {
          const bw = 20 + rnd() * 70, bh = minH + rnd() * (maxH - minH);
          g.fillStyle = col; g.fillRect(x, hz - bh, bw, bh + 2);
          for (let wy = hz - bh + 4; wy < hz - 3; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
            if (rnd() < lit) { g.fillStyle = rnd() < 0.7 ? `rgba(255,${190 + rnd() * 50},${110 + rnd() * 60},${0.5 + rnd() * 0.5})` : 'rgba(170,200,255,0.7)'; g.fillRect(wx, wy, 2, 3); }
          }
          if (bh > 90 && rnd() < 0.5) { g.fillStyle = '#ff3020'; g.fillRect(x + bw / 2, hz - bh - 3, 2, 2); }
          x += bw + rnd() * 6;
        }
      }
    });
    // near layer, 24 m wide x 8 m tall, repeating along the street
    const near = mk(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const px = w / 24, py = h / 8, Y = (m: number) => h - m * py;
      for (const ux of [6, 18]) { // streetlamps, glow first
        const lx = ux * px, ly = Y(5);
        const gl = g.createRadialGradient(lx, ly, 0, lx, ly, 70); gl.addColorStop(0, 'rgba(255,200,120,0.55)'); gl.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = gl; g.fillRect(lx - 70, ly - 70, 140, 140);
      }
      for (const ux of [2.5, 11.5, 21]) { // a few street trees between the lamps
        if (rnd() < 0.25) continue;
        const tx = (ux + (rnd() - 0.5) * 2) * px, th = 3.6 + rnd() * 2;
        g.fillStyle = '#0a0806'; g.fillRect(tx - 3, Y(th * 0.45), 6, th * 0.45 * py);
        for (let k = 0; k < 7; k++) {
          const r = (0.6 + rnd() * 0.7) * px;
          g.fillStyle = ['#05070a', '#070a0c', '#090c0e'][k % 3];
          g.beginPath(); g.ellipse(tx + (rnd() - 0.5) * 1.6 * px, Y(th * (0.6 + rnd() * 0.35)), r, r * 0.85, 0, 0, 7); g.fill();
        }
      }
      for (const ux of [6, 18]) { // lamp posts and heads
        const lx = ux * px;
        g.fillStyle = '#0c0c0e'; g.fillRect(lx - 2, Y(5), 4, 5 * py); g.fillRect(lx - 2, Y(5.05), 22, 5);
        g.fillStyle = '#ffe2b0'; g.fillRect(lx + 10, Y(4.95), 12, 4);
      }
      g.fillStyle = '#0b0b0c'; // fence
      for (let x = 0; x < w; x += 2 * px) g.fillRect(x, Y(1.3), 4, 1.3 * py);
      g.fillRect(0, Y(1.15), w, 4); g.fillRect(0, Y(0.5), w, 4);
      for (let i = 0; i < 12; i++) { g.fillStyle = '#070b08'; g.beginPath(); g.ellipse(rnd() * w, h, (0.6 + rnd()) * px, (0.5 + rnd() * 0.5) * py, 0, Math.PI, 0); g.fill(); } // hedges
    });
    return [sky, near];
  }

  // ---------------------------------------------------------------- describing
  const PI = Math.PI;
  // a turn as a primitive keeps it: [rx, ry], left out when it's none
  const rot = (ry = 0, rx = 0) => (Object.is(rx, 0) && Object.is(ry, 0) ? undefined : [rx, ry]);
  // A grid's heights (a floor laid over rolling ground): f at each of its corners, in three's PlaneGeometry order (row by
  // row from +y; x, y as its vertices hold them, 32-bit)
  const gridZ = (w: number, h: number, nx: number, ny: number, f: (x: number, y: number) => number) => {
    const out: number[] = [], sw = w / nx, sh = h / ny;
    for (let iy = 0; iy <= ny; iy++) { const y = iy * sh - h / 2; for (let ix = 0; ix <= nx; ix++) out.push(f(Math.fround(ix * sw - w / 2), Math.fround(-y))); }
    return out;
  };
  // A plane's corners' uv (three's: [0,1], [1,1], [0,0], [1,0]) as f makes them
  const PLANE_UV = [[0, 1], [1, 1], [0, 0], [1, 0]];
  const planeUV = (f: (u: number, v: number) => number[]) => PLANE_UV.flatMap(([u, v]) => f(u, v));

  // The recorder: the kit every piece's build() is handed (js/furniture.ts R), and what it's recorded so far. Its looks
  // draw on cur (rnd0 until a piece or a room is given a stream of its own: describe).
  function recorder(rnd0: FdRng) {
    const cache = new Map<string, FdMat>(), texIds = new Map<FdTex, number>();
    const texId = (t: FdTex) => { if (!texIds.has(t)) texIds.set(t, texIds.size); return texIds.get(t)!; };
    const D = {
      rnd0, cur: rnd0, groups: [] as FdGroup[], group: null as FdGroup | null, frame: { at: [0, 0, 0] } as { at: number[]; q?: number; meta?: Record<string, any> },
      rnd: () => D.cur(),
      // A colour's material: one per colour and finish (the finish: everything but the colour, what's drawn as one mesh)
      mat(hex: number, rough = 0.8, metal = 0, extra?: Record<string, any>): FdMat {
        const fk = rough + '|' + metal + (extra ? JSON.stringify(Object.keys(extra)) + (extra.map ? texId(extra.map) : '') + (extra.emissive || '') : ''), key = hex + '|' + fk;
        let m = cache.get(key);
        if (!m) { m = { c: hex, r: rough, m: metal }; if (extra) m.x = Object.assign({}, extra); cache.set(key, m); }
        return m;
      },
      // what follows is in this frame (at, turned q quarter-turns about y), and of this piece or room (meta)
      begin(at: number[], q?: number, meta?: Record<string, any>) { D.frame = { at, q, meta }; D.group = null; },
      push(p: FdPrim) {
        if (!D.group) {
          const f = D.frame, g: FdGroup = { at: f.at } as FdGroup;
          if (f.q != null) g.q = f.q;
          if (f.meta) for (const [key, v] of Object.entries(f.meta)) if (v !== undefined) (g as any)[key] = v;
          g.prims = []; D.groups.push(g); D.group = g;
        }
        if (p.r === undefined) delete p.r;
        D.group.prims.push(p);
      },
      // a texture: painted nowhere, but its painting drawn on the stream (the state it starts from is how it's painted)
      tex(k: string, a: (string | boolean)[]): FdTex { const t: FdTex = { k, a, s: D.cur.st() }; (painters(D.rnd, nullMk) as any)[k](...a); return t; },
      // the description: its materials and textures those in use, numbered as they're first used
      done(): FdLevel {
        const mats: FdMat[] = [], tex: FdTex[] = [], mi = new Map<FdMat, number>(), ti = new Map<FdTex, number>();
        const tIdx = (t: FdTex) => { if (!ti.has(t)) { ti.set(t, tex.length); const c: FdTex = { k: t.k }; if (t.a && t.a.length) c.a = t.a; if (t.s != null) c.s = t.s; if (t.rep) c.rep = t.rep; if (t.rot) c.rot = t.rot; tex.push(c); } return ti.get(t)!; };
        const mIdx = (m: FdMat) => {
          if (!mi.has(m)) {
            mi.set(m, mats.length);
            const c: FdMat = { c: m.c, r: m.r, m: m.m };
            if (m.x) { c.x = {}; for (const key of Object.keys(m.x)) c.x[key] = key === 'map' ? tIdx(m.x.map) : m.x[key]; }
            mats.push(c);
          }
          return mi.get(m)!;
        };
        for (const g of D.groups) for (const p of g.prims) p.m = mIdx(p.m);
        return { v: VERSION, mats, tex, groups: D.groups };
      },
      k: null as unknown as FdKit,
    };
    const mat = D.mat, rnd = D.rnd, push = D.push;
    const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
    const CRATE: FdTex = { k: 'crate' }, PACK: FdTex = { k: 'pack' };
    const shadeMat = mat(0xf2e2c0, 0.9, 0, { emissive: 0xffc070, emissiveIntensity: 0.55 });
    const k: FdKit = {
      rnd, pick, tint, mat,
      box: (m, w, h, d, x, y, z, ry, rx) => push({ t: 'box', m, s: [w, h, d], p: [x, y, z], r: rot(ry, rx) }),
      cyl: (m, rt, rb, h, x, y, z, seg = 14, rx = 0) => push({ t: 'cyl', m, s: [rt, rb, h], seg, p: [x, y, z], r: rot(0, rx) }),
      cylX: (m, rt, rb, h, x, y, z, seg = 14) => push({ t: 'cyl', m, s: [rt, rb, h], seg, p: [x, y, z], r: [PI / 2, PI / 2] }), // (lying along x)
      sph: (m, r, x, y, z) => push({ t: 'sph', m, s: [r], p: [x, y, z] }),
      ico: (m, r, x, y, z, ry) => { const a = rnd() * 6; push({ t: 'ico', m, s: [r], p: [x, y, z], r: rot(ry ?? a, 0) }); },
      // a side profile ([z, y] points: along the piece and up) drawn across w at x, its edges rounded by b (a car's body)
      side: (m, pts, w, x = 0, b = 0) => push({ t: 'side', m, s: [w], pts, b, p: [x, 0, 0] }),
      leaf: () => mat(pick([0x3f6b35, 0x4d7a3a, 0x2f5a2c, 0x5a8040]), 0.85, 0, { flatShading: true }),
      screen: () => mat(0x0b0f14, 0.15, 0.2, { emissive: pick([0x1a2a3a, 0x0c1622, 0x202a20]), emissiveIntensity: 0.6 }),
      shade: () => shadeMat,
      crate: () => mat(0xffffff, 0.8, 0, { map: CRATE }),
      // stock: one of the packaging atlas' labels (packPaint) over a box or a cylinder; its material by what it's made
      // of (card and paper, a tin, a plastic bottle), each a little lighter or darker (shade: in the shadow of a shelf)
      pack: (kind, shade = 1) => mat(tint(0xffffff, (0.86 + rnd() * 0.14) * shade), kind === 'tin' ? 0.42 : kind === 'bottle' ? 0.3 : 0.82, kind === 'tin' ? 0.15 : 0, { map: PACK }),
      label: () => Math.floor(rnd() * PACK_N * PACK_N),
      boxL: (m, lb, w, h, d, x, y, z, ry, rx) => push({ t: 'box', m, s: [w, h, d], p: [x, y, z], r: rot(ry, rx), lb }),
      cylL: (m, lb, rt, rb, h, x, y, z, seg = 14) => push({ t: 'cyl', m, s: [rt, rb, h], seg, p: [x, y, z], lb }),
      tableLamp(x, y, z) { k.cyl(mat(pick([0x2a2a2a, 0xb8a060, 0xe8e4da, 0x6d7b66]), 0.4, 0.3), 0.05, 0.08, 0.22, x, y + 0.11, z); k.cyl(shadeMat, 0.1, 0.16, 0.2, x, y + 0.31, z); },
      plantSmall(x, y, z) { k.cyl(mat(pick([0xa0522d, 0xe8e4da, 0x2f3a40]), 0.7), 0.07, 0.055, 0.12, x, y + 0.06, z); for (let i = 0; i < 3; i++) k.ico(k.leaf(), 0.06 + rnd() * 0.04, x + (rnd() - 0.5) * 0.06, y + 0.16 + rnd() * 0.08, z + (rnd() - 0.5) * 0.06); },
      fruit(x, y, z) { k.cyl(mat(pick([0xe8e4da, 0x6b4428, 0x3a5a6a]), 0.4), 0.13, 0.08, 0.06, x, y + 0.03, z); for (let i = 0; i < 4; i++) k.sph(mat(pick([0xd8642a, 0xc0302a, 0x8fb040, 0xe8c040]), 0.5), 0.04, x + (rnd() - 0.5) * 0.12, y + 0.08, z + (rnd() - 0.5) * 0.12); },
    };
    D.k = k;
    return D;
  }

  // One piece, on its own: as it's drawn wherever it stands (name: js/furniture.ts R; v: its own seed; style: what a
  // resident's or the plan's picked for it), its looks drawn on a stream from seed. With its solids.
  function piece(name: string, v: number, style?: any, seed = 1): FdLevel {
    const F = G.Furniture, D = recorder(srng(seed));
    D.begin([0, 0, 0], 0, { piece: name, v, style, solids: F.solids(F.R[name], v) });
    F.R[name].build(D.k, v, style);
    return D.done();
  }

  // A level's furniture and the rooms' dressing, as js/furnmesh.ts draws it (solids: each piece's solids too, as the
  // golden test has them; the simulation has its own from the same pieces, js/furniture.ts worldBoxes).
  function describe(map: any, opts: { solids?: boolean } = {}): FdLevel {
    const L = G.Level, F = G.Furniture, R = F.R, TS = L.TS, { W, t } = map;
    const D = recorder(srng((map.seed ^ 0x5eed1e) >>> 0)), k = D.k, mat = D.mat, rnd = D.rnd, pick = k.pick;
    // (every piece's looks draw on a stream of its own, seeded by its v and where it stands (in centimetres: fence panels
    // and the like share a few v's between them, js/level.ts refine), and every room's on one of its own, seeded by the
    // level's seed and where the room is: so nothing looks as it does for what was described before it, and a room a
    // resident's moved into, or a piece taken out, changes nothing else. docs/furniture-data.md.)
    const cm = (a: number) => Math.floor(a * 100 + 0.5) | 0;
    const pieceRng = (p: { v: number; x: number; z: number }) => srng((Math.floor((p.v || 0) * 4294967295) ^ Math.imul(cm(p.x), 0x9e3779b1) ^ Math.imul(cm(p.z), 0x85ebca6b)) >>> 0);
    const roomRng = (rm: any, salt: number) => srng((map.seed ^ salt ^ Math.imul(((rm.fl || 0) * map.H + rm.z) * W + rm.x + 1, 0x9e3779b1) ^ Math.imul(rm.w * 65536 + rm.h, 0x85ebca6b)) >>> 0);
    for (const p of map.propList || new Set(map.props.values())) {
      // (gy: on rolling ground, a rock or a tree where it lies: G.Level.crestGround)
      D.cur = pieceRng(p);
      D.begin([p.x, p.gy || 0, p.z], p.q, { piece: p.name, v: p.v, style: p.style, solids: opts.solids ? F.solids(R[p.name], p.v) : undefined });
      R[p.name].build(k, p.v, p.style);
    }
    D.cur = D.rnd0; // (the pictures' six paintings: the level's own stream, all of it theirs)
    D.begin([0, 0, 0]);
    const plane = (m: FdMat, w: number, h: number, x: number, y: number, z: number, ry?: number, rx?: number, uv?: number[]) => { const p: FdPrim = { t: 'plane', m, s: [w, h], p: [x, y, z], r: rot(ry, rx) }; if (uv) p.uv = uv; D.push(p); };

    // rooms: floor covering, rug, baseboards, art on the walls
    const tx: Record<string, (...a: any[]) => FdTex> = {};
    for (const kind of TEX_KINDS) tx[kind] = (...a: any[]) => D.tex(kind, a);
    const inRoom = (rm: any, x: number, z: number) => x >= rm.x && x < rm.x + rm.w && z >= rm.z && z < rm.z + rm.h;
    const arts = [0, 1, 2, 3, 4, 5].map(() => mat(0xffffff, 0.7, 0, { map: tx.art() }));
    const board = mat(map.theme.home >= 1 ? 0xe8e4da : 0x2a2826, 0.6);
    const frameMats = [mat(0x1c1c1e, 0.5), mat(0xb8a060, 0.35, 0.7), mat(0x6b4428, 0.6), mat(0xe8e4da, 0.6)];
    // a wall face wide enough to hang something on: this cell and its neighbours either side along the wall are the
    // room's, all face the same wall, and nothing's been hung there yet (the room's own cells only: what one room hangs
    // never keeps another from hanging something, so no room's walls depend on the rooms before it)
    const hung = new Set();
    const wide = (rm: any, x: number, z: number, dx: number, dz: number) => {
      const ax = dz ? 1 : 0, az = dx ? 1 : 0;
      for (const s of [-1, 0, 1]) {
        const xx = x + ax * s, zz = z + az * s;
        if (!inRoom(rm, xx, zz) || t[zz * W + xx] !== 0 || L.tile(map, xx + dx, zz + dz) !== 1 || hung.has(zz * W + xx)) return false;
        if (map.winAt && [-1, 0, 1].some((k) => map.winAt.has((zz + dz + az * k) * W + xx + dx + ax * k))) return false; // (not over a window)
      }
      for (const s of [-1, 0, 1]) hung.add((z + az * s) * W + x + ax * s);
      return true;
    };
    // a floor covering over a room (a lawn runs under the fences to the edge; inside, the floor stops at the walls)
    const layFloor = (rm: any, fm: FdMat, y = 0.004) => {
      const x0 = rm.x * TS, z0 = rm.z * TS, w = rm.w * TS, d = rm.h * TS;
      let drop = false;
      for (let z = rm.z; z < rm.z + rm.h && !drop; z++) for (let x = rm.x; x < rm.x + rm.w; x++) if (t[z * W + x] === 5 && !(rm.out && map.out[z * W + x])) { drop = true; break; } // (outdoors upstairs, open air's no hole in it)
      // on rolling ground (map.terrain: the Sandia Crest's), over it as it lies: a corner at each of the cells' (split as the
      // ground is, so it sits the same few millimetres over it everywhere)
      const tr = map.terrain;
      if (tr && rm.out && rm.flush && !drop) {
        let hilly = false;
        for (let z = rm.z; z <= rm.z + rm.h && !hilly; z++) for (let x = rm.x; x <= rm.x + rm.w; x++) if (Math.abs(tr.v[z * tr.VW + x]) > 1e-3) { hilly = true; break; }
        if (hilly) {
          const z = gridZ(w, d, rm.w, rm.h, (gx, gy) => G.World.terrainAt(tr, x0 + w / 2 + gx, z0 + d / 2 - gy)); // (the plane's z is up once it's laid flat)
          D.push({ t: 'grid', m: fm, s: [w, d], seg: [rm.w, rm.h], z, p: [x0 + w / 2, y, z0 + d / 2], r: rot(0, -PI / 2) });
          return;
        }
      }
      if (rm.out && !drop && !rm.flush) plane(fm, w + 2 * TS, d + TS, x0 + w / 2, y, z0 + d / 2, 0, -PI / 2); // (flush: outdoors, but up against the next room's ground, not over it)
      else if (!drop) plane(fm, w, d, x0 + w / 2, y, z0 + d / 2, 0, -PI / 2);
      else for (let z = Math.max(0, rm.z - (rm.out ? 1 : 0)), x0 = Math.max(0, rm.x - (rm.out ? 1 : 0)), ze = Math.min(map.H, rm.z + rm.h + (rm.out ? 1 : 0)), xe = Math.min(W, rm.x + rm.w + (rm.out ? 1 : 0)), gap = (i: number) => (rm.out ? !map.out[i] : t[i] === 5); z < ze; z++) for (let x = x0; x < xe;) { // (round a drop in the floor: a strip per run of floor. A roof: round what's built on it too, out to its edge)
        if (gap(z * W + x)) { x++; continue; }
        let x1 = x; while (x1 + 1 < xe && !gap(z * W + x1 + 1)) x1++;
        plane(fm, (x1 - x + 1) * TS, TS, (x + x1 + 1) / 2 * TS, y, (z + 0.5) * TS, 0, -PI / 2, planeUV((u, v) => [(x - rm.x + u * (x1 - x + 1)) / rm.w, (rm.z + rm.h - 1 - z + v) / rm.h])); // (the room's texture, continuous across strips)
        x = x1 + 1;
      }
    };
    // A resident's room (js/homes.ts, rm.dress): its floor, its trim round the walls, what hangs on them. Its walls and
    // ceiling are js/leveldesc.ts floorNodes'; its furniture went by with the rest.
    const dressRoom = (rm: any) => {
      const dr = rm.dress, f = dr.floor;
      D.cur = roomRng(rm, 0x40e5);
      const tex = tx[f.kind === 'laminate' ? 'wood' : f.kind](f.color, f.grout || '#7a7670');
      tex.rep = [rm.w, rm.h];
      const fm = mat(0xffffff, f.kind === 'tile' ? 0.45 : 0.85, 0, { map: tex }), mine = new Set(dr.cells);
      layFloor(rm, fm, rm.carved ? 0.006 : 0.004); // (a carved room's floor lies over the floor of the room it came out of)
      const trim = mat(parseInt(dr.trim.slice(1), 16), 0.5);
      for (const i of dr.cells) {
        const x = i % W, z = (i / W) | 0;
        if (t[i] === 1 || t[i] === 5) continue;
        if (!inRoom(rm, x, z)) plane(fm, TS, TS, (x + 0.5) * TS, 0.004, (z + 0.5) * TS, 0, -PI / 2, planeUV((u, v) => [(x - rm.x + u) / rm.w, (rm.z + rm.h - 1 - z + v) / rm.h])); // (a strip off the side of the room: the room's floor carried on over it)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (mine.has(z * W + x + dx + dz * W) || L.tile(map, x + dx, z + dz) !== 1) continue;
          k.box(trim, TS, 0.14, 0.03, (x + 0.5) * TS + dx * (TS / 2 - 0.02), 0.07, (z + 0.5) * TS + dz * (TS / 2 - 0.02), Math.atan2(-dx, -dz));
        }
      }
      for (const h of dr.hung) {
        D.cur = pieceRng(h);
        D.begin([h.x, 0, h.z], h.q, { piece: h.name, v: h.v, style: h.style });
        R[h.name].build(k, h.v, h.style);
      }
      D.begin([0, 0, 0]);
    };
    map.rooms.forEach((rm: any, ri: number) => {
      // (a room indoors on rolling ground: all of it at the ground it's built on, level there; outdoors its floor's laid
      // over the ground as it lies: layFloor)
      D.begin(map.terrain && !(rm.out && rm.flush) ? [0, L.groundHeight(map, (rm.x + rm.w / 2) * TS, (rm.z + rm.h / 2) * TS), 0] : [0, 0, 0], undefined, { room: ri });
      if (rm.dress) { dressRoom(rm); return; } // (a resident's room, a carved one too: its own floor, trim and what's hung, js/homes.ts)
      D.cur = roomRng(rm, 0x5eed1e);
      const spec = (F.ROOMS as Record<string, any>)[rm.type] || {};
      const x0 = rm.x * TS, z0 = rm.z * TS, w = rm.w * TS, d = rm.h * TS;
      if (spec.floor) {
        let tex;
        if (spec.floor === 'wood') tex = tx.wood(pick(['#7a5232', '#9a6e44', '#5e4028', '#a88458']));
        else if (spec.floor === 'grass') tex = tx.grass();
        else if (spec.floor === 'dirt') tex = tx.dirt(pick(['#9a8068', '#a08670', '#94806c']));
        else if (spec.floor === 'soil') tex = tx.dirt('#5a4232', true);
        else if (spec.floor === 'flag') tex = tx.flag(pick(['#b0948a', '#a8968a', '#b89c8e']));
        else if (spec.floor === 'pave') tex = tx.tile(pick(['#55524c', '#4a4844', '#5e5a52']), '#34322e');
        else if (rm.lid) tex = tx.concrete('#6e6d69');
        else if (spec.floor === 'tile') tex = tx.tile(pick(['#d8d4cc', '#b8c0c4', '#e4dccc', '#3a3d40']), '#7a7670');
        else tex = tx.carpet(pick(['#5a5f6a', '#6a5a4a', '#4a5a52', '#7a6e62', '#3d4452']));
        tex.rep = [rm.w, rm.h];
        if (spec.floor === 'wood' && rnd() < 0.5) { tex.rot = PI / 2; }
        layFloor(rm, mat(0xffffff, spec.floor === 'tile' ? 0.45 : spec.floor === 'grass' || spec.floor === 'dirt' || spec.floor === 'soil' ? 1 : 0.85, 0, { map: tex }));
      }
      if (rm.out || rm.lid) return; // no rugs, skirting or pictures out in the garden, nor in a roof's stair head
      if (spec.rug && rnd() < spec.rug && rm.w >= 3 && rm.h >= 3) {
        const rw = Math.min(3.6, w - 2.4), rd = Math.min(2.6, d - 2.4);
        const rt = tx.rug(pick(['#7a2e2e', '#2e4a6a', '#5a4a3a', '#3a5a4a', '#6a5a7a']), pick(['#d8c8a0', '#c0a060', '#e8e0d0']), pick(['#2a2a2a', '#5a2a1a', '#1a2a3a']));
        plane(mat(0xffffff, 1, 0, { map: rt }), rw, rd, x0 + w / 2, 0.008, z0 + d / 2, rnd() < 0.5 ? 0 : PI / 2, -PI / 2);
      }
      let pics = 0, clock = rm.type === 'kitchen' || rm.type === 'office' || rm.type === 'breakroom';
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        if (t[z * W + x] === 1 || t[z * W + x] === 5) continue; // a wall corner inside the room's rectangle (or a drop)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (inRoom(rm, nx, nz) || L.tile(map, nx, nz) !== 1) continue;
          const cx = (x + 0.5) * TS + dx * (TS / 2 - 0.01), cz = (z + 0.5) * TS + dz * (TS / 2 - 0.01), ry = Math.atan2(-dx, -dz);
          // baseboard along this wall face
          k.box(board, TS, 0.1, 0.02, cx - dx * 0.01, 0.05, cz - dz * 0.01, ry);
          const p = map.props.get(z * W + x), tall = p && p.boxes[0].h > 1.0 && !(R[p.name] && R[p.name].small);
          if (tall) continue;
          const v = rnd() * 3;
          if (v > 0.65 || !wide(rm, x, z, dx, dz)) continue;
          if (pics < 3 && v < 0.5 && rm.type !== 'washroom' && rm.type !== 'cubicle' && !spec.noArt) { // (no art in a toilet block)
            pics++;
            const fw = 0.5 + rnd() * 0.5, fh = fw * 0.75, y = p ? 1.7 : 1.55;
            k.box(pick(frameMats), fw + 0.06, fh + 0.06, 0.03, cx - dx * 0.015, y, cz - dz * 0.015, ry);
            plane(pick(arts), fw, fh, cx - dx * 0.032, y, cz - dz * 0.032, ry);
          } else if (clock && v < 0.65) {
            clock = false;
            D.push({ t: 'cyl', m: mat(0x1c1c1e, 0.5), s: [0.16, 0.16, 0.04], seg: 20, p: [cx - dx * 0.02, 2.35, cz - dz * 0.02], r: rot(ry, PI / 2) });
            D.push({ t: 'cyl', m: mat(0xf2efe6, 0.6), s: [0.14, 0.14, 0.01], seg: 20, p: [cx - dx * 0.042, 2.35, cz - dz * 0.042], r: rot(ry, PI / 2) });
            k.box(mat(0x111111, 0.5), 0.012, 0.1, 0.004, cx - dx * 0.05, 2.38, cz - dz * 0.05, ry);
            k.box(mat(0x111111, 0.5), 0.075, 0.012, 0.004, cx - dx * 0.05, 2.35, cz - dz * 0.05, ry);
          }
        }
      }
    });
    return D.done();
  }

  // ---------------------------------------------------------------- fingerprints
  // A value's fingerprint (tests/furniture-golden.json; docs/furniture-data.md, for the Bevy port to check itself by):
  // FNV-1a, 32-bit, over its canonical text: JSON with its keys sorted and no spaces, undefined left out, every number
  // written as the integer nearest ten thousand times it (Math.round: halves up), true and false as 1 and 0.
  function hasher() {
    let h = 0x811c9dc5;
    const byte = (b: number) => { h ^= b; h = Math.imul(h, 16777619) >>> 0; };
    const str = (s: string) => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x80) byte(c); else for (const b of new TextEncoder().encode(s[i])) byte(b); } };
    const val = (v: any): void => {
      if (v === null || v === undefined) str('null');
      else if (typeof v === 'number') { const n = Math.round(v * 1e4); str(Number.isFinite(n) ? String(n === 0 ? 0 : n) : String(v)); }
      else if (typeof v === 'boolean') str(v ? '1' : '0');
      else if (typeof v === 'string') str(JSON.stringify(v));
      else if (Array.isArray(v)) { str('['); v.forEach((e, i) => { if (i) str(','); val(e); }); str(']'); }
      else { str('{'); let n = 0; for (const key of Object.keys(v).filter((q) => v[q] !== undefined).sort()) { if (n++) str(','); str(JSON.stringify(key)); str(':'); val(v[key]); } str('}'); }
    };
    return { val, hex: () => h.toString(16).padStart(8, '0') };
  }
  const hashOf = (...vs: any[]) => { const H = hasher(); for (const v of vs) H.val(v); return H.hex(); };
  // A described level (or piece), fingerprinted: how much of each, the whole of it (hash; solids apart), and each kind of
  // piece's (its primitives with their materials and textures written out, so one piece's change shows as that piece's)
  function fingerprint(d: FdLevel) {
    const kinds: Record<string, number> = {}, by = new Map<string, { n: number; prims: number; H: ReturnType<typeof hasher> }>();
    const resolve = (p: FdPrim) => { const m = d.mats[p.m], x = m.x && m.x.map != null ? Object.assign({}, m.x, { map: d.tex[m.x.map] }) : m.x; return Object.assign({}, p, { m: Object.assign({}, m, { x }) }); };
    const looks = d.groups.map((g) => Object.assign({}, g, { solids: undefined }));
    const S = hasher();
    let prims = 0;
    for (const g of d.groups) {
      prims += g.prims.length;
      for (const p of g.prims) kinds[p.t] = (kinds[p.t] || 0) + 1;
      const key = g.piece || (g.room != null ? '(rooms)' : '(none)');
      let e = by.get(key); if (!e) by.set(key, (e = { n: 0, prims: 0, H: hasher() }));
      e.n++; e.prims += g.prims.length;
      e.H.val({ at: g.at, q: g.q, v: g.v, style: g.style, prims: g.prims.map(resolve) });
      if (g.solids) S.val([g.piece, g.at, g.q, g.v, g.solids]);
    }
    const pieces: Record<string, [number, number, string]> = {};
    for (const key of [...by.keys()].sort()) { const e = by.get(key)!; pieces[key] = [e.n, e.prims, e.H.hex()]; }
    return { groups: d.groups.length, prims, mats: d.mats.length, tex: d.tex.length, kinds, hash: hashOf(d.v, d.mats, d.tex, looks), solids: S.hex(), pieces };
  }

  return { VERSION, srng, tint, painters, outsidePaint, packPaint, PACK_N, TEX_KINDS, piece, describe, fingerprint, hashOf };
})();
G.FurnSpec = G_FurnSpec;

interface GameModules { FurnSpec: typeof G_FurnSpec; }
