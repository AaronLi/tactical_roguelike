'use strict';
// ---------------------------------------------------------------------------
// Game content: weapons, armour, enemies, level themes.
// spread / ads are cone half-angles in degrees, recoil is degrees of kick per shot,
// range is the distance (m) where damage falloff starts, falloff is the min multiplier.
// ---------------------------------------------------------------------------

// The weapon table's rows. Only the fields every gun has are declared (the rest, which only some guns set, are the
// index signature: pellets, mode, hyper, choke, explosive, akimbo, integral, velK, weight...).
// a gun's class (its sound profile, CLASS_SND), which slot it's carried in (primary or sidearm) and a fire selector position
type WeaponClass = 'AR' | 'BR' | 'SMG' | 'SG' | 'LMG' | 'DMR' | 'SNP' | 'GL' | 'RAIL' | 'PST' | 'MP' | 'BOW';
type WeaponSlot = 'p' | 's';
type FireMode = 'semi' | 'auto' | 'burst' | 'hyper' | 'low' | 'high' | 'double' | 'triple' | 'sextuple';
interface WeaponDef {
  id: string; slot: WeaponSlot; cls: WeaponClass; tier: number; price: number; name: string; rpm: number; mag: number; reserve: number;
  reload: number; spread: number; ads: number; range: number; desc: string;
  mode: FireMode; modes?: FireMode[];
  manual?: boolean; // must be cycled by hand after every shot (bolt, pump, lever: the model's moving part says which, js/vmanim.ts): the case stays in and releasing the trigger works it (js/player.ts)
  [field: string]: any;
}
interface GunSpec {
  barrel: number; caliber: number; muzzleDevice: string; pressure: number; grain: number; bulletWeight: number; boltMass: number;
  boltLoudness: number; actionType: string; caseMaterial: string; caseLength: number; shotCount: number; suppressor?: string;
}
interface ArmorDef {
  id: string; kind: string; name: string; tier: number; prot: { at: string; layers: [string, number][] }[]; dur: number; speed: number; price: number; desc: string;
  [field: string]: any;
}
// how an enemy looks and acts: a suspect, an armoured one (heavy, boss) or a civilian
type EnemyStyle = 'suspect' | 'armored' | 'civ';
interface EnemyDef { name: string; style: EnemyStyle; hp: number; speed: number; scale: number; headMult: number; cr: number; [field: string]: any; }
interface ThemeDef { name: string; home: number; reflect: number; floor: string; wall: string; crate: string; fog: number; light: number; ceil: string; [field: string]: any; }
interface LoadDef { g: number; lg?: number; v: number; n?: number; d?: number; len?: number; choke?: number; rangeK?: number; drag?: number } // a load's figures in a caliber that has its own: g: grams (a bullet; a pellet), v: m/s at the longest effective length, n: pellets, d/len: mm of the projectile, choke: degrees, rangeK
interface CaliberDef { name: string; group: string; box: number; per: number; rimfire?: boolean; types?: string[]; loads?: Record<string, LoadDef>; }
interface AmmoDef {
  name: string; tag: string; k: number; desc: string; dragK?: number; velK?: number; massK?: number; rangeK?: number; spreadK?: number;
  pelletsK?: number; tracer?: number; glow?: number; quiet?: boolean; slug?: boolean; plus?: boolean; base?: string;
}

const G_TIER_NAMES = ['Standard', 'Common', 'Uncommon', 'Rare', 'Legendary'];
G.TIER_NAMES = G_TIER_NAMES;
const G_TIER_COLORS = ['#9aa0a6', '#7bc96f', '#4fa3ff', '#b77cff', '#ffb02e'];
G.TIER_COLORS = G_TIER_COLORS;

// Sound profiles by weapon class: f = filter cutoff, len = tail seconds, boom = bass punch, vol
const G_CLASS_SND: Record<WeaponClass, { f: number; len: number; boom: number; vol: number }> = {
  AR: { f: 2600, len: 0.16, boom: 0.6, vol: 0.55 },
  BR: { f: 2000, len: 0.22, boom: 0.8, vol: 0.65 },
  SMG: { f: 3600, len: 0.1, boom: 0.35, vol: 0.45 },
  SG: { f: 1300, len: 0.32, boom: 1.0, vol: 0.75 },
  LMG: { f: 2200, len: 0.18, boom: 0.7, vol: 0.6 },
  DMR: { f: 1900, len: 0.3, boom: 0.9, vol: 0.7 },
  SNP: { f: 1500, len: 0.5, boom: 1.2, vol: 0.85 },
  GL: { f: 700, len: 0.2, boom: 0.6, vol: 0.5 },
  RAIL: { f: 5000, len: 0.45, boom: 0.5, vol: 0.7 },
  PST: { f: 3000, len: 0.13, boom: 0.4, vol: 0.5 },
  MP: { f: 3800, len: 0.09, boom: 0.3, vol: 0.42 },
  BOW: { f: 900, len: 0.12, boom: 0, vol: 0.2 },
};
G.CLASS_SND = G_CLASS_SND;

// spread / ads: the cone (degrees, its half-angle) a round leaves in around where the gun points, from the hip and
// aimed. ads is the gun's own mechanical accuracy: a cone ads degrees round makes a group 120 x ads MOA across, set
// from what the real gun groups with service ammunition (an M4 3 MOA, an AKM 5, an SR-25 1, an AWM 0.5, a service
// pistol 8-10). What the shooter adds (breathing, moving, recoil, a flinch) is on top of it: js/player.ts aimOffset.
// recoil (degrees a shot climbs) is worked out from the round and the gun's weight (G.physRecoil, below); only guns
// without a cartridge (the railgun, the crossbow) set their own.
const W = (o: Record<string, any>): WeaponDef => Object.assign({ pellets: 1, mode: 'auto', pen: 0, zoom: 0.8, speed: 1, falloff: 0.6, shell: false, burst: 0 } as Record<string, any>, o) as WeaponDef;

