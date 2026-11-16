// Types js/data.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/data.ts.

// The weapon table's rows. Only the fields every gun has are declared (the rest, which only some guns set, are the
// index signature: pellets, mode, hyper, choke, explosive, akimbo, integral, velK, weight...).
// a gun's class (its sound profile, CLASS_SND), which slot it's carried in (primary or sidearm) and a fire selector position
type WeaponClass = 'AR' | 'BR' | 'SMG' | 'SG' | 'LMG' | 'DMR' | 'SNP' | 'GL' | 'RAIL' | 'PST' | 'MP' | 'BOW';

type FireMode = 'semi' | 'auto' | 'burst' | 'hyper' | 'low' | 'high' | 'double' | 'triple' | 'sextuple';

interface WeaponDef {
  id: string; slot: WeaponSlot; cls: WeaponClass; tier: number; price: number; name: string; rpm: number; mag: number; reserve: number;
  reload: number; spread: number; ads: number; range: number; desc: string;
  mode: FireMode; modes?: FireMode[];
  manual?: boolean; // must be cycled by hand after every shot (bolt, pump, lever: the model's moving part says which, js/vmanim.ts): the case stays in and releasing the trigger works it (js/player.ts)
  [field: string]: any;
}

// how an enemy looks and acts: a suspect, an armoured one (heavy, boss) or a civilian
type EnemyStyle = 'suspect' | 'armored' | 'civ';

interface EnemyDef { name: string; style: EnemyStyle; hp: number; speed: number; scale: number; headMult: number; cr: number; [field: string]: any; }

interface ThemeDef { name: string; home: number; reflect: number; floor: string; wall: string; crate: string; fog: number; light: number; ceil: string; [field: string]: any; }

interface CaliberDef { name: string; group: string; box: number; per: number; rimfire?: boolean; types?: string[]; loads?: Record<string, LoadDef>; }

// Handheld ballistic shields (js/rig.ts setShield, js/player.ts shieldHit): carried on the left arm by a suspect fighting one-handed with a
// pistol in the right. Rated as G.ARMORS are, by their layers (js/ballistics.ts rating): IIIA stops handguns, III rifle ball, IV armour-piercing
// rifle rounds. The higher the rating the heavier the stuff, so the smaller the shield a man can still carry: w, h its face in metres, th its
// thickness; port: a viewport (its size, how far its middle is below the shield's top, and its glazing's layers); kg, and speed: how it
// slows the one carrying it.
interface ShieldDef { id: string; name: string; nij: string; w: number; h: number; th: number; kg: number; speed: number; layers: [MatKey, number][]; port: { w: number; h: number; down: number; layers: [MatKey, number][] } | null }

type WeaponSlot = 'p' | 's';

interface LoadDef { g: number; lg?: number; v: number; n?: number; d?: number; len?: number; choke?: number; rangeK?: number; drag?: number } // a load's figures in a caliber that has its own: g: grams (a bullet; a pellet), v: m/s at the longest effective length, n: pellets, d/len: mm of the projectile, choke: degrees, rangeK
