// Types js/gunrig.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/gunrig.ts.

/** What a model says about its moving parts and anchor points (docs/models.md `info`): [forward, up, right] each. */
interface GunRigInfo { pistol?: boolean; magRake?: number | null; block?: { drop: number; lever: number } | null; modeDial?: { at: number[]; axis: number[]; modes: string[]; stepDeg: number } | null; hinge?: { sequence: { part: string; axis?: string | null; rotate_deg?: number | null; move?: number[] | null; frame?: string | null }[] } | null; anim?: Record<string, any>; grip?: number[]; support?: number[]; magAt?: number[]; port?: number[]; ch?: number[]; slide?: number[]; cylAt?: number[]; bolt?: number[]; boltTravel?: number; cup?: number[]; magTop?: boolean; recoilBarrel?: number; load?: { at: number[][]; pitch: number }; breech?: { at: number[]; pitch: number; long: string }; handle?: { grab?: number[]; f: number; y: number; x: number; travel: number; recip?: boolean; lock?: number }; chamberAt?: GunRigChamberAt; quarrelMats?: { nock?: THREE.MeshStandardMaterial } }

/** A hand's anchor points in the gun's space (null where the gun has none), and where its parts sit at rest. */
interface GunRigAnchors { G: THREE.Vector3; S: THREE.Vector3; W: THREE.Vector3 | null; port: THREE.Vector3 | null; ch: THREE.Vector3 | null; slide: THREE.Vector3 | null; cyl: THREE.Vector3 | null; bolt: THREE.Vector3 | null; P: THREE.Vector3; F: THREE.Vector3; load?: { at: THREE.Vector3[]; pitch: number }; breech?: { at: THREE.Vector3; pitch: number; long: string; oal: number }; cup?: THREE.Vector3 | null; H?: THREE.Vector3 | null; WB: THREE.Vector3; magHome?: THREE.Vector3; magQ: THREE.Quaternion; magDn?: THREE.Vector3 /* (down the magazine's axis: straight down, or a raked well's, info.magRake) */; magGrab?: THREE.Vector3; handleHome?: THREE.Vector3; chHome?: THREE.Vector3; catchHome?: THREE.Vector3; cylHome?: THREE.Vector3; boltHome?: THREE.Vector3; barrelHome?: THREE.Vector3; brkHome?: THREE.Vector3; block?: { at: THREE.Vector3[]; oal: number } }

interface GunRigMagChk { spine?: number[][]; follower?: GunRigPoseMesh; springs?: (GunRigPoseMesh & { u: number })[]; key: string; top: THREE.Mesh[]; holes: { n: number; t: number; i: number; side: number; mesh: THREE.Mesh; lab?: THREE.Mesh }[]; labCap?: number; w: number; rounds: { t: number; mesh: THREE.Mesh; tip?: THREE.Mesh }[] }

/** One gun in the hands: its holder, its parts, its anchors, its magazine's check data. */
interface GunRig { holder: THREE.Object3D; info: GunRigInfo; side: number; an: GunRigParts; A: GunRigAnchors; chk: GunRigMagChk | null; travel: number; lock: number; recip: boolean; open: boolean; boltAm?: string }

interface GunHolds { grip: GunHold; support: GunHold }

/** The moving parts of a gun (js/gunrig.ts): by info.anim key, the live nodes. */
type GunRigParts = { mag?: THREE.Object3D; handle?: THREE.Object3D; ch?: THREE.Object3D; catch?: THREE.Object3D; cyl?: THREE.Object3D; bolt?: THREE.Object3D; barrel?: THREE.Object3D; slide?: THREE.Object3D; brk?: THREE.Object3D; cover?: THREE.Object3D; bipod?: THREE.Object3D; pump?: THREE.Object3D; lever?: THREE.Object3D; quarrel?: THREE.Object3D; stringCocked?: THREE.Object3D; stringSlack?: THREE.Object3D };

/** Where a gun's round shows when it is checked (docs/models.md info.chamberAt). */
interface GunRigChamberAt { side: VmChamberSide; n: number; r: number; R: number; z: number; bore?: boolean; heads: number[][]; x: number; y: number; f: number; w: number }

/** What a magazine shows when it is looked at: the top round (case, tip), witness holes (each with the count it stands for, once stamped), the rounds drawn through a clear body. */
interface GunRigPoseMesh { mesh: THREE.Mesh; t: number; px: number; py: number; pz: number; rx: number }

/** How a hand takes a gun (G.GunRig.holds): where, the way its palm faces and its fingers run, in the gun's space, and which point of the hand goes there. */
interface GunHold { kind: 'grip' | 'forend' | 'fg' | 'pistol'; hold: 'closed' | 'palm'; at: THREE.Vector3; palm: THREE.Vector3; fingers: THREE.Vector3 }
