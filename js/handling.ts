'use strict';
// The guns' handling sounds, synthesized: tools/contact-synth simulates each part of the action and the magazine (its
// materials, its contacts, the air inside it) and scripts/game-bank.mjs bakes them, dry, into assets/audio/handling/
// (a folder per family of guns, manifest.json: each clip's anchor, the moment into it that the game's cue lines up
// with, and each family's playback gain). Heard through the level's acoustics like everything else (js/audio.ts route):
// your own gun at your hands, in the room you're in; a magazine you drop where it lands, the way that reaches you; a
// suspect's from their hands. A gun with no family of its own (a crossbow) keeps the recorded foley (js/audio.ts
// sample): every call here returns false when it has nothing, for the caller's fallback.
interface HandEntry { gain: number; clips: Record<string, { anchor: number; len: number }> }
const G_Handling = (() => {
  let manifest: { families: Record<string, HandEntry> } | null = null, asked = false;
  const bufs = new Map<string, AudioBuffer>(), loading = new Set<string>();
  // Each gun's family: how its action and its magazine work (the contact synth's specs: an AR-15's charging handle and
  // its catch, an AK's carrier and its rock-in magazine, an MP5's rollers and its slap, a tilting-barrel pistol's slide,
  // an AR-10, a blowback SMG, a bullpup). By id where it's one of a kind, else by class (a self-loading pistol: g19).
  const BY_ID: Record<string, string> = {
    m4: 'ar15', hk416: 'ar15', scarl: 'ar15', m27: 'ar15', mcx: 'ar15', g36: 'ar15', br3: 'ar15', tempest: 'ar15',
    ak: 'kv47', ak74: 'kv47', aks74u: 'kv47', galil: 'kv47', an94: 'kv47', rpk: 'kv47', svd: 'kv47', saiga: 'kv47', vepr: 'kv47',
    mp5: 'mp5', mp5sd: 'mp5',
    f2: 'bullpup', tavor: 'bullpup', aug: 'bullpup', qbz95: 'bullpup', qbz192: 'bullpup',
    sr25: 'sr25', mk14: 'sr25', m14: 'sr25', scar: 'sr25', fal: 'sr25',
    uzi: 'smg', p90: 'smg', vector: 'smg', thompson: 'smg', ppsh: 'smg', mpx: 'smg', ar9: 'smg', aug9: 'smg', mac10: 'smg', mp7: 'smg', skorp: 'smg',
    // the nearest kin's action and magazine: a .50's big carrier, an AK-pattern box, a semi-auto shotgun's bolt worked
    // by its handle (its shells: roundIn), a railgun's cell into a well
    barrett: 'sr25', gm6: 'sr25', benelli: 'sr25', slug: 'sr25', aa12: 'kv47', vss: 'kv47', rail: 'ar15', akimbo: 'g19',
    // their own (scenes/no-family.ts): a revolver's cylinder (and the M32's), a break-action's hinge (and the Hailstorm's
    // block), a belt-fed's feed cover and belt, an M1's clip
    rev: 'revolver', hc500: 'revolver', judge: 'revolver', m32: 'revolver',
    dbl: 'break', sawn: 'break', pocketgl: 'break', hailstorm: 'break', derringer: 'break', thor: 'break',
    m249: 'belt', pkm: 'belt', m60: 'belt', shredder: 'belt', garand: 'enbloc',
  };
  function fam(def: WeaponDef | null | undefined): string | null {
    if (!def) return null;
    if (def.manual) return 'manual';
    if (BY_ID[def.id]) return BY_ID[def.id];
    if (def.akimbo || def.barrels || def.volley || def.handReload || G.revolver(def) || G.beltFed(def)) return null;
    return def.cls === 'PST' || def.cls === 'MP' ? 'g19' : null;
  }
  // the manifest, then a family's clips, fetched as they're first wanted (a family's ~25 clips, ~300 kB)
  function want(f: string) {
    const ctx = G.Audio.ctx;
    if (!ctx) return;
    if (!manifest) {
      if (asked) return;
      asked = true;
      G.Audio.bankJson('handling/manifest.json').then((m) => { manifest = m; want(f); }).catch(() => {}); // (from the audio bundle: G.Audio.bankFile)
      return;
    }
    if (loading.has(f) || !manifest.families[f]) return;
    loading.add(f);
    for (const n of Object.keys(manifest.families[f].clips)) {
      G.Audio.bankFile('handling/' + f + '/' + n + '.ogg').then((b) => ctx.decodeAudioData(b))
        .then((buf) => { bufs.set(f + '/' + n, buf); }).catch(() => {});
    }
  }
  /** fetch the sounds of these guns ahead of their first use (a level's start: the guns you carry) */
  function prewarm(defs: (WeaponDef | null | undefined)[]) {
    for (const d of defs) { const f = fam(d); if (f) want(f); }
    want('manual'); // (rounds loaded by hand: any gun's)
  }
  function clip(f: string | null, name: string) {
    if (!f) return null;
    const buf = bufs.get(f + '/' + name);
    if (!buf) { want(f); return null; }
    const m = manifest!.families[f];
    return { buf, anchor: m.clips[name].anchor, gain: m.gain };
  }
  /** how long before its cue a clip starts (its anchor), or null if it isn't here (yet) */
  function lead(def: WeaponDef, name: string) { const c = clip(fam(def), name); return c ? c.anchor : null; }
  // The clip `name` of family f, its anchor lined up with `land` s from now (a cue that fires early by the anchor:
  // land = anchor; one that fires when the recorded foley started: where that foley's own hit was). At your hands (pos
  // null) or from pos. vol: the level the recorded foley played at (the bank is levelled against it).
  function playF(f: string | null, name: string, o: { land?: number; vol?: number; pos?: THREE.Vector3 | { x: number; y: number; z: number } | null } = {}) {
    const A = G.Audio, ctx = A.ctx, c = clip(f, name);
    if (!ctx || !c) return false;
    const now = ctx.currentTime, when = now + (o.land != null ? o.land : c.anchor) - c.anchor;
    const s = ctx.createBufferSource(); s.buffer = c.buf;
    s.playbackRate.value = 0.98 + Math.random() * 0.04; // (no two quite alike)
    const v = (o.vol != null ? o.vol : 0.7) * c.gain * A.HANDLING, cam = G.R && G.R.camera; // (A.HANDLING: the handling sounds' trim)
    if (o.pos && cam) A.route(s, o.pos, v * A.far(cam.position.distanceTo(o.pos as THREE.Vector3)), v * A.NEAR_PLACED);
    else A.route(s, null, v * A.HANDLING_OWN, v * A.HANDLING_OWN * A.NEAR_HANDS); // (your own: A.HANDLING_OWN up)
    if (when >= now) s.start(when); else s.start(now, Math.min(now - when, c.buf.duration));
    return true;
  }
  // (a single-shot break-action: the one round)
  const one = (def: WeaponDef | null | undefined, f: string | null, name: string) => f === 'break' && def && def.mag === 1 && (name === 'mag-in' || name === 'load') ? (name === 'load' ? 'load-one' : 'mag-in-one') : name;
  const play = (def: WeaponDef | null | undefined, name: string, o?: Parameters<typeof playF>[2]) => { const f = fam(def); return playF(f, one(def, f, name), o); };
  // Your own reload of a gun of these families, on its animation's own moments (js/vmanim.ts revolverClip, breakClip,
  // beltClip, enblocClip: how far through the magazine change each part lands), in place of the magazine out and in.
  const CUES: Record<string, [number, string][]> = {
    revolver: [[0.16, 'open-cue'], [0.7, 'load'], [0.86, 'close']],
    break: [[0.16, 'open-cue'], [0.66, 'load'], [0.9, 'close']],
    belt: [[0.16, 'cover-up'], [0.22, 'belt-off'], [0.27, 'box-off'], [0.6, 'box-on'], [0.66, 'belt-on'], [0.82, 'cover-down']],
  };
  /** the cues for your own reload of def (a fresh copy, each to fire once), or null to play the magazine out and in */
  function cues(def: WeaponDef) {
    const f = fam(def), c = f && CUES[f];
    if (!c) return null;
    want(f!);
    return c.map(([at, name]) => ({ at, name: one(def, f, name), done: false }));
  }
  // A revolver loaded by hand, or a falling block (js/player.ts revOpen, revShut): opened as its first round's reload
  // begins (the crane on its stop REV.open's 0.32 in: vmanim revolverRound), shut over REV.close (the latch at 0.6 of it).
  const open = (def: WeaponDef) => play(def, 'open-cue', { land: 0.32 * G.REV.open });
  const shut = (def: WeaponDef) => play(def, 'close', { land: 0.6 * G.REV.close });
  // When the recorded foley's own hit came after its cue (assets/audio: the insert's catch 0.19 s in, the rack's stop
  // 0.15 s, the slide dropping 0.09 s): cues tuned by ear with it keep their timing.
  const LAND = { magIn: 0.19, magOut: 0, rack: 0.15, home: 0.09, roundIn: 0.19 };
  /** the action worked by hand: which of the family's clips (a manual action's bolt or pump; else by its clock) */
  function rackClip(def: WeaponDef, dur: number) {
    if (def.manual) return G.VMAnim.kinds(def).action === 'pump' ? 'pump' : 'bolt';
    return dur < 0.52 ? 'rack-45' : 'rack-60';
  }
  /** a round loaded by hand (a shell into a tube, a cartridge into a chamber or a magazine) */
  function roundIn(def: WeaponDef, o?: Parameters<typeof playF>[2]) {
    return playF('manual', def.shell && def.cls === 'SG' && !G.revolver(def) ? 'shell-in' : 'cartridge-in', { land: LAND.roundIn, ...o });
  }
  // A dropped magazine's fall, from its first contact (the bank's own drop of that gun's magazine: empty, a third, two
  // thirds or full, landing on its base, its top, its side or its nose), at pos. fill: 0..1.
  const FILLS = ['empty', 'third', 'two-thirds', 'full'], WAYS = ['bottom', 'top', 'sideways', 'forwards'];
  function drop(def: WeaponDef, fill: number, pos: { x: number; y: number; z: number }) {
    const f = fam(def);
    if (!f || f === 'manual' || CUES[f] || f === 'enbloc') return false; // (no magazine of its own to drop)
    const n = 'drop-' + FILLS[Math.round(G.U.clamp(fill, 0, 1) * 3)] + '-' + WAYS[Math.floor(Math.random() * 4)];
    return playF(f, n, { land: 0, vol: 0.7, pos });
  }
  return { fam, prewarm, lead, play, playF, LAND, rackClip, roundIn, drop, cues, open, shut };
})();
G.Handling = G_Handling;
interface GameModules { Handling: typeof G_Handling; }
