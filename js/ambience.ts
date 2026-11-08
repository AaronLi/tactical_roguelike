'use strict';
// Ambience: each place's background sound, synthesized as it plays (no recordings): the room tone and the machines of
// the place, the weather and the town outside, and the odd sound now and then (a drip, a car going by, a dog, a pipe
// knocking). A place is a recipe (RECIPES, below, by the theme's name: js/data.ts THEMES, and the hangar's) built from
// a few kinds of part:
//   beds    sound that runs all the time: filtered noise (air handling, wind, traffic, a crowd), hums (mains, motors)
//   events  one-shots at random, so many a minute on average (a Poisson process: no two minutes alike)
//   spots   sources in the level itself (a furnace, a freezer, a stage, a hissing pipe): panned and quieter with distance
// Everything is split between what's heard indoors and what's heard outdoors: standing inside you hear the inside
// layers and the outside ones muffled through the walls, and the other way about outside. Where you stand is from the
// level's outdoor tiles (LvMap.out), averaged round you so the change happens as you come up to a door, not at it.
// It renders into any audio context: the game's (G.Audio's, through its master and compressor) or an offline one
// (render(): a place's first seconds as a buffer, to look at or to listen to: ambience.html auditions every place).
type AmbBus = 'in' | 'out';
interface AmbPt { x: number; y: number; z: number }
type AmbNoise = 'white' | 'pink' | 'brown';
/** A one-shot: played into dest at time t (s, the context's), k a 0..1 random variety to take its size/pitch from. */
type AmbPlay = (c: BaseAudioContext, dest: AudioNode, t: number, k: number) => void;
/** A loop that runs till stopped: built into dest; returns its stop (at time t, fading). */
type AmbLoop = (c: BaseAudioContext, dest: AudioNode) => (t: number) => void;
interface AmbEvent { name: string; bus: AmbBus; rate: number; play: AmbPlay; next: number; vol: number }
interface AmbSpotDef { x: number; y: number; z: number; r: number; vol: number; loop: AmbLoop; name: string }
interface AmbSpot extends AmbSpotDef { on: boolean; g?: GainNode; pan?: PannerNode; lp?: BiquadFilterNode; stop?: (t: number) => void; seen: number; zone: number }
interface AmbWay { lp: BiquadFilterNode; g: GainNode; dg: GainNode; pan: PannerNode; wg: GainNode; ring: AmbRing }
interface AmbRing { inp: GainNode; ps: PannerNode[] }
/** a gunshot in a rendered walk: when (s), where (ignored if own: yours, from where you are), its sound key (js/gunaudio.ts) */
interface AmbShot { t: number; x: number; y: number; z: number; id: string; own?: boolean; vol?: number }
interface AmbOpts { night: boolean; hub: boolean }
/** A place's sound, being built (in a recipe) and then played. */
interface AmbScene {
  c: BaseAudioContext; out: GainNode; inBus: GainNode; outBus: GainNode; name: string; map: LvMap | null;
  /** each bus's way to you: along the openings (lp, g) and through the walls (wg) */
  inW: AmbWay; outW: AmbWay;
  /** the send to the reverbs, and a reverb per zone you've been in (only the one you're in at any level) */
  verbIn: GainNode; verbs: Map<string, { g: GainNode; cv: ConvolverNode; wide: GainNode; dg: GainNode; pan: PannerNode }>;
  /** what reaches you, from your last listen (js/acoustics.ts), and your zone */
  reach?: Map<number, AcReach>; zone?: number;
  /** where the listener is at time t (the context's): for placing one-shots round them as they play */
  lisAt?: (t: number) => AmbPt;
  stops: ((t: number) => void)[]; events: AmbEvent[]; spots: AmbSpot[];
  /** A bed of noise into a bus. */
  bed(bus: AmbBus, o: AmbBedOpts): void;
  /** A hum into a bus: f0 (Hz) and its partials [multiple, level]. */
  hum(bus: AmbBus, f0: number, parts: [number, number][], vol: number, o?: { drift?: number; wobble?: number }): void;
  /** Any loop into a bus. */
  loop(bus: AmbBus, f: AmbLoop, vol?: number): void;
  /** An event: rate a minute. */
  every(bus: AmbBus, rate: number, name: string, play: AmbPlay, vol?: number): void;
  /** A source at a place in the level. */
  spot(name: string, x: number, y: number, z: number, r: number, loop: AmbLoop, vol?: number): void;
}
interface AmbBedOpts {
  noise: AmbNoise; vol: number; lp?: number; hp?: number; bp?: number; q?: number;
  /** slow swells of the level: depth 0..1 of the gain, rate (Hz) */
  swell?: { rate: number; depth: number };
  /** the filter's frequency wandering: depth (fraction of it) and rate (Hz) */
  sweep?: { rate: number; depth: number };
  mono?: boolean;
}
type AmbRecipe = (s: AmbScene, o: AmbOpts, map: LvMap | null) => void;

