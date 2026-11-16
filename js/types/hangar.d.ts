// Types js/hangar.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/hangar.ts.

// The hangar: where the squad spends the time between levels. A real place on the same map machinery as a level
// (Level.generateHub: walls, floor, lights, collision, rays), dressed by hand here:
//   the workshop (west): a bench for each officer, with a computer that opens the gunsmith, and a rack of the
//     gunsmith's parts for sale;
//   the store (middle): Vex at his counter (his till opens the whole stock), the kit for sale on pedestals,
//     a shelf of pouches, and a vending machine (medical gear and grenades; ammunition's at his till);
//   the stash (east, at the back, by the walkway to the lounge): your crates in a cage, and a console that opens your stash and loadout;
//   Nightjar Optronics (east, at the back, where the warehouse was): a special-operations outfitter behind a glass front,
//     night vision in glass cases (Shop.offers.nvg), a counter with their rep behind it;
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

interface HangarState {
  root: THREE.Group; map: LvMap; targets: HangarTarget[]; items: HangarTarget[]; stands: HangarTarget[]; rigs: HangarRig[]; heli: HangarHeli | null; vend: HangarMachine[];
  hover: HangarTarget | null; hold: number; hl: THREE.Object3D | null; t: number; vexQuip: number; key: string;
  rosterKey: string | undefined; partStands: HangarTarget[] | undefined; precStands: HangarTarget[] | undefined; njStands?: HangarTarget[]; njPart?: HangarTarget | null; pouchSlots: THREE.Group[] | undefined;
  anchors?: Map<string, THREE.Object3D> | null; live?: THREE.Object3D[]; loadMs?: number; // (the baked scene's anchors, by name; what the live parts added; how long the baked scene took to parse)
}

type HangarKind = 'pos' | 'buy' | 'heli';

type HangarWhat = 'gear' | 'part' | 'pouch' | 'ammo' | 'svc';

interface HangarRig { rig: Rig; x: number; z: number; yaw: number; vex?: boolean; y?: number; }

interface HangarMachine { v: HangarVend; group: THREE.Group; key: string; slots: unknown[]; }

interface HangarHeli extends HangarShip { rotor: THREE.Group; speed: number; spin: number; }

interface HangarVend { id: string; title: string; x: number; z: number; cols: number; rows: number; tab: string; }

interface HangarShip { group: THREE.Group; rotors: THREE.Group[]; tail: THREE.Group; glow: THREE.MeshBasicMaterial; thrust: THREE.MeshBasicMaterial; }
