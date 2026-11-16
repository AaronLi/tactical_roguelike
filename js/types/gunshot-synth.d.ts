// Types js/gunshot-synth.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/gunshot-synth.ts.

type CaseMat = 'brass' | 'steel' | 'aluminum' | 'plastic';

type SynthEnv = 'none' | 'field' | 'forest' | 'urban' | 'canyon' | 'room' | 'hall' | 'concrete' | 'warehouse';
