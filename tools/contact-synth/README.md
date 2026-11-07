# Contact Synth

A TypeScript / Web Audio synthesizer for **metal and plastic contact sounds**: impacts, bounces, slides,
scrapes, squeaks, ratchets, latches and clicks, coil springs, and springy metal or plastic (rulers,
sheets, saw blades). Every sound is built from a physical description, so you get any combination by
moving sliders instead of choosing from a fixed list of sound types.

## Run it

```
node serve.js          # from the repo root
# open http://localhost:8080/tools/contact-synth/
```

The compiled JS is committed in `dist/`, so no build is needed to use it. To change the source:

```
cd tools/contact-synth
npm install            # TypeScript only
npm run build          # or: npm run watch
npm run check          # renders every preset in Node and checks the output
```

## How a sound is described

| Layer | Parameters | What it covers |
|---|---|---|
| **Impact & contact** | speed, bounciness (restitution), tumble/clatter, contact curvature, edge hardness, click | taps, drops, bounces, clatter |
| **Friction** | pressing force, duration, speed and motion profile, roughness (µm), grain/ridge spacing (mm), periodicity, stick-slip and its rate, contact softness | smooth slides, gritty scrapes, files, ratchets, zip ties, squeaks, creaks |
| **Snap** | count, strength, spacing, load time, creak, seat hit and seat delay | latches, buckles, battery covers, switches, pen clicks, detents |
| **Body A / Body B** | material (stiffness E, density ρ, loss η), shape (bar / plate / shell / block), size (up to 50 cm), thickness, how firmly it's held, irregularity | every metal and plastic, at any thickness |
| **Flex** | swing amount, rate and decay; rattle against support; pitch wobble; swing tone | ruler twang, thunder sheet, saw blade, latch arm, door-stop spring |
| **Coil** | level, spring length (round-trip ms), dispersion, decay, brightness | spring "boing / zing / pew", spring-loaded mechanisms |
| **Housing** | amount, hollow air box, air space width (narrow = a pipe-like bore), and the enclosure's own material, shape, size, thickness, hold | parts inside a blaster shell, case or housing: every contact rings the enclosure through its mounts, and the air inside resonates |

The physics behind it:

- **Contact time (Hertz):** `τ = 2.87 (m²/(R E*² v))^(1/5)`. A metal-on-metal hit is a pulse of about 30 µs, so it sounds bright. Plastic is about 300 µs and rubber several ms, so they sound duller.
- **Sound from noise, not sine waves:** like the gunshot synth, everything is built from filtered noise with envelopes. The body's modes (fundamental `f₁ ∝ c·h/L²`, `c = √(E/ρ)`, with each shape's own overtone pattern) are grouped into 1/6-octave bands. Bands crowded with modes become wide noise bands, which give the clank or wash of a sheet, case or pot. Isolated modes become narrow noise bands, which give a pitch that wavers slightly. Every contact kicks each band's envelope by its momentum, the contact spectrum (from `τ`) and a random weight for where it hit, so no two hits colour the sound the same way.
- **Held parts smear:** a body that is held, pinned or pressed against others (the *Held / damped* slider) decays faster, and its pitched partials also widen. Its contact stiffness keeps shifting, so clamped metal reads as a clack and not a chime. Mechanisms are assemblies: joint losses in built-up steel structures far exceed solid steel's own loss, so the firearm scenes damp their parts heavily. Small parts have no pitched partials, and the receivers have none either. Free-ringing steel sounds like crystal chimes.
- **Coherent onset:** at the instant of contact, every resonance of a struck body starts in phase, so together they make one sharp spike: the click or snap. After that they drift apart into a noisy ring. Each contact therefore drives every band with a short (~1 ms) burst that starts in phase across all bands, coloured by the body's spectrum, and the noise bands carry the ring after it.
- **Edge hardness:** hard materials first touch through an edge or burr, so each contact is a short, bright crack (5–40 µs) followed by the main Hertzian contact. The *Edge hardness* slider sets how much; stiffness scales it, so rubber and foam get none. This is what gives hard plastic its snap.
- **Teeth:** with a regular, deep texture (ratchets, zip ties, bottle caps), the follower drops off each tooth and its spring slams it into the next, which makes one discrete click per tooth.
- **Micro-contacts:** each collision is followed by a few smaller touches within a few ms (more with Tumble/clatter), and the contact itself is a noise burst whose brightness comes from `τ`.
- **Decay:** `α = π·f·η + 400·η` plus losses to air and to whatever is holding the body. The second term is a floor that stops the lowest modes of lossy plastic parts from humming on. Metals have η ≈ 10⁻⁴ and ring for seconds. Plastics have η ≈ 10⁻² and give a short "tok".
- **Friction:** a fractal or ridged height profile is read at the sliding position `x(t)`, so the texture's pitch follows the speed. That force signal is then filtered through the body's bands. Stick-slip is a relaxation oscillator. The contact point moves along body A as it slides, which shifts which modes get excited.
- **Housing:** the contact events reach the enclosure through its mounts, with contact times stretched and spots scattered, so the enclosure rings with the parts. Its air spaces are driven by the walls and, directly, by the contact's own pressure pulse: a snap inside a pocket pushes that pocket's air. By default there is one box, L × 0.45L × 0.2L. A narrow `cavityWidth` makes it a bore instead. A scene can also list several connected `cavities`, each with its own size, sharpness (Q) and level: a rifle receiver has the upper's bore, the fire-control pocket and the magazine well.
- **Coil:** an all-pass dispersion chain inside a lossy delay loop, which is the standard spring-reverb waveguide model.