const G_WEAPON_LIST: WeaponDef[] = [
  // ----- PRIMARY: assault / battle rifles -----
  W({ id: 'm4', slot: 'p', cls: 'AR', tier: 1, price: 900, name: 'Mk18 CQBR', rpm: 780, mag: 30, reserve: 180, reload: 2.2, spread: 2.8, ads: 0.025, range: 35, speed: 0.95, desc: 'A short-barrelled carbine for close quarters: quick through a doorway, a little less reach.' }),
  W({ id: 'ak', slot: 'p', cls: 'AR', tier: 1, price: 1000, name: 'KV-47', rpm: 600, mag: 30, reserve: 180, reload: 2.5, spread: 3.2, ads: 0.04167, range: 35, speed: 0.94, pen: 1, desc: 'Hits like a truck, kicks like a mule. Punches through one target.' }),
  W({ id: 'f2', slot: 'p', cls: 'AR', tier: 2, price: 1500, name: 'F2 Bullpup', rpm: 950, mag: 30, reserve: 210, reload: 2.4, spread: 2.6, ads: 0.02917, range: 32, speed: 0.97, desc: 'Compact bullpup with a blistering cyclic rate.' }),
  W({ id: 'g36', slot: 'p', cls: 'AR', tier: 2, price: 1600, name: 'G36 Ranger', rpm: 720, mag: 30, reserve: 210, reload: 2.3, spread: 2.2, ads: 0.02083, range: 45, zoom: 0.62, speed: 0.95, desc: 'Laser-flat recoil. Rail on top for whatever optic you like.' }),
  W({ id: 'br3', slot: 'p', cls: 'AR', tier: 2, price: 1700, name: 'Hellfire BR-3', rpm: 1000, mode: 'burst', burst: 3, burstRpm: 1600, mag: 30, reserve: 210, reload: 2.3, spread: 2.4, ads: 0.01667, range: 40, zoom: 0.7, speed: 0.95, desc: 'Semi, or a three-round burst at 1600 rpm: all three are out before the recoil lands. Pull, pull, everyone falls.' }),
  W({ id: 'scar', slot: 'p', cls: 'BR', tier: 3, price: 2400, name: 'SCAR-H', rpm: 580, mag: 20, reserve: 160, reload: 2.4, spread: 2.6, ads: 0.01458, range: 50, zoom: 0.62, speed: 0.93, pen: 1, desc: '7.62 battle rifle. Armour is a suggestion.' }),
  W({ id: 'tavor', slot: 'p', cls: 'AR', tier: 3, price: 2600, name: 'TX-9 Tavor', rpm: 900, mag: 40, reserve: 240, reload: 2.1, spread: 2.2, ads: 0.02917, range: 42, zoom: 0.7, speed: 0.98, desc: 'Top-shelf rifle with a big mag and no weaknesses.' }),
  // ----- PRIMARY: SMGs -----
  W({ id: 'uzi', slot: 'p', cls: 'SMG', tier: 1, price: 600, name: 'Micro Uzi', rpm: 1000, mag: 32, reserve: 224, reload: 1.8, spread: 3.6, ads: 0.075, range: 14, falloff: 0.5, speed: 1.06, desc: 'Spray and pray. Mostly spray.' }),
  W({ id: 'mp5', slot: 'p', cls: 'SMG', tier: 1, price: 800, name: 'MP5', rpm: 800, mag: 30, reserve: 210, reload: 2.0, spread: 2.6, ads: 0.025, range: 20, falloff: 0.5, speed: 1.05, desc: 'The classic room-clearer.' }),
  W({ id: 'p90', slot: 'p', cls: 'SMG', tier: 2, price: 1400, name: 'P90', rpm: 900, mag: 50, reserve: 250, reload: 2.6, spread: 2.8, ads: 0.03333, range: 22, falloff: 0.5, speed: 1.04, pen: 1, desc: '50 rounds of armour-piercing 5.7mm.' }),
  W({ id: 'vector', slot: 'p', cls: 'SMG', tier: 3, price: 2200, name: 'Vector .45', rpm: 1200, mag: 25, reserve: 200, reload: 1.9, spread: 2.4, ads: 0.03333, range: 18, falloff: 0.5, speed: 1.07, desc: 'Absurd fire rate, tamed recoil. Melts at close range.' }),
  // ----- PRIMARY: shotguns -----
  W({ id: 'pump', manual: true, slot: 'p', cls: 'SG', tier: 1, price: 800, name: '870 Pump', pellets: 8, rpm: 70, mode: 'semi', mag: 6, reserve: 36, reload: 0.55, shell: true, choke: 0.75, spread: 4.5, ads: 0.04167, range: 16, falloff: 0.25, speed: 1.0, desc: 'Load one, rack it, clear the room.' }),
  W({ id: 'dbl', slot: 'p', cls: 'SG', tier: 1, price: 700, name: 'Double Barrel', pellets: 9, rpm: 400, mode: 'semi', mag: 2, reserve: 30, reload: 2.0, choke: 0.6, spread: 5, ads: 0.05, range: 18, falloff: 0.25, speed: 1.0, desc: 'Two shells. Make them count.' }),
  W({ id: 'saiga', slot: 'p', cls: 'SG', tier: 2, price: 1600, name: 'Saiga-12', pellets: 8, rpm: 260, mode: 'semi', mag: 8, reserve: 48, reload: 2.6, choke: 0.8, spread: 4.5, ads: 0.05, range: 16, falloff: 0.25, speed: 0.98, desc: 'Semi-auto, box-fed, deeply rude.' }),
  W({ id: 'aa12', slot: 'p', cls: 'SG', tier: 3, price: 2800, name: 'AA-12', pellets: 8, rpm: 300, mode: 'auto', mag: 20, reserve: 60, reload: 3.0, choke: 0.9, spread: 5, ads: 0.05833, range: 15, falloff: 0.25, speed: 0.96, desc: 'Fully automatic shotgun with a drum. Yes, really.' }),
  // ----- PRIMARY: LMGs -----
  W({ id: 'm249', slot: 'p', cls: 'LMG', tier: 2, price: 2000, name: 'M249 SAW', rpm: 800, mag: 100, reserve: 300, reload: 5.0, spread: 3.6, ads: 0.04167, range: 35, speed: 0.86, pen: 1, desc: 'Suppressive fire, belt-fed.' }),
  W({ id: 'pkm', slot: 'p', cls: 'LMG', tier: 3, price: 3000, name: 'PKM', rpm: 650, mag: 100, reserve: 300, reload: 5.5, spread: 3.6, ads: 0.03333, range: 40, speed: 0.83, pen: 2, desc: 'Full-power rounds, a hundred at a time.' }),
  W({ id: 'shredder', slot: 'p', cls: 'LMG', tier: 4, price: 4400, name: 'Shredder Minigun', rpm: 1900, mag: 200, reserve: 600, reload: 6.0, spread: 4.2, ads: 0.06667, range: 25, speed: 0.72, spinUp: 0.55, desc: 'A 5.56 microgun that shares belt boxes with the M249. Has to spin up before it fires. Then it turns rooms into confetti.' }),
  // ----- PRIMARY: marksman / sniper -----
  W({ id: 'mk14', slot: 'p', cls: 'DMR', tier: 2, price: 1800, name: 'Mk14 EBR', rpm: 330, mode: 'semi', mag: 20, reserve: 120, reload: 2.6, spread: 2.5, ads: 0.01458, range: 60, zoom: 0.45, speed: 0.93, pen: 1, desc: 'Semi-auto marksman rifle. Put a magnified optic on it.' }),
  W({ id: 'r700', manual: true, slot: 'p', cls: 'SNP', tier: 2, price: 1700, name: 'R700 Bolt', rpm: 48, mode: 'semi', mag: 5, reserve: 40, reload: 3.0, spread: 6, ads: 0.00625, range: 100, zoom: 0.3, speed: 0.9, pen: 2, desc: 'One shot, one problem solved. Bolt-action.' }),
  W({ id: 'barrett', slot: 'p', cls: 'SNP', tier: 4, price: 4200, name: 'M82 Anti-Materiel', rpm: 90, mode: 'semi', mag: 10, reserve: 40, reload: 3.8, spread: 7, ads: 0.01667, range: 120, zoom: 0.28, speed: 0.85, pen: 5, desc: '.50 BMG. Goes through walls of people.' }),
  W({ id: 'gm6', slot: 'p', cls: 'SNP', tier: 4, price: 4600, name: 'GM6 Lynx', rpm: 80, mode: 'semi', mag: 5, reserve: 30, reload: 4.0, spread: 6.5, ads: 0.01667, range: 120, zoom: 0.26, speed: 0.88, pen: 5, desc: 'The Hungarian bullpup .50. The whole barrel slams back into the body every shot (long recoil): a shove, not a kick, from a gun a foot shorter than the M82.' }),
  // ----- PRIMARY: specials -----
  W({ id: 'm32', slot: 'p', cls: 'GL', tier: 3, price: 3200, name: 'M32 Launcher', explosive: { r: 4.5, dmg: 170 }, rpm: 110, mode: 'semi', mag: 6, reserve: 18, reload: 0.7, shell: true, spread: 1, ads: 0.5, range: 100, zoom: 0.75, speed: 0.9, desc: 'Six-shot revolving grenade launcher. Mind the blast.' }),
  W({ id: 'rail', slot: 'p', cls: 'RAIL', tier: 4, price: 4800, name: 'Arc Railgun', rpm: 50, mode: 'semi', mag: 4, reserve: 24, reload: 3.2, spread: 0.6, ads: 0, recoil: 5, range: 200, zoom: 0.5, speed: 0.9, pen: 99, tracer: 0x55ddff, desc: 'Magnetically accelerated slug. Penetrates everything alive.' }),

  // ----- PRIMARY: more rifles
  W({ id: 'hk416', slot: 'p', cls: 'AR', tier: 2, price: 1700, name: 'HK416', rpm: 820, mag: 30, reserve: 210, reload: 2.2, spread: 2.4, ads: 0.01667, range: 40, zoom: 0.7, speed: 0.95, desc: 'Piston-driven carbine. Clean, flat, dependable.' }),
  W({ id: 'aug', slot: 'p', cls: 'AR', tier: 2, price: 1800, name: 'Steyr AUG', rpm: 700, mag: 30, reserve: 210, reload: 2.4, spread: 2.4, ads: 0.02083, range: 45, zoom: 0.62, speed: 0.97, desc: 'Bullpup. Long barrel, short gun.' }),
  W({ id: 'galil', slot: 'p', cls: 'AR', tier: 2, price: 1500, name: 'Galil ACE', rpm: 650, mag: 35, reserve: 210, reload: 2.5, spread: 3.0, ads: 0.025, range: 36, zoom: 0.75, speed: 0.94, pen: 1, desc: 'Kalashnikov guts, better manners. 35-round mags.' }),
  W({ id: 'an94', slot: 'p', cls: 'AR', tier: 3, price: 2700, name: 'AN-94', rpm: 600, mode: 'hyper', hyper: 2, hyperRpm: 1800, hyperKick: 1.8, autoKick: 1.35, pull: 0.45, mag: 30, reserve: 210, reload: 2.4, spread: 2.4, ads: 0.02083, range: 45, zoom: 0.75, speed: 0.95, desc: 'Hyper-burst: the first two rounds of every pull leave at 1800 rpm on one line, before either kick lands, then you take both at once. Held down it settles to 600 rpm and kicks hard, but always the same way.' }),
  W({ id: 'fal', slot: 'p', cls: 'BR', tier: 3, price: 2500, name: 'FN FAL', rpm: 650, mag: 20, reserve: 140, reload: 2.6, spread: 3.0, ads: 0.025, range: 55, zoom: 0.8, speed: 0.92, pen: 1, desc: 'The right arm of the free world. Full-power 7.62, full-auto, full send.' }),
  W({ id: 'garand', slot: 'p', cls: 'DMR', tier: 2, price: 1600, name: 'M1 Garand', rpm: 300, mode: 'semi', mag: 8, reserve: 64, reload: 2.2, enbloc: true, spread: 2.2, ads: 0.02083, range: 70, zoom: 0.8, speed: 0.93, pen: 1, desc: 'En-bloc clip: can only be reloaded when empty, and it pings when it is.' }),
  W({ id: 'svd', slot: 'p', cls: 'DMR', tier: 3, price: 2600, name: 'SVD Dragunov', rpm: 260, mode: 'semi', mag: 10, reserve: 60, reload: 2.8, spread: 2.8, ads: 0.0125, range: 80, zoom: 0.4, speed: 0.92, pen: 1, desc: 'Semi-auto marksman rifle. Wants a scope on that rail.' }),
  W({ id: 'vss', slot: 'p', cls: 'DMR', tier: 3, price: 2900, name: 'VSS Vintorez', rpm: 750, mag: 20, reserve: 140, reload: 2.4, spread: 2.6, ads: 0.025, range: 35, zoom: 0.45, speed: 0.97, pen: 1, integral: true, desc: 'Integrally suppressed, subsonic 9x39, full-auto. Whisper-quiet.' }),
  W({ id: 'lever', manual: true, slot: 'p', cls: 'DMR', tier: 2, price: 1300, name: 'Marlin .45-70', rpm: 75, mode: 'semi', mag: 6, reserve: 42, reload: 0.55, shell: true, spread: 2.6, ads: 0.02083, range: 50, zoom: 0.8, speed: 0.96, pen: 1, desc: 'Lever-action brush gun. Loads round by round, hits like a bear.' }),
  W({ id: 'mosin', manual: true, slot: 'p', cls: 'SNP', tier: 1, price: 1000, name: 'Mosin-Nagant', rpm: 40, mode: 'semi', mag: 5, reserve: 40, reload: 0.5, shell: true, spread: 6, ads: 0.02083, range: 90, zoom: 0.32, speed: 0.92, pen: 1, desc: 'Cheap, ancient, scoped. Bolt-action, loaded one round at a time.' }),
  W({ id: 'awm', manual: true, slot: 'p', cls: 'SNP', tier: 3, price: 3200, name: 'AWM .338', rpm: 45, mode: 'semi', mag: 5, reserve: 35, reload: 3.4, spread: 6.5, ads: 0.00417, range: 120, zoom: 0.26, speed: 0.88, pen: 3, desc: '.338 Lapua Magnum. Through cover, through them, through the next one.' }),
  // ----- PRIMARY: more SMGs
  W({ id: 'thompson', slot: 'p', cls: 'SMG', tier: 2, price: 1600, name: 'Thompson M1928', rpm: 700, mag: 50, reserve: 200, reload: 3.0, spread: 3.0, ads: 0.05, range: 18, falloff: 0.5, speed: 1.0, desc: 'Drum-fed .45. Chicago typewriter.' }),
  W({ id: 'ppsh', slot: 'p', cls: 'SMG', tier: 2, price: 1500, name: 'PPSh-41', rpm: 1000, mag: 71, reserve: 213, reload: 3.2, spread: 3.4, ads: 0.06667, range: 18, falloff: 0.5, speed: 1.0, desc: '71-round drum. Quantity has a quality all its own.' }),
  W({ id: 'mp5sd', slot: 'p', cls: 'SMG', tier: 2, price: 1700, name: 'MP5SD', rpm: 750, mag: 30, reserve: 210, reload: 2.0, spread: 2.4, ads: 0.02917, range: 18, falloff: 0.5, speed: 1.05, integral: true, desc: 'Integrally suppressed 9mm. Enemies barely hear it.' }),
  // ----- PRIMARY: more shotguns
  W({ id: 'ksg', manual: true, slot: 'p', cls: 'SG', tier: 2, price: 1900, name: 'KSG', pellets: 8, rpm: 75, mode: 'semi', mag: 14, reserve: 42, reload: 0.45, shell: true, choke: 0.75, spread: 4.5, ads: 0.04167, range: 16, falloff: 0.25, speed: 0.98, desc: 'Bullpup pump with twin tubes. Fourteen shells before you reload.' }),
  W({ id: 'slug', slot: 'p', cls: 'SG', tier: 2, price: 1500, name: 'Slug Gun', pellets: 1, rpm: 220, mode: 'semi', mag: 7, reserve: 42, reload: 0.5, shell: true, spread: 2.2, ads: 0.02083, range: 30, falloff: 0.45, speed: 0.98, pen: 1, desc: 'Semi-auto 12-gauge loaded with solid slugs. A shotgun that reaches.' }),
  // ----- PRIMARY: LMG / special
  W({ id: 'm60', slot: 'p', cls: 'LMG', tier: 3, price: 3100, name: 'M60', rpm: 550, mag: 100, reserve: 300, reload: 6.0, spread: 3.8, ads: 0.04167, range: 45, speed: 0.82, pen: 2, desc: 'The Pig. Heavy, slow-firing, devastating.' }),
  // ----- PRIMARY: the 2nd round (and the conversions: guns that are another gun's receiver with a different
  // kit in it, see js/parts.ts RCV)
  W({ id: 'ak74', slot: 'p', cls: 'AR', tier: 2, price: 1400, name: 'AK-74M', rpm: 650, mag: 30, reserve: 210, reload: 2.4, spread: 2.8, ads: 0.02917, range: 38, zoom: 0.75, speed: 0.95, desc: 'The 5.45 Kalashnikov: AK furniture, a flatter, lighter round. Takes AN-94 magazines.' }),
  W({ id: 'aks74u', slot: 'p', cls: 'AR', tier: 1, price: 1100, name: 'AKS-74U', rpm: 700, mag: 30, reserve: 210, reload: 2.2, spread: 3.2, ads: 0.05, range: 22, falloff: 0.5, speed: 1.02, desc: 'A rifle cut down to SMG size. Loud, short, takes 5.45 AK-74 magazines.' }),
  W({ id: 'rpk', slot: 'p', cls: 'LMG', tier: 2, price: 1900, name: 'RPK', rpm: 600, mag: 40, reserve: 200, reload: 3.0, spread: 3.2, ads: 0.03333, range: 42, speed: 0.88, pen: 1, desc: 'An AK with a long heavy barrel and a bipod. Magazine-fed: any 7.62×39 AK magazine, and the 75-round drum was made for it.' }),
  W({ id: 'scarl', slot: 'p', cls: 'AR', tier: 2, price: 1900, name: 'SCAR-L', rpm: 625, mag: 30, reserve: 210, reload: 2.3, spread: 2.4, ads: 0.01667, range: 40, zoom: 0.7, speed: 0.95, desc: 'The SCAR in 5.56: soft-shooting, takes STANAG magazines.' }),
  W({ id: 'm27', slot: 'p', cls: 'AR', tier: 3, price: 2400, name: 'M27 IAR', rpm: 750, mag: 30, reserve: 270, reload: 2.4, spread: 2.6, ads: 0.01667, range: 45, zoom: 0.7, speed: 0.92, desc: 'An automatic rifle built to keep firing: heavy barrel, bipod, STANAG magazines.' }),
  W({ id: 'm14', slot: 'p', cls: 'BR', tier: 2, price: 1900, name: 'M14', rpm: 700, mag: 20, reserve: 140, reload: 2.6, spread: 2.8, ads: 0.02083, range: 55, zoom: 0.8, speed: 0.92, pen: 1, desc: 'Walnut and 7.62 NATO. Fit the EBR chassis kit and it becomes a Mk14.' }),
  W({ id: 'sr25', slot: 'p', cls: 'DMR', tier: 3, price: 2600, name: 'SR-25', rpm: 360, mode: 'semi', mag: 20, reserve: 120, reload: 2.5, spread: 2.4, ads: 0.00833, range: 65, zoom: 0.45, speed: 0.93, pen: 1, desc: 'An AR-10 marksman rifle: AR controls, AR parts, 7.62 NATO.' }),
  W({ id: 'mpx', slot: 'p', cls: 'SMG', tier: 2, price: 1500, name: 'MPX', rpm: 850, mag: 30, reserve: 210, reload: 2.0, spread: 2.4, ads: 0.025, range: 22, falloff: 0.5, speed: 1.04, desc: 'A 9mm SMG that handles like an AR: buffer tube, AR grip, AR rail.' }),
  W({ id: 'benelli', slot: 'p', cls: 'SG', tier: 2, price: 1800, name: 'Benelli M4', pellets: 8, rpm: 240, mode: 'semi', mag: 7, reserve: 42, reload: 0.5, shell: true, choke: 0.8, spread: 4.5, ads: 0.04167, range: 16, falloff: 0.25, speed: 0.98, desc: 'Semi-auto, tube-fed, AR stock and grip. Fast follow-ups, slow to top up (fit a speed loader).' }),
  W({ id: 'vepr', slot: 'p', cls: 'SG', tier: 2, price: 1700, name: 'Vepr-12', pellets: 8, rpm: 280, mode: 'semi', mag: 8, reserve: 48, reload: 2.5, choke: 0.8, spread: 4.5, ads: 0.05, range: 16, falloff: 0.25, speed: 0.98, desc: 'The better-mannered Saiga: same magazines, softer recoil.' }),
  W({ id: 'ar9', slot: 'p', cls: 'SMG', tier: 1, price: 900, name: 'AR-9', rpm: 900, mag: 33, reserve: 198, reload: 2.1, spread: 2.6, ads: 0.03333, range: 20, falloff: 0.5, speed: 1.03, desc: 'A dedicated 9mm AR: its own lower, the magazine well a Glock-pattern one raked like a Glock\'s grip, on a blowback upper. Glock magazines, AR furniture.' }),
  W({ id: 'aug9', slot: 'p', cls: 'SMG', tier: 2, price: 1500, name: 'AUG 9mm', rpm: 750, mag: 33, reserve: 198, reload: 2.2, spread: 2.2, ads: 0.03333, range: 24, zoom: 0.62, falloff: 0.5, speed: 1.03, desc: 'The AUG with its 9mm conversion: a long, quiet-handling bullpup SMG on Glock magazines.' }),
  W({ id: 'qbz95', slot: 'p', cls: 'AR', tier: 2, price: 1600, name: 'QBZ-95', rpm: 650, mag: 30, reserve: 210, reload: 2.4, spread: 2.4, ads: 0.025, range: 44, zoom: 0.72, speed: 0.97, desc: 'The PLA\'s bullpup: 5.8×42, a long barrel in a short gun, its sights in the carrying handle. Shares its magazines with the QBZ-192.' }),
  W({ id: 'qbz192', slot: 'p', cls: 'AR', tier: 2, price: 1800, name: 'QBZ-192', rpm: 750, mag: 30, reserve: 210, reload: 2.2, spread: 2.5, ads: 0.025, range: 36, zoom: 0.72, speed: 0.97, desc: 'The QBZ-95\'s conventional successor, cut down to a carbine: a full-length rail, a side-folding stock, the same 5.8×42 magazines.' }),
  W({ id: 'mcx', slot: 'p', cls: 'AR', tier: 2, price: 2000, name: 'SIG MCX', rpm: 850, mag: 30, reserve: 210, reload: 2.1, spread: 2.5, ads: 0.025, range: 34, zoom: 0.72, speed: 0.98, desc: 'A piston AR with no buffer tube: its stock folds. Barrels, handguards and stocks swap to make it a Rattler, a Virtus or a Spear LT. STANAG magazines.' }),
  W({ id: 'crossbow', slot: 'p', cls: 'BOW', tier: 2, price: 1400, name: 'Crossbow', rpm: 40, mode: 'semi', mag: 1, reserve: 20, reload: 1.7, spread: 0.8, ads: 0.01667, recoil: 1.0, range: 60, falloff: 0.7, zoom: 0.6, speed: 1.0, pen: 1, tracer: 0x8b5a2b, desc: 'Silent. Enemies two steps away won\'t hear it. One bolt per reload.' }),

  // ----- SECONDARY -----
  W({ id: 'p9', slot: 's', cls: 'PST', tier: 0, price: 150, name: 'P9 Pistol', rpm: 450, mode: 'semi', mag: 15, reserve: 90, reload: 1.5, spread: 2.2, ads: 0.08333, range: 18, speed: 1.0, desc: 'Standard issue. Better than throwing it.' }),
  W({ id: 'm1911', slot: 's', cls: 'PST', tier: 1, price: 300, name: 'M1911', rpm: 380, mode: 'semi', mag: 8, reserve: 64, reload: 1.6, spread: 2, ads: 0.06667, range: 20, desc: 'A century of .45 ACP.' }),
  W({ id: 'g18', slot: 's', cls: 'MP', tier: 1, price: 500, name: 'G18 Auto', rpm: 1100, mag: 33, reserve: 132, reload: 1.6, spread: 3.2, ads: 0.1, range: 14, falloff: 0.5, desc: 'Full-auto pistol. Empty in a blink.' }),
  W({ id: 'skorp', slot: 's', cls: 'MP', tier: 1, price: 450, name: 'Skorpion', rpm: 950, mag: 20, reserve: 140, reload: 1.8, spread: 3, ads: 0.1, range: 14, falloff: 0.5, desc: 'Tiny machine pistol, controllable bite.' }),
  W({ id: 'auto9', slot: 's', cls: 'PST', tier: 2, price: 750, name: 'Auto-9', rpm: 1100, mode: 'burst', burst: 3, mag: 18, reserve: 108, reload: 1.7, spread: 2.2, ads: 0.06667, range: 20, desc: 'Burst-fire sidearm for decisive people.' }),
  W({ id: 'deagle', slot: 's', cls: 'PST', tier: 2, price: 900, name: 'Desert Eagle', rpm: 220, mode: 'semi', mag: 7, reserve: 42, reload: 1.9, spread: 2.5, ads: 0.06667, range: 30, pen: 1, desc: '.50 AE hand-howitzer.' }),
  W({ id: 'rev', slot: 's', cls: 'PST', tier: 2, price: 800, name: '.357 Revolver', rpm: 160, mode: 'semi', mag: 6, reserve: 42, reload: 0.6, shell: true, loadFull: 2.8, spread: 1.8, ads: 0.05, range: 30, pen: 1, desc: 'Six for sure.' }),
  W({ id: 'sawn', slot: 's', cls: 'SG', tier: 2, price: 650, name: 'Sawed-Off', pellets: 8, rpm: 400, mode: 'semi', mag: 2, reserve: 24, reload: 1.8, choke: 1.8, spread: 6, ads: 0.08333, range: 9, falloff: 0.25, desc: 'Pocket shotgun for close friends.' }),
  W({ id: 'hc500', slot: 's', cls: 'PST', tier: 3, price: 1400, name: '.500 Hand Cannon', rpm: 110, mode: 'semi', mag: 5, reserve: 30, reload: 0.7, shell: true, loadFull: 2.6, spread: 2, ads: 0.05, range: 40, pen: 2, desc: 'Sidearm with sniper-rifle opinions.' }),
  W({ id: 'pocketgl', slot: 's', cls: 'GL', tier: 3, price: 1500, name: 'Pocket Launcher', explosive: { r: 3.6, dmg: 130 }, rpm: 60, mode: 'semi', mag: 1, reserve: 8, reload: 1.6, spread: 1, ads: 0.5, range: 80, desc: 'Single-shot 40mm. Emergency room-clearer.' }),
  W({ id: 'mp7', slot: 's', cls: 'MP', tier: 3, price: 1300, name: 'MP7 Compact', rpm: 950, mag: 30, reserve: 180, reload: 1.9, spread: 2.2, ads: 0.02917, range: 20, pen: 1, desc: 'A full SMG that fits in a holster.' }),
  W({ id: 'usp', slot: 's', cls: 'PST', tier: 1, price: 500, name: 'USP .45', rpm: 380, mode: 'semi', mag: 12, reserve: 72, reload: 1.6, spread: 1.8, ads: 0.06667, range: 22, desc: 'Match-grade .45. Takes a suppressor beautifully.' }),
  W({ id: 'mac10', slot: 's', cls: 'MP', tier: 1, price: 450, name: 'MAC-10', rpm: 1100, mag: 30, reserve: 150, reload: 1.8, spread: 3.8, ads: 0.11667, range: 12, falloff: 0.5, desc: 'A brick that sprays .45 ACP.' }),
  W({ id: 'akimbo', slot: 's', cls: 'PST', tier: 2, price: 900, name: 'Akimbo Berettas', rpm: 700, mode: 'semi', mag: 30, reserve: 150, reload: 2.6, spread: 2.8, ads: 2.8, range: 18, akimbo: true, desc: 'One in each hand, alternating. No aiming down sights, no regrets.' }),
  W({ id: 'judge', slot: 's', cls: 'SG', tier: 2, price: 700, name: 'The Judge', pellets: 5, rpm: 200, mode: 'semi', mag: 5, reserve: 35, reload: 0.65, shell: true, loadFull: 2.6, choke: 2.2, spread: 4.5, ads: 0.1, range: 8, falloff: 0.25, desc: 'A revolver that fires .410 buckshot.' }),
  W({ id: 'g19', slot: 's', cls: 'PST', tier: 1, price: 350, name: 'G19 Compact', rpm: 450, mode: 'semi', mag: 15, reserve: 90, reload: 1.4, spread: 2.2, ads: 0.08333, range: 18, speed: 1.0, desc: 'Compact 9mm. Takes every Glock magazine, and a stock if you want one.' }),
  W({ id: 'tx22', slot: 's', cls: 'MP', tier: 0, price: 200, name: 'Taurus TX22', rpm: 1050, mag: 16, reserve: 160, reload: 1.4, spread: 2.4, ads: 0.0833, range: 14, falloff: 0.55, speed: 1.02, desc: 'A rimfire plinker someone made fully automatic: .22 LR, 16 rounds, threaded from the factory, hardly kicks. Lots of small holes.' }),
  W({ id: 'derringer', slot: 's', cls: 'PST', tier: 1, price: 250, name: 'Derringer', rpm: 300, mode: 'semi', mag: 2, reserve: 30, reload: 1.6, spread: 2.5, ads: 0.16667, range: 13, desc: 'Two rounds of .44 Magnum in your palm. Hold on tight.' }),
  W({ id: 'b92', slot: 's', cls: 'MP', tier: 1, price: 600, name: '92FS Burst', rpm: 1100, mode: 'burst', burst: 3, mag: 15, reserve: 90, reload: 1.6, spread: 2.4, ads: 0.08333, range: 20, desc: 'The Italian service pistol with a third position on the selector. Three rounds a pull.' }),
  W({ id: 'ppk', slot: 's', cls: 'PST', tier: 0, price: 250, name: 'Walther PPK', rpm: 400, mode: 'semi', mag: 7, reserve: 56, reload: 1.4, spread: 2.2, ads: 0.1, range: 14, desc: 'Slim, quiet and easy to forget about, which is the idea.' }),
  W({ id: 'fiveseven', slot: 's', cls: 'PST', tier: 2, price: 1100, name: 'Five-seveN', rpm: 450, mode: 'semi', mag: 20, reserve: 100, reload: 1.6, spread: 1.8, ads: 0.06667, range: 28, pen: 1, desc: 'Twenty rounds of 5.7 mm, flat and fast. A rifle round\'s manners in a pistol.' }),
  // The authored pistols (models/maxim9, models/welrod). Figures modelled on the P9 / G19 / USP (9x19) and the PPK (.32 ACP): see the notes at GS and GUN_KG below.
  W({ id: 'welrod', slot: 's', cls: 'PST', tier: 1, price: 700, name: 'Welrod Mk II', rpm: 80, mode: 'semi', manual: true, mag: 8, reserve: 48, reload: 1.5, spread: 1.6, ads: 0.075, range: 16, speed: 0.97, integral: true, desc: 'The wartime assassin\'s pistol: .32 ACP, an integral suppressor and a bolt you work by hand after every shot. Slow, silent, and it does not miss much.' }),
  W({ id: 'maxim9', slot: 's', cls: 'PST', tier: 2, price: 1200, name: 'Maxim 9', rpm: 450, mode: 'semi', mag: 17, reserve: 102, reload: 1.5, spread: 2.0, ads: 0.075, range: 20, speed: 0.95, integral: true, desc: 'A 9mm pistol with its suppressor built in: seventeen rounds, a long sight radius and a report you barely hear. Its front block comes off for a shorter, louder, handier gun.' }),
  W({ id: 'thor', slot: 's', cls: 'PST', tier: 4, price: 4500, name: 'Thor .50', rpm: 40, mode: 'semi', mag: 1, reserve: 10, reload: 3.2, spread: 3, ads: 0.03, range: 60, pen: 3, desc: 'One round of .50 BMG, in a pistol, because someone asked if it could be done. It can. Hold on.' }),
  // The Tempest (models/tempest, TASK 18): a stacked-round rifle, six barrels of telescoped rounds (def.barrels: js/player.ts shoot, docs/models.md "Multi-barrel guns"). Found only in weapon cases
  // (caseOnly: no shop, no kit). The figures are the user's starting values (to tune): burst specialist, class AR; tier 4 because that is how the cases rank a legendary.
  W({ id: 'tempest', slot: 'p', cls: 'AR', tier: 4, price: 6000, caseOnly: true, name: 'Tempest', rpm: 600, mode: 'semi', mag: 60, reserve: 240, reload: 4.5, spread: 2.6, ads: 0.02, range: 45, zoom: 0.75, speed: 0.9, pen: 1, caseless: true,
    barrels: { n: 6, mm0: 229, mm1: 508, groups: { top: [0, 1, 2], bottom: [3, 4, 5], all: [0, 1, 2, 3, 4, 5] }, full: 0.8, default: 'standard',
      rounds: { standard: { per: 10, mm0: 229, cal: '10/31', spec: 'tempest' }, rifle: { per: 5, mm0: 296, cal: '10/53', spec: 'tempest.rifle' } } },
    desc: 'Six barrels of stacked 10 mm caseless rounds, fired electrically: the short round, ten to a barrel, or the long rifle round, five, and the block holds whichever it was loaded with. Semi, two automatic rates, or two, three or all six barrels at once. A barrel shoots harder the fewer rounds it has left in it. Legendary.' }),
  // The Hailstorm (GitHub #38): a .22 LR volley gun, a pepperbox for a shoulder. Eight rifled barrels bored in one block (volley: how many) behind a falling-block breech: a lever
  // under the action drops the block to bare the chambers, a round goes into each by hand (shell: a short step a round, as a tube's; the empties stay in their chambers till
  // the block drops), and one pull fires every barrel that has a round in it (js/player.ts shoot). The barrels are bored to meet at volleyZ metres (each round leaves from its own
  // barrel on its own path), and each strays a little on its own (volleySpread: degrees): a fist of small holes up close that opens out with range. A curiosity: tier 2, and cheap.
  W({ id: 'hailstorm', slot: 'p', cls: 'SG', tier: 2, price: 900, name: 'Hailstorm .22', volley: 8, volleyZ: 10, volleySpread: 0.28, rpm: 300, mode: 'semi', mag: 8, reserve: 96, reload: 0.42, shell: true, spread: 3.4, ads: 0.035, range: 16, falloff: 0.55, speed: 0.98,
    desc: 'Eight .22 LR barrels in one block behind a falling-block breech. Drop the lever, thumb a round into each chamber, and one pull sends every one of them: a fist of small holes up close, a scatter further out. Slow to fill, quick to empty.' }),
];
G.WEAPON_LIST = G_WEAPON_LIST;
const G_WEAPONS: Record<string, any> = {}; // (any, not WeaponDef: icons.ts, gunsmith.ts and parts.ts index it as (G.WEAPONS[x] || {}).field)
G.WEAPONS = G_WEAPONS;
G.WEAPON_LIST.forEach((w) => { w.snd = G.CLASS_SND[w.cls]; G.WEAPONS[w.id] = w; });
// Explosive weapons (the grenade launchers) are switched off for now: no case, shop or kit turns one up.
const G_EXPLOSIVES_OFF: boolean = true;
G.EXPLOSIVES_OFF = G_EXPLOSIVES_OFF;
const G_obtainable = (w: Record<string, any> | null | undefined) => !!w && !(G.EXPLOSIVES_OFF && w.explosive);
G.obtainable = G_obtainable;
// Fire selectors (X): the positions a gun has, the first its default. Most select-fire guns come set to semi
// with full auto a click away. Cheap open-bolt guns and belt-fed machine guns have no semi: full auto only.
// The burst guns have semi and their burst (burstRpm: a burst faster than the gun's cyclic rate); the AN-94
// semi and its two-round hyper burst (hyperKick: what the pair's kick comes to, both landing together after the second
// round's gone; autoKick: each round's after that, the gun's works slamming home with nothing to hide it; pull: its
// side kick, a steady pull one way as a share of the usual, where every other gun's flips at random: js/player.ts recoilKick).
const G_AUTO_ONLY = ['mac10', 'uzi', 'aa12', 'm249', 'pkm', 'm60', 'shredder'];
G.AUTO_ONLY = G_AUTO_ONLY;
const G_FIRE_MODES: Record<string, FireMode[]> = { tempest: ['semi', 'low', 'high', 'double', 'triple', 'sextuple'], br3: ['semi', 'burst'], an94: ['semi', 'hyper'], auto9: ['semi', 'burst'], b92: ['burst', 'semi'], tx22: ['auto', 'semi'] }; // (the TX22: made full auto, it comes set to it)
G.FIRE_MODES = G_FIRE_MODES;
G.WEAPON_LIST.forEach((w) => { w.modes = G.FIRE_MODES[w.id] || (w.mode === 'semi' ? ['semi'] : G.AUTO_ONLY.includes(w.id) ? [w.mode] : ['semi', w.mode]); });
const G_MODE_NAME: Record<string, string> = { semi: 'SEMI', auto: 'AUTO', burst: 'BURST', hyper: 'HYPER', low: 'LOW AUTO', high: 'HIGH AUTO', double: 'DOUBLE', triple: 'TRIPLE', sextuple: 'SEXTUPLE' };
G.MODE_NAME = G_MODE_NAME;
// What the multi-barrel positions do (a gun with def.barrels): take = how many barrels one pull fires (group: of the top or the bottom group in def.barrels.groups, whichever has more rounds left),
// auto = the trigger repeats, rpm = its own rate (the gun's def.rpm otherwise). A mode not listed here is an ordinary one (semi, auto, burst, hyper).
const G_MODE_INFO: Record<string, { take: number; auto?: boolean; rpm?: number; group?: boolean }> = {
  low: { take: 1, auto: true, rpm: 500 }, high: { take: 1, auto: true, rpm: 1200 }, double: { take: 2 }, triple: { take: 3, group: true }, sextuple: { take: 6 },
};
G.MODE_INFO = G_MODE_INFO;
// ---- a gun of several barrels (def.barrels: n barrels of rounds fired electrically nose to tail; the model says the same, info.barrels, and the baker checks they agree)
// The ROUND LENGTH loaded decides how many rounds a barrel holds: def.barrels.rounds is a table of round types (the Tempest's: standard, 10 x 31 mm, ten a barrel; rifle, 10 x 53 mm, five),
// each with the rounds a barrel holds of it (per), its caliber (cal: CALIBERS, with its own loads) and the sound spec it fires with (spec: GUN_SPECS). One block is one type: a weapon
// (w.rl) and a block item (it.rl) say which, and its capacity, bookkeeping, boxes and loads all follow it.
// The round type a weapon or block has loaded (its rl, or the gun's default) and what the gun's table says of it.
const G_roundOf = (def: Record<string, any>, rl?: string | null): { rl: string; per: number; cal: string; spec: string } | null => {
  const b = def.barrels;
  if (!b) return null;
  const k = rl && b.rounds[rl] ? rl : b.default;
  return Object.assign({ rl: k }, b.rounds[k]);
};
G.roundOf = G_roundOf;
// the rounds one barrel of this weapon / block holds (a weapon with .def and .rl, or a def: its default type's)
const G_perOf = (x: Record<string, any>): number => { const r = G.roundOf(x.def || x, x.def ? x.rl : null); return r ? r.per : 0; };
G.perOf = G_perOf;
// the caliber a gun's, a block's or a magazine item's rounds are (a weapon with .def, an item with .wid, or a def): the loaded round type's for a gun of several barrels, else the gun's own
const G_cartOf = (x: Record<string, any>): string => { const d = x.def || (x.wid && G.WEAPONS[x.wid]) || x, r = G.roundOf(d, x.def || x.wid ? x.rl : null); return r ? r.cal : G.calOf(d); };
G.cartOf = G_cartOf;
// every caliber a gun can be loaded with (a gun of several barrels takes each of its round types')
const G_calsOf = (d: Record<string, any>): string[] => (d.barrels ? Object.values(d.barrels.rounds).map((r: any) => r.cal) : [G.calOf(d)]);
G.calsOf = G_calsOf;
// a gun's stats as that one of its calibers' round sees them (a gun of several barrels with a round type's caliber; any other gun: itself)
const G_asCal = (d: Record<string, any>, cal: string) => (G.calOf(d) === cal ? d : Object.assign(Object.create(d), { rcal: cal }));
G.asCal = G_asCal;
// the capacity of a gun's magazine as it is loaded: a weapon (a gun of several barrels: n barrels of what its block's round type holds) or a def
const G_capOf = (x: Record<string, any>): number => { const d = x.def || x; return d.barrels ? d.barrels.n * G.perOf(x) : d.mag; };
G.capOf = G_capOf;
// Each barrel's rounds are bookkept in w.bl (rounds left per barrel; w.mag is their sum and stays the one number everything else reads). A magazine put in, or a gun
// picked up with no bookkeeping, spreads its rounds evenly, the lowest barrels the emptier (the way fullest-first would have left them: see pickBarrels).
const G_barrelsOf = (w: { def: Record<string, any>; mag: number; rl?: string | null; bl?: number[] | null }): number[] | null => {
  const b = w.def.barrels;
  if (!b) return null;
  const per = G.perOf(w);
  if (!w.bl || w.bl.length !== b.n || w.bl.reduce((a: number, x: number) => a + x, 0) !== w.mag) { const n = Math.max(0, Math.min(w.mag, b.n * per)); w.bl = Array.from({ length: b.n }, (_, i) => Math.min(per, Math.floor(n / b.n) + (i >= b.n - (n % b.n) ? 1 : 0))); }
  return w.bl;
};
G.barrelsOf = G_barrelsOf;
// Which barrels a pull of the trigger fires, in this mode. One or two (or any number a mode takes): the FULLEST barrels, ties to the lowest, so the barrels empty evenly and each
// barrel's run of shots goes from its shortest effective length to its longest together. A group mode (three) fires the top or the bottom group (def.barrels.groups), whichever
// has more rounds left (the top on a tie), and only the barrels in it that still have a round. Fewer rounds than the mode asks for: what there is.
const G_pickBarrels = (w: { def: Record<string, any>; mag: number; bl?: number[] | null }, mode: string): number[] => {
  const b = w.def.barrels, bl = G.barrelsOf(w)!, mi = G.MODE_INFO[mode] || { take: 1 };
  const sum = (g: number[]) => g.reduce((a, i) => a + bl[i], 0);
  let pool: number[] = bl.map((_: number, i: number) => i);
  if (mi.group) { const t = b.groups.top, u = b.groups.bottom; pool = sum(u) > sum(t) ? u : t; }
  return pool.filter((i) => bl[i] > 0).sort((p, q) => bl[q] - bl[p] || p - q).slice(0, mi.take);
};
G.pickBarrels = G_pickBarrels;
// A shot from barrel i as the gun sees it: the barrel's effective length (the loaded round type's list: G.barrelMm, indexed by the rounds already fired from it) sets the muzzle velocity, and with it the
// damage (energy) and the range, from def.barrels.full (x0.8) at the shortest length of any round type (mm0) to x1.0 at the longest (mm1: the same last shot for every type). The velocity is the build's
// own at its longest, times the square root of that factor (energy goes with its square). eff: that effective length in mm, k: the factor.
// The effective barrel lengths (mm) of a round type of a gun of several barrels, one per round of a barrel, shortest first: the model's own (info.barrels.rounds[type].effective_mm, as soon as the gun's
// platform index is loaded: the game reads it there and nowhere else) or, until then, the same count spread evenly from the table's mm0 (the default type) or the type's own first length (rounds.<type>.mm0) to mm1, evenly (a stand-in with the same ends: the baker checks them against the model).
const G_barrelMm = (def: Record<string, any>, rl?: string | null): number[] => {
  const b = def.barrels, r = G.roundOf(def, rl)!, info = G.Models && G.Models.infoOf ? G.Models.infoOf(def) : null, list = info && info.barrels && info.barrels.rounds && info.barrels.rounds[r.rl] && info.barrels.rounds[r.rl].effective_mm;
  if (list && list.length === r.per) return list;
  const lo = b.rounds[r.rl].mm0;
  return Array.from({ length: r.per }, (_, i) => lo + ((b.mm1 - lo) * i) / Math.max(1, r.per - 1));
};
G.barrelMm = G_barrelMm;
// the factor (0.8 .. 1) a shot of this effective length has: damage (energy) and range, and the report's gain squared. One scale for every round type (mm0 .. mm1), so a given length of bore gives the same share of the
// full figures whatever the round: the rifle round's first shot (296 mm) is already fuller than the standard's (229 mm).
const G_shotK = (def: Record<string, any>, eff: number) => { const b = def.barrels; return b.full + (1 - b.full) * G.U.clamp((eff - b.mm0) / (b.mm1 - b.mm0), 0, 1); };
G.shotK = G_shotK;
// a gun's stats as its round type sees them (no length yet): that type's caliber and sound spec
const G_roundSpec = (def: Record<string, any>, rl?: string | null) => { const r = G.roundOf(def, rl); if (!r) return def; const d = Object.create(def); d.rcal = r.cal; d.rspec = r.spec; d.soundKey = r.spec + def.soundKey.slice(def.id.length); return d; };
G.roundSpec = G_roundSpec;
const G_shotDef = (def: Record<string, any>, w: { def: Record<string, any>; bl?: number[] | null; mag: number; rl?: string | null }, i: number) => {
  const bl = G.barrelsOf(w)!, r = G.roundOf(w.def, w.rl)!, mm: number[] = G.barrelMm(w.def, r.rl), gone = Math.max(0, Math.min(mm.length - 1, r.per - bl[i])), eff = mm[gone];
  const k = G.shotK(w.def, eff), ref = (G.GUN_SPECS[r.spec] || {}).barrel || 20;
  const d = Object.create(G.roundSpec(def, r.rl));
  d.barrelIn = eff / 25.4; d.velK = (def.velK || 1) * Math.sqrt(k) * Math.pow(ref / (eff / 25.4), 0.2); d.range = def.range * k;
  if (r.rl !== w.def.barrels.default && def.recoil) { const I0 = G.recoilImpulse(G.roundSpec(def, w.def.barrels.default), 'ball'), I = G.recoilImpulse(G.roundSpec(def, r.rl), 'ball'); if (I0 && I) d.recoil = def.recoil * Math.pow(I / I0, G.RECOIL.B); } // (a longer round pushes harder)
  return { def: d, eff, k };
};
G.shotDef = G_shotDef;
// the sound key of that shot: the gun's own, with the barrel length of the effective one (the synth's barrel length changes the report: longer is fuller and louder)
const G_shotSoundKey = (def: Record<string, any>, eff: number, am: string): string => {
  const key = G.Gunsmith.roundSoundKey(def, am), [base, load] = key.split('@'), p = base.split(':');
  if (p.length < 3) return key;
  p[1] = (eff / 25.4).toFixed(1);
  return p.join(':') + (load ? '@' + load : '');
};
G.shotSoundKey = G_shotSoundKey;
// Chambers. A closed-bolt gun (most of them) holds a round in its chamber as well as the ones in its magazine or
// tube (w.chamber: its type, or null): it fires that one, and the action feeds the next from the magazine. A
// reload with one chambered keeps it (30+1); run dry, the chamber's empty too and the reload ends by working the
// action; a magazine put in by hand leaves it empty, and the first pull of the trigger (or R) racks a round in.
// Open-bolt guns fire as the bolt closes on a round from the magazine (nothing waits in the chamber), and some
// guns' chambers are their magazine: revolvers, break actions, the Garand's clip, launchers, the crossbow and the
// railgun (and the akimbo pair, counted as one).
const G_OPEN_BOLT = ['uzi', 'mac10', 'ppsh', 'thompson', 'aa12', 'm249', 'pkm', 'm60', 'shredder'];
G.OPEN_BOLT = G_OPEN_BOLT;
const G_chambered = (def: Record<string, any> | null | undefined) => {
  if (!def || G.OPEN_BOLT.includes(def.id) || def.enbloc || def.akimbo || def.barrels || ['GL', 'BOW', 'RAIL'].includes(def.cls)) return false;
  const P = G.Gunsmith && G.Gunsmith.PLATFORMS[def.id];
  return !(P && (P.arch === 'revolver' || P.arch === 'derringer' || P.arch === 'pepperbox' || (P.spec && P.spec.rcv === 'break')));
};
G.chambered = G_chambered;
// A revolver takes loose rounds, a round at a time (its reload figure's a round's), with the cylinder swung out first
// and shut after; a speed loader or moon clips fill it all at once (loadFull, before the part's own figure: js/parts.ts).
const G_revolver = (def: Record<string, any> | null | undefined) => { const P = def && G.Gunsmith && G.Gunsmith.PLATFORMS[def.id]; return !!P && P.arch === 'revolver'; };
G.revolver = G_revolver;
const G_REV = { open: 0.55, close: 0.35 };
G.REV = G_REV;
// A falling-block breech (the Hailstorm's: a pepperbox platform) is loaded the same way: the block dropped first (its lever swung down), a round into each
// chamber, the block up after; the times are the revolver's (G.REV), and a pull of the trigger with the block down shuts it first.
const G_fblock = (def: Record<string, any> | null | undefined) => { const P = def && G.Gunsmith && G.Gunsmith.PLATFORMS[def.id]; return !!P && P.arch === 'pepperbox'; };
G.fblock = G_fblock;
// how loud a volley is, as a share of a full one (every barrel): n rounds of def.volley at once (each round's blast adds to the others': the energy, not the pressure)
const G_volleyVol = (def: Record<string, any>, n: number) => Math.sqrt(Math.max(1, n) / (def.volley || 1));
G.volleyVol = G_volleyVol;
// a whole reload from empty, as the stat cards show it (a revolver loaded by hand; a tube's stays its figure a shell)
const G_fullReload = (d: Record<string, any>) => ((G.revolver(d) || G.fblock(d)) && d.shell ? G.REV.open + d.reload * d.mag + G.REV.close : d.reload);
G.fullReload = G_fullReload;
// Bolt hold-open: the action locks back on the last round, so a reload from empty is a magazine change and a
// thumb on the bolt catch (or the slide stop), not a full rack. Every pistol with a slide, the AR-15 family and the
// rifles and SMGs built the same way; not the AK family, the MP5's roller bolt, the open-bolt guns or a bolt-action.
const G_BOLT_HOLD = new Set(['scar', 'scarl', 'g36', 'aug', 'aug9', 'tavor', 'fal', 'm14', 'mk14', 'sr25', 'barrett', 'gm6', 'mpx', 'mp7', 'vector', 'skorp', 'svd', 'ar9', 'm27', 'hk416', 'br3', 'qbz192']);
G.BOLT_HOLD = G_BOLT_HOLD;
const G_boltHold = (def: Record<string, any>) => {
  const P = def && G.Gunsmith && G.Gunsmith.PLATFORMS[def.id];
  return !!P && ((P.arch === 'pistol' && !def.manual) || G.BOLT_HOLD.has(def.id) || (P.arch === 'rifle' && (P.spec.rcv || 'ar') === 'ar')); // (the AR-15 pattern: a bolt catch over the well)
};
G.boltHold = G_boltHold;
// what's in the gun, all told: the magazine (or tube) and the chamber
const G_loaded = (w: { mag: number; chamber?: unknown } | null | undefined) => (w ? w.mag + (w.chamber ? 1 : 0) : 0);
G.loaded = G_loaded;
// Magazine families: guns that take the same magazines (one set of magazine parts, js/parts.ts MAG_FAMS).
//   stanag: NATO 5.56 (AR-15 pattern): the M4, HK416, F2000, Tavor, SCAR-L and M27
//   mp5: the MP5 and the MP5SD
//   akm: 7.62x39 AK pattern: the AK, the Galil ACE (built to take AK magazines) and the RPK
//   ak74: 5.45x39: the AK-74M, AKS-74U and AN-94
//   glock: 9mm Glock pattern: the P9, G18, G19, the AR-9 (its own Glock-pattern well) and the AUG 9mm conversion
//   m14: the M14 and the Mk14 EBR (an M14 in a chassis)
//   saiga12: the Saiga-12 and the Vepr-12
//   qbz: 5.8x42: the QBZ-95 and QBZ-192
// (The G36 and AUG are their NATO versions, on STANAG magazines; the other 7.62x51 rifles, and the .45s, each have their own.)
const G_MAG_FAMILY: Record<string, string> = {
  m4: 'stanag', hk416: 'stanag', f2: 'stanag', tavor: 'stanag', scarl: 'stanag', m27: 'stanag', mcx: 'stanag', g36: 'stanag', aug: 'stanag', qbz95: 'qbz', qbz192: 'qbz', mp5: 'mp5', mp5sd: 'mp5', ak: 'akm', galil: 'akm', rpk: 'akm',
  ak74: 'ak74', aks74u: 'ak74', an94: 'ak74', p9: 'glock', g18: 'glock', g19: 'glock', ar9: 'glock', aug9: 'glock', m14: 'm14', mk14: 'm14', saiga: 'saiga12', vepr: 'saiga12',
};
G.MAG_FAMILY = G_MAG_FAMILY;
// Belt boxes shared the same way: the linked 5.56 of the M249 and the Shredder. (Not in G.MAG_FAMILY: they're still
// belt-fed, and each keeps its own box parts, which also fit the other: js/parts.ts.)
const G_BELT_FAMILY: Record<string, string> = { m249: 'link556', shredder: 'link556' };
G.BELT_FAMILY = G_BELT_FAMILY;
const G_magFam = (wid: string): string => G.MAG_FAMILY[wid] || G.BELT_FAMILY[wid] || wid;
G.magFam = G_magFam;
// does a magazine made for gun mw go in gun gid?
const G_magFits = (mw: string, gid: string) => G.magFam(mw) === G.magFam(gid);
G.magFits = G_magFits;
// fed from a belt box (the machine guns), rather than a magazine (an LMG like the RPK that takes rifle magazines)
const G_beltFed = (def: Record<string, any>) => def.cls === 'LMG' && !G.MAG_FAMILY[def.id];
G.beltFed = G_beltFed;

