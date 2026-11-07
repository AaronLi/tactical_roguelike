# Planning and tuning a mechanism sound

This is the process used to build the scenes in `src/scenes/` (the Recon CS-6, the pump shotgun and
the AR-15 charge, bolt release and magazine scenes), and the cues used to tune them. Most of the
rules here came from a specific "that sounds wrong" moment. The symptom table in part 2 records them.

The short version: **plan the mechanism, not the sound.** Work out what moves, what drives it, what
it hits and how each part is held. Choose the bodies and timing from that. Then tune by measuring,
not by turning up whatever you want to hear more of.

---

## Part 1: Planning

### 1. Take the mechanism apart (on paper)

Before writing an element, gather references: teardown photos, exploded diagrams, spec sheets. List
every part that moves or is touched, with:

- **Material**: steel, aluminium, brass, ABS, POM and so on. Billet and sheet versions of the same
  metal sound completely different.
- **Real dimensions and mass**: length, thickness, wall thickness, weight. They set pitch (the
  fundamental scales with thickness over length squared) and how heavy a contact sounds (the click
  high-pass follows the effective mass). Look them up; don't guess. On the AR-15 the stroke,
  carrier mass and spring rates all came from published numbers, and getting them wrong was
  audible: the return was too fast and the travel too short.
- **The enclosure and air spaces** the parts move inside. These include the receiver's bore, the
  fire-control pocket and the magazine well. Each one is a cavity with its own size, or an air
  column whose length changes as a part moves through it (a `tube` element).

### 2. Write the event list in causal order

For each moment of the action, ask what physically happens, in what order, and why. For example,
inserting a magazine:

1. The magazine's top enters the well.
2. It slides up, knocking the walls, while the air column above it shrinks.
3. The catch rides along its side.
4. The hole lines up and the catch springs into it.
5. The magazine hits its stop.
6. The magazine settles back down onto the catch.

Each event becomes one element:

| What happens | Element |
|---|---|
| Two bodies collide | `hit` |
| Two bodies slide against each other | `rub` |
| A spring-loaded part lets go | `snap` |
| Air pushed out or drawn in | `air` |
| An air column changes length | `tube` |

