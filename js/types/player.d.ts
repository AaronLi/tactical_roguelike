// Types js/player.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/player.ts.

type PBuild = Record<string, string>;

// what a shot's rounds share (the friendly fire to send, together, and where they end); the rest is set as it goes
interface PShot { sid: number; ff: Map<any, any>; to?: THREE.Vector3; tos: THREE.Vector3[] | null; ghosts?: Map<string, ShotGhost>; n?: number; paths?: any[]; [k: string]: any }

type PHeldKind = 'frag' | 'flash' | 'tb' | 'sticky'; // (tb: a thermobaric grenade; sticky: holds to what it hits, js/views.ts stickStep)

// a weapon as carried (Me.makeWeapon): what's in it; the rest (a light, a laser, its stickers...) comes with the build
interface PWeapon { def: WeaponDef; sup: boolean; mag: number; ammo: string; fm: FireMode; tube: string[]; chamber: string | null; spent?: string[]; spentCh?: string | null; noMag?: boolean; magI?: number; light?: boolean; laser?: boolean; stickers?: any; [k: string]: any }

// a thermobaric's burst, worked out from where it went off (js/player.ts tbModel)
interface PTbModel { map: LvMap; p: THREE.Vector3; fill: ReturnType<typeof G.Level.blastFill>; cloud: number; space: number; closed: boolean; conf: number; qs: number; rc: number; idx: Int32Array; outFrac: number; areaCloud: number; areaSpace: number; V: number }
