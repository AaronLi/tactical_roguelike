'use strict';
// Physics-synthesized gunshots, ported from tactical_game (src/gunAudio.ts + src/acoustics.ts).
//
// Every report comes from the gunshot synthesizer (js/gunshot-synth.ts, window.GunshotSynth).
// Each weapon maps to interior-ballistics inputs (G.GUN_SPECS), and the room the shot is fired
// in maps to the synth's environment controls via a ring of raycasts. Two-stage caching:
//   precompute(source)  — dry per-layer stems (gun + ammo + mic). Cached per weapon.
//   place(source, room) — room reverb + a fixed close-listener reference. Cached per
//                         weapon + quantised room signature.
// The placed buffer is then positioned in 3D (HRTF panner, distance gain, air absorption,
// wall occlusion), so moving around never re-renders anything. Until a room render is ready
// the dry render plays; until that exists, the old procedural shot (G.Audio.shot) plays.
type AcousticEnv = 'hall' | 'room' | 'concrete' | 'warehouse' | 'field' | 'urban' | 'canyon'; // a place's kind, from its shape (acousticsAt): the synth's own presets of that name (the last three out of doors)
interface RoomAcoustics { env: AcousticEnv; rt60: number; envReflect: number; envMix: number }
interface RoomSig { env: SynthEnv; envSize: number; envReflect: number; envMix: number } // a room, rounded off (what a render is cached by)
interface EchoPt { x: number; y: number; z: number }
interface EchoTap { delay: number; amp: number; pos: EchoPt; order: number; hops: EchoPt[] } // an echo path: its extra delay, its level, the wall it comes from, the bounces
type AcMap = LvMap & { _acoustics?: Map<string, RoomAcoustics> };
const G_GunAudio = {
  // Fixed reference listener baked into every placed buffer: right at the shooter.
  REF: { lisBearing: 105, lisDist: 1.2 },
  MIC: { micSim: true, micGain: 1.0, micHardness: 1.0, micAgc: 0.08 },
  CASING: 0, // spent cases are simulated and heard where they land (js/casings.ts), not baked into the shot
  GAIN: 0.87,          // level trim for synth buffers vs. the other effects (4 dB up on 0.55: the shots well over the ambience, the steps and the cases)
  // A suppressor's level drop is in its render (GunshotSynth.suppression: a compact can on a .308 takes off far less
  // than a long can on a 9 mm). First-round pop: a can that's gone quiet for a while fills back up with air, and the
  // oxygen burns with the next shot's gas: that shot is a few dB louder than the string that follows.
  FRP_GAIN: 1.6, FRP_COLD: 8,
  lastShot: new Map<string, number>(), // sound key + shooter -> when (s) they last fired it: the can's still full of gas
  MAX_VOICES: 28,
  CEIL_M: G.Level.WALL_H,

  sources: new Map<string, Promise<unknown>>(),  // weapon id -> Promise<source>
  bufs: new Map<string, AudioBuffer>(),     // weapon|room key -> AudioBuffer
  dry: new Map<string, AudioBuffer>(),      // weapon id -> AudioBuffer
  pending: new Set<string>(),
  queue: [] as { key: string; job: () => Promise<any> }[],
  busy: false,
  voices: 0,

  available() { return !!(window.GunshotSynth && (window.OfflineAudioContext || window.webkitOfflineAudioContext)); },

  // ------------------------------------------------------------ acoustics
  // Ring of rays from the shooter to the nearest walls -> area, perimeter, corridor-ness,
  // openness -> synth environment preset + Sabine RT60. Memoised per tile per map.
  // fy: the floor it's on (a building of several floors: the room upstairs, not the one below it)
  acousticsAt(map: AcMap, x: number, z: number, fy = 0): RoomAcoustics {
    const L = G.Level, tx = Math.floor(x / L.TS), tz = Math.floor(z / L.TS), key = tz * map.W + tx + '|' + fy.toFixed(1);
    map._acoustics = map._acoustics || new Map();
    const memo = map._acoustics.get(key);
    if (memo) return memo;
    const cx = (tx + 0.5) * L.TS, cz = (tz + 0.5) * L.TS;
    // The room's shape from rays round the shooter: 48 of them, each the further of two (at 1.5 m and at 2.6 m, over most
    // furniture), passing what stands in the room (shelves, counters, machines don't make it smaller) and the map's edge
    // walls (past them is open air). Its size is the zone's own (js/acoustics.ts: the whole room's floor, not what's in
    // sight of where you stand: up against a wall the rays fan out short and grazing, and the room read as a cupboard).
    const RAYS = 48, FAR = 80, OPEN_M = 26, clamp = G.U.clamp;
    const dist: number[] = [], opts = this.PROBE;
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      dist.push(Math.max(L.raycast(map, cx, fy + 1.5, cz, c, 0, s, FAR, opts).t, L.raycast(map, cx, fy + 2.6, cz, c, 0, s, FAR, opts).t));
    }
    const dA = (Math.PI * 2) / RAYS;
    let area = 0, perim = 0;
    for (let i = 0; i < RAYS; i++) {
      const d0 = dist[i], d1 = dist[(i + 1) % RAYS];
      area += 0.5 * d0 * d1 * Math.sin(dA);
      perim += Math.sqrt(Math.max(0, d0 * d0 + d1 * d1 - 2 * d0 * d1 * Math.cos(dA)));
    }
    // (its long and short: the lines through you across it, the 85th and 15th percentiles of their lengths, not the
    // longest and shortest: in a corner one ray clipping a door frame made a room a corridor)
    const spans: number[] = [];
    for (let i = 0; i < RAYS / 2; i++) spans.push(dist[i] + dist[i + RAYS / 2]);
    spans.sort((p, q) => p - q);
    const longM = spans[Math.floor(spans.length * 0.85)], shortM = spans[Math.floor(spans.length * 0.15)];
    const openFrac = dist.filter((d) => d > OPEN_M).length / RAYS;
    let aspect = longM / Math.max(shortM, 0.5), narrow = shortM;
    const Ac = G.Acoustics, zi = Ac ? Ac.zoneAt(map, cx, fy + 1.5, cz) : -1, zone = zi >= 0 ? Ac.of(map).zones[zi] : null;
    // (indoors, the room's own size and shape, its whole floor's, wherever in it you stand: the rays only say how open it is)
    if (zone && !zone.out) { area = zone.area; aspect = zone.longM / Math.max(zone.shortM, 0.5); narrow = zone.shortM; }
    let env: AcousticEnv;
    if (aspect >= 2.4 && narrow <= 6) env = 'hall';
    else if (area <= 250) env = 'room';
    else if (area <= 800) env = 'concrete';
    else env = 'warehouse';
    // Surface hardness comes from the level theme; long sightlines leak energy away.
    const envReflect = clamp((map.theme.reflect || 0.32) - 0.22 * openFrac, 0.1, 0.45);
    const envMix = clamp(0.2 - 0.14 * openFrac, 0.05, 0.2);
    const V = area * this.CEIL_M, S = 2 * area + perim * this.CEIL_M;
    const alpha = clamp(0.55 - 0.5 * envReflect, 0.18, 0.6);
    let rt60 = clamp((0.161 * V) / Math.max(S * alpha, 1e-3), 0.1, 1.6), refl = envReflect, mix = envMix;
    // With the level's acoustics (js/acoustics.ts): out of doors, an outdoor preset (the Sandia Crest's a canyon; buildings
    // near round you, a street; otherwise open ground), never an enclosed room's tail; indoors, the zone's own reverberation
    // (its real height, two storeys or a hangar's hall, and what its surfaces are), not a 4 m room's guess.
    if (zone && zone.out) {
      const near = dist.filter((d) => d < 30).length / RAYS;
      env = map.chasm || map.crest ? 'canyon' : near > 0.3 ? 'urban' : 'field';
      rt60 = window.GunshotSynth.ENVIRONMENTS[env].rt60;
      refl = clamp(0.15 + 0.3 * near, 0.1, 0.45); mix = clamp(0.06 + 0.12 * near, 0.05, 0.2);
    } else if (zone) rt60 = clamp(zone.rt60, 0.15, 3);
    const out = { env, rt60, envReflect: refl, envMix: mix };
    map._acoustics.set(key, out);
    return out;
  },
  // the height of the floor something at p (a muzzle, your eyes) is over
  floorY(map: AcMap, p: EchoPt) { return map.floors ? G.Level.floorMap(map, G.Level.floorAt(map, p.x, p.y - 1.4, p.z)!).fy || 0 : 0; },
  // Invert the synth's "space size" control (RT60 = base * (0.45 + 1.6 * size)).
  sizeForRt60(env: SynthEnv, rt60: number) {
    const base = window.GunshotSynth.ENVIRONMENTS[env].rt60 || 0;
    return base > 0 ? G.U.clamp((rt60 / base - 0.45) / 1.6, 0, 1) : 0.5;
  },
  roomSig(map: AcMap, x: number, z: number, fy = 0): RoomSig {
    const a = this.acousticsAt(map, x, z, fy), q = (v: number, s: number) => +(Math.round(v / s) * s).toFixed(2);
    return { env: a.env, envSize: q(this.sizeForRt60(a.env, a.rt60), 0.2), envReflect: q(a.envReflect, 0.25), envMix: q(a.envMix, 0.2) };
  },
  sigKey(sig: RoomSig) { return `${sig.env}|${sig.envSize}|${sig.envReflect}|${sig.envMix}`; },

  // ------------------------------------------------------------ rendering (serial queue)
  // One render at a time keeps the main thread smooth while a level is being prewarmed.
  enqueue(key: string, job: () => Promise<any>, urgent?: boolean) {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    const item = { key, job };
    if (urgent) this.queue.unshift(item); else this.queue.push(item);
    this.pump();
  },
  pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const { key, job } = this.queue.shift()!;
    job().catch((e: any) => console.warn('gunshot render failed', key, e)).finally(() => {
      this.pending.delete(key);
      this.busy = false;
      setTimeout(() => this.pump(), 0);
    });
  },
  // sound keys: "weaponId:barrelInches:muzzleDevice" from a build (js/parts.ts), or a plain weapon id
  spec(vid: string) { return vid ? G.Gunsmith.soundSpec(vid) : null; },
  sourceParams(id: string) {
    const g = this.spec(id);
    return Object.assign({
      barrel: g.barrel, caliber: g.caliber, muzzleDevice: g.muzzleDevice, pressure: g.pressure, grain: g.grain,
      bulletWeight: g.bulletWeight, boltSim: true, boltMass: g.boltMass, boltLoudness: g.boltLoudness,
      actionType: g.actionType, shotCount: g.shotCount, caseMaterial: g.caseMaterial, caseLength: g.caseLength, suppressor: g.suppressor,
    }, this.MIC);
  },
  placeParams(id: string, sig: RoomSig) {
    const g = this.spec(id);
    return Object.assign({}, sig, this.REF, { masterDb: 0, casing: this.CASING, caseMaterial: g.caseMaterial, caseLength: g.caseLength, boltSim: true });
  },
  getSource(id: string) {
    let s = this.sources.get(id);
    if (!s) { s = window.GunshotSynth.precompute(this.sourceParams(id)) as Promise<unknown>; this.sources.set(id, s); }
    return s;
  },
  // A render's end trimmed off where it's gone silent: the synth renders a fixed span (the source 0.6 s and the bolt's,
  // then the placement's padding), and the last ~0.35 s of a shot was digital silence, every voice and echo playing it
  // (its panner, filter and room send working, and its slot under MAX_VOICES held) for nothing. Cut 10 ms past the last
  // sample above -100 dBFS, those 10 ms faded out, so nothing that's heard changes.
  TRIM_FLOOR: 1e-5,
  trim(buf: AudioBuffer) {
    const sr = buf.sampleRate, nc = buf.numberOfChannels, chs: Float32Array[] = [];
    let last = 0;
    for (let c = 0; c < nc; c++) {
      const d = buf.getChannelData(c); chs.push(d);
      for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > this.TRIM_FLOOR) { last = i; break; }
    }
    const fade = Math.ceil(0.01 * sr), len = Math.min(buf.length, last + 1 + fade);
    if (len >= buf.length - fade) return buf;
    const out = new AudioBuffer({ numberOfChannels: nc, length: len, sampleRate: sr });
    for (let c = 0; c < nc; c++) {
      const d = chs[c].slice(0, len);
      for (let i = last + 1; i < len; i++) d[i] *= (len - i) / fade;
      out.copyToChannel(d, c);
    }
    return out;
  },
  buildDry(id: string, urgent?: boolean) {
    if (this.dry.has(id)) return;
    const dryPlace: RoomSig = { env: 'none', envSize: 0, envReflect: 0, envMix: 0 };
    this.enqueue('dry:' + id, () => this.getSource(id)
      .then((src: unknown) => window.GunshotSynth.place(src, this.placeParams(id, dryPlace)))
      .then((buf: AudioBuffer) => { this.dry.set(id, this.trim(buf)); }), urgent);
  },
  build(id: string, sig: RoomSig, urgent?: boolean) {
    const key = id + '|' + this.sigKey(sig);
    if (this.bufs.has(key)) return;
    this.enqueue(key, () => this.getSource(id)
      .then((src: unknown) => window.GunshotSynth.place(src, this.placeParams(id, sig)))
      .then((buf: AudioBuffer) => { this.bufs.set(key, this.trim(buf)); }), urgent);
  },

  // Pre-render every distinct acoustic space in the level for the given weapons, so shots
  // rarely need the dry fallback. Room signatures collapse to a handful per level.
  prewarm(ids: string[], map?: AcMap) {
    if (!this.available()) return;
    ids = [...new Set(ids)].filter((id) => this.spec(id));
    ids.forEach((id) => this.buildDry(id));
    if (G.Acoustics) { if (map) G.Acoustics.prewarm(map); return; } // (the rooms are measured, not rendered per room kind)
    const sigs = new Map<string, RoomSig>();
    const step = Math.max(1, Math.round(4 / G.Level.TS)); // a sample every ~4 m
    for (const fm of map!.floors || [map!]) for (let tz = 1; tz < map!.H - 1; tz += step) for (let tx = 1; tx < map!.W - 1; tx += step) {
      if (fm.t[tz * map!.W + tx] !== 0) continue;
      const sig = this.roomSig(map!, (tx + 0.5) * G.Level.TS, (tz + 0.5) * G.Level.TS, fm.fy || 0);
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
  /** a ray's options: the map's edge walls passed through (past them is open air: nothing comes back off them) */
  PAST_EDGE: { skip: (s: { edge?: boolean }) => !!s.edge } as LvRayOpts,
  /** sizing up a room: the edge walls passed, and what stands in it (furniture, shelving, machines: a 'prop') too */
  PROBE: { skip: (s: { edge?: boolean; kind?: string }) => !!s.edge || s.kind === 'prop' } as LvRayOpts,
  ECHO_RAYS: 48,
  echoCache: new Map<string, { map: AcMap; taps: EchoTap[] }>(),
  debugEchoes: (() => { try { return new URLSearchParams(location.search).has('echoes'); } catch (e) { return false; } })(),

  echoTaps(map: AcMap, src: EchoPt, lis: EchoPt): EchoTap[] {
    const key = `${Math.round(src.x)},${Math.round(src.y)},${Math.round(src.z)}|${Math.round(lis.x)},${Math.round(lis.y)},${Math.round(lis.z)}|${map.doorVer || 0}`;
    const cached = this.echoCache.get(key);
    if (cached && cached.map === map) return cached.taps;
    const L = G.Level, K = this.ECHO_RAYS;
    const refl = 0.55 + (map.theme.reflect || 0.32); // share of pressure a wall throws back (harder themes ring more)
    const fy = this.floorY(map, src), y = G.U.clamp(src.y, fy + 0.5, fy + 3.5), ly = lis.y; // (between the floor and ceiling of the shooter's own floor)
    const direct = Math.hypot(lis.x - src.x, ly - y, lis.z - src.z);
    const rayNorm = Math.sqrt(8 / K); // each ray stands for a slice of the wavefront
    const bins = new Map<number, EchoTap>();
    const add = (pos: EchoPt, path: number, amp: number, order: number, hops: EchoPt[]) => {
      const delay = (path - direct) / this.SOUND;
      // < 20 ms fuses with the direct sound (the room reverb already covers it); > 0.6 s is negligible here
      if (delay < 0.02 || delay > LATE || amp < (outside ? 0.0015 : 0.008)) return; // (out of doors a cliff or a building's front is a big, flat reflector: its slap back carries)
      const b = Math.round(delay / 0.012);
      const cur = bins.get(b);
      if (!cur) bins.set(b, { delay, amp, pos, order, hops });
      else {
        if (amp > cur.amp) { cur.pos = pos; cur.delay = delay; cur.order = order; cur.hops = hops; }
        cur.amp = Math.hypot(cur.amp, amp); // arrivals in the same bin add incoherently
      }
    };
    // (out of doors: a long way to the next wall, a building across the lot or the cliff over the gorge, so the rays go
    // further and the late arrivals count: the slap back off them, half a second and more after the shot)
    const outside = !!(G.Acoustics && (() => { const zi = G.Acoustics.zoneAt(map, src.x, src.y, src.z); return zi >= 0 && G.Acoustics.of(map).zones[zi].out; })());
    const FAR = outside ? 200 : 60, LATE = outside ? 1.5 : 0.6;
    // The rays, in 3D: a level ring, and indoors a ring tilted 35 degrees up and one straight up (the ceiling and the tops
    // of the walls: in a hall two storeys high or the hangar the slap off the roof comes 30-70 ms after the shot; in an
    // ordinary room it fuses with it). Each bounces off whatever it meets (wall, ceiling, floor) up to twice; the map's
    // edge walls it passes (open air past them). Out of doors there's only sky up there.
    const dirs: [number, number, number, number][] = []; // [x, y, z, weight]
    for (let i = 0; i < K; i++) { const a = ((i + 0.5) / K) * Math.PI * 2; dirs.push([Math.cos(a), 0, Math.sin(a), 1]); }
    if (!outside) {
      const e = 0.6, K2 = K >> 1;
      for (let i = 0; i < K2; i++) { const a = ((i + 0.5) / K2) * Math.PI * 2; dirs.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.7]); }
      dirs.push([0, 1, 0, 1]);
    }
    for (const [d0x, d0y, d0z, wgt] of dirs) {
      let dx = d0x, dy = d0y, dz = d0z, ox = src.x, oy = y, oz = src.z, travelled = 0, energy = wgt;
      const hops: EchoPt[] = [{ x: src.x, y, z: src.z }];
      for (let order = 1; order <= 2; order++) {
        const h = L.raycast(map, ox, oy, oz, dx, dy, dz, FAR, this.PAST_EDGE);
        if (!h.n || h.t >= FAR - 1e-3) break;
        const nx = h.n[0], ny = h.n[1], nz = h.n[2];
        const px = ox + dx * h.t + nx * 0.05, py = oy + dy * h.t + ny * 0.05, pz = oz + dz * h.t + nz * 0.05;
        travelled += h.t;
        energy *= refl;
        const dot = dx * nx + dy * ny + dz * nz, rx = dx - 2 * dot * nx, ry = dy - 2 * dot * ny, rz = dz - 2 * dot * nz;
        hops.push({ x: px, y: py, z: pz });
        const tlx = lis.x - px, tly = ly - py, tlz = lis.z - pz, tl = Math.hypot(tlx, tly, tlz);
        if (tl > 0.3 && L.los(map, px, py, pz, lis.x, ly, lis.z)) {
          const spec = Math.max(0, (rx * tlx + ry * tly + rz * tlz) / tl); // 1 = mirror bounce straight at the listener
          const path = travelled + tl;
          const amp = energy * rayNorm * (0.2 + 0.8 * Math.pow(spec, 8)) * Math.pow(2 / Math.max(path, 2), 0.6);
          add({ x: px, y: py, z: pz }, path, amp, order, hops.slice());
        }
        ox = px; oy = py; oz = pz; dx = rx; dy = ry; dz = rz;
      }
    }
    // A gorge (the Sandia Crest's): a shot fired over it comes back off its far face. Its rim's a low wall, so a level ray
    // crosses the open air above it (t 5) to the far side unhindered; where it meets ground again beyond, that's the
    // face's top, the cliff going 45 m down under it: a big, rough reflector, its echo the one you hear a long time after.
    if (outside && map.chasm) {
      const t5 = G.Level.floorMap(map, 0).t, ts = L.TS;
      for (let i = 0; i < K; i++) {
        const a = ((i + 0.5) / K) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
        let over = false;
        for (let s = 1; s < 260; s += ts) {
          const px = src.x + dx * s, pz = src.z + dz * s, tx = Math.floor(px / ts), tz = Math.floor(pz / ts);
          if (tx < 0 || tz < 0 || tx >= map.W || tz >= map.H) break;
          const v = t5[tz * map.W + tx];
          if (v === 5) { over = true; continue; }
          if (!over) continue;
          const tl = Math.hypot(lis.x - px, ly - y, lis.z - pz), path = s + tl;
          const amp = 0.6 * rayNorm * 0.45 * Math.pow(2 / Math.max(path, 2), 0.6) * Math.min(1, map.chasm / 20); // (the face's height: the more of it, the more comes back)
          add({ x: px, y: y - map.chasm / 2, z: pz }, path, amp, 1, [{ x: src.x, y, z: src.z }, { x: px, y, z: pz }]);
          break;
        }
      }
    }
    // the strongest six (out of doors, two of them the strongest late ones, past 150 ms: the slap back off far walls)
    const all = [...bins.values()].sort((p, q) => q.amp - p.amp), late = outside ? all.filter((t) => t.delay > 0.15).slice(0, 2) : [];
    const taps = [...late, ...all.filter((t) => !late.includes(t))].slice(0, 6).sort((p, q) => q.amp - p.amp);
    if (this.echoCache.size > 400) this.echoCache.clear();
    this.echoCache.set(key, { map, taps });
    return taps;
  },
  drawEchoes(taps: EchoTap[], lis: THREE.Vector3) {
    const V = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
    for (const tp of taps) {
      const col = tp.order === 1 ? 0x40c0ff : 0xb070ff;
      for (let i = 0; i < tp.hops.length - 1; i++) G.R.tracer(V(tp.hops[i]), V(tp.hops[i + 1]), col, 0.012, 0.8);
      G.R.tracer(V(tp.pos), new THREE.Vector3(lis.x, lis.y - 0.3, lis.z), col, 0.012, 0.8);
    }
  },

  // ------------------------------------------------------------ the rooms' reverberation, measured
  // A convolver per measured room (its traced response, js/acoustics.ts), every shot in that room sent into it at its own
  // level; its output heard the way that room reaches you now (from the opening it comes in by, as loud and as dull as the
  // way there lets it be; your own room's all round you). Kept for the level (a new one's measured afresh).
  // Its output two ways: wide (the response's own stereo, straight to both ears: a room's tail comes from all round) and
  // placed (a mono share through a panner at the opening it comes in by). A panner collapses a stereo signal to the side
  // it's on, so only the placed share goes through one: in your own room all of it's wide; from another room most of it
  // still is (once it's through the door it fills yours), a third of its energy from the doorway.
  verbs: new Map<AcTrace, { cv: ConvolverNode; lp: BiquadFilterNode; wide: GainNode; dg: GainNode; pan: PannerNode; g: GainNode; map: AcMap }>(),
  verbOf(ctx: AudioContext, map: AcMap, tr: AcTrace) {
    for (const [k, v] of this.verbs) if (v.map !== map) { v.g.disconnect(); this.verbs.delete(k); } // (last level's)
    let v = this.verbs.get(tr);
    if (!v) {
      const cv = ctx.createConvolver(), lp = ctx.createBiquadFilter(), wide = ctx.createGain(), dg = ctx.createGain(), pan = ctx.createPanner(), g = ctx.createGain();
      cv.normalize = false; cv.buffer = G.Acoustics.impulse(ctx, tr); lp.type = 'lowpass';
      pan.panningModel = 'equalpower'; pan.rolloffFactor = 0; dg.gain.value = 0;
      cv.connect(lp); lp.connect(wide); wide.connect(g); lp.connect(dg); dg.connect(pan); pan.connect(g); g.connect(G.Audio.master);
      v = { cv, lp, wide, dg, pan, g, map }; this.verbs.set(tr, v);
    }
    return v;
  },
  /** the shooter's room's response, set for how it reaches you now: returns its nodes (the shot's sent into .cv) */
  roomVerb(ctx: AudioContext, map: AcMap, src: EchoPt, heard: { k: number; lp: number; at: EchoPt; same: boolean } | null) {
    const tr = G.Acoustics.roomAt(map, src.x, src.y, src.z);
    if (!tr) return null;
    const v = this.verbOf(ctx, map, tr), t = ctx.currentTime, same = !heard || heard.same, PLACED = 0.33;
    v.g.gain.setTargetAtTime(same ? 1 : heard!.k, t, 0.02); v.lp.frequency.setTargetAtTime(same ? 20000 : heard!.lp, t, 0.02);
    v.wide.gain.setTargetAtTime(same ? 1 : Math.sqrt(1 - PLACED), t, 0.02); v.dg.gain.setTargetAtTime(same ? 0 : Math.sqrt(PLACED), t, 0.02);
    if (!same) { const at = heard!.at; v.pan.positionX.setValueAtTime(at.x, t); v.pan.positionY.setValueAtTime(at.y, t); v.pan.positionZ.setValueAtTime(at.z, t); }
    return v;
  },
  /** your own room's response, all round you: what a sound coming in from another room fills it with */
  listenerVerb(ctx: AudioContext, map: AcMap) {
    const cam = G.R.camera.position, tr = G.Acoustics.roomAt(map, cam.x, cam.y, cam.z);
    if (!tr) return null;
    const v = this.verbOf(ctx, map, tr), t = ctx.currentTime;
    v.g.gain.setTargetAtTime(1, t, 0.02); v.lp.frequency.setTargetAtTime(20000, t, 0.02); v.wide.gain.setTargetAtTime(1, t, 0.02); v.dg.gain.setTargetAtTime(0, t, 0.02);
    return v;
  },
  // ------------------------------------------------------------ playback
  // A gun's report is loudest down the line it's fired along: the blast leaves the muzzle forward, and behind the gun
  // it's the shooter's body and the gun in the way. About +3 dB straight ahead, -4 dB straight behind, and the highs
  // going first round the back (the crack's ahead of the blast). heard: where the sound leaves for you (the shooter, or
  // the opening it reaches you by: what matters is which way that is from the muzzle).
  directivity(pos: EchoPt, aim: EchoPt, toward: EchoPt) {
    const ax = aim.x - pos.x, ay = aim.y - pos.y, az = aim.z - pos.z, al = Math.hypot(ax, ay, az) || 1;
    const lx = toward.x - pos.x, ly = toward.y - pos.y, lz = toward.z - pos.z, ll = Math.hypot(lx, ly, lz) || 1;
    const c = (ax * lx + ay * ly + az * lz) / (al * ll), f = (1 + c) / 2; // (1 ahead, 0.5 side, 0 behind)
    return { k: Math.pow(10, (-4 + 7 * f) / 20), lp: 6000 + 14000 * f };
  },
  // a suppressed gun's first shot after a pause (by shooter: two of them with the same gun are two cans)
  firstRound(id: string, who: string, now: number) {
    if (this.spec(id).muzzleDevice !== 'suppressor') return 1;
    const k = id + '|' + who, t = this.lastShot.get(k);
    this.lastShot.set(k, now);
    if (this.lastShot.size > 256) this.lastShot.clear();
    return t === undefined || now - t > this.FRP_COLD ? this.FRP_GAIN : 1;
  },
  // pos = world position of the muzzle, or null for the local player's own gun. who: the shooter (for a can's first-round pop).
  // Returns false when no synth buffer exists yet so the caller can play a fallback.
  play(id: string, pos: THREE.Vector3 | null, who?: string, vol = 1, aim?: EchoPt | null) { // (vol: this shot's own level: a gun of several barrels, each as loud as its effective length makes it, js/data.ts G.shotDef)
    const A = G.Audio, ctx = A.ctx, map = G.Game.map;
    if (!ctx || !map || !this.spec(id) || !this.available()) return false;
    const cam = G.R.camera.position;
    const src = pos || cam;
    // With the level's acoustics the report's dry (the gun and the round, a metre off), and its room is the room's own,
    // measured (js/acoustics.ts roomAt: its traced response, convolved below). Without, the synth's render for a room of
    // this one's kind (roomSig: a preset, picked by its shape).
    const measured = !!G.Acoustics;
    let buf: AudioBuffer | undefined;
    if (measured) { buf = this.dry.get(id); if (!buf) { this.buildDry(id, true); return false; } }
    else {
      const sig = this.roomSig(map, src.x, src.z, this.floorY(map, src));
      buf = this.bufs.get(id + '|' + this.sigKey(sig));
      if (!buf) {
        buf = this.dry.get(id);
        if (!buf) this.buildDry(id, true);
        this.build(id, sig, true);
        if (!buf) return false;
      }
    }

    const base = this.GAIN * vol * this.firstRound(id, who || (pos ? 'x' : 'me'), ctx.currentTime);
    let gain = base, occluded = false, d = 0, panPos = pos as EchoPt, portal: EchoTap | null = null; // (panPos is only read inside `if (pos)`)
    let heard: { k: number; lp: number; at: EchoPt; same: boolean } | null = null;
    const taps = this.echoTaps(map, src, cam);
    if (this.debugEchoes) this.drawEchoes(taps, cam);
    if (pos) {
      d = cam.distanceTo(pos);
      gain *= G.U.clamp(Math.pow(2 / Math.max(d, 2), 0.6), 0.05, 1);
      // How it gets to you (js/acoustics.ts): in your own zone, straight (dulled a little behind shelves and pillars);
      // from another, by the strongest way through the openings: as loud and as bright as the doors and windows on it
      // let it be, and from the one it comes in by. (No acoustics: line of sight, and round a corner by its echoes.)
      if (G.Acoustics) {
        heard = G.Acoustics.hear(map, pos, cam);
        gain *= heard.k; panPos = heard.at; occluded = !heard.same || heard.k < 1;
        if (aim) { const dv = this.directivity(pos, aim, heard.at); gain *= dv.k; heard.lp = Math.min(heard.lp, dv.lp); }
      } else {
        occluded = !G.Level.los(map, cam.x, cam.y, cam.z, pos.x, pos.y, pos.z);
        if (occluded) portal = taps.reduce<EchoTap | null>((b, t) => (!b || t.amp > b.amp ? t : b), null);
        if (portal) panPos = portal.pos;
        if (occluded) gain *= portal ? 0.75 : 0.55;
      }
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
      lp.frequency.value = Math.min(G.U.clamp(18000 * Math.pow(0.5, d / 35), 1200, 19000), heard ? heard.lp : occluded ? (portal ? 2500 : 900) : 20000);
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.rolloffFactor = 0; // loudness comes from the gain node
      if (pan.positionX) { pan.positionX.value = panPos.x; pan.positionY.value = panPos.y; pan.positionZ.value = panPos.z; }
      else pan.setPosition(panPos.x, panPos.y, panPos.z);
      s.connect(lp).connect(pan).connect(g);
    } else s.connect(g);
    g.connect(A.master);
    // and into the room you're in (js/ambience.ts's reverb for your zone): a shot from another room comes in and fills
    // yours; one in your own room already carries its room in its render, so only a little
    // its room: the shooter's room's measured response (the report's reverberation, at its measured level against the
    // report itself), heard by the way the shooter's room reaches you (in your own room, all round you)
    const rv = measured ? this.roomVerb(ctx, map, src, heard) : null;
    if (rv) { const sg = ctx.createGain(); sg.gain.value = base; s.connect(sg); sg.connect(rv.cv); } // (at the report's own level: the response carries the room's)
    // and a shot from another room, come in, fills the room you're in: your room's own response to it, all round you, at
    // the level it reaches you at (the same room's response, when that's whose it was, is already the shooter's above)
    if (measured && heard && !heard.same) {
      const lv = this.listenerVerb(ctx, map);
      if (lv && lv !== rv) { const sg = ctx.createGain(); sg.gain.value = gain; g.connect(sg); sg.connect(lv.cv); }
    } else if (!measured) {
      const room = G.Ambience && G.Ambience.reverbIn();
      if (room && heard && !heard.same) { const sg = ctx.createGain(); sg.gain.value = gain * 0.8; g.connect(sg); sg.connect(room); }
    }
    this.voices++;
    s.onended = () => { this.voices--; };
    s.start();

    // the echoes: the dry report (no baked reverb) replayed from each reflecting wall after its delay,
    // darker with every bounce. Under heavy fire only the two strongest are kept.
    const echoBuf = this.dry.get(id) || buf, now = ctx.currentTime;
    // (under heavy fire only the two strongest; while the audio thread's behind, one, then none: G.Audio.load)
    const ld = A.load(), n = Math.min(taps.length, ld > 0.5 ? 0 : ld > 0.15 ? 1 : this.voices > this.MAX_VOICES * 0.6 ? 2 : taps.length); // (there may be fewer than two)
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
  updateListener(cam: THREE.Camera) {
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
G.GunAudio = G_GunAudio;
interface GameModules { GunAudio: typeof G_GunAudio; }
