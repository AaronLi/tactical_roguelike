// Types js/ballistics.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/ballistics.ts.

type BMat = Record<string, any>; // a material (js/materials.ts MAT, TISSUE): its constants differ by kind
