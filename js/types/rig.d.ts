// Types js/rig.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/rig.ts.

interface Rig { // a character's skeleton and its meshes (what create makes, and what update, the hit and the zip tie add as they go)
  hairMesh: THREE.Mesh | null; look: Record<string, any>; pantsM: THREE.Material; seat: THREE.Mesh[] | null; kitParts: THREE.Object3D[]; kitKey: string | null; hKit?: Record<string, (m: THREE.Material) => THREE.SkinnedMesh>; hPart?: Record<string, HumanPart>; hBone?: (name: string) => { b: THREE.Bone; inv: THREE.Matrix4 } | null; kit: Record<string, any> | null; headWear?: { cap: number | null; bandana: number | null }; headWorn?: THREE.Object3D[];
  callsign: { id: string; name: string } | null; root: THREE.Object3D; body: THREE.Object3D; hips: THREE.Object3D; spine: THREE.Object3D; chest: THREE.Object3D; neck: THREE.Object3D; head: THREE.Object3D;
  armL: RigArm; armR: RigArm; legL: RigLeg; legR: RigLeg; gunMount: THREE.Object3D; slingMount: THREE.Object3D; hipMount: THREE.Object3D; slung: boolean; mats: any[]; scale: number; style: string; shoe: FsSole | null;
  gun: THREE.Object3D | null; gunInfo: Record<string, any> | null; gunKey: string | null; phase: number; vel: THREE.Vector3; lastPos: THREE.Vector3 | null;
  crouchW: number; aimW: number; lean: number; kick: number; flinch: THREE.Vector3; throwT: number; state: string; deadT: number; fallX: number; fallZ: number; downW: number;
  hb: any[] | null; dbg: THREE.Mesh[] | null; rd: Ragdoll; hitKit?: THREE.Mesh[] | null; dbgKit?: THREE.Mesh[] | null;
  curl: number[]; fingers: { hand: number; thumb: boolean; bones: THREE.Bone[]; rest: THREE.Matrix4[]; step: THREE.Matrix4[] }[]; // (how closed each hand is, the right's then the left's: 0 open, 1 round a grip; and the body's fingers that show it: poseFingers)
  // (set by create)
  setGun(code: any, skin?: any): void; update(dt: number, p: any): void; hitboxes(): any[]; recoil(deg?: number): void; hit(dir: any, mv?: number): void; dropGun(): void; goLimp(): void;
  die(dir: any): void; throwNade(str?: number): void; setKit(k: any): void; setCallsign(id: string, name: string): void; holster(on: boolean, anim?: boolean): void; swap?: { on: boolean; t: number; Rs: THREE.Matrix4 } | null; slingWant?: boolean | null; zip(on: boolean, instant?: boolean): void;
  secure(t: number): void; settle(sec?: number): void; startle(): void; dispose(): void;
  shield?: THREE.Object3D | null; shieldDropped?: THREE.Object3D | null; shieldMount?: THREE.Object3D; shieldW?: number; setShield(id: string | null): void; dropShield(): THREE.Object3D | null; // (a handheld ballistic shield on the left arm: setShield, its pose in update)
  // (what the animation keeps from frame to frame)
  powered?: boolean; limp?: boolean; zipped?: boolean; zipKit?: THREE.Object3D; zipT?: number; zipYaw?: number | null; zipSw?: ZipSwing; proneW?: number; proneS?: number; effPh?: number; effT?: number; braceW?: number; gunAimW?: number; gunKick?: number;
  gunHold?: GunHolds; gunBase?: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }; gunBaseOf?: THREE.Object3D; gunSupport?: THREE.Vector3 | null; bipodK?: number; hitDir?: THREE.Vector3; xbLoaded?: any;
  cold?: boolean; // (no warmth for a thermal channel: a mannequin)
  nvPivot?: THREE.Object3D | null; nvLit?: THREE.Mesh[]; nvK?: number; nvWant?: number; // (night vision on the helmet: what swings, its lit eyepieces, how far down it is and is going: setKit, update)
  blindW?: number; radioW?: number; dazeW?: number; blindT?: number; atakW?: number; atak?: THREE.Group; atakAlways?: boolean; handNade?: any; throwHand?: boolean; throwStr?: any; dropped?: { g: THREE.Object3D; vy: number; spin: number; floor?: number; [field: string]: any } | null;
  [bone: string]: any; // (a bone looked up by name: js/ballistics.ts boneOf, the hitbox readouts of js/hud.ts and js/highlights.ts; and what js/hud.ts keeps on a rig)
}

// Character rig: a jointed skeleton animated procedurally, with hitboxes that ride the bones.
//
//   root (ground, yaw) → body (tips over when downed) → hips → spine → chest → neck → head
//                                                                    chest → shoulders → upper arm → forearm
//                                                             hips → thigh → shin
// Legs use two-bone IK onto procedurally placed feet (no foot sliding, works for strafing and
// backpedalling, and crouching just lowers the hips). Arms use two-bone IK onto the grip and
// support-hand points of the carried gun (GunModels), so hands stay on any weapon.
// Upper body handles aim pitch, low-ready, corner leans, recoil, flinches and grenade throws.
// Dead characters go to a Verlet ragdoll (see ragdollInit). Living suspects and civilians are the same ragdoll,
// powered: muscles pull each joint toward the animation, as strong as the person is (see powerStep).
interface Ragdoll { // the Verlet ragdoll a dead (or powered, living) rig carries: particles 0 pelvis ... 15 right foot
  P: THREE.Vector3[]; prev: THREE.Vector3[]; r: number[]; still: number; asleep: boolean; roll: RagRoll | null; on: Uint8Array; sp: Float32Array; rigid: number[][]; topple: THREE.Vector3; min: number[][];
  // (what the solver and the handling add as they go)
  handled?: { t: number } | null; calm?: number; push?: THREE.Vector3 | null; keepPin?: number; drive?: { T: THREE.Vector3[]; Tv: THREE.Vector3[]; [field: string]: any } | null;
  Pold?: THREE.Vector3[]; acc?: number; pinT?: number; Tprev?: THREE.Vector3[]; R?: THREE.Vector3[]; armL?: number;
  near?: any[] | null; // the level's solids around the body (what stops a person), gathered once a step: gather
}

interface RigArm { sh: THREE.Object3D; up: THREE.Object3D; lo: THREE.Object3D; wr: THREE.Object3D; tie: THREE.Mesh }

// a rider's swing under the trolley (zipSwing): th, how far the feet are swung forward of hanging straight down (rad), its rate, and
// the speed along the line (eased) and the acceleration of that it has been working from
interface ZipSwing { th: number; w: number; v: number; a: number }

interface RigLeg { th: THREE.Object3D; sh: THREE.Object3D }

interface RagRoll { t: number; driven?: boolean; [field: string]: any } // a body being rolled onto its front (planRoll)
