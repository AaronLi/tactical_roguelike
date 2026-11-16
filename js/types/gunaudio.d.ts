// Types js/gunaudio.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/gunaudio.ts.

interface EchoPt { x: number; y: number; z: number }

type AcMap = LvMap & { _acoustics?: Map<string, RoomAcoustics> };

interface RoomAcoustics { env: AcousticEnv; rt60: number; envReflect: number; envMix: number }

// Physics-synthesized gunshots, ported from tactical_game (src/gunAudio.ts + src/acoustics.ts).
//
// Every report comes from the gunshot synthesizer (js/gunshot-synth.ts, window.GunshotSynth).
// Each weapon maps to interior-ballistics inputs (G.GUN_SPECS), and the room the shot is fired
// in maps to the synth's environment controls via a ring of raycasts. Two-stage caching:
//   precompute(source)  — dry per-layer stems (gun + ammo + mic). Cached per weapon.
//   place(source, room) — room reverb + a fixed close-listener reference. Cached per
//                         weapon + quantised room signature.
// The placed buffer is then positioned in 3D (HRTF panner, distance gain, air absorption,
// wall occlusion), so moving around never re-renders anything. Until a room render is ready
// the dry render plays; until that exists, the old procedural shot (G.Audio.shot) plays.
type AcousticEnv = 'hall' | 'room' | 'concrete' | 'warehouse' | 'field' | 'urban' | 'canyon'; // a place's kind, from its shape (acousticsAt): the synth's own presets of that name (the last three out of doors)
