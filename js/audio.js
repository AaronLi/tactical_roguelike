'use strict';
// Fully synthesized sound effects (no asset files needed).
G.Audio = {
  ctx: null,
  master: null,
  noise: null,
  vol: 0.6,
  muted: false,
  samples: {},
  SAMPLES: ['pull_magazine', 'insert_magazine', 'rack_slide', 'drop_slide', 'drop_bolt', 'drop_magazine', 'door_open', 'door_close',
    // the highlights' studio audience (js/highlights.js; recordings credited in the README)
    'crowd_bed', 'crowd_cheer', 'crowd_cheer_big', 'crowd_roar', 'crowd_laugh', 'crowd_laugh_long', 'crowd_ooh', 'crowd_wow', 'crowd_awww'],
  lastShot: 0,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    this.master.connect(comp);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // recorded reload foley; fails quietly (e.g. when opened from file://) and the synthesized clicks are used instead
    for (const n of this.SAMPLES) {
      fetch('assets/audio/' + n + '.ogg').then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => { this.samples[n] = buf; }).catch(() => {});
    }
  },
  sample(name, vol = 0.7, rate = 1, dist = 0) {
    const buf = this.ctx && this.samples[name];
    if (!buf) return false;
    vol /= 1 + dist * 0.12;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
    return true;
  },
  // A recorded sound from a place in the world: panned in 3D (HRTF, against the listener that follows the
  // camera), quieter with distance, and muffled when there's a wall between you and it. pos: a Vector3.
  sampleAt(name, pos, vol = 0.7, rate = 1) {
    const buf = this.ctx && this.samples[name], cam = G.R && G.R.camera;
    if (!buf) return false;
    if (!pos || !cam) return this.sample(name, vol, rate, 0);
    const c = this.ctx, d = cam.position.distanceTo(pos), map = G.Game && G.Game.map;
    const blocked = map && !G.Level.los(map, cam.position.x, cam.position.y, cam.position.z, pos.x, pos.y, pos.z);
    const s = c.createBufferSource(), g = c.createGain(), lp = c.createBiquadFilter(), pan = c.createPanner();
    s.buffer = buf; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    g.gain.value = vol / (1 + d * 0.12) * (blocked ? 0.55 : 1);
    lp.type = 'lowpass'; lp.frequency.value = blocked ? 1100 : 18000;
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.rolloffFactor = 0; // (loudness comes from the gain)
    if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y, pos.z);
    s.connect(lp).connect(pan).connect(g); g.connect(this.master); s.start();
    return true;
  },
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  setMuted(m) { this.muted = m; this.setVolume(this.vol); },

  _noise(t, dur, f, q, gain, type = 'lowpass', fEnd) {
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
  tone(freq, dur, type = 'sine', gain = 0.2, freqEnd, delay = 0) {
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
  shot(snd, dist = 0) {
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
  // deafened (k 0..1): a high ringing that fades, and everything else muffled down and slowly coming back
  deafen(k) {
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
  hit(head) {
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
  spinUp(t) { this.tone(140, t, 'sawtooth', 0.05, 520); },
  // "POLICE!" — a barked, band-limited burst (no voice samples available); quieter from teammates
  shout(from) {
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
  order(from) {
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
  FOLEY: {
    zip: [[0.05, 'grab'], [0.38, 'thud'], [0.5, 'zipOut'], [0.84, 'zipTie']],
    bag: [[0.21, 'clink'], [0.33, 'rustle'], [0.5, 'rustle'], [0.63, 'tape'], [0.93, 'rustle']],
  },
  foley(kind, from, to, dist = 0, living) {
    const list = this.FOLEY[kind];
    if (!list || !this.ctx || dist > 25) return;
    for (const [at, snd] of list) if (from < at && to >= at) this[snd](dist); // bodies: the grab and the thud are the turn-over
  },
  _att(dist) { return 1 / (1 + dist * 0.15); },
  // A spent case hitting something (js/casings.js). Metal cases ring in a few inharmonic modes whose pitch
  // falls with the case's length (a 19 mm pistol case ~4.2 kHz, a 45 mm rifle case ~2.6 kHz, a 99 mm .50 case
  // ~1.3 kHz); steel rings lower and shorter, aluminium higher and deader. A shotgun hull is a hollow plastic
  // tock with a click from its brass head. Hard floors let it ring; wood damps it; carpet and grass leave
  // little but a tap. speed: the impact speed (m/s); pan: -1 left .. 1 right of you.
  // ---------------------------------------------------------------- rounds going past and landing
  // a short filtered noise burst into a panner: the building block for cracks, zips and impacts
  _burst(out, t, f, q, g, dur, type = 'bandpass', fEnd) {
    if (!Number.isFinite(g) || !Number.isFinite(t)) return; // (a bad distance mustn't take down whatever made the sound)
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const gn = c.createGain(); gn.gain.setValueAtTime(Math.max(0.0006, g), t); gn.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(flt); flt.connect(gn); gn.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  },
  _out(pan) {
    const c = this.ctx, out = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    if (out.pan) out.pan.value = G.U.clamp(pan, -1, 1) * 0.85;
    out.connect(this.master);
    return out;
  },
  // A supersonic round passing: the shock wave's N-wave, a hard snap with almost no body, louder and sharper
  // the closer it passes (miss: metres). k: how big the round is (pistol ~0.55, rifle 1, .50 cal 1.5).
  crack(miss, pan, k = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, a = Math.min(1, 1.1 / (0.35 + miss)) * k, out = this._out(pan);
    this._burst(out, t, 4200, 0.6, 0.55 * a, 0.012, 'highpass');
    this._burst(out, t, 2400, 0.9, 0.45 * a, 0.02);
    if (k > 0.8) this._burst(out, t + 0.002, 700, 0.8, 0.22 * a * (k - 0.6), 0.05, 'lowpass'); // the heavier the round, the more it thumps
  },
  // A subsonic round passing: no crack, a quick falling zip of air
  zip(miss, pan) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, a = Math.min(1, 0.7 / (0.3 + miss)), out = this._out(pan);
    this._burst(out, t, 2600, 4, 0.18 * a, 0.16, 'bandpass', 700);
  },
  // A round landing near you, by what it hit: wall (plaster, concrete), wood (doors, furniture), metal, soft
  // ground (grass, earth, carpet), a body.
  impact(mat, dist, pan) {
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
  // where you're listening from, and how far right of you a point is (-1 .. 1)
  _ear(p) {
    const cam = G.R && G.R.camera;
    if (!cam) return null;
    const rel = new THREE.Vector3().subVectors(p, cam.position), d = rel.length(), right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    return { d, pan: d > 1e-4 ? rel.normalize().dot(right) : 0, cam: cam.position };
  },
  // A shot's path from `from` to `to`: if it passes close to you (and goes past or near you, not just
  // toward you from far behind), the crack, but only if it's still supersonic where it passes (its speed
  // from the gun, its load and how far it's come: G.roundSpeed); slower, a zip of air. am: the load.
  flyby(from, to, def, am) {
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
    if (v <= G.SOUND_SPEED) return this.zip(miss, pe.pan);
    // the crack: bigger rounds louder (and the heavy ones thump), barely-supersonic ones softer
    const size = def.cls === 'RAIL' ? 1.6 : ['12.7/99', '8.6/69'].includes(cal) ? 1.5 : am !== 'slug' && def.cls === 'SG' ? 0.5 : (G.CALIBERS[cal] || {}).group === 'pistol' ? 0.6 : 1;
    this.crack(miss, pe.pan, size * G.U.clamp((v / G.SOUND_SPEED - 1) * 3, 0.35, 1));
  },
  // a round's impact point: heard if it's close, as whatever it hit
  impactAt(p, kind) {
    const e = this._ear(p);
    if (!e || e.d > 15) return;
    let mat = 'wall';
    if (kind === 'blood') mat = 'body';
    else if (kind === 'armor') mat = 'metal';
    else if (G.Game && G.Game.map) {
      const map = G.Game.map, L = G.Level, tx = Math.floor(p.x / L.TS), tz = Math.floor(p.z / L.TS), fm = L.floorMap(map, L.floorAt(map, p.x, p.y, p.z)), tile = L.tile(fm, tx, tz);
      if (p.y - (fm.fy || 0) < 0.06) { const s = G.Casings.surface(map, p.x, p.z, fm.fy || 0); mat = s === 'grass' || s === 'carpet' ? 'soft' : s === 'wood' ? 'wood' : 'wall'; } // (on the floor of whichever floor it's on)
      else if (tile === 3) mat = 'wood'; // a door
      else if (tile === 2 || tile === 4) mat = 'wood'; // furniture, fences
    }
    this.impact(mat, e.d, e.pan);
  },
  // pos: where it landed (a Vector3): placed there in 3D (HRTF against the listener that follows the camera: left and
  // right, in front and behind, above and below), muffled if there's a wall between you and it. Without it, just a pan.
  casing(dist, mat, len, surf, speed, pan = 0, pos = null) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, soft = surf === 'carpet' || surf === 'grass';
    const a = this._att(dist) * Math.min(1, speed / 2.2) * (soft ? 0.3 : 1);
    if (a < 0.004) return;
    let out;
    const cam = pos && G.R && G.R.camera;
    if (cam) {
      const map = G.Game && G.Game.map, blocked = map && !G.Level.los(map, cam.position.x, cam.position.y, cam.position.z, pos.x, pos.y + 0.03, pos.z);
      const pn = c.createPanner(), lp = c.createBiquadFilter(), g = c.createGain();
      pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.rolloffFactor = 0; // (loudness comes from the gain)
      if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; } else pn.setPosition(pos.x, pos.y, pos.z);
      lp.type = 'lowpass'; lp.frequency.value = blocked ? 1400 : 20000; g.gain.value = blocked ? 0.6 : 1;
      out = c.createGain(); out.connect(lp); lp.connect(pn); pn.connect(g); g.connect(this.master);
    } else {
      out = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
      if (out.pan) out.pan.value = pan * 0.8;
      out.connect(this.master);
    }
    const strike = (f, q, g, dur) => {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = q;
      const gn = c.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      src.connect(flt); flt.connect(gn); gn.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    };
    if (mat === 'plastic') {
      strike(soft ? 420 : 820, 1.6, 0.16 * a, soft ? 0.03 : 0.06);
      if (!soft) strike(3200, 4, 0.03 * a, 0.03);
      return;
    }
    const f0 = 4200 * Math.pow(19 / len, 0.6) * (mat === 'steel' ? 0.88 : mat === 'aluminum' ? 1.15 : 1) * (0.96 + Math.random() * 0.08);
    const ring = (soft ? 0.025 : surf === 'wood' ? 0.1 : surf === 'carpet' ? 0.03 : 0.3) * (mat === 'steel' ? 0.55 : mat === 'aluminum' ? 0.45 : 1) * Math.pow(len / 45, 0.35);
    const g0 = 0.075 * a;
    for (const [m, k] of [[1, 1], [2.71, 0.45], [5.15, 0.22], [8.9, 0.1]]) {
      if (f0 * m > 16000) continue;
      const o = c.createOscillator(); o.frequency.value = f0 * m;
      const gn = c.createGain(); gn.gain.setValueAtTime(g0 * k, t); gn.gain.exponentialRampToValueAtTime(0.0005, t + ring / Math.sqrt(m));
      o.connect(gn); gn.connect(out); o.start(t); o.stop(t + ring + 0.05);
    }
    strike(soft ? 1400 : 5500, 0.9, g0 * 0.9, 0.012); // the contact itself
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
