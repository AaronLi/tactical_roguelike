// Types js/levelview.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/levelview.ts.

// The level on the screen: three.js meshes made from the level's description (js/leveldesc.ts, docs/level-data.md), and
// nothing else. build(map) walks map.desc.draw in its order: a node a mesh (or a group, an instanced mesh, points, lines),
// its geometry one of three's (or a buffer the description gives), its material one per material id, its texture one per
// texture id (the procedural ones drawn here: the noise in them is each screen's own). Then what the screen needs to change
// later is picked out by the handles the description puts on it: the walls (js/damage.ts cuts cubes out of them), each door's
// pivot, leaf, knobs and hinges (Game.updateDoors, js/damage.ts), each pane (Views.breakGlass), the weapon case's and the
// boxes' lids, the cabinets' doors and shelves (Views). What the description leaves to others is done here where it falls:
// the furniture (js/furnmesh.ts build), what a foundry's machinery gives off (fx), the zipline trolleys (zipKit). Then the
// light grid (js/lightgrid.ts), and everything that never changes merged into a few meshes (mergeStatic).
interface LvViewPre { root: THREE.Group; it: Generator<void, void, void>; done: boolean; up?: unknown }
