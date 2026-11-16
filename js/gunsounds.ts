'use strict';
import { GunAudio } from './gunaudio.js';
import { GunKeys } from './gunkeys.js';
import { Gunsmith } from './parts.js';
// When the gun sounds are made (js/gunkeys.ts says which, js/gunaudio.ts renders them, js/gunsoundcache.ts keeps them between visits). Three moments:
//   - a level loads (levelStart): every gun it can have is queued, the ones the level can't start without first (your guns with what's loaded, the weapon
//     case's gun), a few renders at a time; the loading veil waits for those (hold), for a few seconds at most
//   - a gun comes into someone's hands or inventory, or its build changes (acquire, acquireDef, lootGun): its loaded round at once, its other loads behind
//   - a teammate's state shows another gun (Views.applySnap -> acquireCode)
// Priorities (GunAudio.PRI): a shot that found its report missing > what a level waits for > everything else.
export const GunSounds = {
  CAP_MS: 4000,          // how long the loading veil waits for the urgent set, at most
  CASE_MAX: 12,          // the case gun's own loads that are all in the urgent set, if it has no more than this many (a gun of several barrels has dozens: its ball)
  LOAD_CONCURRENCY: 3,   // renders at once while a level loads
  PLAY_CONCURRENCY: 1,   // and in play
  urgent: [] as string[],
  counts: { urgent: 0, soon: 0, more: 0, total: 0 },
  _seen: new WeakSet<object>(), // defs whose other loads are queued already
  _loadT: 0,

  // The level's guns. weapons: yours (with what's loaded), pack: the guns in your backpack, team: their guns' defs, caseGun: the weapon case's (its code), enemies: the pool ids. loading: there's a veil to hold (a level come up with from outside has none).
  levelStart(o: { weapons: GWeapon[]; pack: GWeapon[]; team: Record<string, any>[]; caseGun: string | null; enemies: string[]; loading: boolean }) {
    if (!GunAudio.available()) return;
    const urgent: string[] = [], soon: string[] = [], more: string[] = [];
    for (const w of o.weapons) { const k = GunKeys.of(w); urgent.push(...k.loaded); more.push(...k.all); this._seen.add(w.def); }
    // (the weapon case's gun: the host tells the page its code and not what it's loaded with, which would change what the simulation sends: so every load of it that has a report of its own, the loaded one among them)
    const cd = o.caseGun && Gunsmith.fromCode(o.caseGun);
    if (cd) { const k = GunKeys.ofDef(cd); urgent.push(...(k.all.length <= this.CASE_MAX ? k.all : k.loaded)); more.push(...k.all); this._seen.add(cd); }
    for (const w of o.pack) { const k = GunKeys.of(w); soon.push(...k.loaded); more.push(...k.all); this._seen.add(w.def); }
    for (const d of o.team) { const k = GunKeys.ofDef(d); soon.push(...k.loaded); more.push(...k.all); this._seen.add(d); }
    soon.push(...GunKeys.enemy(o.enemies));
    const u = [...new Set(urgent)], s = [...new Set(soon)].filter((k) => !u.includes(k)), all = [...new Set([...u, ...s, ...more])];
    this.urgent = u;
    this.counts = { urgent: u.length, soon: s.length, more: all.length - u.length - s.length, total: all.length };
    GunAudio.setConcurrency(o.loading ? this.LOAD_CONCURRENCY : this.PLAY_CONCURRENCY);
    clearTimeout(this._loadT);
    if (o.loading) this._loadT = window.setTimeout(() => GunAudio.setConcurrency(this.PLAY_CONCURRENCY), 20000); // (whatever goes wrong with the veil, not left at several for good)
    (async () => {
      await GunAudio.preload(all); // (what a visit before rendered: all of it read at once)
      for (const k of u) GunAudio.buildDry(k, GunAudio.PRI.soon);
      for (const k of s) GunAudio.buildDry(k, GunAudio.PRI.background);
      for (const k of all) GunAudio.buildDry(k, GunAudio.PRI.background);
    })().catch((e) => console.warn('gun sounds', e));
  },
  // The loading veil's wait (js/views.ts applySnap, once the shaders are compiled): until the urgent set is rendered, or CAP_MS. say shows the count on the veil's line.
  hold(say?: (text: string) => void): Promise<boolean> {
    const u = this.urgent, left = () => u.filter((k) => !GunAudio.dry.has(k)).length;
    if (!GunAudio.available() || !left()) return this._release(true);
    const tick = say ? window.setInterval(() => say(`Synthesizing gun sounds ${u.length - left()} / ${u.length}`), 150) : 0;
    if (say) say(`Synthesizing gun sounds ${u.length - left()} / ${u.length}`);
    return GunAudio.whenDry(u, this.CAP_MS).then((ok) => { clearInterval(tick); return this._release(ok); });
  },
  _release<T>(v: T): Promise<T> { clearTimeout(this._loadT); GunAudio.setConcurrency(this.PLAY_CONCURRENCY); return Promise.resolve(v); },

  // A gun in someone's hands or inventory, or its build changed (w: the weapon): the round in it now at once, every other load with a report of its own behind
  acquire(w: GWeapon, urgent = true) {
    if (!GunAudio.available()) return;
    const k = GunKeys.of(w);
    GunAudio.ensure(k.loaded, urgent ? GunAudio.PRI.urgent : GunAudio.PRI.soon);
    this._others(w.def, k);
  },
  // a gun known by its build (a teammate's, one lying on the floor): its ball, then the others
  acquireDef(def: Record<string, any>, am?: string | null, urgent = false) {
    if (!GunAudio.available() || !def) return;
    const k = GunKeys.of({ def, ammo: am || null });
    GunAudio.ensure(k.loaded, urgent ? GunAudio.PRI.urgent : GunAudio.PRI.soon);
    this._others(def, k);
  },
  acquireCode(code: string) { const d = code && Gunsmith.fromCode(code); if (d) this.acquireDef(d); },
  // a gun on the floor (js/loot.ts add: its packed item): ready by the time somebody's got it
  lootGun(packed: any) {
    if (!packed || packed.k !== 'gun' || !packed.w || !GunAudio.available()) return;
    try {
      const w = packed.w, def = Gunsmith.compile(w.id, w.build || Gunsmith.defaultBuild(w.id));
      if (!def) return;
      const k = GunKeys.of({ def, ammo: w.ammo, chamber: w.chamber, tube: w.tube });
      GunAudio.ensure(k.loaded, GunAudio.PRI.soon);
      this._others(def, k);
    } catch (e) { /* a gun the build doesn't know: nothing to prepare */ }
  },
  // The parts the attachments box shows you (they're yours to take, and fit to the gun in your hands if they go on it as it's built): the reports the gun would have with each,
  // loaded round only, made while you choose. A part that doesn't change the report (no new key) costs nothing.
  offer(w: GWeapon | null | undefined, pids: string[]) {
    if (!w || !GunAudio.available()) return;
    const GS = Gunsmith;
    for (const pid of pids) {
      try {
        const p = GS.PARTS[pid], slot = p && GS.slotsOf(w.def.id, w.def.build).find((s: any) => GS.fitsSlot(s, p, w.def.id, w.def.build));
        if (!slot) continue;
        const build: Record<string, string> = Object.assign({}, w.def.build, { [slot.slot]: pid });
        GS.prune(w.def.id, build);
        const def = GS.compile(w.def.id, build);
        if (!def || def.soundKey === w.def.soundKey) continue;
        GunAudio.ensure(GunKeys.of({ def, ammo: w.ammo, chamber: w.chamber, tube: w.tube }).loaded, GunAudio.PRI.soon);
      } catch (e) { /* a part the build can't take: nothing to prepare */ }
    }
  },
  // the round about to be fired: its report first in line (js/player.ts feed)
  chambered(def: Record<string, any>, round: string) { if (GunAudio.available()) GunAudio.buildDry(Gunsmith.roundSoundKey(def, round), GunAudio.PRI.urgent); },
  _others(def: Record<string, any>, k: { loaded: string[]; all: string[] }) {
    if (this._seen.has(def)) return;
    this._seen.add(def);
    GunAudio.ensure(k.all.filter((x) => !k.loaded.includes(x)), GunAudio.PRI.background);
  },
};
