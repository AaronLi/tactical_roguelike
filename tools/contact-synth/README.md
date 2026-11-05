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
| **Housing** | amount, hollow air box, and the enclosure's own material, shape, size, thickness, hold | parts inside a blaster shell, case or housing: every contact rings the enclosure through its mounts, and the air inside resonates |

The physics behind it:

- **Contact time (Hertz):** `τ = 2.87 (m²/(R E*² v))^(1/5)`. A metal-on-metal hit is a pulse of about 30 µs, so it sounds bright. Plastic is about 300 µs and rubber several ms, so they sound duller.
- **Sound from noise, not sine waves:** like the gunshot synth, everything is built from filtered noise with envelopes. The body's modes (fundamental `f₁ ∝ c·h/L²`, `c = √(E/ρ)`, with each shape's own overtone pattern) are grouped into 1/6-octave bands. Bands crowded with modes become wide noise bands, which give the clank or wash of a sheet, case or pot. Isolated modes become narrow noise bands, which give a pitch that wavers slightly. Every contact kicks each band's envelope by its momentum, the contact spectrum (from `τ`) and a random weight for where it hit, so no two hits colour the sound the same way.
- **Coherent onset:** at the instant of contact, every resonance of a struck body starts in phase, so together they make one sharp spike: the click or snap. After that they drift apart into a noisy ring. Each contact therefore drives every band with a short (~1 ms) burst that starts in phase across all bands, coloured by the body's spectrum, and the noise bands carry the ring after it.
- **Edge hardness:** hard materials first touch through an edge or burr, so each contact is a short, bright crack (5–40 µs) followed by the main Hertzian contact. The *Edge hardness* slider sets how much; stiffness scales it, so rubber and foam get none. This is what gives hard plastic its snap.
- **Teeth:** with a regular, deep texture (ratchets, zip ties, bottle caps), the follower drops off each tooth and its spring slams it into the next, which makes one discrete click per tooth.
- **Micro-contacts:** each collision is followed by a few smaller touches within a few ms (more with Tumble/clatter), and the contact itself is a noise burst whose brightness comes from `τ`.
- **Decay:** `α = π·f·η + 400·η` plus losses to air and to whatever is holding the body. The second term is a floor that stops the lowest modes of lossy plastic parts from humming on. Metals have η ≈ 10⁻⁴ and ring for seconds. Plastics have η ≈ 10⁻² and give a short "tok".
- **Friction:** a fractal or ridged height profile is read at the sliding position `x(t)`, so the texture's pitch follows the speed. That force signal is then filtered through the body's bands. Stick-slip is a relaxation oscillator. The contact point moves along body A as it slides, which shifts which modes get excited.
- **Housing:** the contact events reach the enclosure through its mounts, with contact times stretched and spots scattered, so the enclosure rings with the parts. Its walls drive the air-box resonances, with dimensions taken as L × 0.45L × 0.2L.
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
- `ar15-charge` (charging handle pulled back and let go). Tracks: latch, unlock, pull back, buffer spring compress, rear stop, release forward. The release-forward track is the spring slam, stripping and chambering a round, bolt lock-up and the charging-handle latch.
- `ar15-bolt-release` (bolt catch pressed with the bolt locked back). Tracks: bolt catch, release forward, catch reset.

