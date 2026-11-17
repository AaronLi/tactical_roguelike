// Types js/leveldesc.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/leveldesc.ts.

// The level as data (docs/level-data.md): one plain object, JSON as it stands, made from (seed, level, theme, night) and
// nothing else, the same on the host's simulation (its own thread: js/serverworker.ts) and on every screen, and what the Rust
// port reads. describe(map) makes it from the map the generator planned (js/level.ts); nothing here touches three.js:
//   the grid: each floor's tiles, what's open to the sky, the catwalks' grating, the rolling ground;
//   the doors, windows (and glass doors' and railings' panes), stairs and railings, as they're placed and as they start;
//   the lamps the light grid lights the level with, and the sky's share of it;
//   where you come in, where suspects can start, what's furniture (the pieces as placed: their own shapes are js/furniture.ts');
//   the solids: everything rays, sight and feet meet, as js/world.ts takes them (World.fromDesc builds the world from these);
//   draw: everything the level draws, as a tree of nodes (boxes, planes, cylinders, profiles, buffers), each with a material
//     id from draw.mats, a texture id from draw.tex, and where it goes. js/levelview.ts turns it into three.js meshes.
// The tree is in the order the meshes were always made in (the screen merges them by material in that order), and its
// materials are one entry each where three.js had one object each (what shares one, shares an id).
interface LdGeo { k: string; a?: number[]; ops?: any[]; pos?: number[]; col?: number[]; nrm?: number[]; uv?: number[]; idx?: number[]; pts?: number[]; parts?: LdGeo[] }

interface LdNode { t: string; g?: LdGeo; m?: number | number[]; p?: number[]; r?: number[]; q?: number[]; s?: number[]; look?: number[]; l1?: number; ro?: number; hid?: number; h?: string; c?: LdNode[]; n?: number; cnt?: number; tr?: number[]; mx?: number[]; col?: number[]; pos?: number[]; k?: string; fl?: number; cells?: number[]; sg?: number; tex?: number; hf?: number }

interface LdDraw { mats: LdMat[]; tex: LdTex[]; root: LdNode[] }

interface LvDesc { v: number; seed: number; level: number; theme: string; night: boolean; hub: boolean; [f: string]: any; draw: LdDraw; solids: any[] }

interface LdMat { k: string; [f: string]: any }

interface LdTex { k: string; [f: string]: any }
