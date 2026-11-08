'use strict';
// The guns made in Blender, as the recipes see them (rcv 'authored', tools/models/recipes.ts rifle()). NOT generated and not data: the store
// starts empty and tools/model_env.mjs fills it from models/<id>/<id>.glb (tools/bake_authored.mjs reads the files, docs/models.md "Authored models").
/** One authored mesh: slot, catalogue material, the part_<key> it rides in and that part's pivot (the gun's frame, three's axes), and the geometry in the gun's frame. */
interface AuthoredMesh { slot: string; mat: string; mount?: boolean /* a piece of the gun's own optic mount (extras.mount): drawn under a rail sight only */; part?: string; leg?: number /* in part_bipod: the index of the leg (parts.bipod.legs) it is in */; at?: number[]; chain?: string[]; name?: string; display?: { width: number; height: number }; uv?: Float32Array; pos: Float32Array; nrm: Float32Array; idx: Uint16Array | Uint32Array;
  /** a magazine-check mesh (extras.chk: js/gunrig.ts magCheck): its tag, its geometry in its own node's frame and that node's place and rotation in the gun's (three's axes) */
  chk?: Record<string, any>; local?: { pos: Float32Array; nrm: Float32Array }; xf?: { p: number[]; q: number[] } }
/** The frame the other parts are seated on: the model's mount anchors (`mount_<slot>`), metres, [forward] or [forward, up] as noted. */
interface AuthoredRig {
  top: number; rail: [number, number];       // mount_optic (rail start, the receiver's top height) .. mount_optic_end (rail end): forward span
  hgF: number; hgEnd: number;               // mount_handguard .. mount_handguard_end: a handguard starts, and the furthest forward one may reach
  end: number; barrel: number;              // mount_muzzle: the factory barrel's end; mount_barrel: where it begins (another barrel is the shared one, ending where its length ends from `end`)
  stockY: number; gripY: number;            // mount_stock (up: the centre of the wrist at the receiver's back), mount_grip (up: the receiver's underside)
  mag: [number, number];                    // mount_magazine: the well, [forward, up]
  /** the gun's own optic mount (meshes with extras.mount, docs/models.md "Authored models"): its rail, mount_optic_rail .. mount_optic_rail_end (forward), and that rail's top; null: none, a rail piece is built on the receiver */
  mount?: { top: number; rail: [number, number] } | null;
}
/** A per-gun variant part (models/<id>/<name>.glb, GUN_MODEL_CONTRACT.authored.variants): the meshes that replace the factory barrel (info.muzzles: where it ends), muzzle device (info.muzzles) or magazine (cap rounds), in the gun's frame. */
interface AuthoredVariant { slot: 'barrel' | 'mag' | 'muzzle'; of: string; info: Record<string, any> | null; anchors?: { mount_muzzle?: number[] } | null /* a threaded barrel's: where a muzzle device is seated (the thread's end) */; thread?: { size: string; shoulder: number; end: number; r: number } | null; cap: number | null; note: string; meshes: AuthoredMesh[]; check: Record<string, any> | null /* (a magazine's check data, its part_mag's extras.check) */ }
/**
 * One authored gun: the frame the other parts are seated on (rig), which optic kinds are its own sights (sights), the factory build's info and the meshes.
 * pistol: a pistol (info.pistol): the rig is made from the pistol anchor set, and the raw anchors (mount_slide, mount_optic, mount_tac...) are in `anchors`; variants: its per-gun parts by file name.
 */
interface AuthoredGun { src: string; rig: AuthoredRig; sights: { builtin: string[]; rail: string[]; meshless?: boolean; railed?: boolean }; info: Record<string, any>; meshes: AuthoredMesh[]; pistol: boolean; anchors: Record<string, number[]>; variants: Record<string, AuthoredVariant>; parts: Record<string, { at: number[]; parent: string | null; check?: Record<string, any>; legs?: { at: number[]; deploy: number[] }[] /* part_bipod: its legs (group_ nodes with extras.leg): pivot, gun frame (three's axes), and deploy rotation */ }>; hinge: Record<string, any> | null }
{
var G_Authored: Record<string, AuthoredGun> = {};
G.Authored = G_Authored;
}
interface GameModules { Authored: typeof G_Authored; }
