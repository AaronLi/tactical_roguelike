// Types js/range.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/range.ts.

// The shooting range behind the hangar's garage door (js/hangar.ts builds the hangar, this is what's beyond its north wall).
// Everything is in the hall's coordinates (z negative past the wall; G.Hangar.RZ is how far the hall sits from the map's
// origin, js/level.ts layHangar). Off a yard: a random IPSC course on the left (js/course.ts), then pistol lanes, 16 m deep,
// and rifle lanes to the east, 300 m deep, each lane marked in metres from the firing line. Every rifle lane has an IPSC target on a carrier:
// the buttons on its console send it out to 10, 25, 50, 100, 200 or 300 m, and the console (and a spotting view on your
// screen while you stand at that lane) shows the target with every hit on it, the last one picked out. The guns work here: you can load, fire and
// reload as you like, and every round you use is given back when you walk out (the magazines, boxes and chambers as they
// were when you came in). Nobody else is hurt by it: friendly fire is off in the hangar.
// What's fixed (the markings, the signs, the boards, the backstops, the lanes' consoles, the targets' posts and frames) is
// baked with the hangar (fixtures: tools/bake_hangar.mjs, docs/hangar-data.md); what changes (the consoles' screens and
// buttons, the targets, the course's stage, board and screens) is added on its anchors as the hangar is entered (build).
// What the hangar hands the range to build with (js/hangar.ts: its box, its materials, its signs; its use targets and the
// baked scene's anchors (build), or a way to place one (fixtures)).
type RangeSolid = ReturnType<typeof G.World.add>;

interface RangeHelpers {
  box: (parent: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material) => unknown;
  M: (c: number, o?: THREE.MeshStandardMaterialParameters) => THREE.Material;
  canvasTex: (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => THREE.CanvasTexture;
  signMat: (lines: string[], w: number, h: number, bg: string, fg: string, sub?: string) => THREE.Material;
  addTarget?: (t: HangarTarget) => HangarTarget;
  at?: (kind: string, i?: number) => THREE.Object3D;
  anchor?: (r: THREE.Object3D, kind: string, i: number | null, x: number, y: number, z: number, ry?: number, extra?: Record<string, unknown>) => THREE.Object3D;
}

interface IpscHit { x: number; y: number; z: string; }
