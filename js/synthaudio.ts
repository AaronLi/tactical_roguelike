'use strict';
// Gun handling, all of it synthesized (TEST BRANCH): every rack, bolt release, magazine in and out, magazine landing
// and round loaded by hand is a clip from the contact synth (tools/contact-synth on claude/great-wozniak-4nmx0u,
// scripts/game-bank.mjs), baked for the gun's family into assets/audio/synth/. The recorded reload foley isn't loaded.
// Each clip has an anchor: the moment in it the game lines its cue up with (the action reaching the rear, the slam
// home, the catch taking the magazine, the first touch of the floor), so a clip is started that long before its cue.
type SynthClip = { buf: AudioBuffer; anchor: number; gain: number };
type SynthPart = 'well' | 'port';
interface SynthPlay { in?: number; vol?: number; pos?: THREE.Vector3 | null; part?: SynthPart; soft?: boolean }
const G_SynthAudio = {
  BASE: 'assets/audio/synth/',
  man: null as null | { families: Record<string, { gain: number; clips: Record<string, { anchor: number }> }> },
  bufs: {} as Record<string, AudioBuffer>,
  started: false,
  // Which family each gun's handling is from: the hand-tuned AR-15 (Mk18), KV-47 (AKM), MP5 and G19, and the
  // families built from measurements: the SR-25 (7.62 ARs and battle rifles), a blowback SMG, a 5.56 bullpup.
  // Manual actions are the 'manual' bank (a turn bolt; a pump). Anything not listed goes by its class (FAMILY_CLS).
  FAMILY: {
    m4: 'ar15', hk416: 'ar15', m27: 'ar15', mcx: 'ar15', scarl: 'ar15', tempest: 'ar15', br3: 'ar15', g36: 'ar15', qbz192: 'ar15', ar9: 'ar15', m249: 'ar15', shredder: 'ar15',
    ak: 'kv47', ak74: 'kv47', aks74u: 'kv47', an94: 'kv47', galil: 'kv47', rpk: 'kv47', svd: 'kv47', vss: 'kv47', saiga: 'kv47', vepr: 'kv47', pkm: 'kv47',
    sr25: 'sr25', mk14: 'sr25', m14: 'sr25', scar: 'sr25', fal: 'sr25', garand: 'sr25', barrett: 'sr25', gm6: 'sr25', m60: 'sr25', aa12: 'sr25', benelli: 'sr25',
    mp5: 'mp5', mp5sd: 'mp5',
    uzi: 'smg', mac10: 'smg', thompson: 'smg', ppsh: 'smg', skorp: 'smg', vector: 'smg', mpx: 'smg', p90: 'smg', aug9: 'smg', mp7: 'smg',
    f2: 'bullpup', tavor: 'bullpup', aug: 'bullpup', qbz95: 'bullpup',
  } as Record<string, string>,
  FAMILY_CLS: { PST: 'g19', MP: 'g19', SMG: 'smg', AR: 'ar15', BR: 'sr25', DMR: 'sr25', SNP: 'sr25', LMG: 'kv47', SG: 'sr25' } as Record<string, string>,
  // where on your own gun each sound comes from (camera space, m: right, up, back), out in front of you
  PARTS: { well: [0.12, -0.25, -0.85], port: [0.1, -0.17, -0.9] } as Record<SynthPart, number[]>,

  init() {
    if (this.started || !G.Audio.ctx) return;
    this.started = true;
    const ctx = G.Audio.ctx;
    fetch(this.BASE + 'manifest.json').then((r) => r.json()).then((m) => {
      this.man = m;
      for (const [fam, f] of Object.entries(m.families as Record<string, { clips: Record<string, unknown> }>)) for (const name of Object.keys(f.clips)) {
        fetch(this.BASE + fam + '/' + name + '.ogg').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))
          .then((buf) => { this.bufs[fam + '/' + name] = buf; }).catch(() => {});
      }
    }).catch(() => { this.started = false; });
  },
  family(def: WeaponDef | null | undefined) {
    if (!def) return 'ar15';
    return this.FAMILY[def.id] || this.FAMILY_CLS[def.cls] || 'ar15';
  },
  // the manual action's clip: a pump (pump guns) or the turn bolt (bolts, levers, the Welrod)
  manualClip(def: WeaponDef) {
    const k = G.VMAnim.kinds(def).action, an = G.R.vm && G.R.vm.userData.vma && G.R.vm.userData.vma.hs && G.R.vm.userData.vma.hs[0] && G.R.vm.userData.vma.hs[0].an;
    return k === 'pump' || (an && an.pump) || /pump|ksg/.test(def.id) ? 'pump' : 'bolt';
  },
  // a round loaded by hand: a shotshell into a tube, or a cartridge into a chamber or cylinder
  roundClip(def: WeaponDef) { return def.cls === 'SG' || /shell|gauge|12g|410/.test(String(G.cartOf ? G.cartOf(def) : '')) ? 'shell-in' : 'cartridge-in'; },
  // the clip: the family's, or the closest stand-in (the run home for a release; the AR's for anything missing)
  clip(fam: string, name: string): SynthClip | null {
    if (!this.man) return null;
    const look = (f: string, n: string) => { const e = this.man!.families[f], c = e && e.clips[n], buf = this.bufs[f + '/' + n]; return c && buf ? { buf, anchor: c.anchor, gain: e.gain } : null; };
    return look(fam, name) || (name === 'release' ? look(fam, 'home') : null) || look('manual', name) || look('ar15', name);
  },
  anchor(def: WeaponDef, name: string) { const c = this.clip(this.family(def), name); return c ? c.anchor : 0; },
  /**
   * Play a clip so its anchor lands `o.in` seconds from now (0: now; a clip already past its start begins part way in).
   * From `o.pos` in the world (a Vector3), or from a part of your own gun (o.part), panned and muffled as the game's
   * other world sounds are (js/audio.ts sampleAt). Returns false when the clip isn't loaded (yet).
   */
  play(def: WeaponDef | null | undefined, name: string, o: SynthPlay = {}) {
    const A = G.Audio, c = A.ctx;
    if (!c || !this.man) { this.init(); return false; }
    const fam = name === 'bolt' || name === 'pump' || name === 'shell-in' || name === 'cartridge-in' ? 'manual' : this.family(def);
    const clip = this.clip(fam, name), cam = G.R && G.R.camera;
    if (!clip) return false;
    let pos = o.pos || null;
    if (!pos && cam) { const p = this.PARTS[o.part || 'port']; pos = new THREE.Vector3(p[0], p[1], p[2]); cam.updateMatrixWorld(); cam.localToWorld(pos); }
    const start = c.currentTime + (o.in || 0) - clip.anchor, when = Math.max(c.currentTime, start), offset = Math.max(0, c.currentTime - start);
    if (offset >= clip.buf.duration) return true;
    const s = c.createBufferSource(), g = c.createGain(), lp = c.createBiquadFilter();
    s.buffer = clip.buf;
    let vol = (o.vol == null ? 0.7 : o.vol) * clip.gain, blocked = false;
    if (pos && cam && o.pos) {
      const d = cam.position.distanceTo(pos), map = G.Game && G.Game.map;
      blocked = !!map && !G.Level.los(map, cam.position.x, cam.position.y, cam.position.z, pos.x, pos.y, pos.z);
      vol *= 1 / (1 + d * 0.12) * (blocked ? 0.55 : 1);
    }
    if (o.soft) vol *= 0.5;
    g.gain.value = vol;
    lp.type = 'lowpass'; lp.frequency.value = blocked ? 1100 : o.soft ? 1600 : 20000;
    let node: AudioNode = s.connect(lp);
    if (pos) {
      const pan = c.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.rolloffFactor = 0;
      if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y, pos.z);
      node = node.connect(pan);
    }
    node.connect(g); g.connect(A.master);
    s.start(when, offset);
    return true;
  },
  // the action worked by hand (js/player.ts workAction): the whole clip is laid out from the start so the rear stop
  // lands when the animation's action reaches the rear (back, s from now) and, for a release, the slam on home
  action(def: WeaponDef, kind: string, dur: number, back: number, home: number, pos: THREE.Vector3 | null = null) {
    if (kind === 'release') return this.play(def, 'release', { in: home, pos, part: 'port', vol: 0.8 });
    const name = def.manual ? this.manualClip(def) : dur > 0.5 ? 'rack-60' : 'rack-45';
    return this.play(def, name, { in: back, pos, part: 'port', vol: 0.8 });
  },
  // a dropped magazine's first touch of the floor (js/casings.ts): its simulated fall, as full as it is, one of the four
  // ways it can land (picked at random), from where it lands. surf: the floor it hit.
  drop(def: WeaponDef, rounds: number, pos: THREE.Vector3, surf: string) {
    const cap = Math.max(1, def.mag || 30), f = rounds / cap;
    const fill = rounds <= 0 ? 'empty' : f >= 0.99 ? 'full' : f <= 0.4 ? 'third' : 'two-thirds';
    const way = ['bottom', 'top', 'sideways', 'forwards'][Math.floor(Math.random() * 4)];
    return this.play(def, `drop-${fill}-${way}`, { pos, vol: 0.9, soft: /grass|carpet|dirt|mud|sand|snow|rug|soft|turf|gravel/.test(surf) });
  },
};
G.SynthAudio = G_SynthAudio;
interface GameModules { SynthAudio: typeof G_SynthAudio; }
