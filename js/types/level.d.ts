// Types js/level.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/level.ts.

interface LvMap { W: number; H: number; t: Uint8Array; out: Uint8Array; glassRoofs?: number[][]; rooms: LvRoom[]; doors: LvDoor[]; cover: LvPt[]; wallSpots: LvPt[]; lights: LvLight[]; lamps: LvLight[]; stairs: LvStair[]; windows: LvWin[]; cabinets: LvCab[]; fx: Record<string, any>[]; winMeshes: THREE.Object3D[]; lightPool: THREE.PointLight[]; enemySpots: number[][];
  seed: number; level: number; theme: ThemeDef; TS?: number; world: ReturnType<typeof import('../world.js').World.create>; crest?: any; chasm: number; floors: LvMap[]; props: Map<number, LvProp>; propList: LvProp[];
  case?: any; abox?: any; sbox?: any; winAt?: any; leafAt: Map<number, any>; unitAt?: Int8Array | null; doorAt?: any; doorMeshes?: any; fy: number; fl?: number; spawn: any; spawnRoom: LvRoom; exitRoom: LvRoom; extract?: any;
  grate?: any; railSteel?: boolean; fest?: any; base?: number; NF: number; minY?: number; rails: any[]; lz?: any; lzSpots?: number[][]; terrain?: any; skirt: number; entries?: number[][]; caseView?: any; cabViews?: any; aboxView?: any; sboxView?: any;
  above?: LvMap | null; voidAbove?: ArrayLike<number> | null; units?: number; navG?: any; lightT?: number; underground?: boolean; rollers?: number[][]; hub?: boolean; glassRuns?: any; fences: LvFence[]; doorVer?: number; cracked?: any; dmg?: any;
  wallMesh?: any; wallIdx?: Map<number, number>; wallBase?: Float32Array; homes?: any; civSpots?: { x: number; z: number; yaw: number }[] | null; night?: boolean; lux?: LvLux; desc?: LvDesc; sp?: ShMeta | null; aiNo?: (i: number, f: number) => boolean }
interface LvLight { x: number; z: number; y?: number; gy?: number; kind?: LvLightKind; color?: number; i?: number; d?: number; up?: number; porch?: number; fl?: number; glow?: number; off?: boolean; sign?: { x: number; z: number; ax: LvAxis } }
interface LvWin { ship?: boolean; solids?: any[]; id: number; cells: number[]; nx: number; nz: number; ext: boolean; broken: boolean; x: number; z: number; len: number; armor?: boolean; cooler?: boolean; sill?: number; top?: number; door?: LvDoor; cracked?: any; fy?: number; rail?: any; fl?: number; case?: number[]; prop?: LvProp; gone?: boolean }
interface LvCab { x: number; z: number; yaw: number; fy?: number }
interface LvRoom { cars?: any; type: RoomType; x: number; z: number; w: number; h: number; cx: number; cz: number; dress?: LvDress | null; unit?: number; lid?: any; door?: any; out?: boolean; loft?: boolean; lamp?: any; cover?: any[][]; carved?: boolean; front?: any; tall?: any; house?: any; fl?: number; flush?: boolean; ship?: string; lootRoom?: boolean }
interface LvLz { x: number; z: number; f?: number; lamps?: number[][]; y?: number }
type LvRng = () => number;
type LvObj = THREE.Object3D & Record<string, any>;
interface LvBox { m?: any; cx: number; cz: number; hx: number; hz: number; y0: number; h: number; ray?: LvBox[]; gy?: number; walk?: boolean; hull?: number[] }
interface LvDoor { id: number; i: number; tx: number; tz: number; x: number; z: number; axis: LvAxis; open: boolean; mirror: boolean; kind: any; cells?: number[]; w?: number; leaf?: LvBox; solids?: any[]; holes: any; gone: any; fallen?: boolean; rest?: any; pane?: any; fy?: number; fl?: number }
interface LvProp { style?: Record<string, any>; name: string; x: number; z: number; q: number; v: number; boxes: LvBox[]; gy?: number; wd?: any; own?: boolean; block?: number } // a room's purpose (what furniture.ts fits it out as; homes.ts re-types a room to a resident's)

type RoomType = 'shelter' | 'bay' | 'grove' | 'works' | 'mall' | 'mezz' | 'security' | 'living' | 'kitchen' | 'dining' | 'bedroom' | 'office' | 'storage' | 'breakroom' | 'yard' | 'hall' | 'hangar' | 'lz' | 'street' | 'road' | 'lot' | 'corridor' | 'bathroom' | 'alley' | 'stage' | 'washroom' | 'plaza' | 'cafe' | 'store' | 'mart' | 'bar' | 'melt' | 'control' | 'mcc' | 'locker' | 'kitchenette' | 'lobby' | 'observe' | 'boss' | 'meeting' | 'trail' | 'garden' | 'giftshop' | 'storeroom' | 'stockroom' | 'freezer' | 'cashier' | 'dock' | 'lawn' | 'landing' | 'range' | 'seating' | 'roof' | 'picnic' | 'parking' | 'pad' | 'gate' | 'cubicle' | 'mall' | 'aisle' | 'overlook' | 'catwalk' | 'ridge' | 'saddle' | 'greenhouse' | 'antennas' | 'carpark' | 'mill' | 'loading' | 'restroom' | 'terrace' | 'viewing' | 'bridge' | 'gunnery' | 'engine' | 'reactor' | 'cargo' | 'quarters' | 'barracks' | 'mess' | 'galley' | 'medbay' | 'armoury' | 'magazine' | 'vault' | 'brig' | 'pods' | 'spine';

type LvAxis = 'x' | 'z'; // (which way a door, stair or fence runs)

// what a ray is asked to do (World.raycast, Level.raycast): through glass, a look not a round, bars, what stops people, solids to skip
interface LvRayOpts { glass?: boolean; sight?: boolean; bars?: boolean; move?: boolean; skip?: (s: any) => boolean }

interface LvLay { W: number; H: number; t: Uint8Array; rooms: LvRoom[]; out?: Uint8Array; glassRoofs?: number[][]; doors?: LvDoorSpec[]; fences?: LvFence[]; grate?: any; crest?: any; glass?: any[]; spawn?: any; lz?: LvLz | null; entries?: number[][] | null; units?: number; underground?: boolean; chasm?: number; rollers?: number[][]; ids?: Int16Array; homes?: any; ringDoors?: boolean; sp?: any }
interface LvPt { x: number; z: number; y?: number; cx?: number; cz?: number; fl?: number; lean?: any }
type LvDoorSpec = [number, number, LvAxis, boolean?, boolean?, any?];
interface LvStair { axis: LvAxis; up: number; x0: number; x1: number; z0: number; z1: number; f: number; y0?: number; steps?: any; rise?: number }
interface LvLux { W: number; H: number; NF: number; v: Float32Array }
type LvFence = [number, number, string, string?];
type LvLightKind = 'string' | 'highbay' | 'panel' | 'exit';

interface LvDress { who: string; type0: RoomType; wall: string; paper?: number; ceil: string; trim: string; floor: HomeFloor; cells: number[] | null; hung: any[]; was: Map<any, any>; own: any[] }