## Using it from code

`dist/index.js` has no DOM dependencies:

```js
import { render, withPatch, PRESETS, encodeWav } from './tools/contact-synth/dist/index.js';
const { samples, sampleRate } = render(withPatch(PRESETS.find(p => p.id === 'latch-snap').patch));
```

`Copy JSON` in the UI gives a full parameter set you can pass to `render()`. The page URL also stores the
current patch, so a link opens the exact same sound.

## Scenes (multi-part mechanisms)

See [SOUND_DESIGN.md](SOUND_DESIGN.md) for how scenes are planned and tuned, and `scripts/analyze/` for the measurement scripts it uses.


A scene sequences many contact sounds, each with its own pair of bodies, into named tracks on one
timeline (`src/scene.ts`). Besides contact sounds, a scene can use an `air` source: band-passed noise
for air pushed out of a plunger tube or barrel, with an optional "pop". All stems share one gain, so
they keep their balance and sum exactly to the full mix.

```
npm run build
npm run scene -- recon-cs6 out/recon        # stems + full mix + cues.json
npm run scene -- recon-cs6-dry out/recon-dry
```

`recon-cs6` (`src/scenes/recon-cs6.ts`) is a Nerf Recon CS-6 priming and firing cycle, built from iFixit
teardown photos. Every element plays through a housing modelled on the ~33 cm ribbed ABS clamshell. It has these
tracks: slide back, spring compress, air-restrictor valve closing, sear engage, clip feed, slide
forward (including dart chambering, front stop and the trigger lock), air-restrictor valve opening,
trigger pull, sear release, plunger launch (spring, O-ring, air, dart leaving) and plunger impact.
`recon-cs6-dry` is a dry fire. With no dart, the air restrictor stays shut and the trapped air
cushions the plunger.

Other scenes, in `src/scenes/firearms.ts`:

- `pump-shotgun` (generic pump-action, racked). Tracks: action release, unlock, pull slide, extract and eject, carrier and feed, rear stop, push slide, chamber, lock-up.
- `ar15-charge`, `ar15-charge-empty-mag`, `ar15-charge-no-mag`: the charging handle pulled back and let go, with a loaded, empty or no magazine.
  - Loaded: the round is stripped, fed, guided into the breech and chambered.
  - Empty: on the pull, the follower pops up and lifts the bolt catch. On release, the carrier is caught on the raised catch a few mm forward (the bolt locks open), and the operator then pushes the charging handle home.
  - No magazine: nothing under the bolt and no feeding.
- `ar15-bolt-release`, `ar15-bolt-release-empty-mag`, `ar15-bolt-release-no-mag`: the bolt catch pressed with the bolt locked back. With an empty magazine, the press is firmer (the follower pushes up on the catch) and the bolt rides over the follower on the way home.

- `ar15-mag-in`, `ar15-mag-in-empty`: a loaded or empty magazine inserted.
  - The hand accelerates it up the lower receiver's aluminium well, knocking the walls, while the spring-loaded mag catch rides along its side.
  - The catch clicks into the hole in the magazine's side, the magazine hits its stop, and it settles back onto the catch. With a loaded magazine, the top round presses against the bolt carrier.
