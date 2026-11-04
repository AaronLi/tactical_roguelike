/*
 * Gunshot Sound Synthesizer — physics-driven Web Audio engine.
 *
 * The report of a firearm is reconstructed from three physical layers:
 *   1. Muzzle blast  — the shock front of high-pressure propellant gas venting
 *                      from the bore. Loudest component; spectrum set by bore
 *                      size, residual muzzle pressure and gas volume.
 *   2. Ballistic crack — an N-wave produced only when the projectile leaves the
 *                      muzzle supersonically. Sharp, high-frequency.
 *   3. Mechanical action — the metallic clatter of the bolt/carrier unlocking,
 *                      slamming the buffer and re-chambering.
 *
 * A lightweight interior-ballistics model turns the seven user inputs
 * (barrel length, caliber, muzzle device, chamber pressure, powder grain size,
 * bullet weight, bolt factors) into muzzle velocity + muzzle pressure, which in
 * turn drive the synthesis parameters. Everything is rendered offline into an
 * AudioBuffer so it can be replayed instantly and visualized.
 */
(function () {
  'use strict';

  const SR = 48000;
  const C = 343;                 // speed of sound, m/s (sea level, ~20°C)
  const GRAIN_KG = 6.479891e-5;  // kilograms per grain (mass)
  const PSI = 6894.76;           // pascals per psi

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smoothstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const dbToGain = (db) => Math.pow(10, db / 20);

  // Muzzle-device signatures. Each redirects/contains propellant gas differently.
  //  level : broadband level offset (dB)      lp/hp : bright/dark spectral tilt
  //  decay : blast decay-time multiplier       crack : ballistic crack scaling
  //  tang  : metallic "ping" of ported gas jet   whoosh: gas-expansion rush (cans)
  // A muzzle device only shapes the muzzle BLAST. It does NOT touch the
  // supersonic crack (that N-wave forms downrange) nor the mechanical action —
  // so a suppressor quiets the blast but leaves a supersonic bullet's crack, and
  // makes the bolt clatter relatively prominent. Those layers are gained
  // independently of `level`, below.
  const DEVICES = {
    none:       { label: 'None (bare muzzle)', level: 0,   lp: 1.00, decay: 1.00, tang: 0.00, whoosh: 0.00 },
    flash:      { label: 'Flash hider',        level: -1,  lp: 0.95, decay: 1.00, tang: 0.05, whoosh: 0.00 },
    comp:       { label: 'Compensator',        level: 2,   lp: 1.15, decay: 0.90, tang: 0.18, whoosh: 0.00 },
    brake:      { label: 'Muzzle brake',       level: 4,   lp: 1.28, decay: 0.82, tang: 0.38, whoosh: 0.00 },
    suppressor: { label: 'Suppressor',         level: -20, lp: 0.34, decay: 1.85, tang: 0.00, whoosh: 0.85 },
  };

  // Suppressors (the 'suppressor' device, by can). What a can does to the report, from the measurements:
  //  - It cuts the muzzle blast's peak by roughly 17-24 dB at the shooter's ear (3-32 dB across rifles,
  //    cans and loads; a supersonic rifle through a can still peaks above 140 dB). The baffles and
  //    expansion chambers break up the initial shock front, so what's left is a slower-rising, darker
  //    "pfft" that lasts longer: the can blows down for tens of ms instead of one sharp shock.
  //  - The ballistic crack forms outside the gun and is untouched: suppressed supersonic rounds still
  //    crack downrange (only subsonic ammunition removes it), and the action is no quieter, so the bolt
  //    clatter comes forward.
  //  - Back pressure: the can holds gas in the bore, so more of it blows back through the action (gas
  //    in the face, a louder, faster bolt) on gas and blowback guns.
  //  - First-round pop: the oxygen in a cold can burns with the first shot's gas, making it a few dB
  //    louder than the shots that follow (applied at playback by the caller: it's one shot in a string).
  //  - The can itself rings faintly: its gas column (an open-closed pipe of hot gas) and the steel tube.
  // How much a can takes off depends on how much gas it's asked to hold: its volume against the gas
  // reaching the muzzle (bore x residual pressure). A full-power .308 through a 5.56-sized can loses
  // several dB of suppression; a 9 mm through a pistol can gets more.
  //  db    : blast reduction for the gas the can is sized for (a gasLoad of vol; 5.56 from a 14.5" barrel is 1)
  //  vol   : relative internal volume (the gas it's sized for, and how long it blows down)
  //  len   : length (m), for the gas-column ring     back : back pressure into the action (0-1)
  //  shock : how much of the initial shock front survives the baffles
  //  ring  : the tube's ring level                    ported: a ported barrel (integral), bleeding gas early
  const SUPPRESSORS = {
    full:      { label: 'Full-length can',   db: -24, vol: 1.00, len: 0.17, back: 0.60, shock: 0.18, ring: 0.10 },
    compact:   { label: 'Compact can',       db: -21, vol: 0.55, len: 0.11, back: 0.45, shock: 0.30, ring: 0.14 },
    long:      { label: 'Long (pistol) can', db: -27, vol: 1.20, len: 0.20, back: 0.35, shock: 0.14, ring: 0.08 },
    box:       { label: 'Shotgun can',       db: -22, vol: 2.50, len: 0.26, back: 0.30, shock: 0.32, ring: 0.18 },
    integral:  { label: 'Integral (ported)', db: -26, vol: 1.30, len: 0.20, back: 0.20, shock: 0.12, ring: 0.06, ported: true },
    integralX: { label: 'Extended integral', db: -29, vol: 1.60, len: 0.24, back: 0.20, shock: 0.10, ring: 0.05, ported: true },
  };

  // Convert a physical powder grain size (mm) to a normalized burn rate.
  // Small grains have more surface area -> faster burn -> earlier pressure peak.
  const burnRateFromGrain = (mm) => clamp(1 - (mm - 0.2) / 1.8, 0, 1);

  // Action types set two timing facts: how long after firing the breech can
  // open (unlock delay) and the full mechanical cycle time. Locked-breech/gas
  // actions must wait for pressure to drop and gas to travel back from the port;
  // blowback actions begin opening almost immediately as gas drives the case
  // head rearward. `cycle` is the base full-cycle time at nominal bolt mass (s).
  const ACTIONS = {
    gas:        { label: 'Gas (direct/piston)', cycle: 0.075, unlock: 0.0042 },
    longstroke: { label: 'Long-stroke gas',     cycle: 0.100, unlock: 0.0052 },
    roller:     { label: 'Roller-delayed',      cycle: 0.072, unlock: 0.0030 },
    blowback:   { label: 'Blowback',            cycle: 0.062, unlock: 0.0012 },
    recoil:     { label: 'Short recoil',        cycle: 0.055, unlock: 0.0022 },
  };

  // Cartridge-case acoustics for the ejected brass/hull. Brass rings ("ting");
  // a polymer shotshell hull mostly clatters (hollow plastic) with only a faint
  // brass-head ring. `freq` scales modal pitch, `ring` the decay time, `metal`
  // the sinusoidal-ring level, `plastic` a hollow noise clack. The absolute
  // pitch is set from the case's physical size (length + caliber), below.
  const CASE_MATERIALS = {
    brass:    { label: 'Brass',        freq: 1.00, ring: 1.00, metal: 1.00, plastic: 0.00 },
    steel:    { label: 'Steel',        freq: 1.12, ring: 1.35, metal: 1.00, plastic: 0.00 },
    aluminum: { label: 'Aluminum',     freq: 1.28, ring: 0.70, metal: 0.90, plastic: 0.00 },
    plastic:  { label: 'Plastic hull', freq: 0.55, ring: 0.30, metal: 0.30, plastic: 1.00 },
  };

  // ---- Interior ballistics -------------------------------------------------
  function ballistics(p) {
    const cal_m = p.caliber / 1000;
    const bore = Math.PI * Math.pow(cal_m / 2, 2);      // bore cross-section, m^2
    const bl = p.barrel * 0.0254;                        // barrel length, m
    const Ppeak = p.pressure * PSI;                      // peak chamber pressure, Pa
    const burn = burnRateFromGrain(p.grain);

    // Work done on the projectile ~ average bore pressure * bore area * travel.
    // Slower powders sustain a higher *average* fraction of peak pressure.
    const avgFrac = 0.35 + 0.25 * burn;
    const eff = 0.62;                                    // lumped efficiency losses
    const work = Ppeak * avgFrac * bore * bl * eff;      // joules
    const m = Math.max(p.bulletWeight, 1) * GRAIN_KG;    // projectile mass, kg
    const v = Math.sqrt(2 * work / m);                   // muzzle velocity, m/s
    const mach = v / C;

    const LD = bl / cal_m;                               // bore length / diameter
    // Residual pressure at the muzzle: short barrels & slow powders vent hotter,
    // higher-pressure gas -> a bigger, louder blast relative to bore size.
    const muzzleFrac = clamp(
      (1 - burn * 0.3) / (1 + 0.03 * LD) * (1 + (1 - burn) * 0.5),
      0.05, 1.25
    );

    return { v, mach, bore, LD, muzzleFrac, Ppeak, burn };
  }

  // Gas reaching the muzzle relative to 5.56 from a 14.5" barrel. The powder burnt goes with the muzzle
  // energy (a 9 mm pistol burns a fifth of a 5.56's charge), and how much of it is still pressure at the
  // muzzle with the residual fraction (a short barrel vents more of it; a pistol's high fraction is still
  // a fraction of very little, hence the square root).
  const gasRaw = (p, b) => 0.5 * Math.max(p.bulletWeight, 1) * GRAIN_KG * b.v * b.v * Math.sqrt(b.muzzleFrac);
  let GAS_REF = 0;
  function gasLoad(p, b) {
    if (!GAS_REF) GAS_REF = gasRaw({ bulletWeight: 62 }, ballistics({ barrel: 14.5, caliber: 5.56, pressure: 55000, grain: 0.7, bulletWeight: 62 }));
    return gasRaw(p, b || ballistics(p)) / GAS_REF;
  }
  // The suppression a shot gets: the can (p.suppressor, else a full-length can) against this round's gas.
  // Every doubling of gas past what the can is sized for costs ~4 dB of suppression; less gas gains a little.
  // Returns null for an unsuppressed shot. The drop is in the render itself: a suppressed shot goes into the mic stage
  // that much quieter, so it doesn't overload it the way an open one does, and keeps its own shape (a soft onset, the
  // can blowing down) instead of being flattened into the same clipped plateau, only quieter.
  function suppression(p, b) {
    if (p.muzzleDevice !== 'suppressor') return null;
    const can = SUPPRESSORS[p.suppressor] || SUPPRESSORS.full;
    const over = Math.log2(Math.max(gasLoad(p, b), 0.05) / can.vol);
    const db = clamp(can.db + 4 * clamp(over, -1, 3) * (over > 0 ? 1 : 0.5), can.db - 3, -8);
    return { can, db };
  }

  // Event schedule shared by the audio renderer and the visual diagram so the
  // animation lines up exactly with what you hear. All times are seconds.
  function schedule(p) {
    const b = ballistics(p);
    const t0 = 0.004;
    const bl = p.barrel * 0.0254;
    // Bullet dwell in the bore under ~constant acceleration: x = ½at², exiting
    // at velocity v, giving t = 2L/v. Usually ~1 ms.
    const tBarrel = clamp(2 * bl / Math.max(b.v, 1), 0.0003, 0.012);
    const tExit = t0 + tBarrel;                 // projectile leaves the muzzle
    let bolt = null;
    if (p.boltSim) {
      const bm = clamp(p.boltMass ?? 0.4, 0, 1);
      const A = ACTIONS[p.actionType] || ACTIONS.gas;
      const cycle = A.cycle * (0.8 + 0.5 * bm);   // heavier carrier cycles slower
      // The firing pin/hammer strike precedes ignition by a couple of ms
      // ("tk-BANG"); the action then opens after its unlock delay and the
      // rearward/forward strokes follow as fractions of the full cycle.
      const tStrike = Math.max(0.0004, t0 - 0.0022);
      const tUnlock = tExit + A.unlock;           // breech opens / carrier moves
      const tEject = tUnlock + 0.18 * cycle;      // case extracted & ejected
      const tRear = tUnlock + 0.42 * cycle;       // carrier bottoms on buffer/rear
      const tReturn = tUnlock + 0.70 * cycle;     // spring driving it forward
      const tChamber = tUnlock + 0.96 * cycle;    // returns to battery / lockup
      bolt = { bm, cycle, tStrike, tUnlock, tEject, tRear, tReturn, tChamber };
    }
    const total = bolt ? bolt.tChamber + 0.05 : tExit + 0.12;
    return { t0, tBarrel, tExit, bolt, total, ballistics: b };
  }

  // Human-readable derived stats for the UI readout.
  function stats(p) {
    const b = ballistics(p);
    return {
      velocity_ms: Math.round(b.v),
      velocity_fps: Math.round(b.v * 3.28084),
      mach: b.mach,
      supersonic: b.mach > 1,
      muzzleEnergy_J: Math.round(0.5 * Math.max(p.bulletWeight, 1) * GRAIN_KG * b.v * b.v),
    };
  }

  // Directional acoustics for a listener at (bearing°, distance) relative to the
  // muzzle. Bearing 0° = straight downrange (in front of the muzzle), 180° =
  // behind the shooter. Returns the per-shot spatial factors used by render.
  //
  //  - Muzzle blast is strongly forward-directed: much louder & brighter in
  //    front of the muzzle than behind it (the shooter hears a duller report).
  //  - The ballistic crack only exists inside the bullet's Mach cone — a
  //    listener behind the muzzle never hears it; a listener downrange/to the
  //    side does, and (being supersonic) it arrives BEFORE the muzzle blast,
  //    giving the classic "crack ... boom" separation that widens with range.
  //  - Distance attenuates level (~1/r) and rolls off highs (air absorption),
  //    turning a near "crack" into a far "boom/pop".
  function listener(p, b) {
    const dist = clamp(p.lisDist ?? 3, 0.5, 400);
    const th = (clamp(p.lisBearing ?? 90, 0, 180)) * Math.PI / 180;
    const cosT = Math.cos(th);                       // +1 front .. -1 rear
    const Lx = dist * cosT;                          // downrange component (m)

    // Level roll-off with range. Ideal free-field spreading is 1/r (−6 dB per
    // doubling), which drops ~30 dB by 100 m — technically correct, but a real
    // gunshot is so loud it is still clearly audible that far off, and over
    // ground the reflection "carpet" makes it fall off more slowly. We use a
    // gentler power law (~−4 dB/doubling) so distance dulls the shot without
    // dropping it to the noise floor.
    const distGain = clamp(Math.pow(2 / Math.max(dist, 2), 0.6), 0.08, 1);
    const dirDb = 8 * cosT;                           // +8 dB front .. -8 dB rear
    const dirBright = 0.55 + 0.65 * ((cosT + 1) / 2); // 1.2 front .. 0.55 rear
    const crackDir = smoothstep(-0.30, 0.35, cosT) * (b.mach > 1 ? 1 : 0);

    // Crack lead over the muzzle blast: bullet covers Lx at v while the report
    // travels it at c, so the crack arrives (Lx/c)(1 - 1/M) sooner.
    const lead = (Lx > 0 && b.mach > 1) ? (Lx / C) * (1 - 1 / b.mach) : 0;
    const blastDelay = clamp(lead, 0, 0.3);           // muzzle sounds arrive later

    // Air absorption of highs, halving roughly every ~35 m: a far shot dulls to
    // a boom but keeps some body rather than collapsing to a muffled thump.
    const airLp = clamp(18000 * Math.pow(0.5, dist / 35), 1200, 19000);

    return { dist, cosT, distGain, dirDb, dirBright, crackDir, blastDelay, airLp, leadMs: lead * 1000 };
  }

  function listenerInfo(p) {
    const b = ballistics(p);
    const L = listener(p, b);
    return {
      blastDb: Math.round(20 * Math.log10(L.distGain) + L.dirDb),
      crackHeard: L.crackDir > 0.02,
      crackLeadMs: Math.round(L.leadMs),
      airCutoff: Math.round(L.airLp),
      front: L.cosT > 0.1, rear: L.cosT < -0.1,
    };
  }

  // ---- Small Web Audio helpers --------------------------------------------
  function noiseBuffer(ctx, seconds) {
    const n = Math.max(1, Math.floor(seconds * SR));
    const buf = ctx.createBuffer(1, n, SR);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Percussive gain envelope: near-instant attack, exponential decay.
  function percEnv(ctx, t0, peak, attack, tau) {
    const g = ctx.createGain();
    g.gain.value = 0; // (silent until it starts: before its first event a gain sits at its default of 1, so a source started
    // ahead of its envelope, as the can's blowdown is, would play flat out until then)
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.setTargetAtTime(0.0001, t0 + attack, tau);
    return g;
  }

  // Acoustic environments. Outdoor scenes are dominated by sparse discrete
  // echoes (ground bounce, distant terrain/buildings) that roll away and lose
  // high frequencies to air absorption. Indoor scenes have dense early
  // reflections and a reverberant tail whose brightness/length depend on room
  // size and surface hardness; parallel walls add flutter echo.
  //   wet     : base wet level          rt60    : tail decay time (s)
  //   predelay: gap before diffuse tail  damp    : HF loss (air / soft surfaces)
  //   diffuse : diffuse tail level        er*     : early-reflection pattern
  //   ground  : add a strong ground-bounce slap (outdoor)
  //   echoes  : add regular repeating slaps (canyon)
  //   flutter : {ms,count,gain} periodic echo between parallel walls
  const ENVIRONMENTS = {
    none:      { label: 'Anechoic (dry)',      group: 'none',    wet: 0 },
    field:     { label: 'Open field',          group: 'outdoor', wet: 0.45, rt60: 0.35, predelay: 0.020, damp: 0.78, diffuse: 0.12, erCount: 3,  erMinMs: 2,  erMaxMs: 130, erGain: 0.38, ground: true },
    forest:    { label: 'Forest',              group: 'outdoor', wet: 0.65, rt60: 0.95, predelay: 0.030, damp: 0.70, diffuse: 0.30, erCount: 16, erMinMs: 8,  erMaxMs: 230, erGain: 0.28, ground: true },
    urban:     { label: 'Urban street',        group: 'outdoor', wet: 0.75, rt60: 1.30, predelay: 0.018, damp: 0.42, diffuse: 0.30, erCount: 8,  erMinMs: 12, erMaxMs: 300, erGain: 0.52 },
    canyon:    { label: 'Canyon / mountains',  group: 'outdoor', wet: 0.85, rt60: 2.60, predelay: 0.050, damp: 0.50, diffuse: 0.22, erCount: 6,  erMinMs: 40, erMaxMs: 620, erGain: 0.55, echoes: true },
    room:      { label: 'Small room',          group: 'indoor',  wet: 0.70, rt60: 0.40, predelay: 0.006, damp: 0.46, diffuse: 0.50, erCount: 18, erMinMs: 2,  erMaxMs: 34,  erGain: 0.48, flutter: { ms: 7,  count: 6,  gain: 0.30 } },
    hall:      { label: 'Hallway / corridor',  group: 'indoor',  wet: 0.82, rt60: 0.90, predelay: 0.008, damp: 0.34, diffuse: 0.45, erCount: 12, erMinMs: 3,  erMaxMs: 46,  erGain: 0.50, flutter: { ms: 11, count: 13, gain: 0.45 } },
    concrete:  { label: 'Concrete hall',       group: 'indoor',  wet: 0.90, rt60: 1.80, predelay: 0.012, damp: 0.24, diffuse: 0.55, erCount: 22, erMinMs: 4,  erMaxMs: 72,  erGain: 0.50 },
    warehouse: { label: 'Warehouse',           group: 'indoor',  wet: 0.88, rt60: 2.30, predelay: 0.020, damp: 0.30, diffuse: 0.50, erCount: 24, erMinMs: 6,  erMaxMs: 120, erGain: 0.44 },
  };

  // Scale a scenario's decay/predelay by the user's size/distance control.
  const envRt60 = (P, size) => (P.rt60 || 0) * (0.45 + 1.6 * size);
  const envPredelay = (P, size) => (P.predelay || 0) * (0.4 + 1.6 * size);

  // Effective reverberation time (RT60, seconds) for a scenario at a given size
  // — the physical meaning of the "Space size" control. 0 for anechoic.
  function roomRt60(env, size) {
    const P = ENVIRONMENTS[env] || ENVIRONMENTS.none;
    return P.wet > 0 ? envRt60(P, clamp(size, 0, 1)) : 0;
  }

  // Synthesize a stereo impulse response for one environment. Convolving the
  // dry shot with discrete IR spikes reproduces full delayed copies (realistic
  // echoes), while the noise tail provides diffuse reverberation. A running
  // low-pass whose cutoff falls over time models progressive HF loss.
  function buildEnvIR(ctx, P, size, reflect) {
    if (!P || P.wet <= 0) return null;
    const rt60 = envRt60(P, size);
    const predelay = envPredelay(P, size);
    const len = Math.max(1, Math.floor((predelay + rt60 + 0.05) * SR));
    const ir = ctx.createBuffer(2, len, SR);
    // Harder surfaces (high reflect) reflect more energy and lose less HF.
    const damp = clamp(P.damp * (1.25 - 0.75 * reflect), 0, 0.985);
    const erGain = (P.erGain || 0) * (0.55 + 0.9 * reflect);
    const decayK = 6.9078 / Math.max(rt60 * SR, 1);   // ln(1000) for -60 dB

    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      const start = Math.floor(predelay * SR);

      // Diffuse reverberant tail.
      for (let i = start; i < len; i++) {
        d[i] += (Math.random() * 2 - 1) * Math.exp(-decayK * (i - start)) * (P.diffuse || 0);
      }

      // Ground-bounce slap (outdoor): a single strong early reflection.
      if (P.ground) {
        const gi = Math.floor((0.0025 + 0.004 * size) * SR) + ((Math.random() * 40) | 0);
        if (gi < len) d[gi] += (Math.random() < 0.5 ? -1 : 1) * erGain * 0.9;
      }

      // Sparse/dense early reflections.
      for (let r = 0; r < (P.erCount || 0); r++) {
        const ms = P.erMinMs + (P.erMaxMs - P.erMinMs) * Math.pow(Math.random(), 1.5) * (0.5 + size);
        const idx = Math.floor((ms / 1000) * SR);
        if (idx < len) {
          const fall = 1 - (ms / 1000) / (rt60 + predelay + 0.001);
          d[idx] += (Math.random() < 0.5 ? -1 : 1) * erGain * clamp(fall, 0.1, 1) * (0.6 + 0.6 * Math.random());
        }
      }

      // Repeating canyon slaps.
      if (P.echoes) {
        const base = (0.16 + 0.14 * size);
        for (let k = 1; k <= 5; k++) {
          const idx = Math.floor(base * k * SR) + ((Math.random() * 200) | 0);
          if (idx < len) d[idx] += (Math.random() < 0.5 ? -1 : 1) * erGain * Math.pow(0.62, k);
        }
      }

      // Flutter echo between parallel walls (corridors/rooms).
      if (P.flutter) {
        const step = Math.floor((P.flutter.ms / 1000) * (0.6 + 0.8 * size) * SR);
        for (let k = 1; k <= P.flutter.count; k++) {
          const idx = k * step;
          if (idx < len) d[idx] += (k % 2 ? 1 : -1) * P.flutter.gain * Math.pow(0.72, k);
        }
      }

      // Progressive low-pass: brighter early, duller later (air absorption /
      // diffuse HF decay). Hard rooms (low damp) keep a bright tail.
      let y = 0;
      for (let i = 0; i < len; i++) {
        const frac = i / len;
        const a = clamp(damp * (0.15 + 0.85 * frac), 0, 0.97);
        y += (d[i] - y) * (1 - a);
        d[i] = y;
      }
    }

    // Normalize so the wet level is predictable regardless of scenario density.
    let peak = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak > 0) {
      const g = 0.7 / peak;
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] *= g;
      }
    }
    return ir;
  }

  // Transfer curve of an overloaded microphone/preamp/ADC. Blends a soft
  // analog knee into a hard digital flat-top; a slight negative-side asymmetry
  // (diaphragm behaviour) injects even harmonics and a DC step that the AC
  // coupling later turns into a low-frequency recovery "thump".
  function micCurve(hardness) {
    const N = 2048, c = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      const soft = Math.tanh(x * 1.6) / Math.tanh(1.6);
      const hard = clamp(x * 1.5, -1, 1);
      let y = soft * (1 - hardness) + hard * hardness;
      if (x < 0) y *= 1 - 0.22 * hardness;
      c[i] = clamp(y, -1, 1);
    }
    return c;
  }

  // Recording-chain overload. The dry+reverb sum is driven hard into a clipper,
  // AC-coupled (recovery thump), then AGC-pumped, emulating how a real gunshot
  // overwhelms a mic/recorder. Hard clipping uses no oversampling so it aliases,
  // reproducing the harsh "digital" edge of phone/action-cam gunshot clips.
  // Build the mic profile once (source stage): the transfer curve and drive
  // amounts derived only from the microphone settings, independent of position.
  // The drive is set for an open shot, ~160 dB. A suppressed one is already quieter by its can's suppression (sup.db,
  // taken off the blast in precompute), so it overloads the mic less on its own; driven exactly the same, the
  // compressor would pump it back up to within ~8 dB of the open shot. So the drive comes down by a share of it
  // (SUP_DRIVE): measured, an integral can ends ~19 dB under the open gun, a full-length rifle can ~14, a compact one
  // ~10 (the rifle's crack isn't the can's to take). (It used to come down by all of it, and the output by a quarter
  // more, on top of the blast's own cut: the can counted two and a quarter times over, an integral can 35-40 dB
  // under the open gun: a whisper even in your own hands.)
  const SUP_DRIVE = 0.45;
  function micProfile(p, sup) {
    const gain = clamp(p.micGain ?? 0.3, 0, 1);
    const hard = clamp(p.micHardness ?? 0.5, 0, 1);
    const agc = clamp(p.micAgc ?? 0.25, 0, 1);
    const driveDb = Math.max(0, gain * 26 + (sup ? sup.db * SUP_DRIVE : 0));
    return { sim: p.micSim !== false, gain, hard, agc, driveDb, outDb: 0, curve: micCurve(hard) };
  }

  function buildMicChain(ctx, input, dest, mic) {
    const { gain, hard, agc } = mic;

    const drive = ctx.createGain();
    drive.gain.value = dbToGain(mic.driveDb ?? gain * 26); // push into overload (a suppressed shot, less: micProfile)

    const clip = ctx.createWaveShaper();
    clip.curve = mic.curve;                            // precomputed transfer curve
    clip.oversample = hard > 0.55 ? 'none' : '4x';     // hard clip -> aliasing

    const hp = ctx.createBiquadFilter();               // AC coupling
    hp.type = 'highpass'; hp.frequency.value = 22; hp.Q.value = 0.7;

    const comp = ctx.createDynamicsCompressor();       // recorder AGC pumping
    comp.threshold.value = -6 - 30 * agc;
    comp.ratio.value = 1 + 19 * agc;
    comp.knee.value = 6;
    comp.attack.value = 0.001;
    comp.release.value = 0.05 + 0.4 * agc;

    const trim = ctx.createGain();                     // clipping raises RMS
    trim.gain.value = dbToGain(-7 * gain + (mic.outDb || 0));

    input.connect(drive).connect(clip).connect(hp).connect(comp).connect(trim).connect(dest);
  }

  // ==========================================================================
  // The render pipeline is split into two stages so that moving around the
  // scene never re-synthesizes the shot:
  //
  //   Stage 1  precompute(p)  — SOURCE: gun + ammo + microphone. Synthesizes the
  //            dry shot once, at a neutral reference, into separate per-layer
  //            stems (blast, bolt, whoosh, crack), and derives the mic profile.
  //            Depends only on source parameters, so it is cached.
  //
  //   Stage 2  place(source,p) — ROOM + LISTENER: cheap, live. Takes the cached
  //            stems and applies distance, directivity, the crack→boom timing
  //            gap, room reverb, air absorption and the mic overload. Re-run on
  //            every listener/room change without touching stage 1.
  // ==========================================================================

  // ---- Stage 1: source (precompute) ----------------------------------------
  // Neutral render: no distance, directivity, timing offset, room or mic. The
  // muzzle device (a source-side part) IS baked in; positional gains are not.
  // Layers go to separate channels of one buffer: 0=blast(+tang) 1=bolt
  // 2=whoosh 3=crack.
  function precompute(p) {
    const b = ballistics(p);
    const dev = DEVICES[p.muzzleDevice] || DEVICES.none;
    const sup = suppression(p, b), can = sup && sup.can;
    const sched = schedule(p);
    const t0 = sched.tExit;
    const dur = 0.6 + (sched.bolt ? sched.bolt.tChamber : 0.15);

    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(4, Math.ceil(dur * SR), SR);
    const merger = ctx.createChannelMerger(4);
    merger.connect(ctx.destination);
    const bus = [0, 1, 2, 3].map((i) => {
      const g = ctx.createGain(); g.connect(merger, 0, i); return g;
    });
    const add = (node, env, ch) => { node.connect(env); env.connect(bus[ch]); };

    // Hard drive curve: nonlinear clipping a 150 dB+ shock front undergoes.
    const drive = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; drive[i] = Math.tanh(x * 3.5); }

    // Blast spectral centroid — device tilt baked, listener directivity NOT.
    let fc = 2600 * Math.pow(5.56 / p.caliber, 0.55);
    fc *= (1 - 0.12 * smoothstep(4, 20, p.barrel));
    fc *= (0.80 + 0.55 * smoothstep(20000, 62000, p.pressure));
    fc = clamp(fc * dev.lp * (can ? 1.25 - 0.22 * can.vol : 1), 500, 6500); // (a bigger can, a darker report)
    const blastFc = fc;

    const blastAmp = clamp(
      0.9 * b.muzzleFrac * Math.pow(b.bore / 2.4e-5, 0.35)
        * (0.7 + 0.6 * smoothstep(20000, 65000, p.pressure)),
      0.05, 2.0
    );
    // (a can blows down: the more volume, the longer the gas takes to leave it)
    const tau = (0.010 + 0.02 * (p.caliber / 9)) * (can ? 1 + 0.75 * can.vol : dev.decay) * (1 + 0.35 * (1 - b.burn));
    const g0 = dbToGain(sup ? sup.db : dev.level);   // device level baked into blast + tang
    // The action and the crack aren't suppressed: they stay at their own level (the bolt a little harder, with the
    // can's back pressure driving it), so next to the quieted blast they come forward.
    const keepBolt = sup ? 1 + 0.5 * can.back : 1;
    const keepCrack = 1;

    // (a) shock front
    const shk = ctx.createBufferSource(); shk.buffer = noiseBuffer(ctx, 0.02);
    const shkHp = ctx.createBiquadFilter();
    shkHp.type = 'highpass'; shkHp.frequency.value = clamp(fc * 0.7, 350, 4500);
    const shkSat = ctx.createWaveShaper(); shkSat.curve = drive; shkSat.oversample = '4x';
    const shkEnv = ctx.createGain();
    // (through a can the baffles break the front up: little of it survives, and it rises slower)
    const shkPk = 1.25 * blastAmp * g0 * (can ? can.shock : 1);
    shkEnv.gain.setValueAtTime(can ? 0.0001 : shkPk, t0);
    if (can) shkEnv.gain.linearRampToValueAtTime(shkPk, t0 + 0.0008);
    shkEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.0045 + 0.01 * (p.caliber / 9));
    shk.connect(shkHp).connect(shkSat).connect(shkEnv).connect(bus[0]);
    shk.start(t0); shk.stop(t0 + 0.03);

    // (b) main blast body
    const bSrc = ctx.createBufferSource(); bSrc.buffer = noiseBuffer(ctx, 0.4);
    const bLp = ctx.createBiquadFilter();
    bLp.type = 'lowpass'; bLp.frequency.value = fc; bLp.Q.value = 0.5;
    const bHp = ctx.createBiquadFilter(); bHp.type = 'highpass'; bHp.frequency.value = 90;
    const bSat = ctx.createWaveShaper(); bSat.curve = drive; bSat.oversample = '4x';
    const bEnv = percEnv(ctx, t0, blastAmp * g0, can ? 0.0012 : 0.0004, tau);
    bSrc.connect(bHp).connect(bLp).connect(bSat); add(bSat, bEnv, 0);
    bSrc.start(t0); bSrc.stop(t0 + tau * 8);

    // (c) concussion rumble
    const rum = ctx.createBufferSource(); rum.buffer = noiseBuffer(ctx, 0.4);
    const rLp = ctx.createBiquadFilter();
    rLp.type = 'lowpass'; rLp.frequency.value = clamp(240 * Math.pow(9 / p.caliber, 0.4), 90, 360);
    rLp.Q.value = 0.7;
    const rEnv = percEnv(ctx, t0, 0.8 * blastAmp * g0, 0.0015, tau * 1.9);
    rum.connect(rLp); add(rLp, rEnv, 0);
    rum.start(t0); rum.stop(t0 + tau * 12);

    // suppressor / brake gas rush -> channel 2 (no device level)
    if (dev.whoosh > 0) {
      const w = ctx.createBufferSource(); w.buffer = noiseBuffer(ctx, 0.4);
      const wLp = ctx.createBiquadFilter(); wLp.type = 'lowpass'; wLp.frequency.value = can ? 700 + 500 / can.vol : 900;
      // (through a can: the blowdown, gas still leaving the can after the shot; a ported barrel starts bleeding early)
      const wAmt = can ? (0.45 + 0.25 * can.vol) * blastAmp * g0 : dev.whoosh * 0.5; // (as loud as what's left of the blast, longer)
      const wEnv = percEnv(ctx, t0 + (can && can.ported ? 0.001 : 0.004), wAmt, 0.006, tau * 2.2);
      w.connect(wLp); add(wLp, wEnv, 2);
      w.start(t0); w.stop(t0 + tau * 12);
    }
    // the can ringing: its column of hot gas (open at the muzzle, closed at the blast baffle: f = c/4L, with c
    // ~520 m/s in the hot gas) and, fainter and higher, the steel tube
    if (can && can.ring > 0) {
      const tone = (f, amp, decay, delay) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const e = percEnv(ctx, t0 + delay, amp, 0.0006, decay); add(o, e, 2);
        o.start(t0 + delay); o.stop(t0 + delay + decay * 8);
      };
      const fGas = 520 / (4 * can.len), amp = can.ring * 2 * blastAmp * g0;
      tone(fGas, amp, 0.012, 0.001);
      tone(fGas * 3, amp * 0.5, 0.008, 0.001);
      tone(clamp(900 / can.len, 3000, 9000), amp * 0.35, 0.02, 0.0015);
    }

    // supersonic crack -> channel 3 (Mach-only amplitude; direction applied live)
    // A single projectile (bullet/slug) makes one sharp N-wave crack. A charge
    // of buckshot pellets makes many weaker cracks smeared in time — a diffuse
    // "brrap" with no single sharp wavefront.
    const shots = clamp(Math.round(p.shotCount ?? 1), 1, 16);
    const crackAmt = smoothstep(0.95, 1.7, b.mach);
    const hasCrack = crackAmt > 0.02;
    if (hasCrack) {
      const fCrack = clamp((3200 + 2800 * smoothstep(1, 2.6, b.mach)
        * Math.pow(62 / Math.max(p.bulletWeight, 10), 0.25)) * (shots > 1 ? 0.8 : 1), 2200, 8000);
      const spread = Math.min(shots, 6);
      const perAmp = crackAmt * 0.7 * keepCrack / Math.sqrt(spread);
      for (let s = 0; s < spread; s++) {
        const jt = t0 + (spread > 1 ? Math.random() * 0.008 : 0);   // pellets smear ~8 ms
        const cSrc = ctx.createBufferSource(); cSrc.buffer = noiseBuffer(ctx, 0.05);
        const cHp = ctx.createBiquadFilter(); cHp.type = 'highpass'; cHp.frequency.value = fCrack; cHp.Q.value = 0.7;
        const cEnv = percEnv(ctx, jt, perAmp, 0.0003, 0.0025);
        cSrc.connect(cHp); add(cHp, cEnv, 3); cSrc.start(jt); cSrc.stop(jt + 0.03);
      }
      // Sharp bipolar wavefront transient only for a single projectile.
      if (shots === 1) {
        const tick = ctx.createOscillator(); tick.type = 'sawtooth'; tick.frequency.value = fCrack * 0.6;
        const tEnv = percEnv(ctx, t0, crackAmt * 0.35 * keepCrack, 0.0002, 0.0012);
        add(tick, tEnv, 3); tick.start(t0); tick.stop(t0 + 0.01);
      }
    }

    // mechanical / bolt -> channel 1 (tang -> channel 0). Neutral internal times.
    if (p.boltSim && sched.bolt) {
      const bm = sched.bolt.bm;
      const loud = (p.boltLoudness ?? 0.55) * keepBolt;
      const pitch = 1 - 0.4 * bm;
      const ping = (t, freq, amp, q, decay, ch) => {
        const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 0.03);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
        const e = percEnv(ctx, t, amp, 0.0004, decay); s.connect(bp); add(bp, e, ch);
        s.start(t); s.stop(t + decay * 8 + 0.02);
      };
      const thunk = (t, freq, amp) => {
        const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 0.05);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq * 3;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3;
        const e = percEnv(ctx, t, amp, 0.0006, 0.012); s.connect(lp).connect(bp); add(bp, e, 1);
        s.start(t); s.stop(t + 0.12);
      };
      const { tStrike, tUnlock, tEject, tRear, tReturn, tChamber } = sched.bolt;
      ping(tStrike, 4300 * pitch, 0.12 * loud, 10, 0.004, 1);        // firing pin / hammer
      ping(tUnlock, 3200 * pitch, 0.20 * loud, 7, 0.006, 1);         // breech unlocks
      ping(tUnlock + 0.004, 2100 * pitch, 0.12 * loud, 6, 0.008, 1);
      ping(tEject, 5200 * pitch, 0.16 * loud, 9, 0.006, 1);          // brass ejected
      thunk(tRear, 230 * pitch, 0.5 * loud);                          // carrier bottoms out
      ping(tRear + 0.001, 2600 * pitch, 0.20 * loud, 8, 0.007, 1);
      ping(tReturn, 2900 * pitch, 0.15 * loud, 8, 0.006, 1);         // spring return
      thunk(tChamber, 300 * pitch, 0.42 * loud);                      // returns to battery
      ping(tChamber + 0.001, 3400 * pitch, 0.22 * loud, 9, 0.006, 1);
      // back pressure: gas the can holds in the bore spits out of the action as it opens (a hiss at the shooter's
      // face), most on direct gas and blowback guns, little on a locked short-recoil or roller action
      if (can && can.back > 0) {
        const A = { gas: 1, longstroke: 0.6, blowback: 1, roller: 0.5, recoil: 0.3 }[p.actionType] ?? 0.7;
        const h = ctx.createBufferSource(); h.buffer = noiseBuffer(ctx, 0.1);
        const hBp = ctx.createBiquadFilter(); hBp.type = 'bandpass'; hBp.frequency.value = 2400; hBp.Q.value = 0.8;
        const e = percEnv(ctx, tUnlock, 0.18 * can.back * A * loud, 0.002, 0.014);
        h.connect(hBp); add(hBp, e, 1); h.start(tUnlock); h.stop(tUnlock + 0.12);
      }
      if (dev.tang > 0) {
        ping(t0 + 0.001, 4200, dev.tang * 0.4 * g0, 12, 0.01, 0);
        ping(t0 + 0.003, 5600, dev.tang * 0.25 * g0, 14, 0.008, 0);
      }
    }

    return ctx.startRendering().then((stems) => ({
      params: p, ballistics: b, schedule: sched, blastFc, hasCrack,
      blastPeak: 1.25 * blastAmp * g0,   // reference loudness of the report
      suppression: sup,
      mic: micProfile(p, sup), stems,
    }));
  }

  // ---- Stage 2: placement (room + listener) --------------------------------
  function place(source, p) {
    const b = source.ballistics;
    const sched = source.schedule;
    const L = listener(p, b);

    const envP = ENVIRONMENTS[p.env] || ENVIRONMENTS.none;
    const envSize = p.envSize ?? 0.5;
    const envReflect = p.envReflect ?? 0.5;
    const envMix = p.envMix ?? 0.6;
    const envTail = envP.wet > 0 ? envPredelay(envP, envSize) + envRt60(envP, envSize) + 0.05 : 0.1;
    // Ejected brass lands and bounces well after the shot; reserve time for it.
    const casingOn = (p.casing ?? 0) > 0.01 && sched.bolt;
    const casHard = clamp(envReflect, 0, 1);              // ground surface hardness
    const casIndoor = envP.group === 'indoor';
    const casMat = CASE_MATERIALS[p.caseMaterial] || CASE_MATERIALS.brass;
    const casRing = (0.05 + 0.5 * casHard) * (casIndoor ? 1.4 : 1) * casMat.ring;   // ring time (s)
    // Bounce-train settle time: drop from ~shoulder height + a geometric sum of
    // ballistic rebound arcs (a hard floor bounces far longer than soft ground).
    const casRest = 0.25 + 0.45 * casHard;
    const casSettle = Math.sqrt(2 * 1.45 / 9.81) + 0.34
      + (2 * Math.sqrt(2 * 9.81 * 1.45) * casRest / 9.81) / (1 - casRest);
    const casingEnd = casingOn ? sched.bolt.tEject + casSettle + casRing + 0.1 : 0;
    const dur = L.blastDelay + Math.max(source.stems.duration, casingEnd) + envTail + 0.05;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.ceil(dur * SR), SR);

    const overall = dbToGain(p.masterDb ?? 0) * L.distGain;   // master × distance
    const master = ctx.createGain(); master.gain.value = 0.9;

    // Muzzle-origin stems (blast/bolt/whoosh) arrive with the report, offset by
    // the crack lead; the crack (channel 3) arrives first, so it plays undelayed.
    const muz = ctx.createBufferSource(); muz.buffer = source.stems;
    const muzSplit = ctx.createChannelSplitter(4);
    muz.connect(muzSplit);
    // blast (ch0): distance × forward/back directivity, + brightness roll-off.
    const blastG = ctx.createGain(); blastG.gain.value = overall * dbToGain(L.dirDb);
    const blastLp = ctx.createBiquadFilter();
    blastLp.type = 'lowpass'; blastLp.frequency.value = clamp(source.blastFc * L.dirBright, 300, 12000); blastLp.Q.value = 0.5;
    muzSplit.connect(blastLp, 0).connect(blastG).connect(master);
    // bolt (ch1) and whoosh (ch2): distance only (no muzzle directivity).
    const boltG = ctx.createGain(); boltG.gain.value = overall;
    muzSplit.connect(boltG, 1).connect(master);
    const whooshG = ctx.createGain(); whooshG.gain.value = overall;
    muzSplit.connect(whooshG, 2).connect(master);
    muz.start(L.blastDelay);

    // crack (ch3): distance × Mach-cone directivity; reaches the listener first.
    if (source.hasCrack && L.crackDir > 0.02) {
      const crk = ctx.createBufferSource(); crk.buffer = source.stems;
      const crkSplit = ctx.createChannelSplitter(4);
      crk.connect(crkSplit);
      const crkG = ctx.createGain(); crkG.gain.value = overall * L.crackDir;
      crkSplit.connect(crkG, 3).connect(master);
      crk.start(0);
    }

    // Ejected brass casing landing + bouncing on the ground ("tink…tink-tink").
    // It lands at the gun, so it takes the same distance/air/reverb as the
    // report, but its character is set by the SURFACE (bright ring on concrete,
    // dull tap on dirt/grass) — hence it is synthesized live here, not baked into
    // the source. Omnidirectional, like the action.
    if (casingOn) {
      const casingAmt = clamp(p.casing ?? 0, 0, 1);
      const caseLen = clamp(p.caseLength ?? 40, 5, 90);
      // Case dimensions + material set the pitch: a bigger/longer case, or a
      // softer material, rings lower and duller. (A 70 mm 12-ga polymer hull
      // lands ~800 Hz and clatters; a 19 mm brass pistol case pings ~4 kHz.)
      const caseF0 = clamp(3200 * casMat.freq * Math.sqrt(30 / caseLen)
        * Math.pow(10 / (p.caliber || 9), 0.3), 250, 9000);
      const base = caseF0 * (0.9 + 0.25 * casHard);      // hard floor a touch brighter

      // A base-heavy case lands base-first and tumbles, so each contact is a
      // low "clunk" from the dense head (mass) + the thin body's bright ring +
      // a lighter secondary tap as the mouth end pivots down while it rotates —
      // not a single clean ping. Bigger cases clunk lower.
      const thudF = clamp(520 * Math.pow(9 / (p.caliber || 9), 0.5), 150, 700);
      const modes = [1, 2.30, 4.05, 6.10];
      const modeGain = [1, 0.55, 0.35, 0.20];

      const ringBody = (t, amp, ring) => {   // the thin case body ringing
        if (casMat.metal > 0.01) {
          for (let m = 0; m < modes.length; m++) {
            const f = base * modes[m] * (0.97 + 0.06 * Math.random());
            if (f > 15000) continue;
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(amp * casMat.metal * modeGain[m], t + 0.0004);
            g.gain.exponentialRampToValueAtTime(0.0001, t + ring * (1 - m * 0.18));
            o.connect(g).connect(master); o.start(t); o.stop(t + ring + 0.05);
          }
        }
        if (casMat.plastic > 0.01) {                     // hollow polymer clatter
          const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 0.03);
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * 0.9; bp.Q.value = 2.5;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = base * 3;
          const e = percEnv(ctx, t, amp * casMat.plastic * 0.9, 0.0006, ring * 0.5 + 0.01);
          s.connect(bp).connect(lp).connect(e).connect(master); s.start(t); s.stop(t + ring + 0.05);
        }
      };

      const caseImpact = (t, amp, ring) => {
        // (1) heavy base landing — a low, short "clunk" (the mass at the head)
        const th = ctx.createBufferSource(); th.buffer = noiseBuffer(ctx, 0.02);
        const thBp = ctx.createBiquadFilter(); thBp.type = 'bandpass'; thBp.frequency.value = thudF; thBp.Q.value = 2.2;
        const thLp = ctx.createBiquadFilter(); thLp.type = 'lowpass'; thLp.frequency.value = thudF * 3;
        const thE = percEnv(ctx, t, amp * 0.55, 0.0004, 0.018 + 0.015 * casHard);
        th.connect(thBp).connect(thLp).connect(thE).connect(master); th.start(t); th.stop(t + 0.08);
        // (2) the thin body ringing — bright, but secondary to the base clunk
        ringBody(t + 0.0006, amp * 0.7, ring);
        // (3) mouth/rim tap a few ms later as the case pivots on its base
        const dt = 0.003 + 0.007 * Math.random();
        const tk = ctx.createBufferSource(); tk.buffer = noiseBuffer(ctx, 0.01);
        const tkHp = ctx.createBiquadFilter(); tkHp.type = 'highpass'; tkHp.frequency.value = clamp(base * 1.6, 2000, 9000);
        const tkE = percEnv(ctx, t + dt, amp * 0.3, 0.0002, 0.003);
        tk.connect(tkHp).connect(tkE).connect(master); tk.start(t + dt); tk.stop(t + dt + 0.02);
      };

      // Ballistic bounce train: the case is ejected ~shoulder height and drops
      // onto the surface, so the FIRST impact (falling from height) is loudest
      // and the rebounds follow real ballistic arcs — a hard floor throws it high
      // (long ~0.5 s first gaps) that then accelerate and converge to rest, while
      // soft ground barely rebounds (one or two dull clunks). Amplitude tracks
      // impact speed. Kept very low: barely audible in the room, not foreground.
      const G = 9.81, dropH = 1.45;                      // ~shoulder-height ejection
      const rest = casRest;                              // restitution: dirt→concrete
      const v0 = Math.sqrt(2 * G * dropH);               // first-impact speed
      const ampScale = casingAmt * overall * source.blastPeak * 0.025 / v0;
      let t = L.blastDelay + sched.bolt.tEject + Math.sqrt(2 * dropH / G) + (0.12 + 0.22 * Math.random());
      let v = v0;
      let ring = casRing;
      for (let k = 0; k < 16 && v > v0 * 0.05; k++) {
        caseImpact(t, v * ampScale, ring * (0.7 + 0.3 * Math.random()));
        v *= rest;                                       // rebound velocity
        t += 2 * v / G;                                  // ballistic air time to next contact
        ring *= 0.82;                                    // ring less on each lighter bounce
      }
    }

    // Glue limiter -> dry + room reverb -> air absorption -> mic overload -> out.
    const limiter = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 1.6); }
    limiter.curve = curve; limiter.oversample = '4x';
    master.connect(limiter);

    const micIn = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 1;
    limiter.connect(dry).connect(micIn);

    const envIR = buildEnvIR(ctx, envP, envSize, envReflect);
    if (envIR) {
      const wet = ctx.createGain(); wet.gain.value = envP.wet * envMix;
      const conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = envIR;
      limiter.connect(conv).connect(wet).connect(micIn);
    }

    const air = ctx.createBiquadFilter();
    air.type = 'lowpass'; air.frequency.value = L.airLp; air.Q.value = 0.4;
    micIn.connect(air);

    if (source.mic.sim) buildMicChain(ctx, air, ctx.destination, source.mic);
    else air.connect(ctx.destination);

    return ctx.startRendering();
  }

  // Convenience: full render = source then placement (no external caching).
  function render(p) {
    return precompute(p).then((source) => place(source, p));
  }

  // Single functional interface. Call GunshotSynth(params) to get a fully
  // analyzed "shot": its interior ballistics, event timeline, spatial/listener
  // info, and a render() that produces the AudioBuffer — all derived from one
  // parameter object. Parameter-independent data tables (device/environment/
  // action definitions) hang off it as static properties, since the UI needs
  // them to build controls before any shot exists.
  function GunshotSynth(params) {
    return {
      params,
      ballistics: ballistics(params),
      stats: stats(params),
      schedule: schedule(params),
      listener: listenerInfo(params),
      render: () => render(params),
    };
  }
  // Two-stage interface for callers that want to cache the source: precompute a
  // source once (gun + ammo + mic), then place() it cheaply per room/listener.
  GunshotSynth.precompute = precompute;
  GunshotSynth.place = place;
  GunshotSynth.DEVICES = DEVICES;
  GunshotSynth.SUPPRESSORS = SUPPRESSORS;
  GunshotSynth.suppression = suppression;
  GunshotSynth.gasLoad = gasLoad;
  GunshotSynth.ENVIRONMENTS = ENVIRONMENTS;
  GunshotSynth.ACTIONS = ACTIONS;
  GunshotSynth.CASE_MATERIALS = CASE_MATERIALS;
  GunshotSynth.roomRt60 = roomRt60;
  GunshotSynth.burnRateFromGrain = burnRateFromGrain;
  GunshotSynth.SR = SR;
  window.GunshotSynth = GunshotSynth;
})();
