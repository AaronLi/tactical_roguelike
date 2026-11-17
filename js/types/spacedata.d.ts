// Types js/spacedata.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/spacedata.ts.

// The space direction's data, the same on every screen and in the host's simulation (docs/space.md): the squad's ships and
// what fits on their hardpoints, the kinds of place a mission goes to (a ship to board, a base on a planet to assault), the
// missions a visit to the base offers (from the visit's seed, so nobody has to be sent the list), where each one's anchor
// is in the space round the base, and how a distance is written. Nothing here draws.
type SpObj = 'artifact' | 'hvt' | 'destruct' | 'assault' | 'hostage' | 'visit';

// a ship under way in a mission's zone (zone): what she is (kind: her lines; size, th, seed, wing: the level she is when she's boarded), her course (a loop of points, metres in the zone's frame), her pace and where on it she started
interface SpContact { k: number; kind: string; size: SpSize; th: number; seed: number; wing: boolean; name: string; pts: number[][]; lens: number[]; total: number; speed: number; off: number }

// a ship's class, least to most: a civilian transport, a corvette, a frigate, a cruiser, a capital ship (SIZES, js/shipgen.ts SPEC)
type SpSize = 'transport' | 'small' | 'medium' | 'large' | 'capital';

// what a level is generated for, besides the four figures (js/level.ts generate: its fifth). size: the ship boarded; obj: what's
// wanted aboard; side: which side the breach is on (1 starboard, -1 port); ship: the squad's own ship (its berth is cut to it)
interface SpGen { size?: SpSize; obj?: SpObj; ship?: string; planet?: number; other?: SpSize | null; wing?: boolean } // (other: a second ship lying off her, nothing to do with the mission)

interface SpMission { i: number; kind: 'board' | 'assault'; obj: SpObj; size: SpSize | null; th: number; seed: number; diff: number; pay: number; name: string; brief: string; where: string; night: boolean; ly: number; anchor: [number, number, number]; other?: SpSize | null; fuse?: number; wing?: boolean } // (wing: a corvette or a frigate built as a flying wing: js/shipgen.ts wingDeck)

interface SpSeat { k: 'helm' | 'sensors' | 'turret' | 'jump'; x: number; y: number; z: number; yaw: number; n?: number; f: number; sx: number; sz: number } // (f: the floor it stands on; sx, sz: where you stand when you get up)

interface SpShipDef { id: string; name: string; cls: string; blurb: string; price: number; hw: number; z0: number; z1: number; nose: number; hull: number; speed: number; cruise: number; turn: number; turrets: number; utils: number; jump: number }

interface SpFleet { owned: string[]; ship: string; fit: Record<string, (string | null)[]> }