const G_Ambience = (() => {
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

  // ---- the raw material: noise buffers (one set per context), filters, envelopes ----
  const noiseSets = new WeakMap<BaseAudioContext, Record<AmbNoise, AudioBuffer>>();
  function noises(c: BaseAudioContext) {
    let n = noiseSets.get(c);
    if (n) return n;
    const len = Math.floor(c.sampleRate * 9.7), mk = () => c.createBuffer(1, len, c.sampleRate);
    const w = mk(), p = mk(), b = mk(), dw = w.getChannelData(0), dp = p.getChannelData(0), db = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1;
      dw[i] = x;
      // pink: Paul Kellet's filter (-3 dB an octave)
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      dp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      // brown: integrated, leaking back to 0 (-6 dB an octave)
      br = (br + 0.02 * x) / 1.02; db[i] = br * 3.5;
    }
    // the loop's seam: the last 50 ms crossfaded into the first, so it doesn't click every 9.7 s
    const fade = Math.floor(c.sampleRate * 0.05);
    for (const d of [dw, dp, db]) for (let i = 0; i < fade; i++) { const k = i / fade; d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k; }
    n = { white: w, pink: p, brown: b };
    noiseSets.set(c, n);
    return n;
  }
  /** A looping noise source, started at a random place in the buffer (so no two are in step). */
  function noise(c: BaseAudioContext, kind: AmbNoise, rate = 1) {
    const s = c.createBufferSource(), buf = noises(c)[kind];
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.start(c.currentTime, Math.random() * buf.duration);
    return s;
  }
  /** Noise, wide: two sources apart, one to each ear (mono: one). */
  function wideNoise(c: BaseAudioContext, kind: AmbNoise, mono = false) {
    if (mono) { const s = noise(c, kind); return { out: s as AudioNode, srcs: [s] }; }
    const a = noise(c, kind), b = noise(c, kind), m = c.createChannelMerger(2);
    a.connect(m, 0, 0); b.connect(m, 0, 1);
    return { out: m as AudioNode, srcs: [a, b] };
  }
  function filt(c: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.707) {
    const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
  }
  function gain(c: BaseAudioContext, v: number) { const g = c.createGain(); g.gain.value = v; return g; }
  /** a chain of nodes, connected in order; returns [first, last] */
  function chain(...ns: AudioNode[]): [AudioNode, AudioNode] { for (let i = 1; i < ns.length; i++) ns[i - 1].connect(ns[i]); return [ns[0], ns[ns.length - 1]]; }
  /** an attack / decay envelope on a gain (exponential decay to silence) */
  function env(g: AudioParam, t: number, peak: number, a: number, d: number) {
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(peak, t + a); g.setTargetAtTime(0, t + a, d / 4);
  }
  /** a slow wobble on a param: two sines at unrelated rates (so it never quite repeats), depth in the param's units */
  function wobble(c: BaseAudioContext, p: AudioParam, rate: number, depth: number) {
    const stops: AudioScheduledSourceNode[] = [];
    for (const [k, d] of [[1, 0.65], [2.73, 0.35]]) {
      const o = c.createOscillator(), g = gain(c, depth * d);
      o.frequency.value = rate * k * rnd(0.85, 1.15); o.connect(g); g.connect(p); o.start(c.currentTime + Math.random() * Math.min(8, 1 / o.frequency.value)); // (a random phase: started some way into a cycle's time)
      stops.push(o);
    }
    return stops;
  }
  /** stop the sources at t, after their gain's faded */
  function stopper(c: BaseAudioContext, g: GainNode, srcs: AudioScheduledSourceNode[]) {
    return (t: number) => { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.4); for (const s of srcs) { try { s.stop(t + 2.5); } catch { /* (already) */ } } void c; };
  }
  /** a panner for a sound at x across the field (-1 left .. 1 right) */
  /** across a loop's stereo field (-1 left .. 1 right): only inside a loop, which the bus then places in the world (the ring) */
  function spread(c: BaseAudioContext, x: number) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x)); return p; }
  // Where the listener is, for placing a one-shot in the world round them when it plays (set from the camera as the game
  // runs, from the walk's track in a render: AmbScene.lisAt). The world's directions don't turn with your head: a dog
  // barking to the north stays to the north as you turn, so it moves round you.
  let here: AmbPt = { x: 0, y: 1.6, z: 0 };
  /** a one-shot's place in the world: somewhere round the listener (a random bearing, near..far metres off), at their
   *  height; its level's the event's own (the panner only places it: no fall-off) */
  function panAt(c: BaseAudioContext, _x?: number, near = 5, far = 18) {
    const p = c.createPanner(), a = Math.random() * Math.PI * 2, r = rnd(near, far);
    p.panningModel = 'equalpower'; p.rolloffFactor = 0;
    p.positionX.value = here.x + Math.cos(a) * r; p.positionY.value = here.y + rnd(-0.5, 1.5); p.positionZ.value = here.z + Math.sin(a) * r;
    return p;
  }

  // ---- loops (built per scene or spot) ----
  const L = {
    /** filtered noise, swelling and wandering */
    bed(o: AmbBedOpts): AmbLoop {
      return (c, dest) => {
        const n = wideNoise(c, o.noise, o.mono), g = gain(c, o.vol), nodes: AudioNode[] = [n.out];
        const fs: BiquadFilterNode[] = [];
        if (o.hp) fs.push(filt(c, 'highpass', o.hp));
        if (o.bp) fs.push(filt(c, 'bandpass', o.bp, o.q || 1));
        if (o.lp) fs.push(filt(c, 'lowpass', o.lp, o.q && !o.bp ? o.q : 0.707));
        chain(...nodes, ...fs, g, dest);
        const srcs: AudioScheduledSourceNode[] = [...n.srcs];
        if (o.swell) { g.gain.value = o.vol * (1 - o.swell.depth / 2); srcs.push(...wobble(c, g.gain, o.swell.rate, o.vol * o.swell.depth / 2)); }
        if (o.sweep && fs.length) { const f = fs[fs.length - 1]; srcs.push(...wobble(c, f.frequency, o.sweep.rate, f.frequency.value * o.sweep.depth)); }
        return stopper(c, g, srcs);
      };
    },
    /** a hum: partials of f0, each a touch off its exact multiple so they beat slowly, as a real transformer's do */
    hum(f0: number, parts: [number, number][], vol: number, o: { drift?: number; wobble?: number } = {}): AmbLoop {
      return (c, dest) => {
        const g = gain(c, vol), srcs: AudioScheduledSourceNode[] = [];
        for (const [m, a] of parts) {
          const os = c.createOscillator(), og = gain(c, a);
          os.frequency.value = f0 * m * (1 + rnd(-1, 1) * (o.drift ?? 0.002));
          os.connect(og); og.connect(g); os.start(); srcs.push(os);
        }
        if (o.wobble) srcs.push(...wobble(c, g.gain, 0.07, vol * o.wobble));
        g.connect(dest);
        return stopper(c, g, srcs);
      };
    },
    /** a motor or fan: a hum on its shaft's rate with a whoosh of air over it (blade rate in its partials) */
    motor(hz: number, vol: number, air = 0.5, airF = 900): AmbLoop {
      return (c, dest) => {
        const g = gain(c, vol), srcs: AudioScheduledSourceNode[] = [];
        for (const [m, a] of [[1, 0.5], [2, 0.3], [3, 0.12], [5, 0.06]] as [number, number][]) {
          const os = c.createOscillator(), og = gain(c, a); os.type = m === 1 ? 'triangle' : 'sine';
          os.frequency.value = hz * m * rnd(0.998, 1.002); chain(os, og, g); os.start(); srcs.push(os);
        }
        const n = noise(c, 'pink'), bp = filt(c, 'bandpass', airF, 0.8), ng = gain(c, air);
        chain(n, bp, ng, g); srcs.push(n);
        srcs.push(...wobble(c, g.gain, 0.11, vol * 0.08));
        g.connect(dest);
        return stopper(c, g, srcs);
      };
    },
    /** a refrigeration compressor: runs for a minute or two, stops (a clunk), rests, starts again (a clunk and a rise) */
    compressor(vol: number, hz = 49): AmbLoop {
      return (c, dest) => {
        const g = gain(c, 0), srcs: AudioScheduledSourceNode[] = [];
        for (const [m, a] of [[1, 0.6], [2, 0.35], [3, 0.2], [4, 0.1], [6, 0.05]] as [number, number][]) {
          const os = c.createOscillator(), og = gain(c, a); os.type = 'sine'; os.frequency.value = hz * m * rnd(0.997, 1.003);
          chain(os, og, g); os.start(); srcs.push(os);
        }
        const n = noise(c, 'brown'), lp = filt(c, 'lowpass', 400), ng = gain(c, 0.25); chain(n, lp, ng, g); srcs.push(n);
        g.connect(dest);
        // its cycle, scheduled ahead for the next fifteen minutes (a level rarely lasts that; after it, it stays as it is)
        let t = c.currentTime + rnd(0, 20), on = Math.random() < 0.6;
        const until = c.currentTime + 900;
        while (t < until) {
          if (on) { g.gain.setTargetAtTime(vol, t, 0.6); clunk(c, dest, t, vol * 0.8); t += rnd(50, 140); }
          else { g.gain.setTargetAtTime(0, t, 1.2); clunk(c, dest, t, vol * 0.5); t += rnd(25, 70); }
          on = !on;
        }
        return stopper(c, g, srcs);
      };
    },
    /** fluorescent tubes: the 120 Hz buzz (and its odd harmonics: a magnetic ballast's) with a high whine on top */
    fluorescent(vol: number): AmbLoop { return L.hum(120, [[1, 0.5], [2, 0.18], [3, 0.3], [5, 0.12], [7, 0.06], [83.3, 0.008]], vol, { drift: 0.0005, wobble: 0.1 }); },
    /** wind: noise through a band that wanders and swells in gusts, and a whistle (a narrow band, sliding) on the gusts */
    wind(vol: number, gusty = 0.7, whistle = 0.15): AmbLoop {
      return (c, dest) => {
        const g = gain(c, vol * (1 - gusty / 2)), srcs: AudioScheduledSourceNode[] = [];
        const n = wideNoise(c, 'pink'), lp = filt(c, 'lowpass', 700, 0.5); chain(n.out, lp, g); srcs.push(...n.srcs);
        const b = wideNoise(c, 'brown'), bg = gain(c, 0.8); chain(b.out, bg, g); srcs.push(...b.srcs);
        srcs.push(...wobble(c, g.gain, 0.06, vol * gusty / 2), ...wobble(c, lp.frequency, 0.05, 350));
        if (whistle) {
          const w = noise(c, 'pink'), wb = filt(c, 'bandpass', 900, 3.5), wg = gain(c, 0), wl = gain(c, whistle * vol * 1.6); // (broad and airy: a narrow band sang like a turbine)
          chain(w, wb, wg, wl, dest); srcs.push(w, ...wobble(c, wb.frequency, 0.04, 380), ...wobble(c, wg.gain, 0.05, 1));
        }
        g.connect(dest);
        return stopper(c, g, srcs);
      };
    },
    /** crickets: each chirps steadily, a short train of pulses (a 4–5 kHz tone pulsed at ~30 Hz) at `rate` chirps a second, all
     *  of them at nearly the same rate (as a field of them falls into step), each its own pitch, place and distance */
    crickets(vol: number, n = 5, rate = 2.2): AmbLoop {
      return (c, dest) => {
        const g = gain(c, vol), srcs: AudioScheduledSourceNode[] = [];
        // the chirp's gate: a pulse a quarter of the period long (a square wave's half would make a trill, not a chirp)
        const N = 24, re = new Float32Array(N), im = new Float32Array(N), duty = 0.25;
        for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
        const pulse = c.createPeriodicWave(re, im, { disableNormalization: true });
        for (let i = 0; i < n; i++) {
          const car = c.createOscillator(), am = c.createOscillator(), amg = gain(c, 0.5), cg = gain(c, 0.5);
          const gate = c.createOscillator(), gg = gain(c, duty), pan = spread(c, rnd(-0.9, 0.9)), lv = gain(c, rnd(0.35, 1));
          car.frequency.value = rnd(4300, 4900); am.type = 'square'; am.frequency.value = 30; gate.setPeriodicWave(pulse); gate.frequency.value = rate * rnd(0.995, 1.005);
          am.connect(amg); amg.connect(cg.gain); // (0..1 at the pulse rate)
          gate.connect(gg.gain); // (0..1: on for a quarter of each period)
          chain(car, cg, gg, lv, pan, g);
          const at = c.currentTime + (i / n) / rate; // (each a fraction of a period after the last)
          for (const o of [car, am, gate]) { o.start(at); srcs.push(o); }
        }
        g.connect(dest);
        return stopper(c, g, srcs);
      };
    },
    /** a crowd: babble (bands of noise at voices' formants, their levels hopping at syllable rate), or the recorded bed if there is one */
    crowd(vol: number, busy = 1): AmbLoop {
      return (c, dest) => {
        const g = gain(c, vol), srcs: AudioScheduledSourceNode[] = [];
        const rec = G.Audio && G.Audio.samples && G.Audio.samples.crowd_bed;
        if (rec && (c === (G.Audio.ambCtx as BaseAudioContext) || c === (G.Audio.ctx as BaseAudioContext))) { // (a decoded buffer plays in either of the game's contexts)
          const s = c.createBufferSource(); s.buffer = rec; s.loop = true; s.start(c.currentTime, Math.random() * rec.duration);
          const lp = filt(c, 'lowpass', 2600); chain(s, lp, g); srcs.push(s);
        } else {
          for (const [f, q, a] of [[320, 2, 0.9], [650, 3, 0.8], [1100, 4, 0.55], [2400, 5, 0.25]] as [number, number, number][]) {
            const n = wideNoise(c, 'pink'), bp = filt(c, 'bandpass', f, q), bg = gain(c, a * 0.5);
            chain(n.out, bp, bg, g); srcs.push(...n.srcs, ...wobble(c, bg.gain, 4.5 * busy, a * 0.35), ...wobble(c, bp.frequency, 0.8, f * 0.15));
          }
        }
        g.connect(dest);
        return stopper(c, g, srcs);
      };
    },
    /** traffic far off: a low rumble that comes and goes */
    traffic(vol: number): AmbLoop { return L.bed({ noise: 'brown', vol, lp: 380, swell: { rate: 0.05, depth: 0.6 } }); },
    /** a city below: a low, even roar */
    city(vol: number): AmbLoop { return L.bed({ noise: 'brown', vol, lp: 220, hp: 30, swell: { rate: 0.02, depth: 0.3 } }); },
    /** a sequenced loop: a beat (kick, bass, hats) at bpm, scheduled bar by bar a second ahead */
    music(bpm: number, vol: number): AmbLoop {
      return (c, dest) => {
        const g = gain(c, vol), beat = 60 / bpm, bass = [41.2, 41.2, 49, 36.7]; // (E1 E1 G1 D1: a bar each)
        let t = c.currentTime + 0.1, n = 0, live = true;
        const step = () => {
          if (!live) return;
          while (t < c.currentTime + 1.2) {
            const bar = Math.floor(n / 4) % 4, b = n % 4;
            kick(c, g, t, 0.9);
            if (b % 2 === 1) hat(c, g, t, 0.18); hat(c, g, t + beat / 2, 0.28);
            if (b === 2) clap(c, g, t, 0.35);
            bassNote(c, g, t + beat / 2, bass[bar], beat * 0.45, 0.5);
            t += beat; n++;
          }
          tmr = setTimeout(step, 250);
        };
        let tmr: ReturnType<typeof setTimeout> | undefined;
        if (c instanceof OfflineAudioContext) { while (t < c.length / c.sampleRate) { const bar = Math.floor(n / 4) % 4, b = n % 4; kick(c, g, t, 0.9); if (b % 2 === 1) hat(c, g, t, 0.18); hat(c, g, t + beat / 2, 0.28); if (b === 2) clap(c, g, t, 0.35); bassNote(c, g, t + beat / 2, bass[bar], beat * 0.45, 0.5); t += beat; n++; } }
        else step();
        g.connect(dest);
        return (at: number) => { live = false; if (tmr) clearTimeout(tmr); g.gain.setTargetAtTime(0, at, 0.4); };
      };
    },
  };

  // ---- one-shots ----
  function kick(c: BaseAudioContext, dest: AudioNode, t: number, v: number) {
    const o = c.createOscillator(), g = gain(c, 0); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g.gain, t, v, 0.003, 0.35); chain(o, g, dest); o.start(t); o.stop(t + 0.6);
  }
  function hat(c: BaseAudioContext, dest: AudioNode, t: number, v: number) {
    const n = noise(c, 'white'), hp = filt(c, 'highpass', 7000), g = gain(c, 0); env(g.gain, t, v, 0.001, 0.05); chain(n, hp, g, dest); n.stop(t + 0.15);
  }
  function clap(c: BaseAudioContext, dest: AudioNode, t: number, v: number) {
    const n = noise(c, 'white'), bp = filt(c, 'bandpass', 1500, 1.2), g = gain(c, 0); env(g.gain, t, v, 0.002, 0.14); chain(n, bp, g, dest); n.stop(t + 0.3);
  }
  function bassNote(c: BaseAudioContext, dest: AudioNode, t: number, f: number, d: number, v: number) {
    const o = c.createOscillator(), lp = filt(c, 'lowpass', 260, 4), g = gain(c, 0); o.type = 'sawtooth'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.setValueAtTime(v, t + d); g.gain.linearRampToValueAtTime(0, t + d + 0.05);
    chain(o, lp, g, dest); o.start(t); o.stop(t + d + 0.1);
  }
  function clunk(c: BaseAudioContext, dest: AudioNode, t: number, v: number) {
    const o = c.createOscillator(), g = gain(c, 0); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    env(g.gain, t, v, 0.004, 0.2); chain(o, g, dest); o.start(t); o.stop(t + 0.5);
    const n = noise(c, 'brown'), lp = filt(c, 'lowpass', 500), ng = gain(c, 0); env(ng.gain, t, v * 0.8, 0.002, 0.08); chain(n, lp, ng, dest); n.stop(t + 0.3);
  }
  /** a struck metal thing: inharmonic partials (a plate's/bar's) decaying, the high ones first */
  function ring(c: BaseAudioContext, dest: AudioNode, t: number, f: number, v: number, d: number, ratios = [1, 2.76, 5.4, 8.93]) {
    ratios.forEach((r, i) => {
      const o = c.createOscillator(), g = gain(c, 0); o.frequency.value = f * r * rnd(0.99, 1.01);
      env(g.gain, t, v / (1 + i * 0.8), 0.001, d / (1 + i * 0.6)); chain(o, g, dest); o.start(t); o.stop(t + d + 0.5);
    });
  }
  /** a burst of filtered noise */
  function burst(c: BaseAudioContext, dest: AudioNode, t: number, kind: AmbNoise, type: BiquadFilterType, f: number, q: number, v: number, a: number, d: number) {
    const n = noise(c, kind), b = filt(c, type, f, q), g = gain(c, 0); env(g.gain, t, v, a, d); chain(n, b, g, dest); n.stop(t + a + d + 0.5);
  }
  const E: Record<string, AmbPlay> = {
    /** water dripping into water: a plink that falls in pitch, sometimes a second after it */
    drip(c, d, t, k) {
      const f = 900 + k * 1400;
      for (let i = 0, n = Math.random() < 0.4 ? 2 : 1; i < n; i++) {
        const tt = t + i * rnd(0.25, 0.9), o = c.createOscillator(), g = gain(c, 0), p = panAt(c, rnd(-0.7, 0.7));
        o.frequency.setValueAtTime(f * 1.6, tt); o.frequency.exponentialRampToValueAtTime(f, tt + 0.03);
        env(g.gain, tt, 0.22, 0.001, 0.05); chain(o, g, p, d); o.start(tt); o.stop(tt + 0.2);
      }
    },
    /** a pipe knocking: a dull thump and the pipe ringing after it */
    knock(c, d, t, k) {
      const p = panAt(c, rnd(-0.8, 0.8)); p.connect(d);
      const n = 1 + Math.floor(k * 3);
      for (let i = 0; i < n; i++) { const tt = t + i * rnd(0.12, 0.3); clunk(c, p, tt, 0.35); ring(c, p, tt, rnd(180, 320), 0.06, 0.6); }
    },
    /** something in a wooden building creaking (a floor, a door): a buzz of stick-slip pulses through the wood's resonances */
    creak(c, d, t, k) {
      const o = c.createOscillator(), g = gain(c, 0), dur = 0.4 + k * 1.0, p = panAt(c, rnd(-0.8, 0.8));
      o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(40, 70), t); o.frequency.linearRampToValueAtTime(rnd(25, 110), t + dur);
      const b1 = filt(c, 'bandpass', rnd(500, 900), 6), b2 = filt(c, 'bandpass', rnd(1400, 2200), 8), m = gain(c, 1);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.08); g.gain.setValueAtTime(0.25, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(b1); o.connect(b2); b1.connect(m); b2.connect(m); chain(m, g, p, d); o.start(t); o.stop(t + dur + 0.1);
    },
    /** metal ticking as it warms or cools (a roof, a duct): a few high pings */
    ping(c, d, t, k) {
      const p = panAt(c, rnd(-0.9, 0.9)); p.connect(d);
      for (let i = 0, n = 1 + Math.floor(k * 4); i < n; i++) ring(c, p, t + i * rnd(0.15, 0.6), rnd(1800, 3800), 0.05, 0.25);
    },
    /** something heavy and metal set down or struck somewhere off */
    clank(c, d, t, k) {
      const p = panAt(c, rnd(-0.9, 0.9)), lp = filt(c, 'lowpass', 2500 + k * 3000); chain(lp, p, d);
      clunk(c, lp, t, 0.5); ring(c, lp, t, rnd(140, 420), 0.18, 1.4 + k);
      if (Math.random() < 0.4) { clunk(c, lp, t + rnd(0.15, 0.35), 0.3); ring(c, lp, t + 0.2, rnd(140, 420), 0.08, 0.8); }
    },
    /** a car going by on a road outside, as a car on a road would: driving past at 36-60 km/h, its nearest 8-25 m off, on a
     *  road at a random bearing in the world (so as you turn, it stays where it is). Its bearing barely moves while it's
     *  far, then swings across in the second or so it's nearest; its level
     *  goes as 1/distance (with the far ends faded in and out); its tyre roar brighter near, and higher coming than going
     *  (the Doppler shift: the band's centre by c / (c - v cos θ)) */
    car(c, d, t, k) {
      const v = rnd(10, 17), D = rnd(8, 25) * (1.15 - k * 0.3), T = rnd(7, 10), N = 96;
      // the road: a line D metres off you, at a random bearing, the car along it from one end to the other
      const a = Math.random() * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a), ux = -nz, uz = nx, side = Math.random() < 0.5 ? -1 : 1;
      const px = new Float32Array(N), pz = new Float32Array(N), lv = new Float32Array(N), fq = new Float32Array(N), peak = Math.min(0.45, 0.1 + 2.2 / D);
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1), x = v * (u - 0.5) * T, r = Math.hypot(x, D), edge = Math.min(1, u / 0.12, (1 - u) / 0.12);
        px[i] = here.x + nx * D + ux * x * side; pz[i] = here.z + nz * D + uz * x * side;
        lv[i] = peak * Math.pow(D / r, 1.3) * edge;
        fq[i] = (450 + 750 * (D / r)) * (343 / (343 + v * (x / r))); // (x < 0: still coming)
      }
      const p = c.createPanner(), n = noise(c, 'pink'), bp = filt(c, 'bandpass', fq[0], 0.7), g = gain(c, 0);
      p.panningModel = 'equalpower'; p.rolloffFactor = 0; p.positionY.value = here.y - 1;
      p.positionX.setValueCurveAtTime(px, t, T); p.positionZ.setValueCurveAtTime(pz, t, T);
      g.gain.setValueCurveAtTime(lv, t, T); bp.frequency.setValueCurveAtTime(fq, t, T);
      chain(n, bp, g, p, d); n.stop(t + T + 0.2); // (tyres and air only: no engine note)
    },
    /** a siren a long way off: the wail sliding up and down, coming and going */
    siren(c, d, t, k) {
      const dur = rnd(8, 16), o = c.createOscillator(), g = gain(c, 0), lp = filt(c, 'lowpass', 1400), period = rnd(3.5, 5.5);
      o.type = 'triangle';
      for (let tt = t, up = true; tt < t + dur; tt += period / 2, up = !up) o.frequency.linearRampToValueAtTime(up ? 1250 : 680, tt + period / 2);
      o.frequency.setValueAtTime(680, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 + k * 0.05, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
      chain(o, lp, g, panAt(c, rnd(-0.8, 0.8)), d); o.start(t); o.stop(t + dur + 0.2);
    },
    /** a dog barking somewhere down the street: two to five barks (a voiced burst through a dog's formants) */
    dog(c, d, t, k) {
      const p = panAt(c, rnd(-0.9, 0.9)), lp = filt(c, 'lowpass', 1800); chain(lp, p, d);
      const f0 = rnd(280, 480) * (1 - k * 0.3), n = 2 + Math.floor(Math.random() * 4);
      let tt = t;
      for (let i = 0; i < n; i++) {
        const o = c.createOscillator(), g = gain(c, 0), f1 = filt(c, 'bandpass', rnd(550, 750), 3), f2 = filt(c, 'bandpass', rnd(1400, 1800), 4), m = gain(c, 1);
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.3, tt); o.frequency.exponentialRampToValueAtTime(f0 * 0.75, tt + 0.13);
        env(g.gain, tt, 0.22, 0.01, 0.12); o.connect(g); g.connect(f1); g.connect(f2); f1.connect(m); f2.connect(m); m.connect(lp);
        o.start(tt); o.stop(tt + 0.4);
        tt += rnd(0.25, 0.55);
      }
    },
    /** a songbird: a phrase of quick whistled sweeps and trills, high */
    bird(c, d, t, k) {
      const p = panAt(c, rnd(-0.9, 0.9)); p.connect(d);
      const base = rnd(2600, 4800), n = 3 + Math.floor(k * 6), style = Math.floor(Math.random() * 3);
      let tt = t;
      for (let i = 0; i < n; i++) {
        const o = c.createOscillator(), g = gain(c, 0), dur = style === 2 ? 0.03 : rnd(0.05, 0.14);
        const f = base * (style === 0 ? 1 + 0.25 * Math.sin(i) : style === 1 ? 1 - i * 0.04 : 1);
        o.frequency.setValueAtTime(f * (style === 1 ? 1.3 : 0.85), tt); o.frequency.exponentialRampToValueAtTime(f * (style === 1 ? 0.8 : 1.25), tt + dur);
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.06, tt + dur * 0.3); g.gain.linearRampToValueAtTime(0, tt + dur);
        chain(o, g, p); o.start(tt); o.stop(tt + dur + 0.05);
        tt += dur + (style === 2 ? 0.02 : rnd(0.03, 0.12));
      }
    },
    /** a crow or a raven: a few harsh caws */
    crow(c, d, t, k) {
      const p = panAt(c, rnd(-0.9, 0.9)), lp = filt(c, 'lowpass', 3000); chain(lp, p, d);
      for (let i = 0, n = 1 + Math.floor(k * 4), tt = t; i < n; i++, tt += rnd(0.35, 0.7)) {
        const o = c.createOscillator(), g = gain(c, 0), bp = filt(c, 'bandpass', rnd(1100, 1500), 2), f = rnd(380, 520);
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f, tt); o.frequency.linearRampToValueAtTime(f * 0.85, tt + 0.25);
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.12, tt + 0.03); g.gain.linearRampToValueAtTime(0.08, tt + 0.18); g.gain.linearRampToValueAtTime(0, tt + 0.3);
        chain(o, bp, g, lp); o.start(tt); o.stop(tt + 0.35);
        burst(c, lp, tt, 'white', 'bandpass', 2000, 1.5, 0.04, 0.02, 0.25);
      }
    },
    /** a coyote far off at night: a rising, wavering howl and a few yips */
    coyote(c, d, t, k) {
      const o = c.createOscillator(), g = gain(c, 0), vib = c.createOscillator(), vg = gain(c, 12), dur = rnd(1.5, 2.8), lp = filt(c, 'lowpass', 1600);
      o.frequency.setValueAtTime(550, t); o.frequency.linearRampToValueAtTime(rnd(900, 1150), t + dur * 0.45); o.frequency.linearRampToValueAtTime(700, t + dur);
      vib.frequency.value = 6; chain(vib, vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06 + k * 0.03, t + 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
      chain(o, lp, g, panAt(c, rnd(-0.9, 0.9)), d); o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
      for (let i = 0, tt = t + dur + 0.2; i < 3; i++, tt += rnd(0.12, 0.25)) {
        const y = c.createOscillator(), yg = gain(c, 0); y.frequency.setValueAtTime(rnd(900, 1200), tt); y.frequency.linearRampToValueAtTime(700, tt + 0.1);
        env(yg.gain, tt, 0.04, 0.01, 0.08); chain(y, yg, lp); y.start(tt); y.stop(tt + 0.3);
      }
    },
    /** steam let off somewhere: a hiss that swells and dies */
    steam(c, d, t, k) {
      const dur = 0.5 + k * 3, n = noise(c, 'white'), hp = filt(c, 'highpass', 2200), bp = filt(c, 'peaking', 4500, 1), g = gain(c, 0);
      bp.gain.value = 6; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.06); g.gain.setTargetAtTime(0, t + dur * 0.6, dur / 4);
      chain(n, hp, bp, g, panAt(c, rnd(-0.8, 0.8)), d); n.stop(t + dur * 2);
    },
    /** an electrical arc: a crackle of sparks on a buzz */
    arc(c, d, t, k) {
      const dur = 0.2 + k * 0.8, p = panAt(c, rnd(-0.7, 0.7)); p.connect(d);
      for (let tt = t; tt < t + dur; tt += rnd(0.005, 0.05)) burst(c, p, tt, 'white', 'highpass', 3000, 0.7, rnd(0.03, 0.12), 0.001, 0.01);
      const o = c.createOscillator(), g = gain(c, 0); o.type = 'sawtooth'; o.frequency.value = 120;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.02); g.gain.linearRampToValueAtTime(0, t + dur); chain(o, g, p); o.start(t); o.stop(t + dur + 0.05);
    },
    /** a drop hammer or a press somewhere in the works: a few heavy, regular thuds */
    thud(c, d, t, k) {
      const p = panAt(c, rnd(-0.6, 0.6)), lp = filt(c, 'lowpass', 900); chain(lp, p, d);
      const gap = rnd(1.1, 1.8);
      for (let i = 0, n = 3 + Math.floor(k * 6); i < n; i++) { const tt = t + i * gap; kick(c, lp, tt, 0.4); ring(c, lp, tt, rnd(70, 110), 0.12, 0.9, [1, 2.1, 3.3]); }
    },
    /** a reversing alarm (a forklift, a truck): a few beeps */
    beeper(c, d, t, k) {
      const p = panAt(c, rnd(-0.9, 0.9)), lp = filt(c, 'lowpass', 2200); chain(lp, p, d);
      for (let i = 0, n = 4 + Math.floor(k * 8); i < n; i++) {
        const o = c.createOscillator(), g = gain(c, 0), tt = t + i * 0.9; o.type = 'square'; o.frequency.value = 1040;
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.03, tt + 0.01); g.gain.setValueAtTime(0.03, tt + 0.45); g.gain.linearRampToValueAtTime(0, tt + 0.46);
        chain(o, g, lp); o.start(tt); o.stop(tt + 0.5);
      }
    },
    /** lab equipment: a short pattern of soft beeps */
    beep(c, d, t, k) {
      const p = panAt(c, rnd(-0.8, 0.8)); p.connect(d);
      const f = pick([880, 1320, 1760, 2093]), n = 1 + Math.floor(k * 3);
      for (let i = 0; i < n; i++) { const o = c.createOscillator(), g = gain(c, 0), tt = t + i * 0.16; o.frequency.value = f * (i === n - 1 && n > 2 ? 0.75 : 1); env(g.gain, tt, 0.04, 0.003, 0.09); chain(o, g, p); o.start(tt); o.stop(tt + 0.2); }
    },
    /** pigeons up in the roof: wings clattering, a coo */
    pigeon(c, d, t, k) {
      const p = panAt(c, rnd(-0.9, 0.9)); p.connect(d);
      if (k > 0.4) {
        const n = noise(c, 'pink'), bp = filt(c, 'bandpass', 1200, 0.8), g = gain(c, 0), am = c.createOscillator(), amg = gain(c, 0.06), dur = rnd(0.5, 1.2);
        am.type = 'square'; am.frequency.value = rnd(12, 18); chain(am, amg); amg.connect(g.gain);
        g.gain.setValueAtTime(0.06, t); g.gain.linearRampToValueAtTime(0, t + dur); chain(n, bp, g, p); am.start(t); am.stop(t + dur); n.stop(t + dur + 0.1);
      } else for (let i = 0, tt = t; i < 3; i++, tt += 0.45) {
        const o = c.createOscillator(), g = gain(c, 0), tr = c.createOscillator(), trg = gain(c, 0.02);
        o.frequency.setValueAtTime(rnd(360, 420), tt); o.frequency.linearRampToValueAtTime(330, tt + 0.35); tr.frequency.value = 22; chain(tr, trg); trg.connect(g.gain);
        env(g.gain, tt, 0.04, 0.05, 0.3); chain(o, g, p); o.start(tt); tr.start(tt); o.stop(tt + 0.45); tr.stop(tt + 0.45);
      }
    },
    /** ice or a cold panel cracking: a sharp tick and a short crackle */
    ice(c, d, t, k) {
      const p = panAt(c, rnd(-0.9, 0.9)); p.connect(d);
      burst(c, p, t, 'white', 'bandpass', rnd(2500, 5000), 3, 0.15, 0.001, 0.02);
      for (let i = 0, n = Math.floor(k * 6); i < n; i++) burst(c, p, t + rnd(0.01, 0.25), 'white', 'highpass', 4000, 1, rnd(0.02, 0.06), 0.001, 0.008);
    },
    /** footsteps or a thump through the ceiling (the neighbours) */
    upstairs(c, d, t, k) {
      const lp = filt(c, 'lowpass', 180); lp.connect(d);
      for (let i = 0, n = 2 + Math.floor(k * 6); i < n; i++) kick(c, lp, t + i * rnd(0.45, 0.6), 0.18);
    },
    /** a door slammed somewhere in the building */
    slam(c, d, t) { const lp = filt(c, 'lowpass', 600); lp.connect(d); clunk(c, lp, t, 0.6); burst(c, lp, t, 'brown', 'lowpass', 300, 1, 0.3, 0.002, 0.4); },
    /** the neighbours' television through the wall: muffled voices and a swell of music, a while */
    telly(c, d, t, k) {
      const dur = rnd(6, 14), g = gain(c, 0), lp = filt(c, 'lowpass', 900), hp = filt(c, 'highpass', 200);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.5); g.gain.setValueAtTime(0.5, t + dur - 0.5); g.gain.linearRampToValueAtTime(0, t + dur);
      chain(g, hp, lp, d);
      const stop = L.crowd(0.25, 1.3)(c, g); stop(t + dur);
      if (k > 0.5) { const o = c.createOscillator(), og = gain(c, 0.02); o.type = 'triangle'; o.frequency.value = pick([196, 220, 247]); chain(o, og, g); o.start(t); o.stop(t + dur); }
    },
    /** a plane going over, high: a long swelling roar */
    plane(c, d, t, k) {
      const dur = rnd(18, 30), n = wideNoise(c, 'pink'), lp = filt(c, 'lowpass', 600), g = gain(c, 0), v = 0.08 + k * 0.08;
      lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(350, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
      chain(n.out, lp, g, d); for (const s of n.srcs) s.stop(t + dur + 0.5);
    },
    /** a lawnmower a few gardens away, a while, coming and going as it turns */
    mower(c, d, t) {
      const dur = rnd(20, 40), o = c.createOscillator(), lp = filt(c, 'lowpass', 700), g = gain(c, 0), p = panAt(c, rnd(-0.8, 0.8));
      o.type = 'sawtooth'; o.frequency.value = rnd(48, 56);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 2); g.gain.setValueAtTime(0.06, t + dur - 2); g.gain.linearRampToValueAtTime(0, t + dur);
      const sw = c.createOscillator(), swg = gain(c, 0.03); sw.frequency.value = rnd(0.08, 0.15); chain(sw, swg); swg.connect(g.gain);
      chain(o, lp, g, p, d); o.start(t); sw.start(t); o.stop(t + dur + 0.1); sw.stop(t + dur + 0.1);
    },
    /** leaves stirred by a gust */
    leaves(c, d, t, k) {
      const dur = rnd(2, 5), n = wideNoise(c, 'white'), hp = filt(c, 'highpass', 2500), g = gain(c, 0), am = c.createOscillator(), amg = gain(c, 0.015 + k * 0.02);
      am.frequency.value = rnd(6, 11); chain(am, amg); amg.connect(g.gain);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03 + k * 0.03, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
      chain(n.out, hp, g, d); am.start(t); am.stop(t + dur); for (const s of n.srcs) s.stop(t + dur + 0.1);
    },
    /** the hangar's PA: a two-tone chime (no announcement after it: it's the chime that says "hangar") */
    chime(c, d, t) {
      for (const [f, dt] of [[784, 0], [622, 0.45]] as [number, number][]) ring(c, d, t + dt, f, 0.05, 1.8, [1, 2, 3.01, 4.2]);
    },
    /** a cheer going up from the crowd, somewhere off */
    cheer(c, d, t, k) {
      const dur = rnd(2, 4), g = gain(c, 0), hp = filt(c, 'highpass', 300);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4 + k * 0.4, t + 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      chain(g, hp, d); const s = L.crowd(0.6, 2)(c, g); s(t + dur);
    },
  };

  // ---- the places ----
  const R: Record<string, AmbRecipe> = {
    // an apartment block in town: its air and its fridges, the neighbours (through the walls and the ceiling), the plumbing; outside, the town
    Apartment(s, o) {
      s.bed('in', { noise: 'brown', vol: 0.05, lp: 220 });
      s.every('in', 2.0, 'neighbours upstairs', E.upstairs, 0.6);
      s.every('in', 0.8, 'television through the wall', E.telly, 0.5);
      s.every('in', 1.5, 'pipes', E.knock, 0.5);
      s.every('in', 1.2, 'a door somewhere', E.slam, 0.4);
      s.every('in', 1.5, 'creak', E.creak, 0.4);
      s.loop('out', L.traffic(0.06));
      s.every('out', o.night ? 2 : 6, 'car', E.car, 0.7);
      s.every('out', 0.8, 'siren', E.siren);
      s.every('out', 1.2, 'dog', E.dog, 0.6);
      if (!o.night) s.every('out', 2, 'bird', E.bird, 0.5);
      s.loop('out', L.wind(0.05, 0.6, 0.05));
    },
    // a warehouse: a big empty volume of air, its roof ticking, pigeons up in the steel; forklifts somewhere
    Warehouse(s) {
      s.bed('in', { noise: 'brown', vol: 0.09, lp: 160, swell: { rate: 0.03, depth: 0.3 } });
      s.bed('in', { noise: 'pink', vol: 0.015, bp: 500, q: 0.6, swell: { rate: 0.05, depth: 0.5 } });
      s.every('in', 3, 'the roof ticking', E.ping, 0.7);
      s.every('in', 1.2, 'pigeons', E.pigeon, 0.7);
      s.every('in', 1.0, 'clank', E.clank, 0.5);
      s.every('in', 0.5, 'forklift reversing', E.beeper, 0.5);
      s.every('in', 1.0, 'creak', E.creak, 0.3);
      s.loop('out', L.wind(0.08, 0.7, 0.1));
      s.loop('out', L.traffic(0.04));
      s.every('out', 3, 'car', E.car, 0.6);
      s.every('out', 1.5, 'crow', E.crow, 0.5);
    },
    // underground: the ventilation's drone, water getting in, the pipes; nothing from outside but a far-off thrum
    Bunker(s) {
      s.loop('in', L.motor(24.5, 0.05, 0.6, 400));
      s.bed('in', { noise: 'brown', vol: 0.07, lp: 140, swell: { rate: 0.02, depth: 0.25 } });
      s.hum('in', 50, [[1, 0.4], [2, 0.6], [3, 0.2], [4, 0.1]], 0.012, { wobble: 0.15 });
      s.every('in', 6, 'drip', E.drip, 0.8);
      s.every('in', 2.5, 'pipes', E.knock, 0.6);
      s.every('in', 1.0, 'clank', E.clank, 0.35);
      s.every('in', 0.5, 'arc', E.arc, 0.3);
      s.loop('out', L.wind(0.06, 0.6, 0.12));
      s.every('out', 1, 'crow', E.crow, 0.4);
    },
    // a suburb: gardens, birds by day and crickets at night, a dog, a mower, cars now and then; in the houses, their quiet
    Suburbs(s, o) {
      s.bed('in', { noise: 'brown', vol: 0.03, lp: 200 });
      s.every('in', 1.2, 'creak', E.creak, 0.4);
      s.every('in', 0.6, 'pipes', E.knock, 0.3);
      s.loop('out', L.wind(0.05, 0.7, 0.03));
      s.every('out', 4, 'leaves', E.leaves);
      s.every('out', 2.5, 'dog', E.dog, 0.5);
      s.every('out', o.night ? 0.8 : 2, 'car', E.car, 0.5);
      if (o.night) { s.loop('out', L.crickets(0.02, 7)); s.every('out', 0.3, 'siren', E.siren, 0.5); }
      else { s.every('out', 14, 'bird', E.bird); s.every('out', 0.25, 'mower', E.mower); s.every('out', 0.6, 'plane', E.plane, 0.5); }
    },
    // a research lab: air handling and fans, the equipment's beeps, a centrifuge's whine, the tubes buzzing
    'Research Lab'(s) {
      s.loop('in', L.motor(29, 0.04, 0.7, 1200));
      s.bed('in', { noise: 'pink', vol: 0.03, lp: 1800, hp: 200 });
      s.loop('in', L.fluorescent(0.006));
      s.loop('in', L.hum(287, [[1, 1], [2, 0.3]], 0.0025, { wobble: 0.5 })); // (a centrifuge, spun up)
      s.every('in', 4, 'equipment beeping', E.beep, 0.7);
      s.every('in', 0.5, 'arc', E.arc, 0.2);
      s.every('in', 0.6, 'a door somewhere', E.slam, 0.3);
      s.loop('out', L.wind(0.06, 0.6, 0.05));
      s.every('out', 2, 'car', E.car, 0.5);
      s.every('out', 3, 'bird', E.bird, 0.5);
    },
    // a foundry: furnaces roaring, the works thudding, steam and sparks, metal everywhere being moved
    Foundry(s) {
      s.bed('in', { noise: 'brown', vol: 0.14, lp: 300, swell: { rate: 0.08, depth: 0.4 } });
      s.bed('in', { noise: 'pink', vol: 0.03, bp: 700, q: 0.7, swell: { rate: 0.15, depth: 0.6 } });
      s.loop('in', L.motor(16.5, 0.05, 0.8, 300));
      s.hum('in', 50, [[1, 0.3], [2, 0.6], [3, 0.3], [6, 0.1]], 0.02, { wobble: 0.3 });
      s.every('in', 1.5, 'drop hammer', E.thud, 0.6);
      s.every('in', 4, 'clank', E.clank, 0.7);
      s.every('in', 2, 'steam', E.steam, 0.6);
      s.every('in', 1.5, 'arc', E.arc, 0.5);
      s.every('in', 0.6, 'forklift reversing', E.beeper, 0.4);
      s.loop('out', L.wind(0.06, 0.7, 0.1));
      s.loop('out', L.traffic(0.035));
      s.every('out', 1, 'crow', E.crow, 0.4);
    },
    // cold storage: the plant's compressors cycling, the evaporators' fans, ice ticking; the yard outside
    'Cold Storage'(s) {
      s.loop('in', L.compressor(0.05, 49));
      s.loop('in', L.compressor(0.035, 51));
      s.loop('in', L.motor(23, 0.035, 0.9, 1500)); // (an evaporator's fan)
      s.bed('in', { noise: 'pink', vol: 0.02, hp: 300, lp: 3000 });
      s.every('in', 3, 'ice', E.ice, 0.6);
      s.every('in', 1.5, 'drip', E.drip, 0.4);
      s.every('in', 0.8, 'the panels ticking', E.ping, 0.4);
      s.every('in', 0.4, 'forklift reversing', E.beeper, 0.35);
      s.loop('out', L.wind(0.08, 0.8, 0.15));
      s.every('out', 2, 'car', E.car, 0.5);
      s.every('out', 1, 'crow', E.crow, 0.4);
    },
    // a corner store: its coolers humming (and their compressors), the tubes, and the street through the door
    'Convenience Store'(s, o) {
      s.loop('in', L.compressor(0.04, 59));
      s.loop('in', L.motor(26, 0.025, 0.8, 1100));
      s.loop('in', L.fluorescent(0.008));
      s.bed('in', { noise: 'pink', vol: 0.012, hp: 400, lp: 2500 });
      s.every('in', 0.5, 'drip', E.drip, 0.3);
      s.loop('out', L.traffic(0.07));
      s.every('out', o.night ? 3 : 7, 'car', E.car, 0.7);
      s.every('out', 0.8, 'siren', E.siren, 0.8);
      s.every('out', 0.8, 'dog', E.dog, 0.5);
      if (o.night) s.loop('out', L.crickets(0.01, 3)); else s.every('out', 3, 'bird', E.bird, 0.5);
    },
    // a festival at night: the crowd, the stage's beat (from the stage itself: a spot), cheers; inside the tents and booths, it all muffled
    Festival(s, o, map) {
      s.loop('out', L.wind(0.03, 0.5, 0.02));
      // (no crickets for now: four of them at evenly staggered starts tile the whole chirp cycle, a steady 30 Hz buzz with no
      // gaps, not a field of crickets; back once L.crickets gives each its own start and rate)
      s.bed('in', { noise: 'brown', vol: 0.04, lp: 200 });
      const stage = map && map.rooms.find((r) => r.type === 'stage');
      if (stage) s.spot('the stage', (stage.cx), 2, (stage.cz), 90, L.music(124, 0.3), 1);
      else s.loop('out', L.music(124, 0.08)); // (no stage: heard from off)
      void o;
    },
    // the top of a mountain at sundown: wind over the rock (whistling in it), ravens; the city far below; coyotes once it's dark
    'Sandia Crest'(s, o) {
      s.loop('out', L.wind(0.16, 0.8, 0.2));
      s.loop('out', L.city(0.035));
      s.every('out', 6, 'gust in the leaves', E.leaves, 0.7);
      s.every('out', 1.5, 'raven', E.crow, 0.6);
      s.every('out', 0.4, 'plane', E.plane, 0.6);
      if (o.night) { s.every('out', 1.2, 'coyote', E.coyote); s.loop('out', L.crickets(0.008, 4)); }
      else s.every('out', 2, 'bird', E.bird, 0.4);
      s.bed('in', { noise: 'brown', vol: 0.04, lp: 180 });
      s.every('in', 1.5, 'creak', E.creak, 0.4);
      s.every('in', 0.6, 'pipes', E.knock, 0.3);
    },
    // the hangar between levels: a huge hall's air, its doors open on the airfield (jets, the wind), the PA's chime, the tools
    Hangar(s) {
      s.bed('in', { noise: 'brown', vol: 0.08, lp: 180, swell: { rate: 0.03, depth: 0.3 } });
      s.bed('in', { noise: 'pink', vol: 0.02, bp: 400, q: 0.5 });
      s.loop('in', L.motor(19, 0.025, 0.7, 500));
      s.every('in', 0.5, 'the PA', E.chime, 0.6);
      s.every('in', 2, 'clank', E.clank, 0.5);
      s.every('in', 2, 'the roof ticking', E.ping, 0.5);
      s.every('in', 0.6, 'tug reversing', E.beeper, 0.4);
      s.loop('out', L.wind(0.09, 0.7, 0.08));
      s.every('out', 1.2, 'plane', E.plane);
      s.every('out', 1, 'crow', E.crow, 0.4);
    },
  };
  /** the ones a level's sound comes from as well: things in it (rooms of a type) */
  function spots(s: AmbScene, map: LvMap) {
    const TS = G.Level ? G.Level.TS : 2 / 3, fms = map.floors || [map];
    fms.forEach((fm, f) => {
      const y = (fm.fy || 0) + 1.2;
      for (const r of fm.rooms || []) {
        const x = (r.cx + 0.5) * TS, z = (r.cz + 0.5) * TS; // (a room's centre is in tiles)
        if (r.type === 'melt') s.spot('a furnace', x, y, z, 40, L.bed({ noise: 'brown', vol: 0.5, lp: 260, swell: { rate: 0.3, depth: 0.5 }, mono: true }), 0.6);
        else if (r.type === 'freezer') s.spot('a freezer', x, y, z, 12, L.compressor(0.4, 47), 0.5);
        else if (r.type === 'kitchen' || r.type === 'kitchenette') s.spot('a fridge', x, y, z, 7, L.compressor(0.25, 60), 0.35);
        else if (r.type === 'mcc' || r.type === 'control') s.spot('the cabinets', x, y, z, 14, L.motor(47, 0.25, 0.8, 2400), 0.4);
      }
    });
    // what machinery gives off (js/level.ts map.fx: world coordinates, y above its floor)
    for (const fx of map.fx || []) {
      const y = (fx.gy || 0) + (fx.y || 1);
      if (fx.kind === 'steam' || fx.kind === 'jet') s.spot('steam', fx.x, y, fx.z, 14, L.bed({ noise: 'white', vol: 0.3, hp: 2500, swell: { rate: 0.4, depth: 0.5 }, mono: true }), 0.4);
      else if (fx.kind === 'embers') s.spot('a fire', fx.x, y, fx.z, 12, L.bed({ noise: 'brown', vol: 0.35, lp: 320, swell: { rate: 0.5, depth: 0.6 }, mono: true }), 0.4);
    }
  }

  // ---- what plays ----
  // Each loop's kind, by the L builder that made it, so a scene can play some kinds and not others. ONLY: the kinds that
  // play (null: everything). For now just the winds and the hums (and the machines that hum: fans, compressors, tubes,
  // and the crickets), while their sound's being settled; events, the noise beds, crowds, music and traffic are off.
  const LOOP_KIND = new WeakMap<AmbLoop, string>();
  for (const k of Object.keys(L) as (keyof typeof L)[]) {
    const f = L[k] as (...a: never[]) => AmbLoop;
    (L as Record<string, unknown>)[k] = (...a: never[]) => { const l = f(...a); LOOP_KIND.set(l, k); return l; };
  }
  // (a one-shot plays if 'events' is in ONLY, or its own name in E as 'event:<name>': 'event:car')
  const EVENT_NAME = new Map<AmbPlay, string>(Object.entries(E).map(([k, f]) => [f, k]));
  let ONLY: Set<string> | null = new Set(['wind', 'hum', 'motor', 'compressor', 'fluorescent', 'crickets', 'traffic', 'city', 'event:car']);
  const plays = (l: AmbLoop) => !ONLY || ONLY.has(LOOP_KIND.get(l) || '');

  // ---- a scene ----
  // Each bus (what's inside, what's out of doors) reaches you two ways: along its path through the level's openings (its
  // level and how bright from js/acoustics.ts listen: a door ajar, a broken window, a doorway beside you), and through
  // the walls themselves (always a little, and dull). Both go into the room you're in: its reverberation (a generated
  // impulse response for the zone's RT60 and size), crossfaded as you go from room to room.
  function scene(c: BaseAudioContext, dest: AudioNode, name: string, o: AmbOpts, map: LvMap | null): AmbScene {
    const out = gain(c, 0), inBus = gain(c, 1), outBus = gain(c, 1), verbIn = gain(c, 1);
    // (a way's path in two parts: wide, all round you, and placed at the opening it comes in by: the further that opening,
    // the more of it comes from there; standing in it, it's all round you)
    // (and the all-round part, and the walls', from a ring of four places round you in the world, so as you turn your
    // head the place turns round you: its left feeds the west and north, its right the east and south. The same, not
    // delayed copies: a copy a few ms late summed back in each ear combs the sound, hollow and metallic, and the combing
    // shifts as you turn)
    const ring = (): AmbRing => {
      const split = c.createChannelSplitter(2), inp = gain(c, 1), ps: PannerNode[] = [];
      inp.channelCount = 2; inp.channelCountMode = 'explicit'; inp.connect(split);
      for (let k = 0; k < 4; k++) {
        const pn = c.createPanner(), g = gain(c, Math.SQRT1_2);
        pn.panningModel = 'equalpower'; pn.rolloffFactor = 0;
        split.connect(g, k % 2 === 0 ? 0 : 1); chain(g, pn); pn.connect(out); pn.connect(verbIn); ps.push(pn);
      }
      return { inp, ps };
    };
    const way = (bus: GainNode, wallHz: number): AmbWay => {
      const lp = filt(c, 'lowpass', 20000), g = gain(c, 0), dg = gain(c, 0), pan = c.createPanner(), wlp = filt(c, 'lowpass', wallHz), wg = gain(c, 0), r = ring();
      pan.panningModel = 'equalpower'; pan.rolloffFactor = 0; // (its level is the path's: the panner only places it)
      chain(bus, lp, g, r.inp); chain(lp, dg, pan); chain(bus, wlp, wg, r.inp);
      pan.connect(out); pan.connect(verbIn);
      return { lp, g, dg, pan, wg, ring: r };
    };
    const inW = way(inBus, 220), outW = way(outBus, 180); // (through a wall: only the lowest of it, a rumble)
    out.connect(dest);
    const s: AmbScene = {
      c, out, inBus, outBus, inW, outW, verbIn, verbs: new Map(), stops: [], events: [], spots: [], name, map,
      bed(bus, bo) { this.loop(bus, L.bed(bo)); },
      hum(bus, f0, parts, vol, ho) { this.loop(bus, L.hum(f0, parts, vol, ho)); },
      loop(bus, f, vol = 1) { if (!plays(f)) return; const g = gain(c, vol); g.connect(bus === 'in' ? inBus : outBus); this.stops.push(f(c, g)); },
      every(bus, rate, ename, play, vol = 1) { if (ONLY && !ONLY.has('events') && !ONLY.has('event:' + EVENT_NAME.get(play))) return; this.events.push({ name: ename, bus, rate, play, vol, next: c.currentTime + wait(rate) * Math.random() }); },
      spot(sname, x, y, z, r, loop, vol = 1) { if (!plays(loop)) return; this.spots.push({ name: sname, x, y, z, r, loop, vol, on: false, seen: 1, zone: map ? G.Acoustics.zoneAt(map, x, y, z) : -1 }); },
    };
    const rec = R[name] || R.Warehouse;
    rec(s, o, map);
    if (map) spots(s, map);
    return s;
  }
  /** the time to the next of an event that comes rate times a minute (exponential: a Poisson process) */
  function wait(rate: number) { return -Math.log(1 - Math.random()) * 60 / Math.max(rate, 1e-3); }

  // ---- the room you're in: its reverberation ----
  // An impulse response made for a room: a few early reflections (sooner in a small room), then a dense tail decaying by
  // 60 dB in rt60, losing its highs as it goes (the air and soft things take them first). Unit energy, so the send's
  // level is the reverb's level. One per room size, kept per context.
  const irs = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
  function impulse(c: BaseAudioContext, rt60: number, mfp: number) {
    const key = rt60.toFixed(2) + '|' + mfp.toFixed(1);
    let m = irs.get(c); if (!m) { m = new Map(); irs.set(c, m); }
    const had = m.get(key); if (had) return had;
    const sr = c.sampleRate, len = Math.ceil(sr * Math.min(4, rt60 * 1.1 + 0.05)), b = c.createBuffer(2, len, sr);
    const pre = Math.min(0.04, mfp / 343); // (the first reflections: a mean free path away)
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lpState = 0, e = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, decay = Math.exp(-6.91 * t / rt60), fc = 9000 * Math.exp(-t / Math.max(0.25, rt60 * 0.45)) + 600;
        const a = Math.exp(-2 * Math.PI * fc / sr); lpState = a * lpState + (1 - a) * (Math.random() * 2 - 1);
        const onset = t < pre ? 0 : Math.min(1, (t - pre) / 0.015);
        d[i] = lpState * decay * onset;
      }
      // early reflections: a dozen discrete arrivals between the pre-delay and four mean free paths
      for (let k = 0; k < 12; k++) { const t = pre + Math.random() * (mfp * 4 / 343); const i = Math.floor(t * sr); if (i < len) d[i] += (Math.random() < 0.5 ? -1 : 1) * 0.15 * Math.exp(-6.91 * t / rt60); }
      for (let i = 0; i < len; i++) e += d[i] * d[i];
      const k = 1 / Math.sqrt(e || 1); for (let i = 0; i < len; i++) d[i] *= k;
    }
    m.set(key, b);
    return b;
  }
  /** the reverb for a zone (made on first use): a convolver from the scene's send to its out, at no level till it's the one you're in */
  // (its tail all round you, but more of it from where the room is: standing at one end of a hall, it rings from the
  // hall's length, not the wall behind you: part of it placed at the zone's middle, the more so the further that is)
  // (a room's measured response, js/acoustics.ts roomAt, when there is one: unit energy, the send setting its level)
  function verbFor(s: AmbScene, key: string, rt60: number, mfp: number, tr?: AcTrace | null) {
    let v = s.verbs.get(key);
    if (!v) {
      const c = s.c, cv = c.createConvolver(), g = gain(c, 0), wide = gain(c, 1), dg = gain(c, 0), pan = c.createPanner();
      cv.normalize = false; cv.buffer = tr ? G.Acoustics.impulse(c, tr, 1) : impulse(c, rt60, mfp);
      pan.panningModel = 'equalpower'; pan.rolloffFactor = 0;
      chain(s.verbIn, cv, g); chain(g, wide, s.out); chain(g, dg, pan, s.out);
      v = { g, cv, wide, dg, pan }; s.verbs.set(key, v);
    }
    return v;
  }

  // ---- where you are: what reaches you, how ----
  const trKeys = new Map<AcTrace, number>();
  interface AmbMix { inLvl: number; inLp: number; inWall: number; outLvl: number; outLp: number; outWall: number; key: string; rt60: number; mfp: number; wet: number; tr?: AcTrace | null; mid?: AmbPt; midDir?: number; inAt?: AmbPt | null; inDir?: number; outAt?: AmbPt | null; outDir?: number }
  /** a mix by hand (no level to listen in: the audition page, render()): k 0 indoors .. 1 out of doors */
  function mixByHand(k: number): AmbMix {
    const o = k > 0.5;
    return { inLvl: 1 - k, inLp: 20000, inWall: k * 0.12, outLvl: k, outLp: 20000, outWall: (1 - k) * 0.22, key: o ? 'out' : 'room', rt60: o ? 0.25 : 0.7, mfp: o ? 20 : 3.5, wet: o ? 0.04 : 0.2 };
  }
  /** the mix for someone at (x, y, z) in a level: the paths to the inside and to out of doors, and the room's reverb */
  function mixAt(s: AmbScene, map: LvMap, x: number, y: number, z: number): AmbMix {
    const Ac = G.Acoustics, d = Ac.of(map), { zone, reach } = Ac.listen(map, x, y, z);
    s.reach = reach; s.zone = zone ? zone.id : -1;
    if (!zone) return mixByHand(1);
    const bi = { level: 0, lp: 300, via: null as AcPortal | null }, bo = { level: 0, lp: 300, via: null as AcPortal | null };
    for (const [zi, r] of reach) { const b = d.zones[zi].out ? bo : bi; if (r.level > b.level) { b.level = r.level; b.lp = r.lp; b.via = r.via; } }
    // (how much of a way comes from its opening: none standing in it, most of it from across a room)
    const dir = (v: AcPortal | null) => (v ? G.U.clamp((Math.hypot(v.x - x, v.z - z) - 1) / 5, 0, 0.85) : 0);
    const anyIn = d.zones.some((q) => !q.out);
    const mfp = zone.out ? 20 : 4 * zone.volume / zone.surface, tr = zone.out ? null : Ac.roomAt(map, x, y, z);
    let tk = tr ? trKeys.get(tr) : undefined; if (tr && tk === undefined) { tk = trKeys.size + 1; trKeys.set(tr, tk); }
    return zone.out
      ? { inLvl: Math.sqrt(bi.level), inLp: bi.lp, inWall: anyIn ? 0.04 : 0, outLvl: 1, outLp: 20000, outWall: 0, key: 'out', rt60: 0.25, mfp, wet: 0.04, inAt: bi.via, inDir: dir(bi.via) }
      : { inLvl: 1, inLp: 20000, inWall: 0, outLvl: Math.sqrt(bo.level), outLp: bo.lp, outWall: 0.06, key: 'z' + zone.id + '|' + (tk || ''), rt60: tr ? tr.rt60 : zone.rt60, mfp, tr, wet: G.U.clamp(0.1 + 0.12 * (tr ? tr.rt60 : zone.rt60), 0.1, 0.42), outAt: bo.via, outDir: dir(bo.via),
        mid: { x: zone.cx, y: zone.y, z: zone.cz }, midDir: G.U.clamp((Math.hypot(zone.cx - x, zone.cz - z) - 2) / Math.max(4, Math.sqrt(zone.area)), 0, 0.3) }; // (no more than 0.3: a tail's mostly all round you)
  }
  /** the rings round where the listener is: west, north, east, south, 6 m off (they follow you, not your facing) */
  function placeRings(s: AmbScene, p: AmbPt, t: number, tc = 0.2) {
    const R = 6, at = [[-R, 0], [0, -R], [R, 0], [0, R]];
    for (const w of [s.inW, s.outW]) w.ring.ps.forEach((pn, k) => {
      pn.positionX.setTargetAtTime(p.x + at[k][0], t, tc); pn.positionY.setTargetAtTime(p.y, t, tc); pn.positionZ.setTargetAtTime(p.z + at[k][1], t, tc);
    });
  }
  function applyMix(s: AmbScene, m: AmbMix, t: number, tc = 0.5) {
    const set = (w: AmbWay, lvl: number, lp: number, wall: number, at: AmbPt | null | undefined, dir: number | undefined) => {
      const k = at ? dir || 0 : 0;
      w.g.gain.setTargetAtTime(lvl * Math.sqrt(1 - k), t, tc); w.dg.gain.setTargetAtTime(lvl * Math.sqrt(k), t, tc); // (equal power between the two)
      w.lp.frequency.setTargetAtTime(lp, t, tc); w.wg.gain.setTargetAtTime(wall, t, tc);
      if (at) { w.pan.positionX.setTargetAtTime(at.x, t, tc); w.pan.positionY.setTargetAtTime(at.y, t, tc); w.pan.positionZ.setTargetAtTime(at.z, t, tc); }
    };
    set(s.inW, m.inLvl, m.inLp, m.inWall, m.inAt, m.inDir);
    set(s.outW, m.outLvl, m.outLp, m.outWall, m.outAt, m.outDir);
    const cur = verbFor(s, m.key, m.rt60, m.mfp, m.tr), dk = m.mid ? m.midDir || 0 : 0;
    cur.wide.gain.setTargetAtTime(Math.sqrt(1 - dk), t, tc); cur.dg.gain.setTargetAtTime(Math.sqrt(dk), t, tc);
    if (m.mid) { cur.pan.positionX.setTargetAtTime(m.mid.x, t, tc); cur.pan.positionY.setTargetAtTime(m.mid.y, t, tc); cur.pan.positionZ.setTargetAtTime(m.mid.z, t, tc); }
    for (const [k, v] of s.verbs) v.g.gain.setTargetAtTime(k === m.key ? m.wet : 0, t, Math.max(tc, 0.4));
  }
  /** a spot as you hear it: how loud (amplitude), how bright, from where (the opening it comes in by, if it's not in your zone) */
  function spotHeard(s: AmbScene, sp: AmbSpot) {
    const r = s.reach && sp.zone >= 0 ? s.reach.get(sp.zone) : undefined;
    if (!r) {
      // not by any opening: through a wall on your own floor, faintly and dull; through a floor or a ceiling (a neighbour's
      // fridge upstairs), nothing: a slab's too much for a hum
      const d = s.map && G.Acoustics.of(s.map), mine = d && s.zone !== undefined && s.zone >= 0 ? d.zones[s.zone].f : -1, its = d && sp.zone >= 0 ? d.zones[sp.zone].f : -1;
      return { k: mine >= 0 && its >= 0 && mine !== its ? 0 : 0.12, lp: 300, at: { x: sp.x, y: sp.y, z: sp.z } };
    }
    const at = r.via ? { x: r.via.x, y: r.via.y, z: r.via.z } : { x: sp.x, y: sp.y, z: sp.z };
    return { k: Math.sqrt(r.level), lp: r.lp, at };
  }
  /** schedule a scene's events up to time `until` */
  function schedule(s: AmbScene, until: number) {
    const c = s.c;
    for (const e of s.events) while (e.next < until) {
      const at = Math.max(e.next, c.currentTime + 0.02), g = gain(c, e.vol);
      g.connect(e.bus === 'in' ? s.inBus : s.outBus);
      if (s.lisAt) here = s.lisAt(at);
      try { e.play(c, g, at, Math.random()); } catch (err) { console.warn('[ambience]', e.name, err); }
      setTimeout(() => g.disconnect(), (at - c.currentTime + 40) * 1000);
      e.next += wait(e.rate);
    }
  }
  function stopScene(s: AmbScene, t: number) {
    s.out.gain.cancelScheduledValues(t); s.out.gain.setTargetAtTime(0, t, 0.8);
    for (const f of s.stops) f(t + 2);
    for (const p of s.spots) if (p.stop) p.stop(t + 2);
    setTimeout(() => s.out.disconnect(), 5000);
  }
  /** a spot's nodes: its loop, a low-pass (what the walls and doors take), a panner, and a send to the room's reverb */
  function spotNodes(s: AmbScene, sp: AmbSpot) {
    const c = s.c, g = gain(c, 0), lp = filt(c, 'lowpass', 18000), pan = c.createPanner(), send = gain(c, 0.6);
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 2; pan.rolloffFactor = 1.2; pan.maxDistance = sp.r * 2;
    pan.positionX.value = sp.x; pan.positionY.value = sp.y; pan.positionZ.value = sp.z;
    chain(g, lp, pan, s.out); lp.connect(send); send.connect(s.verbIn);
    sp.stop = sp.loop(c, g); sp.g = g; sp.lp = lp; sp.pan = pan;
  }
  function spotSet(sp: AmbSpot, h: { k: number; lp: number; at: { x: number; y: number; z: number } }, d: number, t: number, tc = 0.3) {
    sp.lp!.frequency.setTargetAtTime(h.lp, t, tc);
    sp.g!.gain.setTargetAtTime(d > sp.r * 1.1 ? 0 : sp.vol * Math.max(0, 1 - Math.max(0, d / sp.r - 0.8) * 5) * h.k, t, tc); // (fading out over its last fifth)
    const pan = sp.pan!; pan.positionX.setTargetAtTime(h.at.x, t, tc); pan.positionY.setTargetAtTime(h.at.y, t, tc); pan.positionZ.setTargetAtTime(h.at.z, t, tc);
  }

  // ---- gunshots, through the same acoustics (offline, for walkthroughs: js/gunaudio.ts plays the game's own) ----
  // The report as the synth renders it for the shooter's room (its own reverb in it), reaching you along the strongest
  // path through the openings (its level, how dull, and from the opening it comes in by), then ringing in your room
  // (the scene's reverb send); and the walls' echoes (js/gunaudio.ts echoTaps: the dry report replayed from each).
  function shotInto(s: AmbScene, map: LvMap, sh: AmbShot, track: { x: number; y: number; z: number; yaw: number }[], dt: number) {
    const GA = G.GunAudio, c = s.c, i = Math.min(track.length - 1, Math.max(0, Math.round(sh.t / dt))), lis = track[i];
    const src = sh.own ? { x: lis.x - Math.sin(lis.yaw) * 0.5, y: lis.y - 0.15, z: lis.z - Math.cos(lis.yaw) * 0.5 } : { x: sh.x, y: sh.y, z: sh.z };
    const dry = GA.dry.get(sh.id), buf = dry;
    if (!buf) return;
    const h = sh.own ? { k: 1, lp: 20000, at: src, same: true } : G.Acoustics.hear(map, src, lis); // (as js/gunaudio.ts play hears it)
    const d = Math.hypot(src.x - lis.x, src.y - lis.y, src.z - lis.z), near = G.U.clamp(Math.pow(2 / Math.max(d, 2), 0.6), 0.05, 1);
    const k = h.k, lpHz = Math.min(h.lp, G.U.clamp(18000 * Math.pow(0.5, d / 35), 1200, 19000)), at = h.at, base = GA.GAIN * (sh.vol || 1);
    const play = (b: AudioBuffer, when: number, amp: number, hz: number, p: { x: number; y: number; z: number } | null, send: number) => {
      const n = c.createBufferSource(), lp = filt(c, 'lowpass', hz), g = gain(c, amp);
      n.buffer = b; n.playbackRate.value = 0.97 + Math.random() * 0.06;
      if (p) { const pan = c.createPanner(); pan.panningModel = 'HRTF'; pan.rolloffFactor = 0; pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; chain(n, lp, pan, g, c.destination); }
      else chain(n, lp, g, c.destination);
      if (send) { const sg = gain(c, amp * send); lp.connect(sg); sg.connect(s.verbIn); }
      n.start(when);
    };
    play(buf, sh.t, base * k * (sh.own ? 1 : near), lpHz, sh.own ? null : at, 0);
    // its room: the shooter's room's measured response at its measured level, heard by the way that room reaches you
    const tr = G.Acoustics.roomAt(map, src.x, src.y, src.z);
    if (tr) {
      const n = c.createBufferSource(), cv = c.createConvolver(), lp = filt(c, 'lowpass', h.same ? 20000 : h.lp), g = gain(c, base * (h.same ? 1 : h.k));
      cv.normalize = false; cv.buffer = G.Acoustics.impulse(c, tr); n.buffer = dry;
      // (as js/gunaudio.ts: wide, and from another room a third of it placed at the opening it comes in by)
      chain(n, cv, lp); const wide = gain(c, h.same ? 1 : Math.sqrt(0.67)); chain(lp, wide, g, c.destination);
      if (!h.same) { const pan = c.createPanner(), dg = gain(c, Math.sqrt(0.33)); pan.panningModel = 'equalpower'; pan.rolloffFactor = 0; pan.positionX.value = at.x; pan.positionY.value = at.y; pan.positionZ.value = at.z; chain(lp, dg, pan, g); }
      n.start(sh.t);
    }
    // a shot from another room, come in, fills yours: your room's response to it, all round you, at the level it reaches you at
    const lt = h.same ? null : G.Acoustics.roomAt(map, lis.x, lis.y, lis.z);
    if (lt && lt !== tr) {
      const n = c.createBufferSource(), cv = c.createConvolver(), g = gain(c, base * k * near), lp = filt(c, 'lowpass', lpHz);
      cv.normalize = false; cv.buffer = G.Acoustics.impulse(c, lt); n.buffer = dry; chain(n, lp, cv, g, c.destination); n.start(sh.t);
    }
    // the echoes: only off walls the shot reaches you from (your zone's, or the one it comes in by)
    if (dry) for (const tp of GA.echoTaps(map as AcMap, src, lis).slice(0, 4)) play(dry, sh.t + tp.delay, base * tp.amp * k, tp.order === 1 ? 5000 : 2800, tp.pos, 0.3);
  }

  // ---- in the game ----
  let wasAboard = false;
  let bus: GainNode | null = null, cur: AmbScene | null = null, curMap: LvMap | null | undefined, outT = 0, spotT = 0, vol = 0.21; // (vol: the ambience under the master volume: 0.7 at first, a quarter off, then half of that, then 2 dB more under the shots)
  /** bring spots in range on (and the far ones off), heard by the way they reach you */
  function updateSpots(s: AmbScene, p: THREE.Vector3) {
    const c = s.c, t = c.currentTime, MAX = 6; // (the nearest few at most: a foundry's full of fires)
    const ds = s.spots.map((sp) => Math.hypot(sp.x - p.x, sp.y - p.y, sp.z - p.z)), near = new Set(s.spots.map((_, i) => i).filter((i) => ds[i] < s.spots[i].r * 1.1).sort((a, b) => ds[a] - ds[b]).slice(0, MAX));
    for (let i = 0; i < s.spots.length; i++) {
      const sp = s.spots[i], want = near.has(i);
      if (want && !sp.on) { spotNodes(s, sp); sp.on = true; }
      else if (!want && sp.on) { sp.on = false; const g = sp.g!; g.gain.setTargetAtTime(0, t, 0.8); sp.stop!(t + 2); setTimeout(() => g.disconnect(), 4000); }
      if (sp.on) spotSet(sp, spotHeard(s, sp), ds[i], t);
    }
  }
  return {
    E, L, RECIPES: R,
    /** which kinds of loop play (L's names, and 'events' for the one-shots); null: everything. Takes effect from the next scene */
    setOnly(kinds: string[] | null) { ONLY = kinds ? new Set(kinds) : null; },
    get only() { return ONLY ? [...ONLY] : null; },
    /** the ambience's own level (under the master volume) */
    setVolume(v: number) { vol = v; if (bus) bus.gain.setTargetAtTime(v, bus.context.currentTime, 0.2); },
    get scene() { return cur; },
    /** the send into the reverb of the room you're in (the current scene's), for the guns (js/gunaudio.ts); null with no scene */
    reverbIn(): AudioNode | null { return cur ? cur.verbIn : null; },
    /** start a place by name (or stop, with null): what the game calls through update(), and the audition page directly */
    play(name: string | null, o: AmbOpts = { night: false, hub: false }, map: LvMap | null = null) {
      // (in the ambience's own audio context, its own render thread: js/audio.ts ambCtx)
      const A = G.Audio;
      if (!A.ambCtx || !A.ambMaster) return null;
      const c = A.ambCtx;
      if (!bus) { bus = gain(c, vol); bus.connect(A.ambMaster); }
      if (cur) { stopScene(cur, c.currentTime); cur = null; }
      if (!name) return null;
      cur = scene(c, bus, name, o, map);
      if (map && G.Acoustics) G.Acoustics.prewarm(map); // (its rooms measured in idle time: js/acoustics.ts)
      cur.out.gain.setTargetAtTime(1, c.currentTime, 1.2); // (fades in)
      applyMix(cur, mixByHand(map ? 0 : 1), c.currentTime, 0.01); placeRings(cur, here, c.currentTime, 0.01);
      schedule(cur, c.currentTime + 1);
      return cur;
    },
    /** each frame: the place that's up (a level's, the hangar's; none on the menu), where you are in it, the next events */
    update(dt: number, map: LvMap | null, cam: THREE.Camera | null) {
      const A = G.Audio;
      if (!A.ambCtx || A.ambCtx.state !== 'running') return;
      if (map !== curMap) {
        curMap = map; wasAboard = false;
        this.play(map && map.theme ? map.theme.name : null, { night: !!map && !!map.night, hub: !!map && !!map.hub }, map);
      }
      if (!cur) return;
      const c = A.ambCtx;
      // aboard the helicopter (in its seat, flying in or on the pad), nothing of the place outside: the rotors and the
      // cabin are all there is (out as you board, back as you step down)
      const aboard = !!(G.Me && G.Me.seat != null);
      if (aboard !== wasAboard) { wasAboard = aboard; const g = cur.out.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(g.value, c.currentTime); g.setTargetAtTime(aboard ? 0 : 1, c.currentTime, aboard ? 0.3 : 0.8); }
      if (cam) { const p = cam.position; here = { x: p.x, y: p.y, z: p.z }; cur.lisAt = () => here; }
      if (cam && (outT -= dt) <= 0) { outT = 0.2; const p = cam.position; if (map) applyMix(cur, mixAt(cur, map, p.x, p.y, p.z), c.currentTime); placeRings(cur, here, c.currentTime); }
      if (map && cam && (spotT -= dt) <= 0) { spotT = 0.25; updateSpots(cur, cam.position); }
      schedule(cur, c.currentTime + 0.6);
    },
    /** a manual mix for the audition page: 0 indoors .. 1 outdoors */
    setOutdoors(k: number) { if (cur) applyMix(cur, mixByHand(k), cur.c.currentTime, 0.3); },
    /**
     * A walk through a level, rendered offline: the place's sound as heard by someone following `track` (a point every
     * `dt` s: where they are and which way they face), the indoor/outdoor mix and the sources in the level (panned,
     * nearer and further, behind walls or not) all following them. For walkthrough videos (tools/walkthrough.js).
     */
    async renderWalk(map: LvMap, track: { x: number; y: number; z: number; yaw: number }[], dt: number, o?: AmbOpts, shots: AmbShot[] = [], doorsAt?: (t: number) => void) {
      const secs = track.length * dt + 0.5, c = new OfflineAudioContext(2, Math.ceil(44100 * secs), 44100);
      const s = scene(c, c.destination, map.theme ? map.theme.name : 'Warehouse', o || { night: !!map.night, hub: !!map.hub }, map), l = c.listener;
      s.out.gain.value = 1;
      s.lisAt = (t: number) => { const q = track[Math.min(track.length - 1, Math.max(0, Math.round(t / dt)))]; return { x: q.x, y: q.y, z: q.z }; };
      const reaches: Map<number, AcReach>[] = [];
      track.forEach((p, i) => {
        const t = i * dt;
        if (i % 2 === 0) { if (doorsAt) doorsAt(t); applyMix(s, mixAt(s, map, p.x, p.y, p.z), t, i ? 0.35 : 0.01); placeRings(s, p, t, i ? 0.2 : 0.01); reaches[i] = s.reach!; }
        l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
        l.forwardX.setValueAtTime(-Math.sin(p.yaw), t); l.forwardY.setValueAtTime(0, t); l.forwardZ.setValueAtTime(-Math.cos(p.yaw), t);
        l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
      });
      // the sources the walk comes near: on from the start, their level following the walk (as updateSpots does live)
      for (const sp of s.spots) {
        const ds = track.map((p) => Math.hypot(sp.x - p.x, sp.y - p.y, sp.z - p.z));
        if (Math.min(...ds) > sp.r) continue;
        spotNodes(s, sp);
        track.forEach((_, i) => { if (i % 2) return; s.reach = reaches[i]; spotSet(sp, spotHeard(s, sp), ds[i], i * dt, 0.35); });
      }
      schedule(s, secs);
      s.out.gain.value = vol; // (the ambience under the guns as the game has it: its bus at vol, the shots at G.GunAudio.GAIN)
      for (const sh of shots) { if (doorsAt) doorsAt(sh.t); shotInto(s, map, sh, track, dt); }
      if (doorsAt) doorsAt(0);
      return c.startRendering();
    },
    /** the first `secs` of a place, rendered offline (stereo): to check its levels, or to listen to without a game running */
    async render(name: string, secs = 20, k = 0.5, o: AmbOpts = { night: false, hub: false }) {
      const c = new OfflineAudioContext(2, Math.ceil(44100 * secs), 44100), s = scene(c, c.destination, name, o, null);
      s.out.gain.value = 1; here = { x: 0, y: 1.6, z: 0 }; s.lisAt = () => here; applyMix(s, mixByHand(k), 0, 0.01); placeRings(s, here, 0, 0.01); schedule(s, secs);
      return c.startRendering();
    },
  };
})();
G.Ambience = G_Ambience;
interface GameModules { Ambience: typeof G_Ambience; }
