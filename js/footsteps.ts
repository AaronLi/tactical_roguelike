'use strict';
// Footsteps, synthesized: every step anyone takes (you, your team, suspects, civilians) is a clip from the contact
// synth's footstep model (tools/contact-synth/src/scenes/footsteps.ts on claude/great-wozniak-4nmx0u, baked by its
// scripts/footstep-bank.mjs into assets/audio/footsteps/): the sole (boots, sneakers, dress shoes), the floor under
// the foot (eleven of them), the gait (creeping, crouched, walking, running), four takes of each, and the kit's rattle
// (light, heavy) laid over it apart. The clips carry their level (a carpet step is 12 dB under concrete, a run 8 dB over
// a walk); here they're placed in the world and heard the way gunshots are (js/gunaudio.ts): by the level's acoustics
// (js/acoustics.ts hear(): as loud and as dull as the way to you lets them be, from the opening they come in by) and
// into the walker's room's measured reverberation.
// Others' steps land when their rig plants a foot (js/rig.ts, the gait's phase); yours, every half stride you walk.
/** who's walking, as the bank has them (tools/contact-synth/scripts/footstep-bank.mjs BAKE): an officer in boots with their
 *  armour (~105 kg), a suspect in boots (~80 kg), a civilian in sneakers, everyday rubber-soled shoes or leather dress shoes */