// Interior-ballistics inputs for the gunshot synthesizer (js/gunshot-synth.ts), one per weapon.
// Same fields as tactical_game's weapon specs. shotCount > 1 = buckshot (diffuse crack).
// Weapons without an entry (the railgun) keep their procedural sound.
const GS = (barrel: number, caliber: number, muzzleDevice: string, pressure: number, grain: number, bulletWeight: number, boltMass: number, boltLoudness: number, actionType: string, caseMaterial: string, caseLength: number, shotCount = 1): GunSpec =>
  ({ barrel, caliber, muzzleDevice, pressure, grain, bulletWeight, boltMass, boltLoudness, actionType, caseMaterial, caseLength, shotCount });
const G_GUN_SPECS: Record<string, any> = { // (any, not GunSpec, for the same reason: (G.GUN_SPECS[x] || {}).barrel in gunsmith.ts, parts.ts; each row is a GS(), a GunSpec)
  m4:       GS(10.3, 5.56, 'flash', 55000, 0.70, 62, 0.35, 0.50, 'gas', 'brass', 45),
  ak:       GS(16.3, 7.62, 'none', 45000, 1.00, 123, 0.72, 0.70, 'longstroke', 'steel', 39),
  f2:       GS(19.2, 5.56, 'flash', 55000, 0.70, 62, 0.30, 0.55, 'roller', 'brass', 45),
  g36:      GS(18.9, 5.56, 'flash', 55000, 0.70, 62, 0.40, 0.50, 'gas', 'brass', 45),
  br3:      GS(16.0, 7.00, 'comp', 52000, 0.80, 110, 0.40, 0.50, 'gas', 'brass', 43),
  scar:     GS(16.0, 7.62, 'flash', 60000, 0.90, 147, 0.55, 0.55, 'gas', 'brass', 51),
  tavor:    GS(16.5, 5.56, 'flash', 55000, 0.70, 62, 0.40, 0.50, 'longstroke', 'brass', 45),
  uzi:      GS(4.0, 9.00, 'none', 35000, 0.35, 115, 0.60, 0.75, 'blowback', 'brass', 19),
  mp5:      GS(8.9, 9.00, 'none', 35000, 0.40, 124, 0.35, 0.55, 'roller', 'brass', 19),
  p90:      GS(10.4, 5.70, 'none', 50000, 0.50, 31, 0.25, 0.50, 'blowback', 'brass', 29),
  vector:   GS(5.5, 11.43, 'none', 21000, 0.40, 230, 0.40, 0.50, 'roller', 'brass', 23),
  pump:     GS(18.5, 18.5, 'none', 11000, 0.55, 432, 0.20, 0.15, 'recoil', 'plastic', 70, 9),
  dbl:      GS(28.0, 18.5, 'none', 11000, 0.55, 432, 0.05, 0.05, 'blowback', 'plastic', 70, 9),
  saiga:    GS(16.0, 18.5, 'none', 11000, 0.55, 432, 0.65, 0.70, 'longstroke', 'plastic', 70, 9),
  aa12:     GS(13.0, 18.5, 'none', 11000, 0.55, 432, 0.70, 0.60, 'gas', 'plastic', 70, 9),
  m249:     GS(20.5, 5.56, 'flash', 55000, 0.70, 62, 0.60, 0.70, 'gas', 'brass', 45),
  pkm:      GS(25.4, 7.62, 'flash', 50000, 1.00, 150, 0.75, 0.70, 'longstroke', 'steel', 54),
  shredder: GS(22.0, 5.56, 'flash', 55000, 0.70, 62, 0.20, 0.30, 'gas', 'brass', 45),
  mk14:     GS(18.0, 7.62, 'flash', 60000, 0.90, 168, 0.55, 0.55, 'gas', 'brass', 51),
  r700:     GS(24.0, 7.62, 'none', 60000, 1.10, 175, 0.05, 0.10, 'recoil', 'brass', 51),
  barrett:  GS(29.0, 12.7, 'brake', 55000, 1.60, 660, 0.80, 0.70, 'recoil', 'brass', 99),
  gm6:      GS(28.7, 12.7, 'brake', 55000, 1.60, 660, 0.90, 0.75, 'recoil', 'brass', 99),
  m32:      GS(12.0, 40.0, 'none', 1200, 1.20, 3500, 0.10, 0.10, 'recoil', 'aluminum', 46),
  p9:       GS(4.5, 9.00, 'none', 35000, 0.35, 115, 0.45, 0.60, 'recoil', 'brass', 19),
  m1911:    GS(5.0, 11.43, 'none', 21000, 0.40, 230, 0.50, 0.60, 'recoil', 'brass', 23),
  g18:      GS(4.5, 9.00, 'none', 35000, 0.35, 115, 0.40, 0.60, 'blowback', 'brass', 19),
  skorp:    GS(4.5, 7.65, 'none', 20000, 0.30, 73, 0.30, 0.55, 'blowback', 'brass', 17),
  auto9:    GS(6.0, 9.00, 'none', 35000, 0.35, 115, 0.45, 0.60, 'recoil', 'brass', 19),
  deagle:   GS(6.0, 12.7, 'none', 36000, 0.60, 300, 0.60, 0.60, 'gas', 'brass', 33),
  rev:      GS(4.0, 9.07, 'none', 35000, 0.50, 158, 0.05, 0.10, 'recoil', 'brass', 33),
  sawn:     GS(12.0, 18.5, 'none', 11000, 0.55, 432, 0.05, 0.05, 'blowback', 'plastic', 70, 9),
  hc500:    GS(8.4, 12.7, 'comp', 60000, 0.80, 350, 0.05, 0.10, 'recoil', 'brass', 41),
  pocketgl: GS(9.0, 40.0, 'none', 1200, 1.20, 3500, 0.05, 0.05, 'recoil', 'aluminum', 46),
  mp7:      GS(7.1, 4.60, 'none', 58000, 0.50, 31, 0.30, 0.50, 'gas', 'brass', 30),
  hk416:    GS(14.5, 5.56, 'flash', 55000, 0.70, 62, 0.40, 0.50, 'gas', 'brass', 45),
  aug:      GS(20.0, 5.56, 'flash', 55000, 0.70, 62, 0.35, 0.50, 'gas', 'brass', 45),
  galil:    GS(16.0, 7.62, 'brake', 45000, 1.00, 123, 0.60, 0.60, 'longstroke', 'steel', 39),
  an94:     GS(15.9, 5.60, 'brake', 50000, 0.70, 53, 0.50, 0.60, 'gas', 'steel', 39),
  fal:      GS(21.0, 7.62, 'flash', 60000, 0.90, 147, 0.60, 0.60, 'gas', 'brass', 51),
  garand:   GS(24.0, 7.62, 'none', 50000, 1.10, 150, 0.60, 0.60, 'longstroke', 'brass', 63),
  svd:      GS(24.4, 7.62, 'flash', 51000, 1.10, 152, 0.50, 0.55, 'gas', 'steel', 54),
  vss:      GS(7.9, 9.00, 'suppressor', 34000, 0.50, 250, 0.40, 0.50, 'gas', 'steel', 39),
  lever:    GS(18.5, 11.6, 'none', 28000, 1.00, 405, 0.05, 0.20, 'recoil', 'brass', 53),
  mosin:    GS(28.7, 7.62, 'none', 51000, 1.20, 148, 0.05, 0.10, 'recoil', 'steel', 54),
  awm:      GS(27.0, 8.60, 'brake', 61000, 1.40, 250, 0.05, 0.10, 'recoil', 'brass', 69),
  thompson: GS(10.5, 11.43, 'comp', 21000, 0.40, 230, 0.70, 0.70, 'blowback', 'brass', 23),
  ppsh:     GS(10.5, 7.62, 'comp', 34000, 0.40, 85, 0.50, 0.70, 'blowback', 'steel', 25),
  mp5sd:    GS(5.7, 9.00, 'suppressor', 35000, 0.40, 147, 0.35, 0.55, 'roller', 'brass', 19),
  ksg:      GS(18.5, 18.5, 'none', 11000, 0.55, 432, 0.20, 0.15, 'recoil', 'plastic', 70, 9),
  slug:     GS(18.5, 18.5, 'none', 11000, 0.55, 437, 0.65, 0.65, 'gas', 'plastic', 70, 1),
  m60:      GS(22.0, 7.62, 'flash', 60000, 0.90, 147, 0.75, 0.75, 'gas', 'brass', 51),
  usp:      GS(4.4, 11.43, 'none', 21000, 0.40, 230, 0.45, 0.60, 'recoil', 'brass', 23),
  mac10:    GS(5.75, 11.43, 'none', 21000, 0.40, 230, 0.55, 0.75, 'blowback', 'brass', 23),
  akimbo:   GS(4.9, 9.00, 'none', 35000, 0.35, 124, 0.45, 0.60, 'recoil', 'brass', 19),
  judge:    GS(3.0, 10.4, 'none', 13500, 0.50, 350, 0.05, 0.05, 'recoil', 'plastic', 63, 5),
  b92:      GS(4.9, 9.00, 'none', 35000, 0.40, 124, 0.40, 0.60, 'recoil', 'brass', 19),
  ppk:      GS(3.3, 7.65, 'none', 22000, 0.20, 71, 0.30, 0.40, 'blowback', 'brass', 17),
  fiveseven:GS(4.8, 5.70, 'none', 50000, 0.35, 31, 0.30, 0.50, 'blowback', 'brass', 29),
  // (the Welrod Mk II: the PPK's .32 ACP load and case (22000 psi, 71 gr, 17 mm); a 4 in barrel (an estimate: its 330 mm tube is mostly baffles); worked by hand, so the bolt figures are the Mosin's; the integral can)
  welrod:   GS(4.0, 7.65, 'suppressor', 22000, 0.20, 71, 0.05, 0.10, 'recoil', 'brass', 17),
  // (the Maxim 9: the MP5SD's integral-can 9x19 load (35000 psi, 147 gr, 19 mm case, loudness 0.55) in the P9's slide (boltMass 0.45); barrel 4.38 in, the published figure)
  maxim9:   GS(4.38, 9.00, 'suppressor', 35000, 0.35, 147, 0.45, 0.55, 'recoil', 'brass', 19),
  // (the Tempest: 10 mm caseless, a 20 in (508 mm) barrel at its fullest: the figures for a barrel are the effective lengths, G.barrelMm(def); an electric ignition has no bolt to hear.
  // Two lengths of round fit its bores, the block holding whichever it was loaded with (def.barrels.rounds): the standard 10 x 31, 8 g (123 grains), about 5.56 / 7.62x39 in energy,
  // and the rifle 10 x 53, 9.8 g (151 grains), about .30-06's. The loads of each: CALIBERS)
  tempest:  GS(20.0, 10.0, 'none', 55000, 0.80, 123.5, 0.02, 0.02, 'recoil', 'plastic', 31),
  'tempest.rifle': GS(20.0, 10.0, 'none', 60000, 0.90, 151, 0.02, 0.02, 'recoil', 'plastic', 53),
  thor:     GS(15.0, 12.7, 'brake', 55000, 1.60, 660, 0.05, 0.05, 'recoil', 'brass', 99),
  derringer:GS(3.0, 10.9, 'none', 36000, 0.60, 240, 0.05, 0.05, 'recoil', 'brass', 33), // (.44 Magnum: one of the American Derringer Model 1's)
  tx22:     GS(4.1, 5.60, 'none', 24000, 0.10, 40, 0.15, 0.40, 'blowback', 'brass', 15),
  // (the Hailstorm: the TX22's .22 LR round from a 12 in barrel; a falling block, so nothing cycles. The report of a volley is worked out from this one round's: js/parts.ts soundSpec)
  hailstorm:GS(12.0, 5.60, 'none', 24000, 0.10, 40, 0.05, 0.05, 'recoil', 'brass', 15),
  ak74:     GS(16.3, 5.60, 'brake', 50000, 0.70, 53, 0.55, 0.60, 'longstroke', 'steel', 39),
  aks74u:   GS(8.1, 5.60, 'comp', 50000, 0.70, 53, 0.50, 0.65, 'longstroke', 'steel', 39),
  rpk:      GS(23.2, 7.62, 'none', 45000, 1.00, 123, 0.72, 0.70, 'longstroke', 'steel', 39),
  scarl:    GS(14.5, 5.56, 'flash', 55000, 0.70, 62, 0.45, 0.55, 'gas', 'brass', 45),
  m27:      GS(16.5, 5.56, 'flash', 55000, 0.70, 62, 0.45, 0.55, 'gas', 'brass', 45),
  m14:      GS(22.0, 7.62, 'flash', 60000, 0.90, 147, 0.60, 0.60, 'gas', 'brass', 51),
  sr25:     GS(20.0, 7.62, 'flash', 60000, 0.90, 168, 0.45, 0.50, 'gas', 'brass', 51),
  mpx:      GS(8.0, 9.00, 'none', 35000, 0.40, 124, 0.35, 0.55, 'gas', 'brass', 19),
  g19:      GS(4.0, 9.00, 'none', 35000, 0.35, 115, 0.40, 0.60, 'recoil', 'brass', 19),
  benelli:  GS(18.5, 18.5, 'none', 11000, 0.55, 432, 0.60, 0.60, 'gas', 'plastic', 70, 9),
  vepr:     GS(17.0, 18.5, 'none', 11000, 0.55, 432, 0.65, 0.70, 'longstroke', 'plastic', 70, 9),
  ar9:      GS(10.5, 9.00, 'none', 35000, 0.40, 124, 0.45, 0.60, 'blowback', 'brass', 19),
  aug9:     GS(16.0, 9.00, 'none', 35000, 0.40, 124, 0.40, 0.55, 'blowback', 'brass', 19),
  qbz95:    GS(18.2, 5.80, 'flash', 52000, 0.70, 64, 0.40, 0.55, 'gas', 'brass', 42),
  qbz192:   GS(10.5, 5.80, 'flash', 52000, 0.70, 64, 0.40, 0.55, 'gas', 'brass', 42),
  mcx:      GS(11.5, 5.56, 'flash', 55000, 0.70, 62, 0.35, 0.50, 'gas', 'brass', 45),
};
G.GUN_SPECS = G_GUN_SPECS;
// (the integrally suppressed guns: which of the synth's suppressors theirs is, GunshotSynth.SUPPRESSORS)
G.GUN_SPECS.vss.suppressor = G.GUN_SPECS.mp5sd.suppressor = G.GUN_SPECS.welrod.suppressor = G.GUN_SPECS.maxim9.suppressor = 'integral';

