// Types js/views.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/views.ts.

// Client-side representations of networked things: remote players, enemies, grenades.
// Characters are Rig skeletons; their hitboxes ride the animated bones (see js/rig.ts).
// A remote officer, as drawn here: their rig, and the latest state the host sent (st: short keys, see js/server.ts snap)
interface VwPlayer { id: string; name: string; color: number; animal: string; look: any; rig: Rig; tag: THREE.Object3D | null; st: any; pos: THREE.Vector3; yaw: number; pitch: number; first: boolean; dead?: boolean; deadAt?: number | null; lastAct?: string; lastAp?: number; [k: string]: any }

// A suspect or civilian: the rig, where the host says it is (tgt) and where it's drawn (pos, eased towards it). The rest
// (flags from the snapshot, timers for the reload, the prone shift...) are set as they happen.
interface VwEnemy {
  id: number; type: string; def: any; rig: Rig; feet?: FsFeet; tac: number; pos: THREE.Vector3; tgt: THREE.Vector3; yaw: number; tgtYaw: number; hp: number; alive: boolean; deadT: number; lean: number;
  // set as it goes: from the snapshots (bleed, limp, reloading, down: its flags), by the kill and the cuffing, and by the frame's own bookkeeping
  scode?: number; radio?: boolean; str?: number; bleed?: boolean; limp?: boolean; reloading?: boolean; down?: boolean; surp?: boolean; doorOn?: boolean; doorT?: number; arrested?: boolean; bodySecured?: boolean;
  pooled?: boolean; wnd?: number[] | null; wacc?: number[]; ph?: number; wpool?: boolean; leanS?: number; dripT?: number; proneKey?: string; proneShift?: THREE.Vector3 | null; recPitch?: number; recTk?: number;
  [k: string]: any;
}

// a grenade in flight (the position and velocity are all nadeStep needs)
interface VwNadeMotion { pos: THREE.Vector3; vel: THREE.Vector3; onGround?: boolean }
