// Types js/ambience.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/ambience.ts.

/** How the squad's ship is flying, for her sound (js/space.ts sound): how much of her is heard and how dulled; her way on
 *  (0..1 of her speed), cruising, how hard she's gaining or losing it, turning; the jump (1 spooling, ftlK how far; 2 in
 *  transit); something that's just happened to her. */
interface AmbShipState { k: number; muf: number; thr: number; cruise: number; burn: number; turn: number; ftl: number; ftlK: number; ev?: string | null }