// Suppressed fire (suppressors are muzzle parts, see js/parts.ts): damage factor and the fallback sound.
const G_SUPPRESSOR = { snd: { f: 900, len: 0.12, boom: 0.15, vol: 0.25 } };
G.SUPPRESSOR = G_SUPPRESSOR;

// Body armour and helmets that suspects wear (the squad's kit, carriers, plates, helmets and belts, is in
// js/gear.ts, and works the same way). Armour is material, so thick, where it is on the body (js/ballistics.ts):
// prot is a list of { at, layers: [[material, mm], ...] }, at 'plate' (front and back of the chest), 'side', 'torso'
// (soft armour, chest and stomach), 'groin', 'shoulder', 'thigh', 'helmet' (above its brim: cut 'high' or 'full'),
// 'face' (the rest of them: js/ballistics.ts covers). Whether a round gets through is worked out from the round and the layers; armour wears by the energy it
// soaks up (dur: how much it takes), and a worn layer is thinner.
const G_ARMOR_LIST: ArmorDef[] = [
  { id: 'none', kind: 'vest', name: 'No Armour', tier: 0, prot: [], dur: 0, speed: 1, price: 0, desc: 'Just your shirt.' },
  { id: 'soft2', kind: 'vest', name: 'Soft Vest (II)', tier: 1, prot: [{ at: 'torso', layers: [['aramid', 6]] }], dur: 4, speed: 1, price: 300,
    desc: 'Thin Kevlar panels. Stops 9 mm, .45 and buckshot, not a magnum, and it soon wears through.' },
  { id: 'soft', kind: 'vest', name: 'Soft Vest (IIIA)', tier: 1, prot: [{ at: 'torso', layers: [['aramid', 8]] }], dur: 6, speed: 1, price: 500,
    desc: 'Kevlar panels, chest and stomach. Stops handgun rounds and buckshot; rifle rounds go straight through.' },
  { id: 'steel', kind: 'vest', name: 'Steel Plate Carrier (III)', tier: 2, prot: [{ at: 'plate', layers: [['steel', 6.35]] }, { at: 'torso', layers: [['aramid', 6]] }], dur: 6, speed: 0.95, price: 1300,
    desc: 'Steel plates over the heart and lungs, soft armour below. Stops most rifle rounds to the chest. Heavy.' },
  { id: 'ceramic', kind: 'vest', name: 'Ceramic Plate Carrier (IV)', tier: 3, prot: [{ at: 'plate', layers: [['ceramic', 9], ['pe', 6]] }, { at: 'torso', layers: [['aramid', 6]] }], dur: 5, speed: 0.97, price: 2200,
    desc: 'Ceramic plates: lighter, and they stop even armour-piercing rounds, but they crack as they do.' },
  { id: 'assault', kind: 'vest', name: 'Assault Armour', tier: 4, prot: [{ at: 'plate', layers: [['ceramic', 9], ['pe', 6]] }, { at: 'side', layers: [['steel', 5]] }, { at: 'torso', layers: [['aramid', 8]] }, { at: 'groin', layers: [['aramid', 8]] }, { at: 'shoulder', layers: [['aramid', 6]] }, { at: 'thigh', layers: [['aramid', 6]] }], dur: 8, speed: 0.88, price: 3200,
    desc: 'Plates front, back and sides, a groin plate, shoulder and thigh protection. Slow.' },
  { id: 'nohelm', kind: 'helmet', name: 'No Helmet', tier: 0, prot: [], dur: 0, speed: 1, price: 0, desc: '' },
  { id: 'ach', kind: 'helmet', name: 'Ballistic Helmet (IIIA)', tier: 1, cut: 'full', prot: [{ at: 'helmet', layers: [['aramid', 8]] }], dur: 3, speed: 1, price: 600,
    desc: 'Stops handgun rounds to the top of the head. Not to your face.' },
  { id: 'riflehelm', kind: 'helmet', name: 'Rifle-rated Helmet', tier: 3, cut: 'high', prot: [{ at: 'helmet', layers: [['pe', 18]] }], dur: 3, speed: 0.99, price: 1700,
    desc: 'Turns some rifle rounds too. Still not your face.' },
  { id: 'visor', kind: 'helmet', name: 'Helmet with Ballistic Visor', tier: 4, cut: 'high', prot: [{ at: 'helmet', layers: [['pe', 18]] }, { at: 'face', layers: [['pc', 10]] }], dur: 4, speed: 0.97, price: 2800,
    desc: 'Rifle-rated, with a visor that stops handgun rounds to the face.' },
];
G.ARMOR_LIST = G_ARMOR_LIST;
const G_ARMORS: Record<string, ArmorDef> = {};
G.ARMORS = G_ARMORS;
G.ARMOR_LIST.forEach((a) => (G.ARMORS[a.id] = a));


