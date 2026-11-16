// Types js/medical.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/medical.ts.

interface MedBody { parts: Record<string, MedPart>; blood: number; pk: number; }

// Injuries, for the officers (suspects keep a simpler record of the same wounds: js/server.ts injure).
//
// The body is seven parts, each with its own health: head 35, thorax 85, stomach 70, arms 60, legs 65, and the
// organs inside them (js/ballistics.ts: brain, heart, lungs, liver, spine, the long bones, the big arteries...). A
// round's track through you (worked out physically, js/ballistics.ts) takes health from the parts it crosses and
// leaves what it did to the organs it went through:
//   bleeding (light, heavy, or massive: the heart, the aorta, an iliac artery), a fracture (a long bone), a punctured
//   lung (a lung, the airway), a gut wound (stomach, bowel), a spinal injury (you're down and can't get up), or the
//   end (the brain, the brainstem, the spine in the neck).
// What a hit mostly does, though, is cost blood (100 to start): at once, as the wound opens, and then for as long as
// it bleeds. Blood is what decides whether you're up:
//   over 40%: up, however hurt;
//   40% or less: one more hit, anywhere, puts you down;
//   15% or less: unconscious;
//   none: dead.
// A part at zero only stops working (an arm that won't hold the gun steady, a leg that won't carry you, a chest that
// can't get a breath in); it doesn't put you down by itself. The head is the exception: an unarmoured head is still
// a kill, and so is the head at zero.
// Down, you bleed slowly (a sixteenth of the rate standing, but nothing clots any more), until the blood's gone. A
// teammate gets a downed (conscious) officer up with a revive; an unconscious one needs blood bags first, to come
// round. Stop the bleeding before that, or it carries on where it left off: and with low blood, the next hit puts you
// straight back down.
// Light bleeding clots by itself in 30-60 s (a bandage stops it at once; a fresh wound there starts it over); heavy
// bleeding never stops without a tourniquet or gauze. Low blood hurts your aim and pace.
// Pain (fractures, wrecked parts, bleeding) throws your aim; painkillers hold it off for two minutes.
// A punctured lung and blood loss work through painkillers; leg fractures slow you whatever you've taken.
//
// Field treatment, each for one injury on one part (and it takes time, see js/invui.ts):
//   bandage (light bleed, anywhere), tourniquet (heavy bleed, arm or leg), hemostatic gauze (heavy or light bleed,
//   anywhere), chest seal (punctured lung), splint (fracture, arm or leg), painkillers (pain, two minutes),
//   blood bag (40% blood back: on yourself, or on a teammate; an unconscious one comes round with it).
// Bandages and painkiller doses stack 4 to a slot, tourniquets and gauze 3; the rest are one each.
// A gut wound can't be fixed in the field. Everything heals at the quartermaster's.
interface MedPart { hp: number; max: number; light: boolean; heavy: boolean; massive: boolean; frac: boolean; tq: boolean; lung: boolean; gut: boolean; spine: boolean; org: Record<string, number>; clot?: number | null; ln?: number; } // (ln: how many small wounds the part's light bleeding is from: each bleeds)
