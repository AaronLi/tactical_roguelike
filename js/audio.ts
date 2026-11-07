'use strict';
// Fully synthesized sound effects (no asset files needed).
type FoleyKind = 'zip' | 'bag'; // a hands-on action (FOLEY)
type FoleySound = 'grab' | 'thud' | 'zipOut' | 'zipTie' | 'clink' | 'rustle' | 'tape'; // its sounds, by name
type ImpactMat = 'body' | 'metal' | 'wood' | 'soft' | 'wall'; // what a round heard landing hit (impact)
const G_Audio = {
  ctx: null as unknown as AudioContext,
  master: null as unknown as GainNode,
  noise: null as unknown as AudioBuffer,
  vol: 0.6,
  muted: false,
  samples: {} as Record<string, AudioBuffer>,
  SAMPLES: ['pull_magazine', 'insert_magazine', 'rack_slide', 'drop_slide', 'drop_bolt', 'drop_magazine', 'door_open', 'door_close',
    // the highlights' studio audience (js/highlights.ts; recordings credited in the README)
    'crowd_bed', 'crowd_cheer', 'crowd_cheer_big', 'crowd_roar', 'crowd_laugh', 'crowd_laugh_long', 'crowd_ooh', 'crowd_wow', 'crowd_awww'],
  lastShot: 0,
  // The handling sounds' trim (a magazine, the action, a door: the recorded foley here and the synthesized bank,
  // js/handling.ts): 3 dB under where they were set, nearer the ambience, further under the shots.
  HANDLING: 0.7,
  /** your own gun's handling (in your hands: sample, and js/handling.ts at you): back at the level it was set at
   *  (1 / HANDLING), where the others' are 3 dB under it */
  HANDLING_OWN: 1 / 0.7,
  // ---------------------------------------------------------------- keeping up
  // Is the audio thread keeping up? Its clock (ctx.currentTime) runs at real time while it renders in time; when there's
  // more live sound than it can render (a belt dumped: shots, their echoes, every case's bounce), it falls behind, the
  // sound skips, and given long enough some browsers stop it. load(): 0 keeping up .. 1 well behind, from how far the
  // clock lagged over the last half second or so; the least of what's playing (distant cases, echoes, others' steps)
  // is shed while it's behind (casing, js/gunaudio.ts play, js/footsteps.ts step).
  _lw: 0, _lc: 0, _load: 0,
  load() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return 0;
    const now = performance.now() / 1000, ct = c.currentTime;
    if (!this._lw) { this._lw = now; this._lc = ct; return this._load; }
    const dw = now - this._lw;
    if (dw >= 0.25) {
      const rate = (ct - this._lc) / dw; // (1: in time)
      this._load = rate < 0.97 ? G.U.clamp((1 - rate) * 4, 0, 1) : this._load * 0.6; // (eases off once it's caught up)
      if (dw > 2) this._load = 0; // (the page was in the background: not the audio's doing)
      this._lw = now; this._lc = ct;
    }
    return this._load;
  },

  // The master's way out: a compressor (all of it, under -14 dB) into the speakers, and a tap after it for the watchdog.
  _comp: null as DynamicsCompressorNode | null,
  _tap: null as AnalyserNode | null,
  _tapBuf: null as Float32Array<ArrayBuffer> | null,
  _hush: null as GainNode | null,
  /** the whole game's level after the compressor (+6 dB: the volume setting can come down that much), into a limiter
   *  that keeps it from clipping */
  OUTPUT: 2,
  _up: null as GainNode | null,
  _outChain() {
    const c = this.ctx;
    if (this._comp) { try { this.master.disconnect(this._comp); this._comp.disconnect(); } catch { /* (gone already) */ } }
    if (!this._hush) {
      // the compressor -> the make-up gain -> the hush -> a limiter (fast, hard: nothing over -1 dBFS) -> the speakers
      const up = c.createGain(); up.gain.value = this.OUTPUT;
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -1; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
      this._hush = c.createGain(); this._hush.gain.value = this._hushed ? 0 : 1;
      up.connect(this._hush); this._hush.connect(lim); lim.connect(c.destination);
      this._up = up;
    }
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(this._up!);
    this.master.connect(comp);
    const tap = c.createAnalyser(); tap.fftSize = 1024; comp.connect(tap);
    this._comp = comp; this._tap = tap; this._tapBuf = new Float32Array(tap.fftSize);
  },
  // Everything hushed while the loading screen's up (js/game.ts veil): the level being built under it, the hangar's
  // hall and ambience starting, the shaders compiling in stutters, all unheard; out in a moment, back in over ~1 s as
  // it lifts. After the compressor, so the volume and the mute (master) are untouched.
  _hushed: false,
  hush(on: boolean) {
    this._hushed = on;
    const h = this._hush, c = this.ctx;
    if (!h || !c) return;
    const t = c.currentTime;
    h.gain.cancelScheduledValues(t); h.gain.setValueAtTime(h.gain.value, t);
    h.gain.setTargetAtTime(on ? 0 : 1, t, on ? 0.03 : 0.3);
  },
  // A watchdog on the sound coming out, twice a second (init). Sound that blanks out and stays out has a few causes, each
  // put right here and said in the console ('[audio] ...') with what was playing:
  //   a NaN (an unstable filter, a bad level) reaching the compressor: its state goes NaN and it gives silence for good,
  //     long after what made it has stopped; the compressor's rebuilt;
  //   the context suspended or interrupted (the device changed, the OS took it): resumed;
  //   its clock stopped though it says it's running: said (a reload's the cure);
  //   the audio thread falling behind real time (more live sound than it can render: load()): said, with how far.
  _wd: { t: 0, ct: 0, behindSaid: 0, stallSaid: 0 },
  watch() {
    const c = this.ctx;
    if (!c) return;
    const now = performance.now() / 1000, w = this._wd, live = () => `(gunshot voices ${G.GunAudio ? G.GunAudio.voices : '?'}, cases ${this._caseVoices}, steps ${G.Footsteps ? G.Footsteps.voices : '?'})`;
    if (c.state !== 'running') {
      console.warn(`[audio] the context is ${c.state}: resuming ${live()}`);
      c.resume().catch(() => {});
      w.t = 0; return;
    }
    if (this._tap && this._tapBuf) {
      this._tap.getFloatTimeDomainData(this._tapBuf);
      let bad = 0; for (let i = 0; i < this._tapBuf.length; i++) if (!Number.isFinite(this._tapBuf[i])) bad++;
      if (bad) { console.warn(`[audio] NaN in the output (${bad} samples): the compressor rebuilt ${live()}`); this._outChain(); }
    }
    if (w.t && now - w.t < 2) { // (a gap of seconds: the page was in the background, not the audio's doing)
      const rate = (c.currentTime - w.ct) / (now - w.t);
      if (rate < 0.02 && now - w.stallSaid > 10) { w.stallSaid = now; console.warn(`[audio] the audio clock has stopped though the context is running ${live()}`); }
      else if (rate < 0.9 && now - w.behindSaid > 5) { w.behindSaid = now; console.warn(`[audio] the audio thread is behind: rendering at ${Math.round(rate * 100)}% of real time ${live()}`); }
    }
    w.t = now; w.ct = c.currentTime;
  },

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    this._outChain();
    setInterval(() => this.watch(), 500);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // recorded reload foley; fails quietly (e.g. when opened from file://) and the synthesized clicks are used instead
    if (G.Footsteps) G.Footsteps.init(); // (the synthesized footsteps: js/footsteps.ts)
    for (const n of this.SAMPLES) {
      fetch('assets/audio/' + n + '.ogg').then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => { this.samples[n] = buf; }).catch(() => {});
    }
  },
  // A recorded handling sound in your own hands (a magazine, the action, a door you kick): at you, and in the room
  // you're in (route).
  sample(name: string, vol = 0.7, rate = 1, dist = 0) {
    const buf = this.ctx && this.samples[name];
    if (!buf) return false;
    vol *= this.HANDLING * (dist ? 1 : this.HANDLING_OWN) / (1 + dist * 0.12); // (at you: your own hands)
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    this.route(s, null, vol, vol * this.NEAR_HANDS);
    s.start();
    return true;
  },
  // A recorded sound from a place in the world: panned in 3D (HRTF, against the listener that follows the camera),
  // quieter with distance, heard the way it reaches you and in its room (route). pos: a Vector3.
  sampleAt(name: string, pos: THREE.Vector3, vol = 0.7, rate = 1) {
    const buf = this.ctx && this.samples[name], cam = G.R && G.R.camera;
    if (!buf) return false;
    if (!pos || !cam) return this.sample(name, vol, rate, 0);
    vol *= this.HANDLING;
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    this.route(s, pos, vol / (1 + cam.position.distanceTo(pos) * 0.12), vol * this.NEAR_PLACED);
    s.start();
    return true;
  },
  // How far from the thing making it a handling sound's level is set for, m: your own gun's ~0.4 m from your ears, a
  // sound placed in the world is levelled as from ~0.5 m. The rooms' measured responses (js/acoustics.ts) are against
  // the direct sound at 1 m, so a sound's share into its room is its level times that distance (a close sound's direct
  // stands that much further above the room than a gunshot's does).
  NEAR_HANDS: 0.4,
  NEAR_PLACED: 0.5,
  // A sound's way to your ears, through the level's acoustics (js/gunaudio.ts play does the same for the reports):
  // src: the sound, gain: its level as it reaches you before the walls (its distance in it), send: its level at the
  // source scaled to 1 m (what goes into its room's response). pos null: at you (your own hands), straight to your
  // ears, and your room's response round you. Else from the way it reaches you (js/acoustics.ts hear: as loud and as
  // dull as the openings on it let it be, from the one it comes in by), its own room's response heard the same way, and
  // a sound from another room filling yours. Without the acoustics (or out of a level), muffled behind a wall and dry.
  route(src: AudioNode, pos: { x: number; y: number; z: number } | null, gain: number, send: number) {
    const c = this.ctx, map = G.Game && G.Game.map, cam = G.R && G.R.camera && G.R.camera.position, GA = G.GunAudio;
    const g = c.createGain(); g.connect(this.master);
    const ac = !!(G.Acoustics && GA && map && cam && G.Game.phase === 'level');
    const into = (from: AudioNode, k: number, v: { cv: ConvolverNode } | null) => {
      if (!v || k <= 0) return;
      const sg = c.createGain(); sg.gain.value = k; from.connect(sg); sg.connect(v.cv);
    };
    if (!pos || !cam) {
      g.gain.value = gain; src.connect(g);
      if (ac) into(src, send, GA.listenerVerb(c, map));
      return;
    }
    const lp = c.createBiquadFilter(), pan = c.createPanner();
    lp.type = 'lowpass'; pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.rolloffFactor = 0; // (loudness comes from the gain)
    let at = pos;
    if (ac) {
      const h = G.Acoustics.hear(map, pos, cam);
      gain *= h.k; lp.frequency.value = h.same ? 20000 : h.lp; at = h.at;
      const rv = GA.roomVerb(c, map, pos, h);
      into(src, send, rv);
      if (!h.same) { const lv = GA.listenerVerb(c, map); if (lv !== rv) into(g, 1, lv); }
    } else {
      const blocked = map && !G.Level.los(map, cam.x, cam.y, cam.z, pos.x, pos.y, pos.z);
      if (blocked) gain *= 0.55;
      lp.frequency.value = blocked ? 1100 : 18000;
    }
    if (pan.positionX) { pan.positionX.value = at.x; pan.positionY.value = at.y; pan.positionZ.value = at.z; } else pan.setPosition(at.x, at.y, at.z);
    g.gain.value = gain;
    src.connect(lp); lp.connect(pan); pan.connect(g);
  },
  setVolume(v: number) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  setMuted(m: boolean) { this.muted = m; this.setVolume(this.vol); },

  _noise(t: number, dur: number, f: number, q: number, gain: number, type: BiquadFilterType = 'lowpass', fEnd?: number) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = c.createBiquadFilter();
    flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },
  tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, freqEnd?: number | null, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  // dist = metres from the listener (0 for your own gun)
  shot(snd: { vol: number; len: number; f: number; boom: number } | null | undefined, dist = 0) {
    if (!this.ctx || !snd) return;
    const now = this.ctx.currentTime;
    const att = 1 / (1 + dist * 0.07);
    if (att < 0.03) return;
    const far = dist > 25;
    const v = snd.vol * att;
    this._noise(now, snd.len, far ? Math.min(snd.f, 900) : snd.f, 0.7, v * 0.9, 'lowpass', 300);
    this._noise(now, 0.03, 5000, 1, v * 0.5, 'highpass');
    if (snd.boom > 0) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      g.gain.setValueAtTime(v * snd.boom * 0.9, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      o.connect(g); g.connect(this.master); o.start(now); o.stop(now + 0.2);
    }
  },
  boom(dist = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, att = 1 / (1 + dist * 0.04);
    this._noise(now, 1.1, 1200, 0.5, 1.0 * att, 'lowpass', 80);
    this.tone(90, 0.7, 'sine', 0.9 * att, 25);
  },
  // a flashbang: a sharp, deafening crack
  flashbang(dist = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, att = 1 / (1 + dist * 0.05);
    this._noise(now, 0.35, 6000, 0.4, 1.3 * att, 'lowpass', 900);
    this._noise(now, 0.9, 900, 0.6, 0.6 * att, 'lowpass', 60);
    this.tone(140, 0.4, 'sine', 0.8 * att, 40);
  },
  // A thermobaric: the burster's sharp pop as it throws the fuel out, then, a moment later, the cloud lighting: a deep whump and a
  // long roar as it burns through the room (the afterburn), a rumble that goes on after the bang has gone
  thermobaric(dist = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, att = 1 / (1 + dist * 0.035), t1 = now + 0.12;
    this._noise(now, 0.12, 3000, 0.6, 0.5 * att, 'lowpass', 600);
    this._noise(t1, 0.5, 2200, 0.5, 1.3 * att, 'lowpass', 120);
    this._noise(t1, 1.0, 520, 0.7, 0.9 * att, 'lowpass', 90); // (the roar, in pieces: the noise buffer is a second and a half long)
    this._noise(t1 + 0.8, 1.0, 260, 0.7, 0.5 * att, 'lowpass', 45);
    this._noise(t1 + 0.1, 0.95, 900, 1.2, 0.35 * att, 'bandpass', 180);
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(70, t1); o.frequency.exponentialRampToValueAtTime(18, t1 + 1.8);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(1.1 * att, t1 + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t1 + 1.9);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(t1 + 2);
  },
  // a grenade's spoon flying off: the striker's snap and the lever's ping
  spoon() { this.tone(3400, 0.04, 'square', 0.06); this.tone(1900, 0.09, 'triangle', 0.07, 1500, 0.03); },
  // deafened (k 0..1): a high ringing that fades, and everything else muffled down and slowly coming back
  deafen(k: number) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, dur = 1.5 + 5.5 * k;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 3400 + Math.random() * 600; o.type = 'sine';
    g.gain.setValueAtTime(0.12 * k, now); g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + dur + 0.1);
    if (!this.muted) {
      const m = this.master.gain;
      m.cancelScheduledValues(now); m.setValueAtTime(this.vol * (1 - 0.8 * k), now + 0.05);
      m.linearRampToValueAtTime(this.vol, now + dur);
    }
  },
  rail(dist = 0) {
    if (!this.ctx) return;
    const att = 1 / (1 + dist * 0.06);
    this.tone(1800, 0.35, 'sawtooth', 0.12 * att, 120);
    this.shot(G.CLASS_SND.RAIL, dist);
  },
  click() { this.tone(1800, 0.03, 'square', 0.08); },
  dry() { this.tone(900, 0.04, 'square', 0.1); },
  reload() { this.tone(500, 0.05, 'square', 0.08); this.tone(320, 0.06, 'square', 0.08, null, 0.12); },
  shell() { this.tone(700, 0.04, 'square', 0.07); },
  hit(head: boolean) {
    if (head) { this.tone(2200, 0.12, 'sine', 0.22); this.tone(3300, 0.1, 'sine', 0.12); }
    else this.tone(1400, 0.05, 'square', 0.1);
  },
  kill() { this.tone(900, 0.08, 'triangle', 0.2); this.tone(1350, 0.14, 'triangle', 0.18, null, 0.06); },
  hurt() { if (!this.ctx) return; this._noise(this.ctx.currentTime, 0.15, 600, 1, 0.35); this.tone(160, 0.15, 'sawtooth', 0.12, 80); },
  armorHit() { if (!this.ctx) return; this._noise(this.ctx.currentTime, 0.08, 4000, 3, 0.25, 'bandpass'); },
  pickup() { this.tone(660, 0.08, 'triangle', 0.18); this.tone(990, 0.12, 'triangle', 0.18, null, 0.07); },
  buy() { this.tone(1200, 0.06, 'square', 0.1); this.tone(1600, 0.1, 'square', 0.1, null, 0.06); this.tone(2400, 0.18, 'triangle', 0.12, null, 0.12); },
  deny() { this.tone(220, 0.2, 'square', 0.12, 180); },
  down() { this.tone(400, 0.8, 'sawtooth', 0.15, 80); },
  revive() { this.tone(500, 0.1, 'triangle', 0.2); this.tone(750, 0.1, 'triangle', 0.2, null, 0.1); this.tone(1000, 0.2, 'triangle', 0.2, null, 0.2); },
  alarm() { for (let i = 0; i < 3; i++) this.tone(880, 0.18, 'square', 0.1, 660, i * 0.25); },
  extract() { this.tone(523, 0.2, 'triangle', 0.2); this.tone(659, 0.2, 'triangle', 0.2, null, 0.15); this.tone(784, 0.4, 'triangle', 0.2, null, 0.3); },
  laser() { this.tone(2400, 0.06, 'sine', 0.05); },
  // night vision flipped: the mount's detent clacking (down, then the tubes' faint whine as they power up; up, they're off)
  nvFlip(down: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.035, down ? 2200 : 2800, 2, 0.18, 'bandpass'); this.tone(down ? 420 : 520, 0.04, 'square', 0.05, null, 0.01);
    this._noise(t + 0.24, 0.03, 3200, 3, 0.16, 'bandpass'); this.tone(900, 0.03, 'square', 0.05, null, 0.25);
    if (down) this.tone(9800, 0.55, 'sine', 0.012, 12600, 0.28);
  },
  pin() { this.tone(2600, 0.05, 'square', 0.08); },
  chat() { this.tone(1500, 0.05, 'sine', 0.08); },
  // crossbow: string slap + a dull thump, deliberately quiet
  bow(dist = 0) {
    if (!this.ctx) return;
    const att = 1 / (1 + dist * 0.15);
    this.tone(180, 0.12, 'triangle', 0.25 * att, 90);
    this._noise(this.ctx.currentTime, 0.06, 1600, 2, 0.12 * att, 'bandpass');
  },
  // the iconic en-bloc clip ejecting from an empty Garand
  ping() { this.tone(2650, 0.35, 'sine', 0.14); this.tone(3980, 0.25, 'sine', 0.06); },
  spinUp(t: number) { this.tone(140, t, 'sawtooth', 0.05, 520); },
  // "POLICE!" — a barked, band-limited burst (no voice samples available); quieter from teammates
  shout(from: THREE.Vector3) {
    if (!this.ctx) return;
    const d = from && G.R ? G.R.camera.position.distanceTo(from) : 0, att = 1 / (1 + d * 0.08), t = this.ctx.currentTime;
    for (const [f, st] of [[620, 0], [480, 0.16], [700, 0.34]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), bp = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.5, t + st); o.frequency.linearRampToValueAtTime(f * 0.42, t + st + 0.14);
      bp.type = 'bandpass'; bp.frequency.value = f * 1.6; bp.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t + st); g.gain.linearRampToValueAtTime(0.22 * att, t + st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + st + 0.15);
      o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t + st); o.stop(t + st + 0.2);
    }
  },
  // a short barked command ("Turn around!"): two clipped syllables, lower than the full shout
  order(from: THREE.Vector3) {
    if (!this.ctx) return;
    const d = from && G.R ? G.R.camera.position.distanceTo(from) : 0, att = 1 / (1 + d * 0.08), t = this.ctx.currentTime;
    for (const [f, st, len] of [[520, 0, 0.13], [430, 0.17, 0.2]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), bp = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.48, t + st); o.frequency.linearRampToValueAtTime(f * 0.4, t + st + len);
      bp.type = 'bandpass'; bp.frequency.value = f * 1.5; bp.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t + st); g.gain.linearRampToValueAtTime(0.2 * att, t + st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + st + len);
      o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t + st); o.stop(t + st + len + 0.05);
    }
  },
  // a leader on the radio: the squelch of the key, a gruff bark (three clipped syllables, lower than a shout, through a narrow radio band),
  // the squelch again as it lets go; heard by everyone near enough (it's loud: he's shouting into it)
  radio(from: THREE.Vector3 | null) {
    if (!this.ctx) return;
    const d = from && G.R ? G.R.camera.position.distanceTo(from) : 0, att = 1 / (1 + d * 0.07), t = this.ctx.currentTime;
    this._noise(t, 0.07, 2400, 2, 0.16 * att, 'bandpass');
    for (const [f, st, len] of [[440, 0.12, 0.14], [380, 0.3, 0.12], [500, 0.46, 0.22]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), bp = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.4, t + st); o.frequency.linearRampToValueAtTime(f * 0.33, t + st + len);
      bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 2.5;
      g.gain.setValueAtTime(0.0001, t + st); g.gain.linearRampToValueAtTime(0.24 * att, t + st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + st + len);
      o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t + st); o.stop(t + st + len + 0.05);
    }
    this._noise(t + 0.74, 0.09, 2000, 2, 0.14 * att, 'bandpass');
  },
  // boot into a door: a heavy thump and the crack of the frame
  kick(dist = 0) {
    if (!this.ctx) return;
    const att = 1 / (1 + dist * 0.06), t = this.ctx.currentTime;
    this.tone(95, 0.25, 'sine', 0.8 * att, 40);
    this._noise(t, 0.18, 900, 0.8, 0.7 * att, 'lowpass', 200);
    this._noise(t, 0.06, 3000, 2, 0.35 * att, 'bandpass');
    this.sample('door_open', 0.7 * att, 1.7);
  },
  // Foley for hands-on actions, keyed by action kind: [progress, sound]. Each plays as the action passes its
  // mark: for my own actions, and for teammates' (from their state, attenuated by distance).
  FOLEY: <Record<FoleyKind, [number, FoleySound][]>>{
    zip: [[0.05, 'grab'], [0.38, 'thud'], [0.5, 'zipOut'], [0.84, 'zipTie']],
    bag: [[0.21, 'clink'], [0.33, 'rustle'], [0.5, 'rustle'], [0.63, 'tape'], [0.93, 'rustle']],
  },
  foley(kind: string, from: number, to: number, dist = 0, living?: any) {
    const list = this.FOLEY[kind as FoleyKind];
    if (!list || !this.ctx || dist > 25) return;
    for (const [at, snd] of list) if (from < at && to >= at) this[snd](dist); // bodies: the grab and the thud are the turn-over
  },
  _att(dist: number) { return 1 / (1 + dist * 0.15); },
  // A spent case hitting something (js/casings.ts). Metal cases ring in a few inharmonic modes whose pitch
  // falls with the case's length (a 19 mm pistol case ~4.2 kHz, a 45 mm rifle case ~2.6 kHz, a 99 mm .50 case
  // ~1.3 kHz); steel rings lower and shorter, aluminium higher and deader. A shotgun hull is a hollow plastic
  // tock with a click from its brass head. Hard floors let it ring; wood damps it; carpet and grass leave
  // little but a tap. speed: the impact speed (m/s); pan: -1 left .. 1 right of you.
  // ---------------------------------------------------------------- rounds going past and landing
  // a short filtered noise burst into a panner: the building block for cracks, zips and impacts
  _burst(out: AudioNode, t: number, f: number, q: number, g: number, dur: number, type: BiquadFilterType = 'bandpass', fEnd?: number) {
    if (!Number.isFinite(g) || !Number.isFinite(t)) return; // (a bad distance mustn't take down whatever made the sound)
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const gn = c.createGain(); gn.gain.setValueAtTime(Math.max(0.0006, g), t); gn.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(flt); flt.connect(gn); gn.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  },
  _out(pan: number) {
    const c = this.ctx, out: GainNode | StereoPannerNode = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    if ((out as StereoPannerNode).pan) (out as StereoPannerNode).pan.value = G.U.clamp(pan, -1, 1) * 0.85;
    out.connect(this.master);
    return out;
  },
  // A supersonic round passing: the shock wave's N-wave, a hard snap with almost no body, louder and sharper
  // the closer it passes (miss: metres). k: how big the round is (pistol ~0.55, rifle 1, .50 cal 1.5).
  crack(miss: number, pan: number, k = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, a = Math.min(1, 1.1 / (0.35 + miss)) * k, out = this._out(pan);
    this._burst(out, t, 4200, 0.6, 0.55 * a, 0.012, 'highpass');
    this._burst(out, t, 2400, 0.9, 0.45 * a, 0.02);
    if (k > 0.8) this._burst(out, t + 0.002, 700, 0.8, 0.22 * a * (k - 0.6), 0.05, 'lowpass'); // the heavier the round, the more it thumps
  },
  // A subsonic round passing: no crack, a quick falling zip of air
  zip(miss: number, pan: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, a = Math.min(1, 0.7 / (0.3 + miss)), out = this._out(pan);
    this._burst(out, t, 2600, 4, 0.18 * a, 0.16, 'bandpass', 700);
  },
  // A round landing near you, by what it hit: wall (plaster, concrete), wood (doors, furniture), metal, soft
  // ground (grass, earth, carpet), a body.
  impact(mat: ImpactMat, dist: number, pan: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, a = this._att(dist) * Math.min(1, 6 / (1 + dist)), out = this._out(Number.isFinite(pan) ? pan : 0);
    if (!(a >= 0.01)) return;
    if (mat === 'body') { this._burst(out, t, 900, 0.7, 0.5 * a, 0.07, 'lowpass', 300); this._burst(out, t, 2200, 1.2, 0.12 * a, 0.03); return; }
    if (mat === 'metal') { this._burst(out, t, 3800, 1.4, 0.3 * a, 0.03); for (const [f, g] of [[1900, 0.12], [2850, 0.08], [4100, 0.05]]) this.tone(f * (0.95 + Math.random() * 0.1), 0.25, 'sine', g * a); return; }
    if (mat === 'wood') { this._burst(out, t, 750, 3, 0.55 * a, 0.06); this._burst(out, t, 3000, 1, 0.15 * a, 0.015, 'highpass'); return; }
    if (mat === 'soft') { this._burst(out, t, 420, 0.8, 0.45 * a, 0.08, 'lowpass'); this._burst(out, t + 0.01, 1800, 0.7, 0.05 * a, 0.12, 'highpass'); return; }
    // a wall: the smack, then the grit pattering down
    this._burst(out, t, 1800, 0.9, 0.55 * a, 0.035, 'lowpass', 500);
    this._burst(out, t, 3600, 1.2, 0.2 * a, 0.02, 'highpass');
    this._burst(out, t + 0.02, 5000, 0.5, 0.06 * a, 0.25, 'highpass');
  },
  // a round going off something, close by: the whine of it tumbling away, falling in pitch
  ricochet(p: THREE.Vector3) {
    const e = this._ear(p);
    if (!this.ctx || !e || e.d > 40) return;
    const c = this.ctx, t = c.currentTime, a = this._att(e.d) * Math.min(1, 8 / (1 + e.d)), f0 = 2200 + Math.random() * 1800, dur = 0.25 + Math.random() * 0.3;
    if (!(a >= 0.01)) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (0.35 + Math.random() * 0.25), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14 * a, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this._out(e.pan)); o.start(t); o.stop(t + dur + 0.02);
  },
  // where you're listening from, and how far right of you a point is (-1 .. 1)
  _ear(p: THREE.Vector3) {
    const cam = G.R && G.R.camera;
    if (!cam) return null;
    const rel = new THREE.Vector3().subVectors(p, cam.position), d = rel.length(), right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    return { d, pan: d > 1e-4 ? rel.normalize().dot(right) : 0, cam: cam.position };
  },
  // A shot's path from `from` to `to`: if it passes close to you (and goes past or near you, not just
  // toward you from far behind), the crack, but only if it's still supersonic where it passes (its speed
  // from the gun, its load and how far it's come: G.roundSpeed); slower, a zip of air. am: the load.
  flyby(from: THREE.Vector3, to: THREE.Vector3, def: WeaponDef, am: string) {
    if (!this.ctx || !def || def.explosive || def.cls === 'BOW' || def.cls === 'GL') return;
    const e = this._ear(from);
    if (!e) return;
    const seg = new THREE.Vector3().subVectors(to, from), L = seg.length();
    if (L < 1e-3) return;
    const s = G.U.clamp(new THREE.Vector3().subVectors(e.cam, from).dot(seg) / (L * L), 0, 1);
    const near = from.clone().addScaledVector(seg, s), miss = near.distanceTo(e.cam);
    if (s <= 0.02 || miss > 5 || near.distanceTo(from) < 2) return; // not past you, too wide, or it's your own muzzle
    const pe = this._ear(near), cal = G.calOf(def), v = G.roundSpeed(def, am, near.distanceTo(from));
    if (v < 60) return;
    if (v <= G.SOUND_SPEED) return this.zip(miss, pe!.pan);
    // the crack: bigger rounds louder (and the heavy ones thump), barely-supersonic ones softer
    const size = def.cls === 'RAIL' ? 1.6 : ['12.7/99', '8.6/69'].includes(cal) ? 1.5 : G.baseAm(am) !== 'slug' && def.cls === 'SG' ? 0.5 : ((G.CALIBERS as Record<string, any>)[cal] || {}).group === 'pistol' ? 0.6 : 1;
    this.crack(miss, pe!.pan, size * G.U.clamp((v / G.SOUND_SPEED - 1) * 3, 0.35, 1));
  },
  // a round's impact point: heard if it's close, as whatever it hit
  impactAt(p: THREE.Vector3, kind: ImpactKind, fx?: ImpactFx) {
    const e = this._ear(p);
    if (!e || e.d > 15) return;
    let mat: ImpactMat = 'wall';
    if (kind === 'blood') mat = 'body';
    else if (kind === 'armor') mat = 'metal';
    else if (fx) mat = fx === 'metal' || fx === 'glass' ? 'metal' : fx === 'wood' ? 'wood' : fx === 'soft' || fx === 'soil' || fx === 'water' ? 'soft' : 'wall'; // (what it really hit: js/materials.ts)
    else if (G.Game && G.Game.map) {
      const map = G.Game.map, L = G.Level, tx = Math.floor(p.x / L.TS), tz = Math.floor(p.z / L.TS), fm = L.floorMap(map, L.floorAt(map, p.x, p.y, p.z)!), tile = L.tile(fm, tx, tz);
      if (p.y - (fm.fy || 0) < 0.06) { const s = G.Casings.surface(map, p.x, p.z, fm.fy || 0); mat = G.Audio.SOFT[s] ? 'soft' : s === 'wood' ? 'wood' : 'wall'; } // (on the floor of whichever floor it's on)
      else if (tile === 3) mat = 'wood'; // a door
      else if (tile === 2 || tile === 4) mat = 'wood'; // furniture, fences
    }
    this.impact(mat, e.d, e.pan);
  },
  // A case's ring, made once (per material, length, floor and take) and played as a clip: its modes as decaying sines
  // and its contact as a burst of band-passed noise, as the live synthesis built them node by node (a bounce was ~15
  // nodes; a belt dumped made a hundred oscillators a second). At unit level: the bounce's level is the clip's gain.
  _caseBufs: new Map<string, AudioBuffer>(),
  _caseVoices: 0,
  CASE_VOICES: 10,
  /** the cases' level trim (3 dB down on where they were set: under the shots) */
  CASE_GAIN: 0.7,
  _caseBuf(mat: CaseMat, len: number, surf: string, soft: boolean) {
    const fl = soft ? 'soft' : surf === 'wood' ? 'wood' : surf === 'carpet' ? 'carpet' : 'hard', take = Math.floor(Math.random() * 3);
    const key = mat + '|' + Math.round(len) + '|' + fl + '|' + take;
    let b = this._caseBufs.get(key);
    if (b) return b;
    const sr = this.ctx.sampleRate, rng = (() => { let x = (take + 1) * 2654435761 >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    // a strike: white noise through a band-pass (RBJ biquad), decaying exponentially to -64 dB over dur
    const strike = (d: Float32Array, f: number, q: number, g: number, dur: number) => {
      const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
      const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      const n = Math.min(d.length, Math.ceil((dur + 0.02) * sr)), k = Math.log(0.0005 / 1) / (dur * sr);
      for (let i = 0; i < n; i++) {
        const x = rng() * 2 - 1, y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        d[i] += y * g * Math.exp(k * i);
      }
    };
    if (mat === 'plastic') {
      b = this.ctx.createBuffer(1, Math.ceil(0.1 * sr), sr);
      const d = b.getChannelData(0);
      strike(d, soft ? 420 : 820, 1.6, 0.16, soft ? 0.03 : 0.06);
      if (!soft) strike(d, 3200, 4, 0.03, 0.03);
    } else {
      const f0 = 4200 * Math.pow(19 / len, 0.6) * (mat === 'steel' ? 0.88 : mat === 'aluminum' ? 1.15 : 1) * (0.97 + 0.06 * rng());
      const ring = (soft ? 0.025 : fl === 'wood' ? 0.1 : fl === 'carpet' ? 0.03 : 0.3) * (mat === 'steel' ? 0.55 : mat === 'aluminum' ? 0.45 : 1) * Math.pow(len / 45, 0.35);
      b = this.ctx.createBuffer(1, Math.ceil((ring + 0.05) * sr), sr);
      const d = b.getChannelData(0), g0 = 0.075;
      for (const [m, k] of [[1, 1], [2.71, 0.45], [5.15, 0.22], [8.9, 0.1]]) {
        if (f0 * m > 16000) continue;
        // (each mode falls to 0.0005 over ring/√m, as the live version's exponential ramp did)
        const n = Math.min(d.length, Math.ceil((ring / Math.sqrt(m)) * sr)), dec = Math.log(0.0005 / (g0 * k)) / n, w = 2 * Math.PI * f0 * m / sr, ph = rng() * 6.283;
        for (let i = 0; i < n; i++) d[i] += Math.sin(w * i + ph) * g0 * k * Math.exp(dec * i);
      }
      strike(d, soft ? 1400 : 5500, 0.9, g0 * 0.9, 0.012); // the contact itself
    }
    this._caseBufs.set(key, b);
    return b;
  },
  /** the floors (js/casings.ts surface()) a case lands dead on: no ring, a thud */
  SOFT: { carpet: 1, grass: 1, dirt: 1, soil: 1, leaves: 1, gravel: 1 } as Record<string, number>,
  // A spent case hitting something (js/casings.ts): its ring (_caseBuf), as loud as the bounce, placed where it landed in
  // 3D (HRTF against the listener that follows the camera), heard the way it reaches you and in its room (route); without
  // pos, just a pan. At most CASE_VOICES ring at once; while the audio's behind (load), only the near ones.
  casing(dist: number, mat: CaseMat, len: number, surf: string, speed: number, pan = 0, pos: THREE.Vector3 | null = null) {
    if (!this.ctx) return;
    const c = this.ctx, soft = !!this.SOFT[surf];
    const a = this.CASE_GAIN * this._att(dist) * Math.min(1, speed / 2.2) * (soft ? 0.3 : 1);
    if (a < 0.004 || this._caseVoices >= this.CASE_VOICES) return;
    if (this.load() > 0.15 && dist > 3) return; // (behind: the far ones go first)
    const src = c.createBufferSource();
    src.buffer = this._caseBuf(mat, len, surf, soft); src.playbackRate.value = 0.97 + Math.random() * 0.06;
    const cam = pos && G.R && G.R.camera;
    if (cam) {
      // (its strikes are levelled for the distance already, _att: its room's share is the level at the case, at 1 m)
      const g = c.createGain(); g.gain.value = a; src.connect(g);
      this.route(g, { x: pos!.x, y: pos!.y + 0.03, z: pos!.z }, 1, this.NEAR_PLACED / this._att(dist));
    } else {
      const out = c.createStereoPanner ? c.createStereoPanner() : c.createGain(), g = c.createGain();
      if ((out as StereoPannerNode).pan) (out as StereoPannerNode).pan.value = pan * 0.8;
      g.gain.value = a; src.connect(g); g.connect(out); out.connect(this.master);
    }
    this._caseVoices++;
    src.onended = () => { this._caseVoices--; };
    src.start();
  },
  grab(dist = 0) { const a = this._att(dist), t = this.ctx.currentTime; this._noise(t, 0.14, 900, 0.8, 0.22 * a, 'bandpass'); this._noise(t + 0.02, 0.08, 2600, 1.2, 0.08 * a, 'bandpass'); },
  // a body pushed onto the floor: the weight landing, then clothes and kit settling
  thud(dist = 0) {
    const a = this._att(dist), t = this.ctx.currentTime;
    this.tone(78, 0.2, 'sine', 0.55 * a, 42);
    this._noise(t, 0.24, 520, 0.8, 0.5 * a, 'lowpass', 140);
    this._noise(t + 0.06, 0.3, 1700, 0.7, 0.1 * a, 'bandpass');
  },
  // a tie pulled from the pouch and looped round the wrists: a plastic swish
  zipOut(dist = 0) { const a = this._att(dist), t = this.ctx.currentTime; this._noise(t, 0.13, 1600, 1.5, 0.12 * a, 'bandpass', 4200); this._noise(t + 0.15, 0.03, 3000, 3, 0.12 * a, 'bandpass'); },
  // the ratchet: clicks speeding up as the tie is cinched, then the final snap
  zipTie(dist = 0) {
    const a = this._att(dist);
    let t = this.ctx.currentTime;
    for (let i = 0; i < 13; i++) {
      t += 0.04 - i * 0.0017;
      this._noise(t, 0.012, 3000 + Math.random() * 1200, 5, 0.45 * a, 'bandpass');
      this._noise(t, 0.005, 7500, 1, 0.12 * a, 'highpass');
    }
    this._noise(t + 0.05, 0.04, 2200, 3, 0.35 * a, 'bandpass');
  },
  // a weapon picked up off the floor
  // glass breaking: the crack, a crash of noise, then pieces tinkling down
  glass(dist = 0) {
    if (!this.ctx) return;
    const a = this._att(dist), t = this.ctx.currentTime;
    this._noise(t, 0.08, 3500, 0.8, 0.5 * a, 'highpass');
    this._noise(t + 0.01, 0.35, 5200, 1.5, 0.28 * a, 'bandpass');
    for (let i = 0; i < 9; i++) this.tone(2800 + Math.random() * 3200, 0.05 + Math.random() * 0.08, 'triangle', (0.03 + Math.random() * 0.04) * a, null, 0.06 + Math.random() * 0.45);
  },
  clink(dist = 0) { const a = this._att(dist); this.tone(2300, 0.06, 'triangle', 0.07 * a); this.tone(3400, 0.05, 'triangle', 0.04 * a, null, 0.015); this._noise(this.ctx.currentTime, 0.05, 1200, 1, 0.12 * a, 'bandpass'); },
  // paper envelope handling: a few crinkly bursts
  rustle(dist = 0) {
    const a = this._att(dist), t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this._noise(t + Math.random() * 0.22, 0.025 + Math.random() * 0.04, 2200 + Math.random() * 3000, 1.6, 0.16 * a, 'bandpass');
  },
  // peeling the backing off the seal and pressing it down
  tape(dist = 0) { const a = this._att(dist), t = this.ctx.currentTime; this._noise(t, 0.22, 1300, 2, 0.2 * a, 'bandpass', 5200); this._noise(t + 0.26, 0.06, 800, 1, 0.18 * a, 'lowpass'); },
  heal() { this.tone(600, 0.25, 'sine', 0.15, 900); },
};
G.Audio = G_Audio;
interface GameModules { Audio: typeof G_Audio; }