// Enemy archetypes. acc = base hit chance at close range
// Opponents are what a police tactical team actually faces: armed suspects in street clothes, a few with
// body armour, not super-soldiers. People have human health; armour (vest = fraction of torso damage stopped)
// and helmets do the protecting. comply = base chance to surrender when shouted at, fake = chance a
// surrender is a ruse and they go back for the gun. style picks the clothing on the character rig.
// morale = starting nerve (0..1): it drains under fire and when friends go down; at 0.3 they break and run.
// Only `hunt` types press an attack, and only while their nerve holds; everyone else holds their ground.
// steady scales how much fear costs them (professionals shrug off more).
const G_ENEMIES: Record<string, EnemyDef> = {
  suspect: { draw: 0.55, morale: 0.4, style: 'suspect', wpn: 'p9', name: 'Armed Suspect', hp: 100, speed: 2.2, range: 22, pref: 6, pellets: 1, burst: [1, 3], rof: 0.28, pause: [0.7, 1.4], acc: 0.36, cr: 50, scale: 1, headMult: 2, comply: 0.45, fake: 0.15, snd: 'PST' },
  grunt: { draw: 1.0, morale: 0.55, style: 'suspect', wpn: 'ak', name: 'Gunman', hp: 100, speed: 2.1, range: 28, pref: 9, pellets: 1, burst: [3, 6], rof: 0.11, pause: [0.9, 1.7], acc: 0.36, cr: 65, scale: 1, headMult: 2, comply: 0.3, fake: 0.12, snd: 'AR' },
  rusher: { draw: 0.9, morale: 0.65, hunt: true, style: 'suspect', wpn: 'saiga', name: 'Shotgunner', hp: 100, speed: 2.9, range: 9, pref: 2.5, pellets: 6, burst: [1, 1], rof: 0.9, pause: [0.9, 1.3], acc: 0.5, cr: 70, scale: 1, headMult: 2, comply: 0.35, fake: 0.1, snd: 'SG' },
  marksman: { ready: true, morale: 0.5, style: 'suspect', wpn: 'r700', name: 'Lookout', hp: 100, speed: 1.9, range: 60, pref: 15, pellets: 1, aimTime: 1.2, pause: [2.0, 3.0], acc: 0.75, cr: 90, scale: 1, headMult: 2, comply: 0.4, fake: 0.05, snd: 'SNP' },
  heavy: { ready: true, morale: 0.85, steady: 0.3, hunt: true, style: 'armored', nades: true, wpn: 'm249', name: 'Enforcer', hp: 150, armor: 'heavy', speed: 1.9, range: 30, pref: 8, pellets: 1, burst: [6, 12], rof: 0.08, pause: [1.2, 2.0], acc: 0.38, cr: 160, scale: 1.04, headMult: 1.6, comply: 0.1, fake: 0, snd: 'LMG' },
  warden: { ready: true, morale: 1.0, style: 'armored', boss: true, nades: true, wpn: 'scar', name: 'The Kingpin', hp: 600, armor: 'boss', speed: 2.0, range: 40, pref: 8, pellets: 1, burst: [3, 6], rof: 0.1, pause: [0.8, 1.4], acc: 0.45, cr: 1500, scale: 1.06, headMult: 1.6, comply: 0, fake: 0, snd: 'BR' },
  // The Leader: one to a level at most, from level 2 (js/server.ts spawnEnemies). A plate carrier with a radio on the chest and a headset;
  // tougher than a gunman and steady, and he stays back (pref) and lets the others do the walking: when he spots or hears police he
  // calls it in on the radio and the suspects near him come for the spot (js/server.ts callIn, dispatch). Take him out and they lose the plan.
  leader: { ready: true, leader: true, morale: 0.8, steady: 0.5, style: 'armored', armor: 'leader', wpn: 'ak', name: 'Leader', hp: 130, speed: 2.0, range: 32, pref: 16, pellets: 1, burst: [3, 5], rof: 0.11, pause: [1.0, 1.8], acc: 0.4, cr: 220, scale: 1.02, headMult: 1.8, comply: 0.2, fake: 0.05, snd: 'AR' },
  civ: { style: 'civ', civ: true, name: 'Civilian', hp: 100, speed: 1.1, run: 3.2, scale: 1, headMult: 2, cr: 0 },
};
G.ENEMIES = G_ENEMIES;