Label each element with what is physically happening ("mag catch clicks into the hole in the
magazine"), not what it should sound like. The labels are also how the analysis scripts find it.

A mechanism is many parts doing things **at different points of travel**. One long slide sound for
the AR-15 charging pull sounded fake. Several parts that start, stop, catch and release at their own
positions sounded right.

### 3. Ask what drives each motion

This decides how each element sounds more than any material setting:

| Driven by | Motion | Sound |
|---|---|---|
| **A spring** (buffer spring, catch, sear) | Accelerates hard and arrives fast | Snaps, slams, explosive returns |
| **The operator's hand or finger** | Controlled, and decelerated by the hand at the end | Nothing snaps: a button pressed all the way by a finger, or a catch drawn out by it, is nearly silent |
| **Gravity** | Starts from rest and accelerates at 9.8 m/s² | Quiet start, sounds speed up |
| **An aggressive hand** (yanking a charging handle) | A fast ramp-up | Lively start, faster sounds |

Two corrections in this group: the release first sounded "like the operator pushing it forward",
and an audible catch snap in mag-out was wrong because the finger drives the catch out.

### 4. Get the timing from physics

- **Distance from real numbers, time from motion.** For constant acceleration, `x = ½at²`. A
  magazine falling 8 cm takes `√(2·0.08/9.8) ≈ 128 ms`. Spring-driven runs are simulated: the
  AR-15 forward run uses `simulateRun` with the carrier's mass, spring force at each end of travel,
  friction and feed drag.
- **Spread events along distance, not time.** Wall knocks, ridges and tooth clicks are set by
  position. When something accelerates, they get closer together in time and harder (a higher
  impact speed). Timestamps on a fixed grid sound mechanical in the wrong way.
- **Respect constraints.** A cartridge pinned by the feed lips can't rattle loose. A part leaving
  its guide stops touching anything, so it makes no sound until it next lands somewhere. A spring
  that is still compressed at full extension (the AR-15's buffer spring) keeps holding things in
  place.
- **Check the causal order.** A catch clicks when its hole reaches it, the stop comes as the
  magazine reaches the end of its travel, and the settle comes after. The cartridge is picked up
  only after the bolt has moved back far enough to clear it.

### 5. Choose each body by how it's held, not only what it is

- **Held, pinned, gripped or latched parts don't ring.** Raise `damping`, and use `modes: 0` (noise
  bands only, no pitched partials) for small parts and anything clamped. Most mechanism parts are
  held. Free-ringing steel sounds like crystal chimes, not a gun.
- **Choose the part of the body the contact excites.** A knock on a magazine excites the small
  panel it lands on (a 6 cm panel, tinny), not the whole 18 cm shell, which rings low like a bell.
  Use the whole body only where it can actually ring: an empty magazine dropping, a part flying
  free.
- **Shape matters.** A `shell` is a pot or a bell. A long part (bolt, carrier, cartridge) is a
  `bar`. A thick machined part is a `block`.
- **Thin sheet next to billet:** a loose, worn sheet-metal magazine in a billet well buzzes and
  clatters (`flex.rattle`, short decays). A tight fit with no rattle reads as "new and tight".

### 6. Group the elements into tracks

Group the elements into tracks a game would trigger separately, or that a listener hears as one
action: insert, catch locks, release, drop, button return. Stems share one gain and sum exactly to
the mix, so balance is set by each element's `gainDb` and never by normalising stems separately.

---

## Part 2: Tuning cues

### Listening symptoms and what caused them

| What it sounds like | What was wrong | Fix |
|---|---|---|
| Piano keys, filtered sines | Synthesised from tones | Noise bands gated by envelopes (the engine's design) |
| Fantasy crystals, chimes | Pitched modes ringing freely on held parts | `modes: 0`, raise `damping`; held parts smear |
| A pot or bell; hollow in the wrong way | Wrong shape (a `shell` for a long part), or the whole body struck instead of a panel | `bar` or `block`; strike the panel |
| Creaky wood | Friction periodicity or stick-slip where the surfaces are greased | `periodicity` near 0, `stickSlip: 0` |
| A dry bolt action, not an oiled semi-auto | Dry, rough friction | Lower roughness; greased parts slap rather than grind |
| A plastic plunger hitting a rubber pad | Contact too soft and long, mass too low, no edge | A steel-on-steel pair, `sharpness`, real mass (it lowers the click high-pass and adds weight) |
| The operator pushing it forward | Speed profile and spring force too weak or too even | A spring simulation: an explosive start, a hard arrival |
| Not travelling the same distance it was pulled | Stroke or timing don't match the real numbers | Use the real stroke, and work out time from motion |
| One slide sound, not many parts | Everything starts and stops together | Stagger the parts by position in travel |
| Fresh and tight when it should be loose and worn | No rattle or buzz between loose parts | `flex.rattle`, short buzz, more scattered knocks |
| Sounds backwards | An air column's length moving the wrong way | A shrinking column rises in pitch, a growing one falls |
| Cartridge sounds loose | It ignores a constraint (feed lips) | Make it a pinned rub, not a free ring |
| A ping or ring at the end | Something ringing freely that is really held (whole shell, carrier as a free bar) | Find it with `ping.mjs`, then damp it or use the right sub-part |
| A click you can't hear | Masked by a louder event within about 5–10 ms | Move it ahead of the louder event, lower what masks it, clear overlapping elements |
| A click you shouldn't hear | It's driven by a finger, not a spring | Make it a faint rub |

### Measurements

Each scene element can be rendered on its own stem; stems share one gain, so levels compare
directly. The scripts are in `scripts/analyze/` (run `npm run build` first):

- **`timeline.mjs <scene> [regex]`**: when each element actually becomes audible (its onset), when
  it peaks, and its peak in dB relative to the mix. Use it to check the causal order and the
  spacing, and to find what is loudest. Times include the scene's lead-in, so they are offset from
  the `at` values.
- **`masking.mjs <scene> '<what>'`** (`W=96` gives a 2 ms window, the default is 10 ms): the
  element's energy over its first moment against everything else at that moment. Roughly:
  - above +3 dB: clearly its own event;
  - 0 to +3 dB: audible but merging;
  - below −3 dB: it adds colour but isn't heard as an event;
  - below −6 dB: masked.

  For a click, use a 2 ms window. The 10 ms figure also counts whatever follows it.
- **`ping.mjs <scene> [from-ms] [to-ms]`**: the strongest narrow peaks in a stretch of the mix,
  with how far each stands above its local average, and the elements that carry it. Roughly:
  - about 4× or more: an audible pitch or ping;
  - about 3×: the normal unevenness of noise.
- **`tonal.mjs <scene>`**: for each element on its own, how much of its tail is pitched rather than
  noise, its share above 3 kHz, and how loud it still is 100–200 ms later. Near 100% "tonal" means
  it rings; on a held part, that's a bug.

Reference levels from the tuned scenes:

| Measurement | Value |
|---|---|
| AR-15 mag-in catch click (2 ms window) | about +8 dB against the rest |
| Mag-in hard stop | about 5 dB below the click, 8 ms after it |
| Mag-out finger-driven catch | about −27 dB (meant to be inaudible) |
| Pings left in a finished scene | none above about 3.5× local average |

### Before sending a render

1. `npm run build && npm run check`: all presets render without errors.
2. Check the timeline of anything you changed: the causal order, and the spacing against real
   dimensions.
3. Check every click or snap meant to be heard with `masking.mjs`.
4. Run `ping.mjs` on the tail of anything metal, especially after changing which bodies a contact
   uses.
5. Render the scene and every variant (loaded, empty and no magazine). A change to a shared
   constant, such as `SHEET_RATTLE`, reaches every scene that uses it.
6. When you report a change, say what physically changed and give the measured result, not
   "sounds better".

### Physics grounding

Use published figures when you can. Look up loss factors and damping ratios for the material and
for built-up joints (assemblies lose far more than the solid material does). Look up spring rates,
masses, strokes and dimensions. When a sound needs a value that isn't published, choose one, say so,
and prefer calibrating it against a recording.

---

## Part 3: From measurements

Every gun tuned by hand so far followed the same rules from the same kinds of numbers.
`src/scenes/from-spec.ts` turns those rules into code. You fill in a `GunSpec` with
measurements, and `gunScenes(spec)` builds a first attempt at every sound:

- the charge with a loaded magazine, an empty one and none;
- the hold-open release, if the gun has one;
- the magazine in and out, loaded and empty;
- the 16 simulated magazine drops.

The `sr25` spec is built from measurements alone. The `spec-ar15`, `spec-kv47`, `spec-mp5` and
`spec-g19` specs restate the hand-tuned guns as measurements only, so the rules can be checked
against the hand tuning.

### What to measure, and what each number drives

| Measurement | Where to get it | What it drives |
|---|---|---|
| Reciprocating mass (carrier + bolt, or slide + barrel; add the buffer) | Parts weights, armorer's manuals | Run-home time `t = √(2 x m / F)`, the speed of every hit on the way home (their level and brightness), and the carrier and bolt bars' thickness (mass = ρ L t²) |
| Stroke | Manual, or bolt travel measured from the port | Pull timing, run-home time, the spring's coil length (its pitch) |
| Return spring force at home and fully back | Spring rate × compression; published spring weights | Run-home time and speed |
| Carrier and bolt (or slide and barrel) length | Parts drawings | The bars' pitch (longer is lower) |
| Lock-up kind (rotating, rollers, tilting) | How it works | The last few ms: a bolt that turns into its lugs, rollers that snap out, or a barrel that cams up into the slide |
| Lube (greased, oiled, dry) | How it's kept | The rubs' surface texture. Dry gets gritty stick-slip on the hammer |
| Hold-open; hammer or striker; hammer spring wire | Manual | Whether there is a release scene; the hammer's ride-down, wind-up and cock on the pull |
| Handle kind (on the carrier, separate, the slide), material, length | Manual | A separate handle stops at the end of its travel, then either springs home in its tube (MP5) or claps into its front stop with a latch clack (AR) |
| Receiver build (billet, stamped, polymer), wall, inside length × width × height | Drawings, calipers | The shell body (aluminium shell, ringing steel plate, lossy polymer) and the air space that rings (its cavity from the inside dimensions) |
| Ports (open, closed, slide); loose top cover | Look at it | How muffled it is: open billet is heard straight; the others go through the walls (a low-pass with a straight-through leak). A loose cover buzzes on every slam |
| Buffer tube: length, bore, buffer weight | AR pattern guns | The spring sings in the tube's air column; the buffer's weights lag on the pull and slam forward a beat after lock-up |
| Barrel length and diameter; overall length; frame material; separate lower | Spec sheet | The low end of the slam home: the barrel rings, the whole gun flexes as one body, and a pinned lower rings on its own |
| Cartridge overall and case length, mass | Cartridge drawing | Where the bolt clears the rim on the pull and strips the round on the run home; the round's ring |
| Magazine: capacity, length × width × thickness, material, wall, rib pitch, empty mass, spring force and rate | Calipers, scale, spring gauge | The magazine body's ring (ribbed folded steel, aluminium, polymer), its drop simulation (mass, centre of mass, contents on the spring), the follower rattle |
| Magazine insert (straight, rock-in), catch (button, paddle), free drop, well, fit | Look at it | The mag-in and mag-out order of events. A loose fit knocks the walls on the way up, and the air in the well shrinks |

The rules that don't change from gun to gun:

- **Timing.** The pull is a smooth hand yank over the stroke. The default is `0.13 + 0.4 × stroke`
  s; match it to the reload animation with `chargeFromSpec(g, fill, { pull, hold })`. The run home
  is the spring driving the mass.
- **Order.** The cartridge length sets where the round is stripped. The lock-up kind sets the
  last few milliseconds.
- **Held parts don't ring.** A carrier that lands is held home, so it is a damped bar. Only free
  parts get modes.
- **Through the walls, not into the ear.** Only parts on the outside are marked `outside`: the
  handle, the top cover, the receiver ring and the thumb on the catch. They skip the enclosure.

### How close a first attempt gets

`node scripts/analyze/compare.mjs <hand-tuned> <spec> ...` compares two scenes on their dry render. It reports:

- their lengths;
- when the loudest moment comes;
- the spectral centroid and the share of energy above 3 kHz;
- the RMS difference of their third-octave spectra. `BANDS=1` prints each band.

As a guide, under about 3 dB is close, 3–6 dB is noticeably different, and over 6 dB is a different sound.

| Scene | Spectral difference |
|---|---|
| KV-47 charge | 3.0 dB |
| MP5 charge | 2.4 dB |
| AR-15 release | 4.0 dB |
| AR-15 charge | 4.6 dB |
| G19 rack | 4.9 dB |
| G19 slide release | 5.6 dB |
| KV-47, MP5 and G19 mag in | 3.2–3.8 dB |
| AR-15 mag in | 5.9 dB |

What the hand tuning added beyond the rules is detail of one particular gun:

- the AR's staged lug turn, its gas key and its hammer and trigger jolting on their pins;
- the G19's trigger bar and its particular striker;
- the AR magazine's settle back onto its catch.

The first attempt has the right events in the right order at the right times. It doesn't have
those details.

### Tuning a first attempt

Listen to the charge first. It exercises most of the numbers. Then:

1. **Timing wrong:** check the mass and the spring forces before changing any gain. Then match
   `pull` to the animation.
2. **Too bright or too dull overall:** check `ports` and `build`. These decide how much is heard
   through the walls.
3. **Slam has no weight:** check the `gun` block. A short barrel or a polymer frame is meant to be
   light.
4. **A part rings on:** it's a held part modelled as free. Find it with `ping.mjs`.
5. **Scratchy rubs:** set `lube` one step wetter.
6. **Magazine sounds like the wrong material:** check its material, wall and `ribPitchCm`. Ribs
   stiffen a sheet and stop it ringing like a plain plate.
7. When a gun needs more than these rules give, copy its generated scene into a hand-tuned file
   and add the missing parts there, as `more-guns.ts` does.
