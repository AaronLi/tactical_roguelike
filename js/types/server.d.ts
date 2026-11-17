// Types js/server.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/server.ts.

type EnemyKind = 'suspect' | 'grunt' | 'rusher' | 'marksman' | 'heavy' | 'warden' | 'leader' | 'civ' | 'rating'; // (ENEMIES' keys)

interface Door extends LvDoor { fy?: number; fallen?: boolean; hp?: Tbl }

interface Player { id: string; name: string; color: any; animal: any; look: any; ready: boolean; st: PState | null; anon?: number; lux?: number; luxAt?: number; firedAt?: number; flashK?: number } // (lux: the light on them this tick, officerLux; firedAt: their last shot, the level's clock; flashK: how much flash it made, its muzzle's)

type LivePlayer = Player & { st: PState }

interface Enemy {
  windErr?: number; // (how it misjudges the wind: Sim.windJudge)
  id: number; type: EnemyKind; def: EnemyDef; x: number; y: number; z: number; yaw: number; hp: number; maxHp: number;
  clearOut?: { ux: number; uz: number; until: number } | null; clearT?: number; // (a civilian getting out of a shooter's way: clearLine)
  alert: boolean; spot: number; tgt: string | null; tgtD: number; canSee: boolean; percT: number; cool: number; burstLeft: number; aiming: boolean; aimT: number;
  strafe: number; strafeT: number; idleT: number; idleYaw: number; pendingAlert: number; lostT: number; lastHit: string | null;
  cover: EnemyCover | null; inCover: boolean; peek: boolean; peekT: number; coverT: number; coverStuck: number; crouch: boolean; nadeT: number; nadeN?: number; pushing?: boolean; pushWait?: number;
  lastSeen: { x: number; y: number; z: number } | null; morale: number; broken: boolean; noise: { x: number; z: number } | null; holding: boolean; bold: boolean;
  mag: number; magMax: number; reloadT: number; bleedH: number; bleedL: number; wnd?: number[]; clotT: number; legs: number; arms: number; lung: boolean;
  drawn: boolean; drawT: number; surprisedT: number; suspicious: boolean; calmT: number; state: EnemyState; armed: boolean; shouts: number; complyCd: number;
  suppressT: number; doorWait: number; leanOut: number; runner: boolean; home: { x: number; y: number; z: number }; walkTo: { x: number; z: number } | null;
  fleeT: number; fake: boolean; fakeT: number;
  // grown as they go (think() and the hit and injury code set these)
  lurk?: boolean; hide?: HideSpot | null; peeking?: boolean; relocate?: boolean; turnYaw?: number | null; ordered?: boolean; dragTo?: { x: number; z: number } | null;
  guard?: boolean; dp?: DoorPeekSpot | null; dpT?: number; dpOk?: number; heard?: { x: number; y: number; z: number; at: number };
  threat?: { x: number; z: number; y?: number; d?: number } | null; str?: number; collapsed?: boolean; down?: boolean; sup?: number; supAt?: number; supQ?: number[][];
  flinchT?: number; flinchOk?: number; flashT?: number; flashRec?: number; flashRecLen?: number; flashK?: number; flashOn?: boolean; flashBy?: { x: number; y: number; z: number } | null; stumbleT?: number; stumbleYaw?: number; stumbleV?: number; peekDone?: boolean; peekOut?: number; organs?: Record<string, number>; broke?: Record<string, number>;
  dodge?: { x: number; y: number; z: number; at: number; until: number; run?: boolean; ux?: number; uz?: number; clear?: number; from?: number[] } | null; // (a grenade they've seen land: when they move, and till when)
  spine?: boolean; cardiac?: boolean; out?: boolean; incap?: { by: string | null; t: number }; lastHitAt?: number; lastH?: boolean; lastAp?: boolean; lastGr?: number; lastFb?: number; tb?: { burn: number; blast: number; n: number }; flashId?: number;
  hitState?: EnemyState; hitUnaware?: boolean; hitYield?: boolean; hitAt?: number; shock?: number; kick?: number; headDelay?: number; engAt?: number; engTgt?: string;
  firedAt?: number; sawAt?: number; engagedAt?: number; allyT?: number; allyN?: number; proof?: boolean; seeVis?: number; blind?: boolean; onWait?: number;
  post?: { x: number; y: number; z: number; yaw: number; flow?: Int16Array } | null; shelter?: { x: number; y: number; z: number; flow?: Int16Array; room?: number } | null; // (a doorway to hold, a room to get to: a ship's response, js/spaceserver.ts)
  order?: Order | null; radioT?: number; callAt?: number; callTgt?: { x: number; y: number; z: number } | null; callLog?: string[]; calls?: number; noLead?: number;
  point?: boolean; // (their team's point man, with a shield: giveShield)
  shieldBy?: number; // (another team's shield man they've got in behind, with no cover of their own to go to: shieldNear)
  grade?: number; rank?: number; team?: number | null; stay?: boolean; ally?: boolean; fromPir?: boolean; named?: string; lastHitN?: string | null; wear?: string | null; title?: string; // (wear: whose ship they're aboard, civil, pirate or navy: what they're called, titleOf) // (grade: how strong they are within the level's gear tier, 0-1, their kit by it: equip; rank: grade, a Leader a whole rank up; team: their fireteam's leader's id, their own if they lead it; stay: at a station, in no team: teamForm)
  coverFlow?: ReturnType<typeof import('../level.js').Level.flow> | null; coverCheckT?: number; emboldened?: boolean; fl?: number;
  lowRun?: boolean;
  artGuard?: boolean; // (posted with the artifact, aboard a ship carrying one: js/spaceserver.ts crew, shelter)
  trv?: { g: object; best: number; at: number; side: number; sx: number; sz: number }; // (travel: how they're getting on toward where they're going, and a step aside when they aren't)
  // (lowRun: running under an order, weapon lowered: orderStep)
  visK?: number; noiseAt?: number; nsAt?: number; guess?: { x: number; y: number; z: number; until: number } | null; // (night: how well they see who they're on, lightK; when they last heard something; when their own search last started; where they think you are)
}

