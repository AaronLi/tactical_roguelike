// Types js/humandata.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/humandata.ts.

// The human models' variants (assets/models/humans/<id>.glb): written by models/characters/build_variants.py, not by hand.
// scale: the figure's height over the skeleton's own (1.756 m); skin, hair: colours; fit: the trunk's half-width, front and back
// (metres from the spine's line) across the chest, the belt and the pelvis, and the limbs' girth against the base figure's.
interface HumanDef { sex: string; name: string; scale: number; hairStyle: string; skin: number; hair: number; fit: { chest: number[]; belt: number[]; pelvis: number[]; delt: number; arm: number; fore: number; thigh: number; calf: number; head_w: number } }
