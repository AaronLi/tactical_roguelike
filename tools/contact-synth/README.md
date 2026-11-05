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
| **Impact** | speed, bounciness (restitution), tumble/clatter, contact curvature, click | taps, drops, bounces, clatter |
| **Friction** | pressing force, duration, speed and motion profile, roughness (µm), grain/ridge spacing (mm), periodicity, stick-slip and its rate, contact softness | smooth slides, gritty scrapes, files, ratchets, zip ties, squeaks, creaks |
| **Snap** | count, strength, spacing, load time, creak, seat hit and seat delay | latches, buckles, battery covers, switches, pen clicks, detents |
| **Body A / Body B** | material (stiffness E, density ρ, loss η), shape (bar / plate / shell / block), size, thickness, how firmly it's held, irregularity | every metal and plastic, at any thickness |
| **Flex** | swing amount, rate and decay; rattle against support; pitch wobble; swing tone | ruler twang, thunder sheet, saw blade, latch arm, door-stop spring |
| **Coil** | level, spring length (round-trip ms), dispersion, decay, brightness | spring "boing / zing / pew", spring-loaded mechanisms |

The physics behind it:

- **Contact time (Hertz):** `τ = 2.87 (m²/(R E*² v))^(1/5)`. A metal-on-metal hit is a pulse of about 30 µs, so it sounds bright. Plastic is about 300 µs and rubber several ms, so they sound duller.
- **Modes:** fundamental `f₁ ∝ c·h/L²` with `c = √(E/ρ)`. Each shape has its own overtone pattern: a free-free beam, a plate grid, shell ring modes with beating pairs, or the modes of a solid block. When there are more modes than the mode budget, the lowest third are kept exactly and the rest are represented one per log-frequency band.
- **Decay:** `α = π·f·η` plus losses to air and to whatever is holding the body. Metals have η ≈ 10⁻⁴ and ring for seconds. Plastics have η ≈ 10⁻² and give a short "tok".
- **Friction:** a fractal or ridged height profile is read at the sliding position `x(t)`, so the texture's pitch follows the speed. Stick-slip is a relaxation oscillator. The contact point moves along body A as it slides, which shifts which modes get excited.
- **Coil:** an all-pass dispersion chain inside a lossy delay loop, which is the standard spring-reverb waveguide model.

## Using it from code

`dist/index.js` has no DOM dependencies:

```js
import { render, withPatch, PRESETS, encodeWav } from './tools/contact-synth/dist/index.js';
const { samples, sampleRate } = render(withPatch(PRESETS.find(p => p.id === 'latch-snap').patch));
```

`Copy JSON` in the UI gives a full parameter set you can pass to `render()`. The page URL also stores the
current patch, so a link opens the exact same sound.
