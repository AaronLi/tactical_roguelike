// Types js/humans.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/humans.ts.

// The human models: who a character's body is. Twenty figures (ten men, ten women: models/characters/human_variants.py), each
// one skinned mesh set on the same skeleton as js/rig.ts's joints, in assets/models/humans/<id>.glb (in the models' bundle with the
// rest: js/modelbundles.ts; checked and put there by tools/bake_humans.mjs). What the game knows of each
// without its file is js/humandata.ts (its height's scale, its colours, the fit of the gear on it): a character is the right
// size and its kit the right fit from the moment it's made, and the body itself is put on when its file has come (js/rig.ts
// attachHuman: till then the old figure of boxes and tubes stands in).
//
//   G.Humans.ids                 every figure's id (m01..m10, f01..f10)
//   G.Humans.pick(o)             whose body a character has: by their name and animal (an officer), or their seed
//   G.Humans.def(id)             its HumanDef
//   G.Humans.ensure(id)          Promise<parts | null>: its file loaded and taken apart
//   G.Humans.get(id)             the parts if they're loaded, else null
//   G.Humans.boot()              every figure's file, loaded behind the menu
//   G.Humans.gear(name)          a node of the gear that's the same on every body (assets/models/humans/gear.glb: night vision, a plate;
//                                models/characters/build_gear.py), or null: loaded with the first body, so it's in before any body is
//
// A part is one material's faces: { geo (shared: never disposed with a body), mat (its material's name: shirt, upsleeve, sleeve,
// trousers, boots, neck, hand, finger, skin, eyeskin, hair, brow, lip, stubble, eye, iris), color, head (it rides the head),
// bones (names without their dots: 'upperarmR', a finger's 'index1R' .. 'index3R', 'thumb1R'), inv (their inverse rest matrices, in the file's frame: y up, the figure facing +z) }.
interface HumanPart { geo: THREE.BufferGeometry; mat: string; color: number; head: boolean; bones: string[]; inv: THREE.Matrix4[] }
