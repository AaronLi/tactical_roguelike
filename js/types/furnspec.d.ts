// Types js/furnspec.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/furnspec.ts.

// A material, by value: colour (c, sRGB hex), roughness (r), metalness (m) and what else it has (x: emissive,
// emissiveIntensity, flatShading, transparent, opacity, depthWrite; map: a texture's index in the level's tex).
interface FdMat { c: number; r: number; m: number; x?: Record<string, any> }

// A primitive: t its kind, m its material (an index; while it's being described, the material itself), s its size, p
// where (its centre), r its turn [rx, ry] (three's 'YXZ': turned to face first, then tilted), and by kind: seg (a
// cylinder's sides; a grid's [cols, rows]), lb (a label of the stock atlas over every face), pts, b (a side profile's
// outline and its rounded edges), uv (a plane's own uv, corner by corner), z (a grid's heights, corner by corner)
interface FdPrim { t: FdPrimKind; m: any; s: number[]; p: number[]; r?: number[]; seg?: number | number[]; lb?: number; uv?: number[]; pts?: number[][]; b?: number; z?: number[] }

// What stops people (boxes), rounds and eyes (ray, hulls), in the piece's frame: js/furniture.ts solids, worldBoxes
interface FdSolids { boxes: any[]; ray?: any[]; hulls?: number[][] }

interface FdLevel { v: number; mats: FdMat[]; tex: FdTex[]; groups: FdGroup[] }

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

type FdPrimKind = 'box' | 'cyl' | 'sph' | 'ico' | 'side' | 'plane' | 'grid';

// A group: primitives in one frame (at, turned q quarter-turns about y if q is there: a piece; else only moved), and the
// piece it is (piece, v, style; solids when asked for)
interface FdGroup { at: number[]; q?: number; piece?: string; v?: number; style?: any; room?: number; solids?: FdSolids; prims: FdPrim[] }
