// Types js/render.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/render.ts.

type ImpactKind = 'wall' | 'blood' | 'armor'; // what a round hit (impact)

type ImpactFx = 'metal' | 'stone' | 'wood' | 'plaster' | 'soft' | 'glass' | 'soil' | 'plastic' | 'water'; // what it threw up (IMPACT), js/materials.ts fx
