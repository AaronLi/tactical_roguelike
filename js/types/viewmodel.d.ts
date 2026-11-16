// Types js/viewmodel.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/viewmodel.ts.

/** What a gun model gives the first person to put on it: its geometry, its anchors, its sight windows. */
interface VmModel { group: THREE.Object3D; info: GunRigInfo & { muzzles: number[][]; sy: number; fSight: number; relief: number; cheek?: number | null; pistol?: boolean | null; reflex?: VmReflex | null; pip?: VmPip | null }; reflex?: VmReflex | null; pip?: VmPip | null }

// First-person extras and the third-person model, applied to a gun MODEL (a group of slot-tagged meshes, `part_<key>` nodes and
// `info`: docs/models.md), not to the recipes' internals. The recipes (js/gunmodels.ts) or a .glb (js/glb.ts) make the geometry;
// js/gunrig.ts binds its animation; this file adds what only the first person (or only the far-off view) needs:
//
//   Viewmodel.assemble(def, models)   the first-person gun: each model (a { group, info } with its sight windows) in a holder with
//                                       its muzzle flashes, a reflex sight's reticle, a scope's lens, its display surfaces; the
//                                       arms and animation bound on top (GunRig.bind via js/vmanim.ts prepare)
//   Viewmodel.reflex(group, o)        a reflex sight's collimated reticle behind its window (o: info.reflex)
//   Viewmodel.pipLens(group, o, def)  a scope's picture-in-picture lens (o: info.pip)
//   Viewmodel.flash(color)            a muzzle flash sprite
//   Viewmodel.surfaces(group)         the model's display_<name> meshes, each given a CanvasTexture to paint: { name: { mesh, canvas, ctx, tex, width, height } }
//   Viewmodel.paintAmmo(s, left, per) a multi-barrel gun's display_ammo: the rounds left in each barrel
//   Viewmodel.paintRange(s, text)     a rail ballistic computer's display_range: its seven-segment readout (rangeText(metres) makes the text)
//   Viewmodel.worldProto(group, info) the third-person model of a gun: its meshes merged one per material, the magazine, a
//                                       crossbow's bolt and strings and a bipod's legs pulled out on their own (cache it)
//   Viewmodel.worldInstance(proto)    a group of it, sharing the proto's geometry
//
// The sight windows (info.reflex, info.pip) and the display surfaces are in the model contract (docs/models.md); a recipe's model
// gives its windows to assemble alongside, as the kit recorded them.
/** A reflex sight's window, in the gun's frame (metres; f: forward, y: up): the stencil mask's size and the reticle kind drawn in it. */
interface VmReflex { f: number; y: number; w: number; h: number; round?: boolean; kind: string }

/** A scope's ocular lens (the picture-in-picture one): r its radius. parent/pos: a lens that swings on a hinge (a magnifier's): the hinge's node (or its name) and the lens's place in it. */
interface VmPip { f: number; y: number; r: number; parent?: THREE.Object3D | string; pos?: THREE.Vector3 | number[] }
