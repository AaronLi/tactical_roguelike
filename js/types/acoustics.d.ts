// Types js/acoustics.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/acoustics.ts.

interface AcPortal { id: number; kind: AcPortalKind; a: number; b: number; cells: number; x: number; y: number; z: number; door?: LvDoor; win?: LvWin }

/** a room's measured response (js/acoustics.ts roomAt): the energy coming back over time (per bin of `bin` s, per ray), its
 *  first arrivals [t, energy], its whole against the direct sound's at 1 m, RT60 from its slope, its mean free path */
interface AcTrace { hist: Float32Array; bin: number; early: [number, number][]; wet: number; rt60: number; mfp: number; zone: number;
  /** the low band's (under 250 Hz): its energy response and its RT60 */
  histL: Float32Array; rt60L: number }

/** what reaches you from a zone: its level (0..1, energy through the portals), how bright (a low-pass cutoff, Hz), and the
 *  portal it comes in by last (where it seems to come from), null for your own zone */
interface AcReach { level: number; lp: number; via: AcPortal | null; hops: number }

// The level's acoustics: what the sound of a place does, shared by everything that makes sound in it (js/ambience.ts now;
// js/gunaudio.ts's reverb and echoes are next). Built once a level, from its tiles:
//   zones     the spaces sound fills: each floor's open tiles, split by the walls, and indoors split from out of doors.
//             Each has its volume (its own height: a room open to the floor above is two storeys of air; out of doors
//             there's no ceiling), its surface, and from those its reverberation time (Sabine: RT60 = 0.161 V / S α)
//   portals   where sound gets from one zone to the next: a door (open, or shut: through the leaf, dull and quiet), a
//             window (through the glass, or broken), an opening where indoors meets out of doors with no wall (a
//             garage's door up, a carport), a drop in the floor (a hall two storeys high, a stairwell)
// What's heard where you stand: listen() finds the strongest path from your zone to every other one, through the
// portals (a door's leaf, a pane, each passed takes its share), and how bright it still is (the dullest thing it passed).
type AcPortalKind = 'door' | 'window' | 'opening' | 'void';