// home: share of rooms furnished as a home (the rest are storage, offices and break rooms)
// layout: 'rooms' (rooms and corridors, the default), 'warehouse', 'houses', 'foundry'... (js/level.ts)
// noFog: a clear view to the far end (the fog colour is still the backdrop)
const G_THEMES: ThemeDef[] = [
  { name: 'Apartment', layout: 'apartments', residents: 1, winRate: 0.3, foes: 2, crowd: 2, big: 2, home: 1, reflect: 0.3, floor: '#4a443d', wall: '#b8ab95', crate: '#8a6a3a', fog: 0x0e0c0a, light: 0xffd8a8, ceil: '#cfc8ba' },
  { name: 'Warehouse', layout: 'warehouse', noFog: true, home: 0, reflect: 0.3, floor: '#57504a', wall: '#7c6e5b', crate: '#8a6a3a', fog: 0x16130f, light: 0xffd49a, ceil: '#2a2622' },
  { name: 'Bunker', entry: 'vault', home: 0.45, reflect: 0.4, floor: '#3a4042', wall: '#5a6160', crate: '#4d5a3c', fog: 0x0b0f11, light: 0xa8c8ff, ceil: '#1d2224' },
  { name: 'Suburbs', layout: 'houses', foes: 1.8, crowd: 1.6, big: 2, home: 1, reflect: 0.28, floor: '#5a4a3a', wall: '#9fae98', crate: '#8a6a3a', fog: 0x111723, light: 0xffe0b0, ceil: '#d6d2c4' },
  { name: 'Research Lab', home: 0.4, reflect: 0.36, floor: '#8d9399', wall: '#b9bec4', crate: '#5d6b7a', fog: 0x12161a, light: 0xe6f2ff, ceil: '#3a3f44' },
  { name: 'Foundry', layout: 'foundry', home: 0, reflect: 0.3, floor: '#3e3832', wall: '#6e645a', crate: '#6a5a4a', fog: 0x1a0e08, light: 0xffd2a4, ceil: '#2a221c' },
  { name: 'Cold Storage', home: 0.35, reflect: 0.4, floor: '#4f5d68', wall: '#7f97a8', crate: '#5f6f7a', fog: 0x0a1218, light: 0x9fe0ff, ceil: '#26323a' },
  // a music festival at night, outdoors: big open spaces, the fog pushed far back, moonlight, more people about
  // the first deployment of a run (js/route.ts: never anywhere else): a small corner store, its weapon case, attachments
  // box and first aid cabinet always in its stockroom to get you started
  { name: 'Convenience Store', layout: 'mart', starter: true, foes: 0.8, crowd: 1.5, home: 0, reflect: 0.35, floor: '#cfd3cd', wall: '#e6e2d6', crate: '#8a6a3a', fog: 0x0d0f12, light: 0xf2f6ff, ceil: '#e8e8e2' },
  { name: 'Festival', layout: 'festival', fence: 'hoarding', from: 2, home: 0, reflect: 0.2, floor: '#26331f', wall: '#5b7480', crate: '#8a6a3a', fog: 0x060912, light: 0xffe2c0, ceil: '#d8dcde', fogNear: 30, fogFar: 150, hemi: 0x5a6a96, hemiI: 0.55, crowd: 2, foes: 1.5, night: 35 },
  // the top of the Sandia Mountains over Albuquerque at sundown, outdoors: two summits of pink granite with a gorge between,
  // long sight lines across it (a sniper's level: the garden 500 m from the overlook), the city's lights coming on far below. rock: the walls are outcrops
  // (js/level.ts buildMesh); far: how far the camera sees (the view off the mountain); lookouts: more marksmen among them;
  // from: the first level it can come up at on the route map (js/route.ts): not till after the third
  { name: 'Sandia Crest', layout: 'crest', from: 4, rock: 1, fence: 'cliffwall', home: 0, reflect: 0.1, floor: '#8c7660', wall: '#e2d6cc', crate: '#8a6a3a', fog: 0xd99a7c, light: 0xffe4c0, ceil: '#d6cfc4', fogNear: 340, fogFar: 1100, far: 1600, hemi: 0xffd6b8, hemiI: 0.85, cloud: 0xb98c8a, crowd: 0.8, foes: 1.4, big: 1.5, lookouts: 2.5 },
];
G.THEMES = G_THEMES;

// the hangar between levels (js/hangar.ts): a daylit hall with a helipad outside it
const G_HANGAR_ROWS: number = 156; // the shooting range (300 m of rifle lanes) north of the hangar: tile rows (js/level.ts layHangar; js/hangar.ts shifts the hall by two metres a row)
G.HANGAR_ROWS = G_HANGAR_ROWS;
const G_HANGAR_THEME: ThemeDef = { name: 'Hangar', layout: 'hangar', hub: true, noFog: true, home: 0, reflect: 0.35, floor: '#6c7075', wall: '#98a0a8', crate: '#8a6a3a', fog: 0x86a6c8, light: 0xfff2dc, ceil: '#c9cdd0', hemi: 0xe4ecf6, hemiI: 0.85 };
G.HANGAR_THEME = G_HANGAR_THEME;

const G_PLAYER_COLORS = [0x3fa9f5, 0x7bd34a, 0xf5a623, 0xd94fd9, 0x2fd6c4, 0xf2e94e, 0xff6b6b, 0xffffff];
G.PLAYER_COLORS = G_PLAYER_COLORS;

const G_VENDOR_QUIPS: Record<string, string[]> = {
  hello: [
    'Back already? Good. Dead customers don\'t pay.',
    'Fresh stock, no questions, no refunds.',
    'Wipe your boots. That\'s not mud, is it.',
    'I heard the shooting from here. Nice work.',
    'Credits on the counter, guns over the counter.',
  ],
  buy: [
    'Pleasure doing business.',
    'Point the loud end at them.',
    'That one\'s a crowd favourite. Literally, it removes crowds.',
    'Good choice. Probably.',
    'Sold! Bring it back in one piece. Or don\'t.',
  ],
  broke: [
    'Come back when you\'re a little richer.',
    'Credit? I don\'t do credit. Ironic, I know.',
    'Your wallet says no.',
  ],
  ready: [
    'Go on then. Try not to die.',
    'The next floor\'s nastier. I\'d buy armour.',
    'I\'ll keep the lights on for you.',
  ],
};
G.VENDOR_QUIPS = G_VENDOR_QUIPS;

// ---------------------------------------------------------------- wounds
// Rounds are worked out physically, through armour and through bodies (js/ballistics.ts): what a round does depends
// on what it is (mass, diameter, core, nose), how fast it's going when it gets there, what armour is in its way and
// what it goes through inside. Nothing here multiplies a wound.

