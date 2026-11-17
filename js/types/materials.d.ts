// Types js/materials.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/materials.ts.

// What everything is made of, for a round (js/ballistics.ts strike, crossSolid).
//
// MAT: every material a round can meet, armour and walls and furniture alike, by the same numbers:
//   K      the de Marre constant: the speed it takes to get through t mm is v = K·t^0.7·d^0.75/m^0.5 (d in mm, m in g).
//          It's fitted to what the material is known to do (below), and armour's to the NIJ ratings.
//   E      how well each core works on it: the speed needed is divided by this (default CORE_E).
//   rho    density, kg/m³: how hard it is to shove aside at speed, half rho v².
//   sig    the stress it stands up to, Pa. With rho it sets the pressure on the round's nose, and so whether the round
//          flattens, breaks up or stays whole (js/ballistics.ts deform).
//   mu, e  a ricochet: the share of its speed along the surface it loses, and what it keeps of its speed into it.
//   noRic  it never glances (fabric, foam, anything a round just goes into).
//   clog   it plugs a hollow point's nose, which then doesn't open.
//   fx     what a hit looks and sounds like (js/render.ts IMPACT).
//   blunt, wearJ, soft, hard: armour's (js/ballistics.ts): the share of a stopped round's energy the body behind it
//          takes, joules per point of durability, and how it behaves.
//   spall  a hard plate's: the share of the plug a round pushes out of it that flies off its back as chips (stack).
// Fitted to: 9 mm ball stopped by about 3 mm of mild steel and 85 mm of pine, through a dozen sheets of plasterboard; M193
// 5.56 through 8 mm of mild steel; a single brick stopping 5.56 and 7.62x39 and passing 7.62x51 slowly; hollow block's
// shell not stopping a rifle, stopping a pistol; 100 mm of concrete stopping 7.62x51; a car door nothing to anyone.
//
// A SOLID is a box in the world (js/world.ts), and the boxes are what the level's made of, not what it's built from: a
// wall is 67 cm thick. So each solid has a construction: { skin: the layers on each face, outside in, core: what's
// between the faces (null: a void), fill: the share of the way through the core that's really core, stud: the framing in
// the void, every so many metres }. of(map, solid, p, q) gives the construction of the solid a round met at p and left
// at q. A partition is two sheets of plasterboard and a void, with a stud every 40 cm; a bunker's wall is concrete all
// the way through; a fridge is thin steel with foam in it; a car is thin steel with an engine in it.
/** Every material a round can meet (js/materials.ts MAT's keys). */
type MatKey = 'aramid' | 'pe' | 'steel' | 'ceramic' | 'pc' | 'abs' | 'nylon' | 'polyurea' | 'pad' | 'bone' | 'mild' | 'sheet' | 'iron' | 'alu' | 'concrete' | 'cmu' | 'brick' | 'ceram' | 'hardwood' | 'pine' | 'ply' | 'mdf' | 'gypsum' | 'card' | 'paper' | 'fabric' | 'foam' | 'pur' | 'wool' | 'goods' | 'foliage' | 'rubber' | 'hdpe' | 'soil' | 'sand' | 'granite' | 'water' | 'glass' | 'bpglass' | 'paperT';

/** What a body is made of (TISSUE's keys), for a round going through it. */
type TissueKey = 'skin' | 'fat' | 'muscle' | 'viscera' | 'liver' | 'heart' | 'brain' | 'lung' | 'airway' | 'vessel' | 'cortical' | 'cancellous' | 'marrow' | 'rib' | 'diploe';

/** A round's core, which a material's E is keyed by. */
type MatCore = 'lead' | 'mild' | 'hard' | 'wc';

/** What a hit on a material looks and sounds like (js/render.ts IMPACT). */
type MatFx = 'soft' | 'metal' | 'stone' | 'glass' | 'plastic' | 'wood' | 'plaster' | 'soil' | 'water';

/** One material's numbers (the header comment says what each is). */
interface MatDef {
  name: string; K: number; rho: number; sig: number; fx: MatFx; E: Record<MatCore, number>; mu: number; e: number;
  noRic?: boolean; clog?: boolean; blunt?: number; wearJ?: number; soft?: boolean; hard?: boolean; spall?: number; damp?: number; weave?: number;
}

/** What a solid is built of: skin on each face (outside in), the core between (null: a void), the share of it that's core, the framing in a void. */
interface MatBuild { skin: [MatKey, number][]; core: MatKey | null; fill: number; stud: MatStud | null; one?: boolean }

interface MatStud { every: number; w: number; mat: MatKey; mm: number }
