// Types js/scars.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/scars.ts.

// What a round does to what it hits: the damage it leaves on a surface and what it throws out of it, by what the surface is made
// of (js/materials.ts). plan() works out a mark; the game puts it in its pool of marks (js/render.ts impact: they stay on doors and
// targets), the replays in their own scene (js/highlights.ts struck). Walls and doors have the hole really cut in them (js/damage.ts);
// a mark is what's left round it, or all there is on anything else: a picture of the damage laid on the surface (one sheet of them, drawn
// here, lit as the level is; a second with the holes left clear, for what's been cut) and, where something really stands proud of
// it, a piece of geometry too: metal torn open and bent the way the round was going, splinters, torn paper. The way it went
// matters: a dent's dragged along the round's line, a gouge runs with it, an exit's petals lean with it.
//   - metal dimples into the hole on the way in and comes out of the far side in petals; a round it stops leaves a dent and lead
//     smeared in it; cast iron's brittle, and cracks and chips instead
//   - concrete, block, brick and tile crater and crack, thrown chips and dust, spalling wider out of the back than the front
//   - wood takes a ragged hole and blows out in splinters along the grain; particle board just crumbles
//   - plasterboard takes a neat hole in, a torn paper-edged blowout out, and hangs in the air as dust
//   - cardboard, paper, cloth, foam, wool and stock tear and let go of what's in them, which drifts
//   - glass and tile star; plastic whitens and stars; earth and sand crater; water splashes; leaves fall
// what a round does to a surface (js/damage.ts and js/render.ts pass these; dir is a vector or an [x, y, z]). k: e in, x out, r off (a skid)
type MarkSide = 'e' | 'x' | 'r';

interface MarkOpts { m?: string; fx?: string; k?: string; n?: number[] | null; dir?: any; J?: number; stop?: boolean; cal?: number; cut?: number; fit?: number; }
