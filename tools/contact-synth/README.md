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
  - It enters the mag well and slides up the lower receiver's aluminium well, and the spring-loaded mag catch rides along its side.
  - The catch snaps into the magazine's slot and the magazine bottoms in the well. With a loaded magazine, the top round presses against the bolt carrier.
- `ar15-mag-out`, `ar15-mag-out-empty`: the mag release button pressed until the catch pivots out. The magazine drops off the catch and slides out of the well, and the button springs back. A loaded magazine is heavier and damped by its rounds; an empty one rings.

The forward run is simulated from the reciprocating mass, the spring force and each magazine state's drag. Loaded takes 24.7 ms to the bolt face, empty 24.0 ms and no magazine 23.7 ms.

