'use strict';
import { ammoOk, ammoTypes, ballFor, barrelMm, calOf, ENEMIES, roundSpec, shotSoundKey, WEAPONS } from './data.js';
import { Gunsmith } from './parts.js';
// Which gun sounds a level can need (js/gunaudio.ts renders them, js/gunsounds.ts decides when). A sound key is a build's
// soundKey ("id:barrelInches:device[:can]", or the plain id of a gun with no barrel spec), with "@ammo" for the few loads that
// have a report of their own (js/parts.ts roundSoundKey: subsonic, slug, birdshot, flechette, and the +P loads). A gun of
// several barrels has a report for each effective length of each round type (js/data.ts shotSoundKey). No browser here: only
// the data and the gunsmith, so a node tool can count them (tools/gunsounds.test.mjs).
interface KGun { def: Record<string, any>; ammo?: string | null; chamber?: string | null; tube?: (string | null)[] | null; rl?: string | null }
export interface GunKeys { loaded: string[]; all: string[] } // loaded: what the gun fires with what's in it now; all: that, and every other load with a report of its own

const uniq = (a: (string | null | undefined)[]): string[] => [...new Set(a.filter((k): k is string => !!k))];
const hasSpec = (key: string) => !!Gunsmith.soundSpec(key);

export const GunKeys = {
  // the rounds a gun has in it (chamber, magazine, tube): the types its next shots are
  loadedAmmo(w: KGun): string[] { return uniq([w.chamber, w.ammo, ...(w.tube || [])]); },
  // every key a gun's shots can have, by the loads in `ammo` (what it holds now) and, in all, by every type of its caliber(s)
  of(w: KGun): GunKeys {
    const def = w.def, held = this.loadedAmmo(w), loaded: string[] = [], all: string[] = [];
    const cal0 = calOf(def), b = def.barrels;
    const ofCal = (cal: string, am: string) => ammoOk(cal, am);
    // (the gun's own key: what a volley or a shot with no barrel length named plays, js/player.ts shoot, js/views.ts remoteShot)
    for (const am of held.length ? held : [ballFor(cal0)]) loaded.push(Gunsmith.roundSoundKey(def, ofCal(cal0, am)));
    for (const am of ammoTypes(cal0) || []) all.push(Gunsmith.roundSoundKey(def, am));
    if (b) for (const [rl, r] of Object.entries(b.rounds as Record<string, { cal: string }>)) {
      const sd = roundSpec(def, rl), mm = barrelMm(def, rl);
      for (const am of held.length ? held : [ballFor(r.cal)]) for (const m of mm) loaded.push(shotSoundKey(sd, m, ofCal(r.cal, am)));
      for (const am of ammoTypes(r.cal) || []) for (const m of mm) all.push(shotSoundKey(sd, m, am));
    }
    const ok = (k: string) => hasSpec(k);
    return { loaded: uniq(loaded).filter(ok), all: uniq([...loaded, ...all]).filter(ok) };
  },
  // the keys of a gun nobody's told us the load of (a teammate's, one lying on the floor): ball, and then every other
  ofDef(def: Record<string, any>, am?: string | null): GunKeys { return this.of({ def, ammo: am || null }); },
  // a suspect's gun is heard by its plain id (js/views.ts enemyShot): the level's pool (Game.enemyGuns) and what each kind carries when it has no pick (js/data.ts ENEMIES)
  enemy(pool: string[]): string[] {
    const ids = [...pool];
    for (const e of Object.values(ENEMIES as Record<string, { wpn?: string; civ?: boolean }>)) if (e.wpn && !e.civ) ids.push(e.wpn);
    return uniq(ids).filter((id) => !!WEAPONS[id] && hasSpec(id));
  },
};