// ---------------------------------------------------------------- ammunition
// Calibers (from each gun's G.GUN_SPECS bore and case) and the boxes their loose rounds come in. group decides
// which ammo types exist for it; box: rounds in a box of ball from the quartermaster; per: price per round.
const G_CALIBERS: Record<string, CaliberDef> = {
  '5.56/45': { name: '5.56×45', group: 'rifle', box: 30, per: 1.2 }, '7.62/39': { name: '7.62×39', group: 'rifle', box: 30, per: 1.1 },
  '7/43': { name: '.277 Fury', group: 'rifle', box: 30, per: 1.8 }, '10/31': { name: '10×31 caseless', group: 'rifle', box: 30, per: 1.6, types: ['ball', 'hp', 'tracer'], loads: { ball: { g: 8, v: 650 }, hp: { g: 7, v: 700 }, tracer: { g: 7.6, v: 665 } } }, // (the Tempest's standard round: loads at its longest effective length, 508 mm)
  '10/53': { name: '10×53 caseless', group: 'rifle', box: 15, per: 2.6, types: ['ball', 'hp', 'tracer', 'sabot', 'buck'], loads: { ball: { g: 9.8, v: 850 }, hp: { g: 8.6, v: 900 }, tracer: { g: 9.4, v: 865 }, sabot: { g: 6.7, lg: 7.8, v: 945, d: 4.5, len: 24 }, buck: { g: 3.5, v: 430, n: 5, d: 8.4, choke: 1.0, rangeK: 0.55, drag: 65 } } }, // (the Tempest's rifle round: sabot: a 4.5 x 24 mm tungsten rod of 6.7 g, 7.8 g launched; buck: five 00 pellets a round)
  '7.62/51': { name: '7.62×51', group: 'rifle', box: 20, per: 1.8 },
  '9/19': { name: '9×19', group: 'pistol', box: 50, per: 0.6 }, '5.7/29': { name: '5.7×28', group: 'pistol', box: 50, per: 1.1 },
  '11.43/23': { name: '.45 ACP', group: 'pistol', box: 50, per: 0.9 }, '18.5/70': { name: '12 gauge', group: 'shotgun', box: 12, per: 2 },
  '7.62/54': { name: '7.62×54R', group: 'rifle', box: 20, per: 1.8 }, '12.7/99': { name: '.50 BMG', group: 'rifle', box: 10, per: 8 },
  '40/46': { name: '40 mm', group: 'grenade', box: 3, per: 45 }, '7.65/17': { name: '.32 ACP', group: 'pistol', box: 50, per: 0.6 },
  '12.7/33': { name: '.50 AE', group: 'pistol', box: 20, per: 2.5 }, '9.07/33': { name: '.357 Magnum', group: 'pistol', box: 30, per: 1.4 },
  '12.7/41': { name: '.500 S&W', group: 'pistol', box: 20, per: 3.5 }, '4.6/30': { name: '4.6×30', group: 'pistol', box: 40, per: 1.2 },
  '5.6/39': { name: '5.45×39', group: 'rifle', box: 30, per: 1 }, '5.8/42': { name: '5.8×42', group: 'rifle', box: 30, per: 1.2 }, '7.62/63': { name: '.30-06', group: 'rifle', box: 16, per: 2 },
  '9/39': { name: '9×39', group: 'rifle', box: 20, per: 2.2 }, '11.6/53': { name: '.45-70', group: 'rifle', box: 20, per: 2.5 },
  '8.6/69': { name: '.338 Lapua', group: 'rifle', box: 10, per: 6 }, '7.62/25': { name: '7.62×25', group: 'pistol', box: 50, per: 0.7 },
  '10.4/63': { name: '.410 bore', group: 'shotgun', box: 15, per: 1.5 }, '11.43/33': { name: '.45 Colt', group: 'pistol', box: 30, per: 1.2 }, '10.9/33': { name: '.44 Magnum', group: 'pistol', box: 30, per: 1.3 },
  '5.6/15': { name: '.22 LR', group: 'pistol', box: 100, per: 0.15, rimfire: true },
  bolt: { name: 'crossbow bolts', group: 'bolt', box: 6, per: 12 }, cell: { name: 'rail slugs', group: 'cell', box: 8, per: 15 },
};
G.CALIBERS = G_CALIBERS;
const G_calOf = (def: Record<string, any>): string => {
  if (def.rcal) return def.rcal; // (one shot of a gun of several barrels: the round type it was loaded with, G.shotDef)
  if (def.cls === 'BOW') return 'bolt';
  if (def.cls === 'RAIL') return 'cell';
  const g = G.GUN_SPECS[def.id];
  return g ? g.caliber + '/' + g.caseLength : 'cell';
};
G.calOf = G_calOf;
// a caliber's standard magazine (rounds): the middle one of the guns that take it, belts aside (a shotgun's tube)
const G_stdMag = (cal: string): number => {
  const n: number[] = [];
  for (const id in G.WEAPONS) { const d = G.WEAPONS[id]; if (G.calOf(d) === cal && d.mag > 2 && !(d.cls === 'LMG' && d.mag >= 100)) n.push(d.mag); }
  n.sort((a, b) => a - b);
  return n.length ? n[(n.length - 1) >> 1] : ((G.CALIBERS[cal] || {}) as Partial<CaliberDef>).box || 10;
};
G.stdMag = G_stdMag;
// Ammo types. What each is physically (its bullet: js/ballistics.ts projectile) decides what it does to armour and
// to people; here, what it does in flight: velK (faster), massK (lighter, for recoil), dragK (blunter: it slows
// sooner), rangeK, spreadK, pelletsK, slug, tracer (colour), quiet (with a suppressor, heard no further than a
// crossbow). k: price per round relative to ball.
const G_AMMO: Record<string, AmmoDef> = {
  ball: { name: 'FMJ ball', tag: 'FMJ', k: 1, desc: 'Full metal jacket. The standard round.' },
  hp: { name: 'Hollow point', tag: 'HP', k: 1.8, dragK: 0.8, desc: 'Opens to as much as 1.37× its width in flesh, the faster the wider: a wide track, all its energy spent inside, rarely out the far side. Its soft lead nose flattens on armour. It drags more in the air: it slows and drops sooner than ball.' },
  ap: { name: 'Armour-piercing', tag: 'AP', k: 2.4, velK: 1.08, massK: 0.85, desc: 'A hardened steel (pistol) or tungsten carbide (rifle) core, lighter and 8% faster: goes through plate that flattens lead, and through people, nose-first and late to tumble: a narrow track.' },
  sabot: { name: 'Sabot AP', tag: 'SABOT', k: 3.2, desc: 'A slim tungsten rod in a sabot that falls away at the muzzle: a narrow, fast, hard penetrator that holds its line through plate that stops a full-width bullet, and leaves a narrow track in a body.' },
  tracer: { name: 'Tracer', tag: 'TR', k: 1.3, tracer: 0xff4a2a, desc: 'Burns red all the way out: you see exactly where it goes (so do they).' },
  subsonic: { name: 'Subsonic', tag: 'SUB', k: 1.6, rangeK: 0.7, quiet: true, desc: 'A heavier bullet under the speed of sound: no crack, so through a suppressor it is barely heard. Slow: less energy, and it drops sooner.' },
  buck: { name: '00 buckshot', tag: 'BUCK', k: 1, desc: 'Nine pellets. The standard shotgun load.' },
  slug: { name: 'Slug', tag: 'SLUG', k: 1.7, slug: true, desc: 'One heavy lead slug: accurate, hits like a rifle, goes through.' },
  birdshot: { name: 'Birdshot', tag: 'BIRD', k: 0.7, pelletsK: 2.5, spreadK: 1.5, desc: 'A cloud of tiny 0.2 g pellets: they shed their speed in a few centimetres of flesh. Painful, rarely lethal past a few metres; armour shrugs them off.' },
  flechette: { name: 'Flechette', tag: 'FLCH', k: 2.6, spreadK: 0.7, pelletsK: 2.5, velK: 1.2, massK: 0.35, dragK: 1.6, desc: 'Twenty hardened steel darts: a tight, fast pattern that carries, and they part a soft vest\'s weave. A hard plate stops them. Thin tracks that open out when they tumble, deep in.' },
  he: { name: 'HE grenade', tag: 'HE', k: 1, desc: '40 mm high explosive.' },
  // Bolts kill by cutting, not by energy: about what a .22 carries, on a head that opens a wound and lets it bleed.
  // (glow: the lit nock's colour, in flight and where it sticks: js/bolts.ts)
  broadhead: { name: 'Broadhead bolt', tag: 'BOLT', k: 1, glow: 0x39ff5a, desc: 'A hunting bolt: three fixed blades, 30 mm across. Goes deep and bleeds them, often right through. A vest stops it.' },
  mechanical: { name: 'Mechanical broadhead', tag: 'MECH', k: 1.6, glow: 0xffa020, desc: 'Blades that swing open on impact, 50 mm across: the worst wound there is, but opening costs it its depth, so it stays in them.' },
  bodkin: { name: 'Bodkin bolt', tag: 'BDKN', k: 2.2, velK: 0.79, massK: 1.6, glow: 0xff3ad0, desc: 'A heavy hardened needle, the old answer to mail: it parts a soft vest\'s weave where a bullet would be caught, and leaves a narrow wound. A hard plate still stops it.' },
  railslug: { name: 'Tungsten slug', tag: 'SLUG', k: 1, desc: 'Magnetically launched.' },
};
// +P loads (issue #19): every load but subsonic (and the grenade, bolts and rail) has a hotter twin, id '<load>_p': the same bullet on a higher-pressure
// charge. PLUSP is the rule, by caliber group: v the muzzle speed it adds (pistol +7%, a rifle round +4%, a shotgun +6%), c the powder charge it adds (the
// push back, G.recoilImpulse, follows the speed and the gas) and p the pressure the report is synthesised at (a louder crack, js/parts.ts LOAD_SOUND).
// Priced 1.5x the base load; found 1 in 5 as often.
const G_PLUSP: Record<string, { v: number; c: number; p: number }> = { pistol: { v: 1.07, c: 1.12, p: 1.14 }, rifle: { v: 1.04, c: 1.07, p: 1.08 }, shotgun: { v: 1.06, c: 1.10, p: 1.12 } };
G.PLUSP = G_PLUSP;
const G_PLUSP_K = 1.5;
for (const id of Object.keys(G_AMMO)) {
  if (['subsonic', 'he', 'broadhead', 'mechanical', 'bodkin', 'railslug'].includes(id)) continue;
  const A = G_AMMO[id];
  G_AMMO[id + '_p'] = Object.assign({}, A, { name: '+P ' + A.name, tag: A.tag + '+P', k: A.k * G_PLUSP_K, plus: true, base: id, desc: A.desc + ' Loaded +P: more powder at a higher chamber pressure, so it leaves faster and carries more energy, with a sharper kick and a louder report. Costs half as much again.' } as AmmoDef);
}
G.AMMO = G_AMMO;
// the load a +P load is the hot version of (itself for any other)
const G_baseAm = (am?: string | null): string => (am && G_AMMO[am] && G_AMMO[am].base) || am || '';
G.baseAm = G_baseAm;
// a +P load's factors in that caliber (see PLUSP), or null for any other load
const G_plusOf = (cal: string, am?: string | null) => (am && G_AMMO[am] && G_AMMO[am].plus ? G_PLUSP[((G.CALIBERS[cal] || {}) as Partial<CaliberDef>).group || 'rifle'] || G_PLUSP.rifle : null);
G.plusOf = G_plusOf;
const G_AMMO_TYPES: Record<string, string[]> = { rifle: ['ball', 'hp', 'ap', 'tracer', 'subsonic'], pistol: ['ball', 'hp', 'ap', 'tracer', 'subsonic'], shotgun: ['buck', 'slug', 'birdshot', 'flechette'], grenade: ['he'], bolt: ['broadhead', 'mechanical', 'bodkin'], cell: ['railslug'] };
for (const g of ['rifle', 'pistol', 'shotgun']) G_AMMO_TYPES[g] = G_AMMO_TYPES[g].concat(G_AMMO_TYPES[g].filter((t) => G_AMMO[t + '_p']).map((t) => t + '_p'));
G.AMMO_TYPES = G_AMMO_TYPES;
// the loads a caliber takes: its own list (the Tempest's two rounds), else its group's
const G_ammoTypes = (cal: string): string[] => { const C = G.CALIBERS[cal] || { group: 'cell' } as Partial<CaliberDef>; return C.types ? C.types.concat(C.types.filter((t) => G.AMMO[t + '_p']).map((t) => t + '_p')) : G.AMMO_TYPES[C.group!]; }; // (a caliber's own list: its +P loads follow)
G.ammoTypes = G_ammoTypes;
// a load's own figures in a caliber that lists them (CALIBERS loads: grams, speed at the longest effective length, pellets...), or null
const G_loadOf = (cal: string, am?: string | null): LoadDef | null => { const C = G.CALIBERS[cal]; return (C && C.loads && am && C.loads[G.baseAm(am)]) || null; }; // (a +P load has its base load's bullet)
G.loadOf = G_loadOf;
// How fast a round leaves the muzzle (m/s), for whether it cracks going past (only above the speed of sound,
// 343 m/s). Reference velocities by caliber at a reference barrel length (inches), scaled gently by the
// build's barrel; how far it carries before drag takes 63% of its speed (m: pellets slow fast).
const G_MUZZLE_V: Record<string, number[]> = {
  // (the drag lengths from real retained velocities: 5.56 keeps about 73% of its speed at 300 m, 7.62×51 76%,
  // .338 86%, .50 BMG 91%; 9 mm about 87% at 100 m, .45 ACP 94%; heavy subsonic 9×39 barely slows)
  '5.56/45': [940, 20, 950], '7.62/39': [715, 16.3, 1000], '7/43': [920, 16, 1050], '10/31': [650, 20, 1000], '10/53': [850, 20, 1100], // (the Tempest's ball at its longest effective length, 20 in / 508 mm: a 8 g and a 9.8 g bullet; their other loads' speeds are in CALIBERS loads)
  '7.62/51': [840, 22, 1100],
  '9/19': [370, 4.5, 700], '5.7/29': [715, 10.4, 550], '11.43/23': [260, 5, 1600], '18.5/70': [400, 18, 70],
  '7.62/54': [830, 28, 1100], '12.7/99': [880, 29, 3000], '40/46': [76, 12, 2000], '7.65/17': [300, 4, 500],
  '12.7/33': [450, 6, 850], '9.07/33': [440, 4, 500], '12.7/41': [550, 8, 600], '4.6/30': [720, 7, 550],
  '5.6/39': [880, 16, 900], '5.8/42': [930, 18.2, 950], '7.62/63': [820, 24, 1100], '9/39': [295, 7.9, 2000], '11.6/53': [600, 22, 700],
  '8.6/69': [915, 27, 2000], '7.62/25': [450, 4.6, 600], '10.4/63': [330, 3, 60], '11.43/33': [290, 5, 900], '10.9/33': [410, 6, 800],
  '5.6/15': [370, 4.1, 560], // (.22 LR: a 40-grain round from a pistol, about 85% of its speed left at 100 m)
  bolt: [120, 20, 300], cell: [2000, 20, 3000],
};
G.MUZZLE_V = G_MUZZLE_V;
const G_SOUND_SPEED: number = 343;
G.SOUND_SPEED = G_SOUND_SPEED;
// how far a round goes before drag takes 63% of its speed (m), from this build, with this load
// (a load's dragK: a hollow point's open, blunt nose sheds speed sooner than ball's)
const G_dragOf = (def: Record<string, any>, am?: string | null): number => { const L = G.loadOf(G.calOf(def), am); if (L && L.drag) return L.drag; const ref = G.MUZZLE_V[G.calOf(def)]; return G.baseAm(am) === 'slug' ? 350 : (ref ? ref[2] : 600) * ((G.AMMO[am!] || {} as AmmoDef).dragK || 1); };
G.dragOf = G_dragOf;
// a round's speed (m/s) d metres from the muzzle, from this build, with this load
const G_roundSpeed = (def: Record<string, any>, am?: string | null, d = 0): number => {
  const cal = G.calOf(def), ref = G.MUZZLE_V[cal];
  if (!ref) return 0;
  const barrel = def.barrelIn || (G.GUN_SPECS[def.id] || {}).barrel || ref[1];
  let v = ref[0] * Math.pow(Math.max(1, barrel) / ref[1], 0.2) * (def.velK || 1); // (velK: what the build adds besides its barrel's length)
  if (G.baseAm(am) === 'slug') v = Math.max(v, 470);
  const L = G.loadOf(cal, am); // (a caliber with loads of its own: the load's speed against the ball's, and not the generic multiplier)
  if (L) v *= L.v / ref[0];
  else if (G.AMMO[am!] && G.AMMO[am!].velK) v *= G.AMMO[am!].velK!; // (AP: a lighter, hard-cored bullet leaves faster)
  // subsonic loads, and guns built to be (the integrally suppressed MP5SD and VSS), stay under Mach 1
  { const P = G.plusOf(cal, am); if (P) v *= P.v; } // (+P: the hotter charge)
  if (am === 'subsonic' || def.integral) v = Math.min(v, 310);
  return v * Math.exp(-d / G.dragOf(def, am)); // (a slug carries its speed; pellets shed it)
};
G.roundSpeed = G_roundSpeed;
// Recoil comes from the round and the gun. The round pushes back with its momentum: the bullet's, plus the powder
// gas leaving behind it (about 1.75 times the bullet's speed). The gun's mass soaks that up: the same push moves a
// heavy gun less. A shot climbs K * impulse^B / mass^A degrees (B > 1: big rounds hurt more than in proportion, and
// A < 1: your shoulder takes some of it whatever the gun weighs), times HAND for a handgun (it pivots on your wrist).
// RECOIL_K is what the design adds: a stock that drops below the bore lets it climb more; a manual action (bolt,
// pump, lever, break, revolver) has nothing to soften it, so the whole kick lands at once; and a few guns built
// against recoil. The muzzle device and the rest of the build are parts (js/parts.ts compile, which also uses the
// build's own weight and barrel). K puts an M4 at 1.1 degrees.
const G_CHARGE_GR: Record<string, number> = { // powder charge (grains)
  '5.56/45': 25, '7.62/39': 25, '7/43': 30, '10/31': 26, '10/53': 52, // (the Tempest's 1.7 g and 3.4 g of propellant)
  '7.62/51': 46, '9/19': 6, '5.7/29': 6.5, '11.43/23': 5.5, '18.5/70': 27,
  '7.62/54': 50, '12.7/99': 235, '40/46': 5, '7.65/17': 2.5, '12.7/33': 25, '9.07/33': 14, '12.7/41': 40, '4.6/30': 6,
  '5.6/39': 23, '5.8/42': 26, '7.62/63': 50, '9/39': 15, '11.6/53': 55, '8.6/69': 90, '7.62/25': 8, '10.4/63': 14, '11.43/33': 9, '10.9/33': 22, '5.6/15': 2,
};
G.CHARGE_GR = G_CHARGE_GR;
const G_GUN_KG: Record<string, number> = { // each gun as it comes (kg)
  m4: 2.9, ak: 3.5, f2: 3.6, g36: 3.6, br3: 3.4, scar: 3.6, tavor: 3.3, hk416: 3.5, aug: 3.6, galil: 3.4, an94: 3.85,
  ak74: 3.4, aks74u: 2.7, scarl: 3.3, m27: 3.6, fal: 4.3, m14: 4.5, mk14: 5.1, garand: 4.3, svd: 4.3, vss: 2.6, lever: 3.3,
  sr25: 4.9, uzi: 1.5, mp5: 2.5, p90: 2.6, vector: 2.7, thompson: 4.9, ppsh: 3.6, mp5sd: 2.9, mpx: 2.7, ar9: 2.9, aug9: 3.3, qbz95: 3.3, qbz192: 3.0, mcx: 2.7,
  pump: 3.6, dbl: 3.2, saiga: 3.6, aa12: 4.8, ksg: 3.6, slug: 3.6, benelli: 3.8, vepr: 4.0, m249: 7.5, pkm: 7.5, m60: 10.5,
  rpk: 4.8, shredder: 16, r700: 4.1, barrett: 14, gm6: 11.5, mosin: 4.0, awm: 6.5, m32: 5.3, rail: 7.5, crossbow: 3.5,
  tempest: 4.6, p9: 0.75, g19: 0.7, m1911: 1.1, usp: 0.75, fiveseven: 0.75, thor: 5.4, b92: 0.97, ppk: 0.59, auto9: 1.1, deagle: 2.0, rev: 1.1, hc500: 2.0, akimbo: 0.95, derringer: 0.4,
  welrod: 1.0, maxim9: 1.2, // (estimates: a little over a kilo for the Welrod with its tube, about 1.2 kg for the Maxim 9 with its suppressor; the P9 is 0.75)
  g18: 0.9, skorp: 1.3, mp7: 1.9, mac10: 2.8, tx22: 0.6, sawn: 2.0, judge: 0.85, pocketgl: 1.8,
  hailstorm: 3.1, // (an estimate: the eight-bore block is most of it, about 1.3 kg of steel)
};
G.GUN_KG = G_GUN_KG;
const G_RECOIL_K = (() => {
  const k: Record<string, number> = {}, set = (ids: string, f: number) => ids.split(' ').forEach((id) => { k[id] = (k[id] || 1) * f; });
  set('ak ak74 aks74u an94 galil rpk svd saiga vepr garand thompson ppsh mosin pump dbl', 1.25); // (the stock drops below the bore)
  set('m14', 1.15);
  set('r700 mosin awm pump ksg dbl lever rev derringer hailstorm', 1.4); // (manual actions)
  set('vector', 0.75); // (the KRISS action throws its bolt down, not back)
  set('g36', 0.75);
  set('shredder', 0.4); // (braced on its harness)
  set('barrett', 0.65); // (its barrel recoils inside the receiver, and the brake takes much of the rest)
  set('gm6', 0.6); // (all of its barrel and bolt run back together, a long stroke: the impulse spread out, and the brake)
  return k;
})();
G.RECOIL_K = G_RECOIL_K;
const G_RECOIL = { K: 0.2045, B: 1.35, A: 0.7, HAND: 1.3, GAS: 1.75 };
G.RECOIL = G_RECOIL;
// How much the aim wanders (js/player.ts swayStep): sway, the slow breathing drift (heavier guns droop more), and
// erratic, the quick twitch. A stock to your shoulder is what steadies a gun: a handgun with one (a derringer on a
// stock-lug grip, a pistol with a shoulder stock) settles almost to a carbine's; a long gun with its stock taken off
// (or folded away) is held out in the hands like a pistol, and heavier, and wanders worse than one. braced: the
// build's (js/parts.ts compile); a gun as it comes, by its class. score: the two together, an M4's about 1.
const G_aimSway = (def: Record<string, any>) => {
  const hand = def.cls === 'PST' || def.cls === 'MP', braced = def.braced != null ? def.braced : !hand, kg = def.weight || G.GUN_KG[def.id] || 3;
  const sway = braced ? G.U.clamp(0.75 + kg * 0.07, 0.8, 1.6) * (hand ? 0.9 : 1) : hand ? 1.25 : G.U.clamp(1.7 + kg * 0.12, 1.9, 2.8);
  const erratic = braced ? (def.cls === 'SMG' ? 0.12 : hand ? 0.07 : 0.03) : hand ? 0.35 : 0.42;
  return { sway, erratic, score: (sway + erratic * 2.5) / 1.05 };
};
G.aimSway = G_aimSway;
// the push back of one shot (N·s) from this build with this load, or 0 (a bolt, a rail slug)
const G_recoilImpulse = (def: Record<string, any>, am?: string | null) => {
  const g = G.GUN_SPECS[def.rspec || def.id], cal = G.calOf(def), ch = G.CHARGE_GR[cal]; // (rspec: the round type's own spec, a shot of a gun of several barrels: G.shotDef)
  if (!g || !ch) return 0;
  const v = G.roundSpeed(def, am), v0 = am === 'subsonic' ? G.roundSpeed(def) : v;
  // a subsonic load: a heavier bullet on a smaller charge (the energy it's loaded to)
  const A = G.AMMO[am!] || {} as AmmoDef, L = G.loadOf(cal, am), bw = L ? (L.lg || L.g) * (L.n || 1) / 0.0647989 : g.bulletWeight * (am === 'subsonic' ? 1.4 : A.massK || 1), cw = ch * (am === 'subsonic' ? 1.4 * (v / v0) * (v / v0) : 1) * ((G.plusOf(cal, am) || { c: 1 }).c);
  return (bw * v + cw * G.RECOIL.GAS * v) * 6.479891e-5;
};
G.recoilImpulse = G_recoilImpulse;
// a shot's climb (degrees) from this build weighing kg, with this load; null when it isn't a gun with a round
const G_physRecoil = (def: Record<string, any>, kg = G.GUN_KG[def.id], am?: string | null) => {
  const I = G.recoilImpulse(def, am), R = G.RECOIL;
  if (!I || !kg) return null;
  return R.K * Math.pow(I, R.B) / Math.pow(kg, R.A) * (def.cls === 'PST' || def.cls === 'MP' ? R.HAND : 1) * (G.RECOIL_K[def.id] || 1);
};
G.physRecoil = G_physRecoil;
for (const id in G.WEAPONS) { const r = G.physRecoil(G.WEAPONS[id]); if (r) G.WEAPONS[id].recoil = Math.round(r * 100) / 100; }
// Rounds are projectiles (js/player.ts fly): they slow with drag over dragOf metres (to 37% of their speed) and
// fall with gravity, so every gun's sights are zeroed: the round leaves a hair above the line of sight, crosses
// it at zeroOf metres and drops below it past that. Handguns, SMGs and shotguns at 25 m, carbines and machine
// guns at 50, marksman and sniper rifles at 100, a launcher's leaf sight at 40. The sights sit sightH metres
// above the bore, so the round starts that far under your eye and climbs to the line: that's what gives a
// carbine zeroed at 50 m its second zero out near 200 (and puts a round low on something very close).
const G_GRAVITY: number = 9.81;
G.GRAVITY = G_GRAVITY;
const G_zeroOf = (def: Record<string, any>): number => ({ PST: 25, MP: 25, SMG: 25, SG: 25, BOW: 20, GL: 40, DMR: 100, SNP: 100, RAIL: 0 } as Record<string, number>)[def.cls] ?? 50;
G.zeroOf = G_zeroOf;
const G_sightH = (def: Record<string, any>): number => ({ PST: 0.02, MP: 0.025, SMG: 0.05, SG: 0.035, BOW: 0.05, GL: 0.06, RAIL: 0 } as Record<string, number>)[def.cls] ?? 0.065;
G.sightH = G_sightH;
// What a round does once it leaves (js/player.ts fly, stepRound: the same sums): from sightH under the line of sight,
// the bore tipped up `slope` (rise over run), out to maxD metres. Samples a metre apart: h (metres above the line of
// sight; level ground, the line of sight level), v (m/s), t (s). Stops where a round's spent (ROUND_LIFE).
const G_ROUND_LIFE = { t: 4, dist: 700, v: 30 }; // (in the air past any of these, it's gone: past the far side of the Sandia Crest's gorge, 500 m off)
G.ROUND_LIFE = G_ROUND_LIFE;
const G_ballistics = (def: Record<string, any>, am?: string | null) => { const rail = def.cls === 'RAIL'; return { v0: rail ? 3000 : Math.max(40, G.roundSpeed(def, am) || 400), drag: rail ? 1e9 : G.dragOf(def, am), g: rail ? 0 : G.GRAVITY, sh: G.sightH(def) }; };
G.ballistics = G_ballistics;
const G_flight = (def: Record<string, any>, am: string | null | undefined, slope: number, maxD = 500) => {
  const { v0, drag, g, sh } = G.ballistics(def, am), L = G.ROUND_LIFE, dt = 1 / 120, n = Math.hypot(1, slope);
  let x = 0, y = -sh, vx = v0 / n, vy = v0 * slope / n, t = 0, dist = 0;
  const out = [{ d: 0, h: y, v: v0, t: 0 }];
  while (x < maxD && t < L.t && dist < L.dist && Math.hypot(vx, vy) >= L.v) {
    const x1 = x + vx * dt, y1 = y + vy * dt - 0.5 * g * dt * dt, len = Math.hypot(x1 - x, y1 - y), k = Math.exp(-len / drag);
    for (let d = out.length; d <= x1 && d <= maxD; d++) { const u = (d - x) / (x1 - x); out.push({ d, h: y + (y1 - y) * u, v: Math.hypot(vx, vy) * k, t: t + dt * u }); }
    vx *= k; vy = vy * k - g * dt; x = x1; y = y1; t += dt; dist += len;
  }
  return out;
};
G.flight = G_flight;
// The tip of the bore that puts the round back on the line of sight at `zero` metres (found by halving: higher
// is always higher there). null if it can't get there (spent first). Kept, by gun, load and zero.
const _zeroK = new Map<string, number | null>();
const G_zeroSlope = (def: Record<string, any>, am: string | null | undefined, zero: number): number | null => {
  const key = `${def.code || def.id}|${am}|${zero}`;
  if (_zeroK.has(key)) return _zeroK.get(key)!;
  let lo = -0.02, hi = 0.25, k: number | null = null;
  if (zero > 0 && (G.flight(def, am, hi, zero)[zero] || {} as { h: number }).h > 0) {
    for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2, p = G.flight(def, am, mid, zero)[zero]; if (p && p.h > 0) hi = mid; else lo = mid; }
    k = (lo + hi) / 2;
  }
  _zeroK.set(key, k);
  return k;
};
G.zeroSlope = G_zeroSlope;
// A gun's sights: zeroed for its class's distance with ball (G.zeroOf), then turned at the zeroing table a click at
// a time (w.clicks: 0.1 mil each, a centimetre at 100 m; up is +, the round strikes higher). The bore's tip over the
// line of sight, rise over run: every load fires from it (a slower one drops more, so it hits lower).
const G_CLICK: number = 0.0001;
G.CLICK = G_CLICK;
const G_boreTip = (w: { def: Record<string, any>; clicks?: number }) => { const d = w.def; if (d.cls === 'RAIL') return 0; const k = G.zeroSlope(d, G.ballFor(G.calOf(d)), G.zeroOf(d)); return (k == null ? 0 : k) + (w.clicks || 0) * G.CLICK; };
G.boreTip = G_boreTip;
const G_ballFor = (cal: string): string => G.ammoTypes(cal)[0];
G.ballFor = G_ballFor;
// how often each type turns up loaded in a found gun (relative): ball and buckshot mostly, AP and flechette rarely
const G_AMMO_RARITY: Record<string, number> = { ball: 10, hp: 3, tracer: 3, subsonic: 2, ap: 1, buck: 10, slug: 4, birdshot: 3, flechette: 1, sabot: 1, he: 1, broadhead: 3, mechanical: 2, bodkin: 1, railslug: 1 };
for (const id of Object.keys(G.AMMO)) if (G.AMMO[id].plus) G_AMMO_RARITY[id] = Math.max(0.3, (G_AMMO_RARITY[G.AMMO[id].base!] || 1) * 0.2); // (+P: a fifth as often as its base load)
G.AMMO_RARITY = G_AMMO_RARITY;
const G_rollAmmo = (cal: string, rnd = Math.random): string => {
  const types = G.ammoTypes(cal);
  let x = rnd() * types.reduce((a, t) => a + (G.AMMO_RARITY[t] || 1), 0);
  for (const t of types) { x -= G.AMMO_RARITY[t] || 1; if (x <= 0) return t; }
  return types[0];
};
G.rollAmmo = G_rollAmmo;
// a type for that caliber, or its ball
const G_ammoOk = (cal: string, am: string): string => (G.ammoTypes(cal).includes(am) ? am : G.ballFor(cal));
G.ammoOk = G_ammoOk;
// a gun firing a round of this type: its stats as that round sees them
const G_roundDef = (def: Record<string, any>, am?: string | null) => {
  const A = G.AMMO[am!], L = G.loadOf(G.calOf(def), am);
  if (!A || A.k === 1 && !A.tracer && !A.slug && !L) return def;
  const d = Object.create(def);
  if (L && L.n) { d.pellets = L.n; d.choke = L.choke || 1; } // (a caliber's own buckshot: a round of several pellets, in a cone)
  if (L && L.rangeK) d.range = def.range * L.rangeK;
  if (A.rangeK) d.range = def.range * A.rangeK;
  if (A.spreadK) { if (def.choke) d.choke = def.choke * A.spreadK; else { d.spread = def.spread * A.spreadK; d.ads = def.ads * A.spreadK; } } // a shot load opens (or tightens) the pattern
  if (A.pelletsK) d.pellets = Math.max(1, Math.round(def.pellets * A.pelletsK));
  if (A.slug) { d.pellets = 1; d.choke = 0; d.range = def.range * 2; }
  if (A.tracer) d.tracer = A.tracer;
  if (A.quiet) d.quiet = true;
  if (A.slug || A.velK || A.plus || L || am === 'subsonic') { const I0 = G.recoilImpulse(def), I = G.recoilImpulse(def, am); if (I0 && I) d.recoil = def.recoil * Math.pow(I / I0, G.RECOIL.B); } // (a load that pushes harder or softer)
  return d;
};
G.roundDef = G_roundDef;