type FsSole = 'boot' | 'suspect' | 'sneaker' | 'shoe' | 'dress';
type FsGait = 'creep' | 'crouch' | 'walk' | 'run';
type FsKit = 'none' | 'light' | 'heavy';
/** who's walking: what's on their feet and what they carry (js/views.ts sets it on each rig's update) */
interface FsFeet { sole: FsSole; kit: FsKit; careful?: boolean; low?: boolean }
type FsClip = { buf: AudioBuffer; anchor: number };
const G_Footsteps = {
  BASE: 'assets/audio/footsteps/',
  /** level trim against the other effects: a boot walking on concrete peaks about 0.3 at 1 m */
  GAIN: 2,
  /** your own, against someone else's at the same distance (they're under you, and you know they're coming) */
  SELF: 0.32, // (3 dB down on 0.45: your own steps under everything else)
  /** out past this they're not played (m) */
  RANGE: 30,
  MAX_VOICES: 24,
  voices: 0,
  man: null as null | { variants: number; soles: Record<string, Record<string, { anchor: number }>>; kit: Record<string, { anchor: number }> },
  bufs: {} as Record<string, AudioBuffer>,
  started: false,
  // the game's floors (js/casings.ts surface(): a room's floor, a home's, out of doors) as the synth's
  FLOOR: { concrete: 'concrete', hard: 'wood', tile: 'tile', pave: 'pave', flag: 'pave', carpet: 'carpet', wood: 'wood', parquet: 'wood', lino: 'lino', dirt: 'dirt', soil: 'dirt', grass: 'grass', gravel: 'gravel', leaves: 'leaves', metal: 'metal' } as Record<string, string>,

  init() {
    if (this.started || !G.Audio.ctx) return;
    this.started = true;
    const ctx = G.Audio.ctx;
    fetch(this.BASE + 'manifest.json').then((r) => r.json()).then((m) => {
      this.man = m;
      // boots first (everyone on your side wears them), then the rest, a few at a time so the level's loading isn't held up
      const names = [...Object.entries(m.soles as Record<string, Record<string, unknown>>).flatMap(([s, c]) => Object.keys(c).map((n) => s + '/' + n)), ...Object.keys(m.kit).map((n) => 'kit/' + n)];
      let i = 0;
      const next = (): void => {
        const n = names[i++];
        if (!n) return;
        fetch(this.BASE + n + '.ogg').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => { this.bufs[n] = buf; }).catch(() => {}).then(next);
      };
      for (let k = 0; k < 6; k++) next();
    }).catch(() => { this.started = false; });
  },
  clip(dir: string, name: string): FsClip | null {
    const m = this.man, e = m && (dir === 'kit' ? m.kit[name] : m.soles[dir] && m.soles[dir][name]), buf = this.bufs[dir + '/' + name];
    return e && buf ? { buf, anchor: e.anchor } : null;
  },
  /**
   * Steps a second at a speed (m/s): a typical adult's cadence rises with speed (Winter; Perry): ~1.85 at 1.4 m/s, ~2.1
   * at a brisk 1.9 (the game's walk), ~2.65 jogging at 3, ~3 sprinting. Crouched, a little quicker and shorter. Your
   * steps, everyone's legs (js/rig.ts) and your view's bob (js/player.ts bobT) all keep to it.
   */
  cadence(speed: number, crouch = 0) { return G.U.clamp(1.15 + 0.5 * speed, 1.5, 3) * (1 + 0.1 * crouch); },
  /** a full stride (two steps) at a speed, m */
  stride(speed: number, crouch = 0) { return (2 * Math.max(speed, 0.3)) / this.cadence(speed, crouch); },
  /** the synth's floor under a foot at p (feet height) */
  floorAt(map: LvMap, p: { x: number; y: number; z: number }) {
    const s = G.Casings.surface(map, p.x, p.z, p.y + 0.01);
    return this.FLOOR[s] || 'concrete';
  },
  /** the gait from how they're moving: speed (m/s), how crouched (0..1), steadied (careful), weapon lowered (low) */
  gaitOf(speed: number, crouch: number, careful?: boolean, low?: boolean): FsGait {
    if (crouch > 0.5) return 'crouch';
    if (careful || speed < 1.0) return 'creep';
    return low || speed > 2.5 ? 'run' : 'walk';
  },
  /**
   * who someone (js/views.ts EnemyView) is, on their feet: the armoured as officers (boots, heavy kit); suspects in boots,
   * light kit when armed; a civilian in the shoes their model wears (js/rig.ts shoe: white trainers, brown leather dress
   * shoes, black everyday shoes), or, without one, by who they are
   */
  feetOf(def: { style?: string; civ?: boolean } | null | undefined, id: number, armed: boolean, shoe?: FsSole | null): FsFeet {
    const h = ((id * 2654435761) >>> 0) / 4294967296;
    if (!def) return { sole: 'suspect', kit: 'none' };
    if (def.civ || def.style === 'civ') return { sole: shoe || (h < 0.4 ? 'sneaker' : h < 0.75 ? 'shoe' : 'dress'), kit: 'none' };
    if (def.style === 'armored') return { sole: 'boot', kit: 'heavy' };
    return { sole: 'suspect', kit: armed ? 'light' : 'none' };
  },
  /**
   * A step: `feet` on whatever's under `pos` (their feet) at `gait`. self: your own (heard from under you, quieter).
   * Returns false when nothing's loaded (yet) to play.
   */
  step(feet: FsFeet, pos: THREE.Vector3, gait: FsGait, self = false) {
    const A = G.Audio, ctx = A.ctx, map = G.Game && G.Game.map, cam = G.R && G.R.camera;
    if (!ctx || !map || !cam) return false;
    if (!this.man) { this.init(); return false; }
    const cp = cam.position, d = self ? 0 : cp.distanceTo(pos);
    if (d > this.RANGE || this.voices >= this.MAX_VOICES) return false;
    if (!self && A.load() > 0.3) return false; // (the audio thread's behind: others' steps go before anything that matters)
    const n = this.man.variants || 4, v = 1 + Math.floor(Math.random() * n);
    let floor = this.floorAt(map, pos);
    // (a dress shoe's baked for the floors indoors and the street; on earth, a sneaker stands in)
    // (a dress shoe's baked for the floors indoors and the street, walking and running; on earth, an everyday shoe stands in)
    const sole = feet.sole === 'dress' && !this.man.soles.dress[`${floor}-${gait === 'run' ? 'run' : 'walk'}-1`] ? 'shoe' : feet.sole;
    const g = sole === 'dress' ? (gait === 'run' ? 'run' : 'walk') : gait;
    if (!this.man.soles[sole] || !this.man.soles[sole][`${floor}-${g}-1`]) floor = 'concrete';
    const c = this.clip(sole, `${floor}-${g}-${v}`);
    if (!c) return false;
    let gain = this.GAIN * (self ? this.SELF : Math.min(1, 1.5 / Math.max(d, 1.5))), lp = 20000, at: { x: number; y: number; z: number } = pos;
    let heard: { k: number; lp: number; at: EchoPt; same: boolean } | null = null;
    if (!self && G.Acoustics) {
      heard = G.Acoustics.hear(map, pos, cp);
      gain *= heard.k; lp = heard.lp; at = heard.at;
      if (gain < 0.004) return false; // (nothing of it gets to you)
    } else if (!self && !G.Level.los(map, cp.x, cp.y, cp.z, pos.x, pos.y + 0.2, pos.z)) { gain *= 0.4; lp = 900; }
    const t = ctx.currentTime, start = (b: AudioBuffer, anchor: number, k: number) => {
      const s = ctx.createBufferSource(), gn = ctx.createGain(), f = ctx.createBiquadFilter(), pan = ctx.createPanner();
      s.buffer = b; s.playbackRate.value = 0.96 + Math.random() * 0.08;
      f.type = 'lowpass'; f.frequency.value = lp;
      // (yours: centred, not through the HRTF: straight below you its filtering colours a step hollow)
      pan.panningModel = self ? 'equalpower' : 'HRTF'; pan.distanceModel = 'inverse'; pan.rolloffFactor = 0;
      const px = self ? cp.x : at.x, py = self ? cp.y - 1.5 : at.y, pz = self ? cp.z : at.z;
      if (pan.positionX) { pan.positionX.value = px; pan.positionY.value = py; pan.positionZ.value = pz; } else pan.setPosition(px, py, pz);
      gn.gain.value = gain * k;
      s.connect(f).connect(pan).connect(gn).connect(A.master);
      // into the walker's room: its measured response (js/gunaudio.ts roomVerb), heard the way that room reaches you
      if (!self && G.GunAudio && G.Acoustics) {
        const rv = G.GunAudio.roomVerb(ctx, map, pos, heard);
        if (rv) { const sg = ctx.createGain(); sg.gain.value = this.GAIN * k * Math.min(1, 1.5 / Math.max(d, 1.5)) * 0.5; s.connect(sg); sg.connect(rv.cv); }
      } else if (self && G.GunAudio && G.Acoustics && G.Game.phase === 'level') {
        // yours into the room you're in (as your own gun's handling is, js/audio.ts route): the step's level at 1 m
        // (its 1.5 m level, the others' baseline, scaled to 1 m), under you
        const lv = G.GunAudio.listenerVerb(ctx, map);
        if (lv) { const sg = ctx.createGain(); sg.gain.value = this.GAIN * k * 0.5 * this.SELF / 1.5; s.connect(sg); sg.connect(lv.cv); }
      }
      this.voices++;
      s.onended = () => { this.voices--; };
      // (the strike lands now: the clip's lead-in is skipped but for a hair; a clip that only begins after the strike, a
      // kit's knocks catching up, starts that much later)
      if (anchor >= 0) s.start(t, Math.min(anchor, 0.02)); else s.start(t - anchor);
    };
    start(c.buf, c.anchor, 1);
    if (feet.kit !== 'none') {
      const k = this.clip('kit', `${feet.kit}-${gait}-${v}`);
      if (k) start(k.buf, k.anchor, self ? 0.8 : 1);
    }
    return true;
  },
  // ------------------------------------------------------------ the walkers
  /** a rig's foot came down (js/rig.ts update): p is what it was updated with (p.feet: who it is) */
  rigStep(rig: { crouchW: number }, p: { pos: THREE.Vector3; feet?: FsFeet }, speed: number) {
    if (!p.feet) return;
    this.step(p.feet, p.pos, this.gaitOf(speed, rig.crouchW, p.feet.careful, p.feet.low));
  },
  // you: a step each time your view's bob comes down (js/player.ts bobT, on the steps' cadence: the gun at its lowest
  // at each π, the heel a touch before), while you're on your feet and on the ground (js/player.ts update)
  selfIdx: null as number | null,
  selfFeet: { sole: 'boot', kit: 'heavy' } as FsFeet,
  self(_dt: number) {
    const me = G.Me;
    if (!me || !me.pos || me.dead || me.down || me.prone || me.climb || me.zipRide || me.seat != null || !me.onGround || G.Game.phase !== 'level' || (me.hspeed || 0) < 0.5) { this.selfIdx = null; return; }
    const idx = Math.floor((me.bobT || 0) / Math.PI + 0.1);
    if (this.selfIdx == null) { this.selfIdx = idx; return; } // (setting off: the first step's at the first dip)
    if (idx === this.selfIdx) return;
    this.selfIdx = idx;
    this.step(this.selfFeet, me.pos, this.gaitOf(me.hspeed, me.crouch ? 1 : 0, !!me.steadying, !!me.lowReady), true);
  },
};
G.Footsteps = G_Footsteps;
interface GameModules { Footsteps: typeof G_Footsteps; }
