'use strict';
// Physics-synthesized gunshots, ported from tactical_game (src/gunAudio.ts + src/acoustics.ts).
//
// Every report comes from the gunshot synthesizer (js/gunshot-synth.js, window.GunshotSynth).
// Each weapon maps to interior-ballistics inputs (G.GUN_SPECS), and the room the shot is fired
// in maps to the synth's environment controls via a ring of raycasts. Two-stage caching:
//   precompute(source)  — dry per-layer stems (gun + ammo + mic). Cached per weapon.
//   place(source, room) — room reverb + a fixed close-listener reference. Cached per
//                         weapon + quantised room signature.
// The placed buffer is then positioned in 3D (HRTF panner, distance gain, air absorption,
// wall occlusion), so moving around never re-renders anything. Until a room render is ready
// the dry render plays; until that exists, the old procedural shot (G.Audio.shot) plays.
G.GunAudio = {
  // Fixed reference listener baked into every placed buffer: right at the shooter.
  REF: { lisBearing: 105, lisDist: 1.2 },
  MIC: { micSim: true, micGain: 1.0, micHardness: 1.0, micAgc: 0.08 },
  CASING: 0, // spent cases are simulated and heard where they land (js/casings.js), not baked into the shot
  GAIN: 0.55,          // level trim for synth buffers vs. the other effects
  // The synth's mic-overload stage evens out loudness, so a suppressed render peaks as high as an
  // open one (its longer gas tail even raises RMS). Apply the suppressor's level drop at playback.
  SUP_GAIN: 0.25,
  MAX_VOICES: 28,
  CEIL_M: G.Level.WALL_H,

  sources: new Map(),  // weapon id -> Promise<source>
  bufs: new Map(),     // weapon|room key -> AudioBuffer
  dry: new Map(),      // weapon id -> AudioBuffer
  pending: new Set(),
  queue: [],
  busy: false,
  voices: 0,

  available() { return !!(window.GunshotSynth && (window.OfflineAudioContext || window.webkitOfflineAudioContext)); },

  // ------------------------------------------------------------ acoustics
  // Ring of rays from the shooter to the nearest walls -> area, perimeter, corridor-ness,
  // openness -> synth environment preset + Sabine RT60. Memoised per tile per map.
  acousticsAt(map, x, z) {
    const L = G.Level, tx = Math.floor(x / L.TS), tz = Math.floor(z / L.TS);
    map._acoustics = map._acoustics || new Map();
    const memo = map._acoustics.get(tz * map.W + tx);
    if (memo) return memo;
    const cx = (tx + 0.5) * L.TS, cz = (tz + 0.5) * L.TS;
    const RAYS = 24, FAR = 80, OPEN_M = 26, clamp = G.U.clamp;
    const dist = [];
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      dist.push(L.raycast(map, cx, 1.5, cz, Math.cos(a), 0, Math.sin(a), FAR).t);
    }
    const dA = (Math.PI * 2) / RAYS;
    let area = 0, perim = 0;
    for (let i = 0; i < RAYS; i++) {
      const d0 = dist[i], d1 = dist[(i + 1) % RAYS];
      area += 0.5 * d0 * d1 * Math.sin(dA);
      perim += Math.sqrt(Math.max(0, d0 * d0 + d1 * d1 - 2 * d0 * d1 * Math.cos(dA)));
    }
    let longM = 0, shortM = Infinity;
    for (let i = 0; i < RAYS / 2; i++) {
      const span = dist[i] + dist[i + RAYS / 2];
      longM = Math.max(longM, span); shortM = Math.min(shortM, span);
    }
    const openFrac = dist.filter((d) => d > OPEN_M).length / RAYS;
    const aspect = longM / Math.max(shortM, 0.5);
    let env;
    if (aspect >= 2.4 && shortM <= 6) env = 'hall';
    else if (area <= 250) env = 'room';
    else if (area <= 800) env = 'concrete';
    else env = 'warehouse';
    // Surface hardness comes from the level theme; long sightlines leak energy away.
    const envReflect = clamp((map.theme.reflect || 0.32) - 0.22 * openFrac, 0.1, 0.45);
    const envMix = clamp(0.2 - 0.14 * openFrac, 0.05, 0.2);
    const V = area * this.CEIL_M, S = 2 * area + perim * this.CEIL_M;
    const alpha = clamp(0.55 - 0.5 * envReflect, 0.18, 0.6);
    const rt60 = clamp((0.161 * V) / Math.max(S * alpha, 1e-3), 0.1, 1.6);
    const out = { env, rt60, envReflect, envMix };
    map._acoustics.set(tz * map.W + tx, out);
    return out;
  },
  // Invert the synth's "space size" control (RT60 = base * (0.45 + 1.6 * size)).
  sizeForRt60(env, rt60) {
    const base = window.GunshotSynth.ENVIRONMENTS[env].rt60 || 0;
    return base > 0 ? G.U.clamp((rt60 / base - 0.45) / 1.6, 0, 1) : 0.5;
  },
  roomSig(map, x, z) {
    const a = this.acousticsAt(map, x, z), q = (v, s) => +(Math.round(v / s) * s).toFixed(2);
    return { env: a.env, envSize: q(this.sizeForRt60(a.env, a.rt60), 0.2), envReflect: q(a.envReflect, 0.25), envMix: q(a.envMix, 0.2) };
  },
  sigKey(sig) { return `${sig.env}|${sig.envSize}|${sig.envReflect}|${sig.envMix}`; },

  // ------------------------------------------------------------ rendering (serial queue)
  // One render at a time keeps the main thread smooth while a level is being prewarmed.
  enqueue(key, job, urgent) {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    const item = { key, job };
    if (urgent) this.queue.unshift(item); else this.queue.push(item);
    this.pump();
  },
  pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const { key, job } = this.queue.shift();
    job().catch((e) => console.warn('gunshot render failed', key, e)).finally(() => {
      this.pending.delete(key);
      this.busy = false;
      setTimeout(() => this.pump(), 0);
    });
  },
  // sound keys: "weaponId:barrelInches:muzzleDevice" from a build (js/parts.js), or a plain weapon id
  spec(vid) { return vid ? G.Gunsmith.soundSpec(vid) : null; },
  sourceParams(id) {
    const g = this.spec(id);
    return Object.assign({
      barrel: g.barrel, caliber: g.caliber, muzzleDevice: g.muzzleDevice, pressure: g.pressure, grain: g.grain,
      bulletWeight: g.bulletWeight, boltSim: true, boltMass: g.boltMass, boltLoudness: g.boltLoudness,
      actionType: g.actionType, shotCount: g.shotCount, caseMaterial: g.caseMaterial, caseLength: g.caseLength,
    }, this.MIC);
  },
  placeParams(id, sig) {
    const g = this.spec(id);
    return Object.assign({}, sig, this.REF, { masterDb: 0, casing: this.CASING, caseMaterial: g.caseMaterial, caseLength: g.caseLength, boltSim: true });
  },
  getSource(id) {
    let s = this.sources.get(id);
    if (!s) { s = window.GunshotSynth.precompute(this.sourceParams(id)); this.sources.set(id, s); }
    return s;
  },
  buildDry(id, urgent) {
    if (this.dry.has(id)) return;
    const dryPlace = { env: 'none', envSize: 0, envReflect: 0, envMix: 0 };
    this.enqueue('dry:' + id, () => this.getSource(id)
      .then((src) => window.GunshotSynth.place(src, this.placeParams(id, dryPlace)))
      .then((buf) => { this.dry.set(id, buf); }), urgent);
  },
  build(id, sig, urgent) {
    const key = id + '|' + this.sigKey(sig);
    if (this.bufs.has(key)) return;
    this.enqueue(key, () => this.getSource(id)
      .then((src) => window.GunshotSynth.place(src, this.placeParams(id, sig)))
      .then((buf) => { this.bufs.set(key, buf); }), urgent);
  },

  // Pre-render every distinct acoustic space in the level for the given weapons, so shots
  // rarely need the dry fallback. Room signatures collapse to a handful per level.
  prewarm(ids, map) {
    if (!this.available()) return;
    ids = [...new Set(ids)].filter((id) => this.spec(id));
    ids.forEach((id) => this.buildDry(id));
    const sigs = new Map();
    const step = Math.max(1, Math.round(4 / G.Level.TS)); // a sample every ~4 m
    for (let tz = 1; tz < map.H - 1; tz += step) for (let tx = 1; tx < map.W - 1; tx += step) {
      if (map.t[tz * map.W + tx] !== 0) continue;
      const sig = this.roomSig(map, (tx + 0.5) * G.Level.TS, (tz + 0.5) * G.Level.TS);
      sigs.set(this.sigKey(sig), sig);
    }
    for (const id of ids) for (const sig of sigs.values()) this.build(id, sig);
  },

  // ------------------------------------------------------------ geometric echoes
  // The baked room reverb is a generic tail picked from the room type. On top of it, trace the actual
  // level: rays leave the gun in every direction, bounce off walls (up to twice), and any bounce point
  // that can see the listener is an echo path. Its extra length over the direct path sets the delay
  // (speed of sound), distance + wall absorption + how mirror-like the bounce is set the level, and the
  // echo is played from that wall. Closed doors block rays, so opening one changes what you hear.
  SOUND: 343,
  ECHO_RAYS: 48,
  echoCache: new Map(),
  debugEchoes: (() => { try { return new URLSearchParams(location.search).has('echoes'); } catch (e) { return false; } })(),

  echoTaps(map, src, lis) {
    const key = `${Math.round(src.x)},${Math.round(src.z)}|${Math.round(lis.x)},${Math.round(lis.z)}|${map.doorVer || 0}`;
    const cached = this.echoCache.get(key);
    if (cached && cached.map === map) return cached.taps;
    const L = G.Level, K = this.ECHO_RAYS;
    const refl = 0.55 + (map.theme.reflect || 0.32); // share of pressure a wall throws back (harder themes ring more)
    const y = G.U.clamp(src.y, 0.5, 3.5), ly = lis.y;
    const direct = Math.hypot(lis.x - src.x, ly - y, lis.z - src.z);
    const rayNorm = Math.sqrt(8 / K); // each ray stands for a slice of the wavefront
    const bins = new Map();
    const add = (pos, path, amp, order, hops) => {
      const delay = (path - direct) / this.SOUND;
      // < 20 ms fuses with the direct sound (the room reverb already covers it); > 0.6 s is negligible here
      if (delay < 0.02 || delay > 0.6 || amp < 0.008) return;
      const b = Math.round(delay / 0.012);
      const cur = bins.get(b);
      if (!cur) bins.set(b, { delay, amp, pos, order, hops });
      else {
        if (amp > cur.amp) { cur.pos = pos; cur.delay = delay; cur.order = order; cur.hops = hops; }
        cur.amp = Math.hypot(cur.amp, amp); // arrivals in the same bin add incoherently
      }
    };
    for (let i = 0; i < K; i++) {
      const a = ((i + 0.5) / K) * Math.PI * 2;
      let dx = Math.cos(a), dz = Math.sin(a), ox = src.x, oz = src.z, travelled = 0, energy = 1;
      const hops = [{ x: src.x, y, z: src.z }];
      for (let order = 1; order <= 2; order++) {
        const h = L.raycast(map, ox, y, oz, dx, 0, dz, 60);
        if (!h.n || h.n[1] !== 0) break;
        const nx = h.n[0], nz = h.n[2];
        const px = ox + dx * h.t + nx * 0.05, pz = oz + dz * h.t + nz * 0.05;
        travelled += h.t;
        energy *= refl;
        const dot = dx * nx + dz * nz, rx = dx - 2 * dot * nx, rz = dz - 2 * dot * nz;
        hops.push({ x: px, y, z: pz });
        const tlx = lis.x - px, tly = ly - y, tlz = lis.z - pz, tl = Math.hypot(tlx, tly, tlz);
        if (tl > 0.3 && L.los(map, px, y, pz, lis.x, ly, lis.z)) {
          const spec = Math.max(0, (rx * tlx + rz * tlz) / tl); // 1 = mirror bounce straight at the listener
          const path = travelled + tl;
          const amp = energy * rayNorm * (0.2 + 0.8 * Math.pow(spec, 8)) * Math.pow(2 / Math.max(path, 2), 0.6);
          add({ x: px, y, z: pz }, path, amp, order, hops.slice());
        }
        ox = px; oz = pz; dx = rx; dz = rz;
      }
    }
    const taps = [...bins.values()].sort((p, q) => q.amp - p.amp).slice(0, 6);
    if (this.echoCache.size > 400) this.echoCache.clear();
    this.echoCache.set(key, { map, taps });
    return taps;
  },
  drawEchoes(taps, lis) {
    const V = (p) => new THREE.Vector3(p.x, p.y, p.z);
    for (const tp of taps) {
      const col = tp.order === 1 ? 0x40c0ff : 0xb070ff;
      for (let i = 0; i < tp.hops.length - 1; i++) G.R.tracer(V(tp.hops[i]), V(tp.hops[i + 1]), col, 0.012, 0.8);
      G.R.tracer(V(tp.pos), new THREE.Vector3(lis.x, lis.y - 0.3, lis.z), col, 0.012, 0.8);
    }
  },

  // ------------------------------------------------------------ playback
  // pos = world position of the muzzle, or null for the local player's own gun.
  // Returns false when no synth buffer exists yet so the caller can play a fallback.
  play(id, pos) {
    const A = G.Audio, ctx = A.ctx, map = G.Game.map;
    if (!ctx || !map || !this.spec(id) || !this.available()) return false;
    const cam = G.R.camera.position;
    const src = pos || cam;
    const sig = this.roomSig(map, src.x, src.z);
    let buf = this.bufs.get(id + '|' + this.sigKey(sig));
    if (!buf) {
      buf = this.dry.get(id);
      if (!buf) this.buildDry(id, true);
      this.build(id, sig, true);
      if (!buf) return false;
    }

    const base = this.GAIN * (this.spec(id).muzzleDevice === 'suppressor' ? this.SUP_GAIN : 1);
    let gain = base, occluded = false, d = 0, panPos = pos, portal = null;
    const taps = this.echoTaps(map, src, cam);
    if (this.debugEchoes) this.drawEchoes(taps, cam);
    if (pos) {
      d = cam.distanceTo(pos);
      gain *= G.U.clamp(Math.pow(2 / Math.max(d, 2), 0.6), 0.05, 1);
      occluded = !G.Level.los(map, cam.x, cam.y, cam.z, pos.x, pos.y, pos.z);
      // Heard round a corner: if an echo path exists, the shot seems to come from that opening and is
      // much less muffled than sound going through a wall.
      if (occluded) portal = taps.reduce((b, t) => (!b || t.amp > b.amp ? t : b), null);
      if (portal) panPos = portal.pos;
      if (occluded) gain *= portal ? 0.75 : 0.55;
      if (this.voices >= this.MAX_VOICES && gain < 0.3) return true; // drop distant shots under load
    }

    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = 0.97 + Math.random() * 0.06; // keeps automatic fire from sounding looped
    const g = ctx.createGain();
    g.gain.value = gain;
    if (pos) {
      // air absorption (halves every ~35 m, as in the synth's listener model) + muffling through walls
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(G.U.clamp(18000 * Math.pow(0.5, d / 35), 1200, 19000), occluded ? (portal ? 2500 : 900) : 20000);
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.rolloffFactor = 0; // loudness comes from the gain node
      if (pan.positionX) { pan.positionX.value = panPos.x; pan.positionY.value = panPos.y; pan.positionZ.value = panPos.z; }
      else pan.setPosition(panPos.x, panPos.y, panPos.z);
      s.connect(lp).connect(pan).connect(g);
    } else s.connect(g);
    g.connect(A.master);
    this.voices++;
    s.onended = () => { this.voices--; };
    s.start();

    // the echoes: the dry report (no baked reverb) replayed from each reflecting wall after its delay,
    // darker with every bounce. Under heavy fire only the two strongest are kept.
    const echoBuf = this.dry.get(id) || buf, now = ctx.currentTime;
    const n = this.voices > this.MAX_VOICES * 0.6 ? 2 : taps.length;
    for (let i = 0; i < n; i++) {
      const tp = taps[i];
      const es = ctx.createBufferSource();
      es.buffer = echoBuf;
      es.playbackRate.value = s.playbackRate.value;
      const elp = ctx.createBiquadFilter();
      elp.type = 'lowpass';
      elp.frequency.value = tp.order === 1 ? 5000 : 2800;
      const ep = ctx.createPanner();
      ep.panningModel = 'equalpower';
      ep.rolloffFactor = 0;
      if (ep.positionX) { ep.positionX.value = tp.pos.x; ep.positionY.value = tp.pos.y; ep.positionZ.value = tp.pos.z; }
      else ep.setPosition(tp.pos.x, tp.pos.y, tp.pos.z);
      const eg = ctx.createGain();
      eg.gain.value = base * tp.amp;
      es.connect(elp).connect(ep).connect(eg).connect(A.master);
      this.voices++;
      es.onended = () => { this.voices--; };
      es.start(now + tp.delay);
    }
    return true;
  },

  // Keep the Web Audio listener glued to the camera so HRTF panning tracks where you look.
  updateListener(cam) {
    const ctx = G.Audio.ctx;
    if (!ctx) return;
    const l = ctx.listener, p = cam.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(u.x, t); l.upY.setValueAtTime(u.y, t); l.upZ.setValueAtTime(u.z, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  },
};
