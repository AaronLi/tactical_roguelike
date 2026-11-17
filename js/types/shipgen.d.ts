// Types js/shipgen.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/shipgen.ts.

// a stretch of hull a ship can breach: three cells of its wall (c the middle one), the way out of her (nx, nz), the wall's middle there
interface ShSite { c: number; nx: number; nz: number; x: number; z: number; cells: number[]; ang?: number; pt?: number } // (ang: an angled breach's, degrees off square: tunnel; pt: degrees nose up, - down)

interface ShMeta { hall?: ShHallKind | null; size: SpSize; obj: SpObj | null; decks: number; other: SpSize | null; breach: { x: number; z: number; face: number; door: number; room: number }; sites?: ShSite[]; cuts: number[][]; locks: Record<number, string>; roles: (ShRole | null)[];
  hullOf: number[]; console: ShPt | null; artifact: ShPt | null; pods: ShPt[]; salvage: ShPt[]; hullWin: Record<number, number>; wing?: boolean; hvtRoom: number; cardRooms: Record<string, number>; hull: ShHull; hulls: ShHull[] }

// Ships to board, as a level's layout (js/level.ts plan takes it as it takes a warehouse's or a house's): decks on the
// coarse grid, bow to the west, stern to the east.
//   A deck: a room across the bow (the bridge, on her top deck); a spine corridor aft from its door to the room across the
//   stern (the engine room; the reactor over it); compartments off the spine to port (north) and starboard (south), a
//   bulkhead between each and the next. A big ship's deeper sides are split in two: a compartment on the spine and another
//   behind it against the hull, reached through the first.
//   Everything outside a hull is open space (tile 5, open to the sky, the floor 300 m down: nothing drawn, nothing to stand
//   on), with room all round for the squad's ship to stand nose-on to any side of her.
// Her class (SpSize: js/spacedata.ts SIZES) is what she is: a civilian transport, a corvette, a frigate, a cruiser, a
// capital ship. What compartments she has goes by it (PROGRAM), and a capital ship has TWO decks, the same hull on both,
// stairwells between them (js/level.ts stack, as a building's storeys).
// A level can hold a second ship, nothing to do with the mission (sp.other: a transport or a corvette lying off the
// target's port side), to be boarded or left alone.
// finish(map, lay), after the plan: what the mission needs of the finished map (map.sp).
type ShRole = 'bridge' | 'security' | 'gunnery' | 'engine' | 'reactor' | 'cargo' | 'quarters' | 'barracks' | 'mess' | 'galley' | 'medbay' | 'armoury' | 'magazine' | 'vault' | 'brig' | 'pods' | 'spine' | 'stairs' | ShHallKind | 'gallery';
type ShHallKind = 'bay' | 'grove' | 'works' | 'mall'; // (a cruiser's hall two decks high: js/shipgen.ts HALLS)

interface ShPt { x: number; z: number; y: number }

interface ShHull { x0: number; z0: number; x1: number; z1: number; zc: number; main: boolean; size: SpSize }