// ---------------------------------------------------------------- enemy kit
// What suspects carry moves up through gear tiers at its own pace with the level, the way the squad's own
// kit does: early levels are cheap handguns, sawn-offs and street SMGs, in a thin soft vest if anything; later ones bring
// rifles, plate carriers and helmets. Each suspect rolls its own tier around the level's (a few a tier lower or higher).
const G_gearTier = (level: number): number => (level <= 2 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4);
G.gearTier = G_gearTier;
const G_ENEMY_GEAR = {
  // weapon pools by type, tiers 1-4
  weapons: {
    suspect: [['p9', 'rev', 'derringer', 'tx22'], ['p9', 'm1911', 'usp', 'rev', 'g19'], ['usp', 'm1911', 'g18', 'deagle', 'g19'], ['g18', 'deagle', 'usp']],
    grunt: [['mac10', 'uzi', 'skorp', 'aks74u', 'ar9'], ['ak', 'mp5', 'uzi', 'thompson', 'aks74u', 'ak74', 'mpx'], ['ak', 'm4', 'galil', 'mp5', 'vector', 'ak74', 'scarl', 'aug9', 'qbz95'], ['hk416', 'scar', 'an94', 'tavor', 'aug', 'scarl', 'm27', 'qbz192', 'mcx']],
    rusher: [['sawn', 'dbl'], ['pump', 'dbl', 'sawn'], ['pump', 'saiga', 'ksg', 'vepr', 'benelli'], ['saiga', 'aa12', 'ksg', 'benelli', 'vepr']],
    marksman: [['lever', 'mosin'], ['mosin', 'r700', 'm14'], ['r700', 'svd', 'mk14', 'm14', 'sr25'], ['svd', 'awm', 'mk14', 'sr25']],
    heavy: [['pkm', 'rpk'], ['pkm', 'm249', 'rpk'], ['m249', 'pkm', 'm60', 'rpk'], ['m60', 'm249']],
    warden: [['scar'], ['scar', 'fal'], ['scar', 'fal'], ['scar', 'hk416']],
    leader: [['mp5', 'uzi', 'aks74u'], ['ak', 'mp5', 'mpx', 'ak74'], ['ak', 'm4', 'scarl', 'mp5', 'aug9'], ['hk416', 'scar', 'tavor', 'mcx', 'scarl']],
  },
  // What they wear by the level: the chance of each, in the order of ids, at the levels in at, in a line between them, and
  // no further than the last. Armour's weighted by the level and not the tier, so it goes on getting heavier after the
  // guns stop changing. (A suspect a gear tier up or down is dressed as for two levels on or back: js/server.ts equip.)
  at: [1, 3, 5, 8, 12, 18],
  odds: {
    // what they've got on, Level II first: early on most have a shirt, and the odd one that
    vest: { ids: ['soft2', 'soft', 'steel', 'ceramic', 'assault'], by: [[0.05, 0, 0, 0, 0], [0.3, 0.06, 0, 0, 0], [0.4, 0.3, 0.08, 0.01, 0], [0.16, 0.36, 0.26, 0.08, 0], [0.05, 0.28, 0.36, 0.2, 0.02], [0, 0.14, 0.32, 0.38, 0.12]] },
    helmet: { ids: ['ach', 'riflehelm'], by: [[0, 0], [0.1, 0], [0.25, 0.03], [0.33, 0.12], [0.35, 0.25], [0.3, 0.45]] },
    // on a helmet with no visor of its own (js/gear.ts f.*: the officers' own, drawn on the helmet and in the way of rounds just as theirs are)
    face: { ids: ['f.mandible', 'f.shield', 'f.rifle'], by: [[0, 0, 0], [0.06, 0.02, 0], [0.14, 0.08, 0.01], [0.2, 0.16, 0.06], [0.2, 0.2, 0.1], [0.2, 0.25, 0.15]] },
    // and what's mounted on it (js/gear.ts s.*, g.*, l.*): only on a plate carrier, as yours has to be, and not on assault armour, which has its own
    shoulder: { ids: ['s.deltoid', 's.axil', 's.plate'], by: [[0, 0, 0], [0, 0, 0], [0.05, 0, 0], [0.15, 0.05, 0], [0.2, 0.15, 0.03], [0.2, 0.25, 0.1]] },
    groin: { ids: ['g.flap', 'g.pelvis', 'g.plate'], by: [[0, 0, 0], [0, 0, 0], [0.1, 0, 0], [0.2, 0.06, 0.02], [0.2, 0.15, 0.08], [0.15, 0.25, 0.15]] },
    legs: { ids: ['l.shin', 'l.thigh', 'l.wrap', 'l.full'], by: [[0, 0, 0, 0], [0, 0, 0, 0], [0.05, 0, 0, 0], [0.12, 0.06, 0, 0], [0.15, 0.15, 0.06, 0], [0.1, 0.2, 0.15, 0.05]] },
  },
  // chance of a light / a laser on their gun, by tier (the Kingpin has both), and
  // the levels they first turn up on, whatever the tier: none in the first half of an act, and lights before lasers.
  // nightLight: on a night level (js/level.ts nightify) a light's what they'd reach for: that chance, on any level
  tac: { light: [0, 0.1, 0.2, 0.3], laser: [0, 0.1, 0.35, 0.6], lightFrom: 5, laserFrom: 7, nightLight: [0.3, 0.4, 0.5, 0.6] },
  // the Enforcer is always armoured, more heavily as tiers go up; the Kingpin wears the best
  fixed: {
    heavy: { vest: ['steel', 'steel', 'ceramic', 'assault'], helmet: ['ach', 'ach', 'riflehelm', 'riflehelm'], face: [0, 0, 'f.mandible', 'f.shield'], ex: [[], ['g.flap'], ['s.axil', 'g.flap', 'l.thigh'], ['l.shin']] },
    leader: { vest: ['soft', 'steel', 'steel', 'ceramic'], helmet: ['ach', 'ach', 'ach', 'riflehelm'], ex: [[], [], ['g.flap'], ['g.flap', 's.axil']] },
    boss: { vest: ['assault', 'assault', 'assault', 'assault'], helmet: ['riflehelm', 'visor', 'visor', 'visor'], ex: [[], ['l.shin'], ['l.shin'], ['l.shin']] },
  },
};
G.ENEMY_GEAR = G_ENEMY_GEAR;

interface GameModules { PLUSP: typeof G_PLUSP; baseAm: typeof G_baseAm; plusOf: typeof G_plusOf; TIER_NAMES: typeof G_TIER_NAMES; TIER_COLORS: typeof G_TIER_COLORS; CLASS_SND: typeof G_CLASS_SND; WEAPON_LIST: WeaponDef[]; WEAPONS: typeof G_WEAPONS; EXPLOSIVES_OFF: typeof G_EXPLOSIVES_OFF; obtainable: typeof G_obtainable; AUTO_ONLY: typeof G_AUTO_ONLY; FIRE_MODES: typeof G_FIRE_MODES; MODE_NAME: typeof G_MODE_NAME; MODE_INFO: typeof G_MODE_INFO; barrelsOf: typeof G_barrelsOf; roundOf: typeof G_roundOf; perOf: typeof G_perOf; cartOf: typeof G_cartOf; calsOf: typeof G_calsOf; asCal: typeof G_asCal; roundSpec: typeof G_roundSpec; capOf: typeof G_capOf; ammoTypes: typeof G_ammoTypes; loadOf: typeof G_loadOf; pickBarrels: typeof G_pickBarrels; shotDef: typeof G_shotDef; shotK: typeof G_shotK; barrelMm: typeof G_barrelMm; shotSoundKey: typeof G_shotSoundKey; OPEN_BOLT: typeof G_OPEN_BOLT; chambered: typeof G_chambered; revolver: typeof G_revolver; REV: typeof G_REV; fblock: typeof G_fblock; volleyVol: typeof G_volleyVol; fullReload: typeof G_fullReload; BOLT_HOLD: typeof G_BOLT_HOLD; boltHold: typeof G_boltHold; loaded: typeof G_loaded; MAG_FAMILY: typeof G_MAG_FAMILY; BELT_FAMILY: typeof G_BELT_FAMILY; magFam: typeof G_magFam; magFits: typeof G_magFits; beltFed: typeof G_beltFed; GUN_SPECS: typeof G_GUN_SPECS; SUPPRESSOR: typeof G_SUPPRESSOR; ARMOR_LIST: ArmorDef[]; ARMORS: typeof G_ARMORS; ENEMIES: typeof G_ENEMIES; THEMES: typeof G_THEMES; HANGAR_ROWS: typeof G_HANGAR_ROWS; HANGAR_THEME: typeof G_HANGAR_THEME; PLAYER_COLORS: typeof G_PLAYER_COLORS; VENDOR_QUIPS: typeof G_VENDOR_QUIPS; CALIBERS: typeof G_CALIBERS; calOf: typeof G_calOf; stdMag: typeof G_stdMag; AMMO: typeof G_AMMO; AMMO_TYPES: typeof G_AMMO_TYPES; MUZZLE_V: typeof G_MUZZLE_V; SOUND_SPEED: typeof G_SOUND_SPEED; dragOf: typeof G_dragOf; roundSpeed: typeof G_roundSpeed; CHARGE_GR: typeof G_CHARGE_GR; GUN_KG: typeof G_GUN_KG; RECOIL_K: typeof G_RECOIL_K; RECOIL: typeof G_RECOIL; aimSway: typeof G_aimSway; recoilImpulse: typeof G_recoilImpulse; physRecoil: typeof G_physRecoil; GRAVITY: typeof G_GRAVITY; zeroOf: typeof G_zeroOf; sightH: typeof G_sightH; ROUND_LIFE: typeof G_ROUND_LIFE; ballistics: typeof G_ballistics; flight: typeof G_flight; zeroSlope: typeof G_zeroSlope; CLICK: typeof G_CLICK; boreTip: typeof G_boreTip; ballFor: typeof G_ballFor; AMMO_RARITY: typeof G_AMMO_RARITY; rollAmmo: typeof G_rollAmmo; ammoOk: typeof G_ammoOk; roundDef: typeof G_roundDef; gearTier: typeof G_gearTier; ENEMY_GEAR: typeof G_ENEMY_GEAR; }