type Tbl = Record<string, any>;

// What a suspect or civilian is doing ('hide': a civilian behind cover; 'dead' is only ever tested for)
type EnemyState = 'normal' | 'flee' | 'surrender' | 'cuffed' | 'cower' | 'hide' | 'dead';

// A player's last state (position p: [x, y, z]); the rest is the client's short-keyed state (js/player.ts state())
interface PState { [k: string]: any; p: number[]; dd: number; dn: number; pr: number; cr: number; sx: any; yw: number; mv: any; tl: number; ln: number; sd: number; se: number; lr: number }

// A suspect or civilian (addEnemy makes them; think() and the hit/injury code grow the optional fields)
interface EnemyCover { x: number; y: number; z: number; lean: number; px?: number; pz?: number; fl?: number; cx?: number; cz?: number }

interface HideSpot { x: number; z: number; y?: number; lean: number; fl?: number; flow?: ReturnType<typeof import('../level.js').Level.flow>; stuck?: number; [k: string]: any }

interface Order {
  by: number; role: 'push' | 'hold'; phase: 'approach' | 'stack' | 'breach' | 'clear' | 'hold' | 'enter' | 'search'; x: number; y: number; z: number; entry: OrderSpot; tflow: ReturnType<typeof import('../level.js').Level.flow>;
  at: number; until: number; holdUntil: number; rest: number; leg: 'cover' | 'run'; legT: number; cv: EnemyCover | null; cvFlow: ReturnType<typeof import('../level.js').Level.flow> | null;
  sp: { x: number; z: number; flow: ReturnType<typeof import('../level.js').Level.flow> } | null; ring: number; done: [number, number][]; look: number; delay: number; rt: number;
  own?: boolean; lookYaw?: number; // (own: a search of their own in the dark, no leader's: nightSearch)
  slot?: { x: number; y: number; z: number; flow: ReturnType<typeof import('../level.js').Level.flow>; yaw: number } | null; slotK?: number; stuck?: number; prog?: number; progT?: number; side?: number; sideYaw?: number;
  inP?: { x: number; z: number; flow: ReturnType<typeof import('../level.js').Level.flow> } | null; cp?: { x: number; z: number; yaw: number } | null; clrT?: number; resAt?: number; rush?: boolean; cordon?: 'exit' | 'cover'; face?: { x: number; z: number } | null; hc?: EnemyCover | null; // (cordon: a team with no door of its own left to stack on, holding the police's way out or a defensive spot: dispatchGroup's cordon; face: where they watch from it; hc: the cover they hold there) // (rush: reinforcing a fight: a run there, bounding only the last of it, orderStep) // (resAt: when they last went back to it after a fight) (just inside the doorway; their corner inside, and the way they face there) // (their place in a door's stack, and how far back in it: the first is the first through)
}

interface DoorPeekSpot { d: LvDoor; x: number; y: number; z: number; px: number; pz: number; lean: number; yaw: number; fl: number; phase: string; t: number; n: number; flow?: ReturnType<typeof import('../level.js').Level.flow> }

// A leader's order to a suspect (js/server.ts dispatch): get to the spot the police were last known at, by this way in (entry: a door, or a
// point round it), and then search outward. role: 'push' goes in, 'hold' covers the way in from a little way off and goes in later; phase:
// 'approach' (to the entry: at a door, to their place in its team's stack), 'stack' (on the wall beside the door, waiting for the go),
// 'breach' (through the doorway, on their turn), 'clear' (sideways along the inside wall to their corner, facing into the room, till
// the whole stack's in), 'hold', 'enter' (the entry to the spot), 'search' (spot to spot, outward from it).
interface OrderSpot { x: number; y: number; z: number; flow: ReturnType<typeof import('../level.js').Level.flow>; kind: 'door' | 'point'; n: number; grp?: StackGrp }

// A team's stack on a door (dispatchGroup): who's in place yet, when they go, who's at their corner inside, and whether the room's
// cleared (till then their leader takes no new word: callIn). by: the leader whose stack it is.
interface StackGrp { by: number; ids: number[]; ready: Set<number>; first: number | null; go: number | null; at: number; inside: Set<number>; cleared: boolean; room: number; sync?: { grps: StackGrp[] }; said?: boolean; cps?: { x: number; z: number }[] } // (room: the one they're breaching; sync: the stacks on it, going together)
