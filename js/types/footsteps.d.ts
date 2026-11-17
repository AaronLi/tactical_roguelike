// Types js/footsteps.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/footsteps.ts.

// Footsteps, synthesized: every step anyone takes (you, your team, suspects, civilians) is a clip from the contact
// synth's footstep model (tools/contact-synth/src/scenes/footsteps.ts on claude/great-wozniak-4nmx0u, baked by its
// scripts/footstep-bank.mjs into assets/audio/footsteps/): the sole (boots, sneakers, dress shoes), the floor under
// the foot (eleven of them), the gait (creeping, crouched, walking, running), four takes of each, and the kit's rattle
// (light, heavy) laid over it apart. The clips carry their level (a carpet step is 12 dB under concrete, a run 8 dB over
// a walk); here they're placed in the world and heard the way gunshots are (js/gunaudio.ts): by the level's acoustics
// (js/acoustics.ts hear(): as loud and as dull as the way to you lets them be, from the opening they come in by) and
// into the walker's room's measured reverberation.
// Others' steps land when their rig plants a foot (js/rig.ts, the gait's phase); yours, every half stride you walk.
/** who's walking, as the bank has them (tools/contact-synth/scripts/footstep-bank.mjs BAKE): an officer in boots with their
 *  armour (~105 kg), a suspect in boots (~80 kg), a civilian in sneakers, everyday rubber-soled shoes or leather dress shoes */
type FsSole = 'boot' | 'suspect' | 'sneaker' | 'shoe' | 'dress';

/** who's walking: what's on their feet and what they carry (js/views.ts sets it on each rig's update) */
interface FsFeet { sole: FsSole; kit: FsKit; careful?: boolean; low?: boolean }

type FsKit = 'none' | 'light' | 'heavy';