- `ar15-mag-out`, `ar15-mag-out-empty`: the finger presses the mag release button and draws the catch out (nearly silent). The magazine falls from rest out of the well, speeding up, and touches nothing once it's clear; then the button springs back.
- `ar15-load-rack-unload`: the full cycle, made with `chainScenes`: a loaded magazine in, the charging handle racked and released (chambering a round), and the magazine out, with the hand's travel between them and a level balance between the parts.
- `ar15-mag-in-out`: just the magazine: a loaded magazine in, a short pause, and back out.
- `ar15-mag-drop-<way>-<fill>`: a USGI magazine dropped ~1.2 m onto concrete (it lands at ~4.8 m/s), 16 scenes, **simulated**: the fall, every bounce, tip, tumble, rock and slide comes from a rigid-body simulation (`src/rigid.ts`) of the 18 × 6 × 2.2 cm magazine with its load's mass and centre of mass, its contents riding the magazine spring. Each contact becomes one hit (its part — floorplate, feed lips, a folded edge, the spine, a flat side — sets the sound, its impulse sets the level), each slide a rub, each knock of the contents an internal hit.
  - `<fill>`: `empty`, `third` (10 rounds), `two-thirds` (20) or `full` (30). The load sets the mass (0.12 to 0.48 kg), the bounce, how damped the shell is, the hollow space below the stack, and what moves inside: an empty follower is thrown off its spring and slams back into the feed lips ~10 ms after landing; a heavier stack swings slower; a full one barely moves.
  - `<way>`: the release: `bottom` (upright, so it lands on the floorplate), `top` (inverted), `sideways` (spinning about its long axis) or `forwards` (spinning end over end). Where it goes from there is up to the simulation.
  - `magDropScene({ rounds, way, surface: 'asphalt', box: 0.5, toss, start })` builds others: an asphalt surface (softer, lossier, rougher) and a low walled box it can bounce off.
  - `node scripts/drop-video.mjs <rounds> <way> <out.mp4> [--surface asphalt] [--box 0.5] [--toss 0.45 --start -0.1]` renders the simulation as a video (a small software renderer, encoded with ffmpeg) with its synthesized sound: real time, then a 4× slow-motion replay; rings mark where each louder contact lands.

- From measurements (`src/scenes/from-spec.ts`): fill in a `GunSpec` (action mass, stroke, spring, lock-up, receiver, barrel, cartridge, magazine) and `gunScenes(spec)` builds a first attempt at every sound of the gun: `<id>-charge` (loaded, `-empty-mag`, `-no-mag`), `<id>-release`, `<id>-mag-in`/`-mag-out` (and `-empty`), and `<id>-mag-drop-*`. `sr25-*` is built from measurements alone; `spec-ar15-*`, `spec-kv47-*`, `spec-mp5-*` and `spec-g19-*` are the hand-tuned guns restated as measurements, for comparison (`scripts/analyze/compare.mjs`). See SOUND_DESIGN.md, part 3.

- `smg-*` (a 9 mm blowback SMG) and `bullpup-*` (a 5.56 bullpup): two generic families from measurements; `bolt-action` (a turn bolt worked by hand), `shell-in` and `cartridge-in` (rounds loaded by hand).
- `node scripts/game-bank.mjs <out-dir>` bakes the game's gun-handling clips (each family's rack on the game's two rack clocks, the release, the pull and the run home apart, magazine in and out, the 16 drops; the manual actions and rounds by hand) as OGG with a `manifest.json` of anchors: the moment in each clip the game lines its cue up with. The `claude/synth-audio-test` branch of the game plays only these.

- Footsteps (`src/scenes/footsteps.ts`), built from measurements too: a `StepSpec` names the sole (`SOLES`: `boot`, `sneaker`, `dress`, `barefoot`), the floor (`FLOORS`: `concrete`, `pave`, `tile`, `lino`, `wood`, `metal`, `carpet`, `dirt`, `grass`, `leaves`, `gravel`), the gait (`GAITS`: `creep`, `crouch`, `walk`, `run`), the walker's mass and their kit (`none`, `light`, `heavy`). `stepScene(spec)` builds one step in three tracks:
  - foot: the heel's hard rim catching first, the heel taking the weight (the foot and shank stopping, ~4.5% of body mass, through the heel's rubber and the floor's give), its scuff, the forefoot slapping down, the roll, the toes pushing off. A run lands on the forefoot; a creep or a crouched step lands flat. The slides go through a light, dynamically stiff tread body (a scuff is the sole's skin dragging, not the leg stopping), and a grippy sole on a smooth floor squeaks.
  - floor: a wooden floor's boards and joist space boom (and now and then a board creaks), a steel deck rings, and what lies loose is crushed under the heel and the forefoot (grit, gravel grinding and scattering, grass, dry leaves).
  - kit: what's carried lags the body and knocks as the heel stops it: magazines in pouches, a sling swivel, plates in a carrier, a buckle, the fabric.
  - `walkScene(spec, steps)` strings steps left and right on the gait's cadence; `walk-*` in the scene list are a boot on every floor, every gait, every sole and some kit.
  - Loudness across floors, gaits and soles is a measurement given to the synth (`levelDb` on each), since every sound is rendered normalised.
  - `node scripts/footstep-bank.mjs <out-dir> [variants]` bakes the game's footsteps: boots and sneakers on every floor at every gait, dress shoes walking and running indoors and on the street, 4 variations each, and the kit apart, as OGG with a `manifest.json` (each clip's anchor: where the foot strikes). Levels are baked in. `node scripts/footstep-reel.mjs <out.wav> [--room]` renders a 90 s listening reel.

The forward run is simulated from the reciprocating mass, the spring force and each magazine state's drag. Loaded takes 24.7 ms to the bolt face, empty 24.0 ms and no magazine 23.7 ms.

