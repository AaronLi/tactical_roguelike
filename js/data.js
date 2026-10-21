'use strict';
// ---------------------------------------------------------------------------
// Game content: weapons, armour, enemies, level themes.
// spread / ads are cone half-angles in degrees, recoil is degrees of kick per shot,
// range is the distance (m) where damage falloff starts, falloff is the min multiplier.
// ---------------------------------------------------------------------------

G.TIER_NAMES = ['Standard', 'Common', 'Uncommon', 'Rare', 'Legendary'];
G.TIER_COLORS = ['#9aa0a6', '#7bc96f', '#4fa3ff', '#b77cff', '#ffb02e'];

// Sound profiles by weapon class: f = filter cutoff, len = tail seconds, boom = bass punch, vol
G.CLASS_SND = {
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

const W = (o) => Object.assign({ pellets: 1, mode: 'auto', pen: 0, zoom: 0.8, speed: 1, falloff: 0.6, shell: false, burst: 0 }, o);

G.WEAPON_LIST = [
  // ----- PRIMARY: assault / battle rifles -----
  W({ id: 'm4', slot: 'p', cls: 'AR', tier: 1, price: 900, name: 'M4 Carbine', dmg: 28, rpm: 780, mag: 30, reserve: 180, reload: 2.2, spread: 2.8, ads: 0.6, recoil: 1.1, range: 35, speed: 0.95, desc: 'Reliable all-rounder. Never lets you down.' }),
  W({ id: 'ak', slot: 'p', cls: 'AR', tier: 1, price: 1000, name: 'KV-47', dmg: 36, rpm: 600, mag: 30, reserve: 180, reload: 2.5, spread: 3.2, ads: 0.8, recoil: 1.8, range: 35, speed: 0.94, pen: 1, desc: 'Hits like a truck, kicks like a mule. Punches through one target.' }),
  W({ id: 'f2', slot: 'p', cls: 'AR', tier: 2, price: 1500, name: 'F2 Bullpup', dmg: 27, rpm: 950, mag: 30, reserve: 210, reload: 2.4, spread: 2.6, ads: 0.6, recoil: 1.0, range: 32, speed: 0.97, desc: 'Compact bullpup with a blistering cyclic rate.' }),
  W({ id: 'g36', slot: 'p', cls: 'AR', tier: 2, price: 1600, name: 'G36 Ranger', dmg: 31, rpm: 720, mag: 30, reserve: 210, reload: 2.3, spread: 2.2, ads: 0.35, recoil: 0.7, range: 45, zoom: 0.62, speed: 0.95, desc: 'Laser-flat recoil. Rail on top for whatever optic you like.' }),
  W({ id: 'br3', slot: 'p', cls: 'AR', tier: 2, price: 1700, name: 'Hellfire BR-3', dmg: 40, rpm: 1000, mode: 'burst', burst: 3, burstRpm: 1600, mag: 30, reserve: 210, reload: 2.3, spread: 2.4, ads: 0.4, recoil: 1.2, range: 40, zoom: 0.7, speed: 0.95, desc: 'Semi, or a three-round burst at 1600 rpm: all three are out before the recoil lands. Pull, pull, everyone falls.' }),
  W({ id: 'scar', slot: 'p', cls: 'BR', tier: 3, price: 2400, name: 'SCAR-H', dmg: 47, rpm: 580, mag: 20, reserve: 160, reload: 2.4, spread: 2.6, ads: 0.4, recoil: 1.9, range: 50, zoom: 0.62, speed: 0.93, pen: 1, desc: '7.62 battle rifle. Armour is a suggestion.' }),
  W({ id: 'tavor', slot: 'p', cls: 'AR', tier: 3, price: 2600, name: 'TX-9 Tavor', dmg: 34, rpm: 900, mag: 40, reserve: 240, reload: 2.1, spread: 2.2, ads: 0.4, recoil: 0.8, range: 42, zoom: 0.7, speed: 0.98, desc: 'Top-shelf rifle with a big mag and no weaknesses.' }),
  // ----- PRIMARY: SMGs -----
  W({ id: 'uzi', slot: 'p', cls: 'SMG', tier: 1, price: 600, name: 'Micro Uzi', dmg: 18, rpm: 1000, mag: 32, reserve: 224, reload: 1.8, spread: 3.6, ads: 1.8, recoil: 0.8, range: 14, falloff: 0.5, speed: 1.06, desc: 'Spray and pray. Mostly spray.' }),
  W({ id: 'mp5', slot: 'p', cls: 'SMG', tier: 1, price: 800, name: 'MP5', dmg: 22, rpm: 800, mag: 30, reserve: 210, reload: 2.0, spread: 2.6, ads: 0.9, recoil: 0.6, range: 20, falloff: 0.5, speed: 1.05, desc: 'The classic room-clearer.' }),
  W({ id: 'p90', slot: 'p', cls: 'SMG', tier: 2, price: 1400, name: 'P90', dmg: 21, rpm: 900, mag: 50, reserve: 250, reload: 2.6, spread: 2.8, ads: 1.0, recoil: 0.6, range: 22, falloff: 0.5, speed: 1.04, pen: 1, desc: '50 rounds of armour-piercing 5.7mm.' }),
  W({ id: 'vector', slot: 'p', cls: 'SMG', tier: 3, price: 2200, name: 'Vector .45', dmg: 26, rpm: 1200, mag: 25, reserve: 200, reload: 1.9, spread: 2.4, ads: 0.9, recoil: 0.7, range: 18, falloff: 0.5, speed: 1.07, desc: 'Absurd fire rate, tamed recoil. Melts at close range.' }),
  // ----- PRIMARY: shotguns -----
  W({ id: 'pump', slot: 'p', cls: 'SG', tier: 1, price: 800, name: '870 Pump', dmg: 15, pellets: 8, rpm: 70, mode: 'semi', mag: 6, reserve: 36, reload: 0.55, shell: true, choke: 0.75, spread: 4.5, ads: 0.7, recoil: 4, range: 16, falloff: 0.25, speed: 1.0, desc: 'Load one, rack it, clear the room.' }),
  W({ id: 'dbl', slot: 'p', cls: 'SG', tier: 1, price: 700, name: 'Double Barrel', dmg: 19, pellets: 9, rpm: 400, mode: 'semi', mag: 2, reserve: 30, reload: 2.0, choke: 0.6, spread: 5, ads: 0.8, recoil: 5, range: 18, falloff: 0.25, speed: 1.0, desc: 'Two shells. Make them count.' }),
  W({ id: 'saiga', slot: 'p', cls: 'SG', tier: 2, price: 1600, name: 'Saiga-12', dmg: 13, pellets: 8, rpm: 260, mode: 'semi', mag: 8, reserve: 48, reload: 2.6, choke: 0.8, spread: 4.5, ads: 0.75, recoil: 3.2, range: 16, falloff: 0.25, speed: 0.98, desc: 'Semi-auto, box-fed, deeply rude.' }),
  W({ id: 'aa12', slot: 'p', cls: 'SG', tier: 3, price: 2800, name: 'AA-12', dmg: 12, pellets: 8, rpm: 300, mode: 'auto', mag: 20, reserve: 60, reload: 3.0, choke: 0.9, spread: 5, ads: 0.9, recoil: 2.5, range: 15, falloff: 0.25, speed: 0.96, desc: 'Fully automatic shotgun with a drum. Yes, really.' }),
  // ----- PRIMARY: LMGs -----
  W({ id: 'm249', slot: 'p', cls: 'LMG', tier: 2, price: 2000, name: 'M249 SAW', dmg: 27, rpm: 800, mag: 100, reserve: 300, reload: 5.0, spread: 3.6, ads: 1.0, recoil: 0.9, range: 35, speed: 0.86, pen: 1, desc: 'Suppressive fire, belt-fed.' }),
  W({ id: 'pkm', slot: 'p', cls: 'LMG', tier: 3, price: 3000, name: 'PKM', dmg: 38, rpm: 650, mag: 100, reserve: 300, reload: 5.5, spread: 3.6, ads: 1.0, recoil: 1.4, range: 40, speed: 0.83, pen: 2, desc: 'Full-power rounds, a hundred at a time.' }),
  W({ id: 'shredder', slot: 'p', cls: 'LMG', tier: 4, price: 4400, name: 'Shredder Minigun', dmg: 22, rpm: 1900, mag: 200, reserve: 600, reload: 6.0, spread: 4.2, ads: 2.8, recoil: 0.32, range: 25, speed: 0.72, spinUp: 0.55, desc: 'Has to spin up before it fires. Then it turns rooms into confetti.' }),
  // ----- PRIMARY: marksman / sniper -----
  W({ id: 'mk14', slot: 'p', cls: 'DMR', tier: 2, price: 1800, name: 'Mk14 EBR', dmg: 60, rpm: 330, mode: 'semi', mag: 20, reserve: 120, reload: 2.6, spread: 2.5, ads: 0.12, recoil: 2.4, range: 60, zoom: 0.45, speed: 0.93, pen: 1, desc: 'Semi-auto marksman rifle. Put a magnified optic on it.' }),
  W({ id: 'r700', slot: 'p', cls: 'SNP', tier: 2, price: 1700, name: 'R700 Bolt', dmg: 125, rpm: 48, mode: 'semi', mag: 5, reserve: 40, reload: 3.0, spread: 6, ads: 0.02, recoil: 6, range: 100, zoom: 0.3, speed: 0.9, pen: 2, desc: 'One shot, one problem solved. Bolt-action.' }),
  W({ id: 'barrett', slot: 'p', cls: 'SNP', tier: 4, price: 4200, name: 'M82 Anti-Materiel', dmg: 220, rpm: 90, mode: 'semi', mag: 10, reserve: 40, reload: 3.8, spread: 7, ads: 0.03, recoil: 7, range: 120, zoom: 0.28, speed: 0.85, pen: 5, desc: '.50 BMG. Goes through walls of people.' }),
  // ----- PRIMARY: specials -----
  W({ id: 'm32', slot: 'p', cls: 'GL', tier: 3, price: 3200, name: 'M32 Launcher', dmg: 0, explosive: { r: 4.5, dmg: 170 }, rpm: 110, mode: 'semi', mag: 6, reserve: 18, reload: 0.7, shell: true, spread: 1, ads: 0.5, recoil: 4, range: 100, zoom: 0.75, speed: 0.9, desc: 'Six-shot revolving grenade launcher. Mind the blast.' }),
  W({ id: 'rail', slot: 'p', cls: 'RAIL', tier: 4, price: 4800, name: 'Arc Railgun', dmg: 290, rpm: 50, mode: 'semi', mag: 4, reserve: 24, reload: 3.2, spread: 0.6, ads: 0, recoil: 5, range: 200, zoom: 0.5, speed: 0.9, pen: 99, tracer: 0x55ddff, desc: 'Magnetically accelerated slug. Penetrates everything alive.' }),

  // ----- PRIMARY: more rifles
  W({ id: 'hk416', slot: 'p', cls: 'AR', tier: 2, price: 1700, name: 'HK416', dmg: 30, rpm: 820, mag: 30, reserve: 210, reload: 2.2, spread: 2.4, ads: 0.45, recoil: 0.8, range: 40, zoom: 0.7, speed: 0.95, desc: 'Piston-driven carbine. Clean, flat, dependable.' }),
  W({ id: 'aug', slot: 'p', cls: 'AR', tier: 2, price: 1800, name: 'Steyr AUG', dmg: 31, rpm: 700, mag: 30, reserve: 210, reload: 2.4, spread: 2.4, ads: 0.3, recoil: 0.8, range: 45, zoom: 0.62, speed: 0.97, desc: 'Bullpup. Long barrel, short gun.' }),
  W({ id: 'galil', slot: 'p', cls: 'AR', tier: 2, price: 1500, name: 'Galil ACE', dmg: 37, rpm: 650, mag: 35, reserve: 210, reload: 2.5, spread: 3.0, ads: 0.6, recoil: 1.5, range: 36, zoom: 0.75, speed: 0.94, pen: 1, desc: 'Kalashnikov guts, better manners. 35-round mags.' }),
  W({ id: 'an94', slot: 'p', cls: 'AR', tier: 3, price: 2700, name: 'AN-94', dmg: 33, rpm: 600, mode: 'hyper', hyper: 2, hyperRpm: 1800, mag: 30, reserve: 210, reload: 2.4, spread: 2.4, ads: 0.35, recoil: 1.3, range: 45, zoom: 0.75, speed: 0.95, desc: 'Hyper-burst: the first two rounds of every pull leave at 1800 rpm, before the recoil lands.' }),
  W({ id: 'fal', slot: 'p', cls: 'BR', tier: 3, price: 2500, name: 'FN FAL', dmg: 52, rpm: 650, mag: 20, reserve: 140, reload: 2.6, spread: 3.0, ads: 0.45, recoil: 2.4, range: 55, zoom: 0.8, speed: 0.92, pen: 1, desc: 'The right arm of the free world. Full-power 7.62, full-auto, full send.' }),
  W({ id: 'garand', slot: 'p', cls: 'DMR', tier: 2, price: 1600, name: 'M1 Garand', dmg: 78, rpm: 300, mode: 'semi', mag: 8, reserve: 64, reload: 2.2, enbloc: true, spread: 2.2, ads: 0.1, recoil: 3.0, range: 70, zoom: 0.8, speed: 0.93, pen: 1, desc: 'En-bloc clip: can only be reloaded when empty, and it pings when it is.' }),
  W({ id: 'svd', slot: 'p', cls: 'DMR', tier: 3, price: 2600, name: 'SVD Dragunov', dmg: 85, rpm: 260, mode: 'semi', mag: 10, reserve: 60, reload: 2.8, spread: 2.8, ads: 0.08, recoil: 3.2, range: 80, zoom: 0.4, speed: 0.92, pen: 1, desc: 'Semi-auto marksman rifle. Wants a scope on that rail.' }),
  W({ id: 'vss', slot: 'p', cls: 'DMR', tier: 3, price: 2900, name: 'VSS Vintorez', dmg: 42, rpm: 750, mag: 20, reserve: 140, reload: 2.4, spread: 2.6, ads: 0.3, recoil: 1.0, range: 35, zoom: 0.45, speed: 0.97, pen: 1, integral: true, desc: 'Integrally suppressed, subsonic 9x39, full-auto. Whisper-quiet.' }),
  W({ id: 'lever', slot: 'p', cls: 'DMR', tier: 2, price: 1300, name: 'Marlin .45-70', dmg: 95, rpm: 75, mode: 'semi', mag: 6, reserve: 42, reload: 0.55, shell: true, spread: 2.6, ads: 0.2, recoil: 4.5, range: 50, zoom: 0.8, speed: 0.96, pen: 1, desc: 'Lever-action brush gun. Loads round by round, hits like a bear.' }),
  W({ id: 'mosin', slot: 'p', cls: 'SNP', tier: 1, price: 1000, name: 'Mosin-Nagant', dmg: 105, rpm: 40, mode: 'semi', mag: 5, reserve: 40, reload: 0.5, shell: true, spread: 6, ads: 0.04, recoil: 5.5, range: 90, zoom: 0.32, speed: 0.92, pen: 1, desc: 'Cheap, ancient, scoped. Bolt-action, loaded one round at a time.' }),
  W({ id: 'awm', slot: 'p', cls: 'SNP', tier: 3, price: 3200, name: 'AWM .338', dmg: 175, rpm: 45, mode: 'semi', mag: 5, reserve: 35, reload: 3.4, spread: 6.5, ads: 0.02, recoil: 6, range: 120, zoom: 0.26, speed: 0.88, pen: 3, desc: '.338 Lapua Magnum. Through cover, through them, through the next one.' }),
  // ----- PRIMARY: more SMGs
  W({ id: 'thompson', slot: 'p', cls: 'SMG', tier: 2, price: 1600, name: 'Thompson M1928', dmg: 27, rpm: 700, mag: 50, reserve: 200, reload: 3.0, spread: 3.0, ads: 1.0, recoil: 0.9, range: 18, falloff: 0.5, speed: 1.0, desc: 'Drum-fed .45. Chicago typewriter.' }),
  W({ id: 'ppsh', slot: 'p', cls: 'SMG', tier: 2, price: 1500, name: 'PPSh-41', dmg: 21, rpm: 1000, mag: 71, reserve: 213, reload: 3.2, spread: 3.4, ads: 1.3, recoil: 0.7, range: 18, falloff: 0.5, speed: 1.0, desc: '71-round drum. Quantity has a quality all its own.' }),
  W({ id: 'mp5sd', slot: 'p', cls: 'SMG', tier: 2, price: 1700, name: 'MP5SD', dmg: 21, rpm: 750, mag: 30, reserve: 210, reload: 2.0, spread: 2.4, ads: 0.8, recoil: 0.45, range: 18, falloff: 0.5, speed: 1.05, integral: true, desc: 'Integrally suppressed 9mm. Enemies barely hear it.' }),
  // ----- PRIMARY: more shotguns
  W({ id: 'ksg', slot: 'p', cls: 'SG', tier: 2, price: 1900, name: 'KSG', dmg: 15, pellets: 8, rpm: 75, mode: 'semi', mag: 14, reserve: 42, reload: 0.45, shell: true, choke: 0.75, spread: 4.5, ads: 0.7, recoil: 3.6, range: 16, falloff: 0.25, speed: 0.98, desc: 'Bullpup pump with twin tubes. Fourteen shells before you reload.' }),
  W({ id: 'slug', slot: 'p', cls: 'SG', tier: 2, price: 1500, name: 'Slug Gun', dmg: 120, pellets: 1, rpm: 220, mode: 'semi', mag: 7, reserve: 42, reload: 0.5, shell: true, spread: 2.2, ads: 0.5, recoil: 4.5, range: 30, falloff: 0.45, speed: 0.98, pen: 1, desc: 'Semi-auto 12-gauge loaded with solid slugs. A shotgun that reaches.' }),
  // ----- PRIMARY: LMG / special
  W({ id: 'm60', slot: 'p', cls: 'LMG', tier: 3, price: 3100, name: 'M60', dmg: 42, rpm: 550, mag: 100, reserve: 300, reload: 6.0, spread: 3.8, ads: 1.1, recoil: 1.5, range: 45, speed: 0.82, pen: 2, desc: 'The Pig. Heavy, slow-firing, devastating.' }),
  // ----- PRIMARY: the 2nd round (and the conversions: guns that are another gun's receiver with a different
  // kit in it, see js/parts.js RCV)
  W({ id: 'ak74', slot: 'p', cls: 'AR', tier: 2, price: 1400, name: 'AK-74M', dmg: 30, rpm: 650, mag: 30, reserve: 210, reload: 2.4, spread: 2.8, ads: 0.55, recoil: 1.05, range: 38, zoom: 0.75, speed: 0.95, desc: 'The 5.45 Kalashnikov: AK furniture, a flatter, lighter round. Takes AN-94 magazines.' }),
  W({ id: 'aks74u', slot: 'p', cls: 'AR', tier: 1, price: 1100, name: 'AKS-74U', dmg: 26, rpm: 700, mag: 30, reserve: 210, reload: 2.2, spread: 3.2, ads: 1.0, recoil: 1.2, range: 22, falloff: 0.5, speed: 1.02, desc: 'A rifle cut down to SMG size. Loud, short, takes 5.45 AK-74 magazines.' }),
  W({ id: 'rpk', slot: 'p', cls: 'LMG', tier: 2, price: 1900, name: 'RPK', dmg: 36, rpm: 600, mag: 40, reserve: 200, reload: 3.0, spread: 3.2, ads: 0.7, recoil: 1.35, range: 42, speed: 0.88, pen: 1, desc: 'An AK with a long heavy barrel and a bipod. Magazine-fed: any 7.62×39 AK magazine, and the 75-round drum was made for it.' }),
  W({ id: 'scarl', slot: 'p', cls: 'AR', tier: 2, price: 1900, name: 'SCAR-L', dmg: 29, rpm: 625, mag: 30, reserve: 210, reload: 2.3, spread: 2.4, ads: 0.45, recoil: 0.85, range: 40, zoom: 0.7, speed: 0.95, desc: 'The SCAR in 5.56: soft-shooting, takes STANAG magazines.' }),
  W({ id: 'm27', slot: 'p', cls: 'AR', tier: 3, price: 2400, name: 'M27 IAR', dmg: 30, rpm: 750, mag: 30, reserve: 270, reload: 2.4, spread: 2.6, ads: 0.35, recoil: 0.75, range: 45, zoom: 0.7, speed: 0.92, desc: 'An automatic rifle built to keep firing: heavy barrel, bipod, STANAG magazines.' }),
  W({ id: 'm14', slot: 'p', cls: 'BR', tier: 2, price: 1900, name: 'M14', dmg: 52, rpm: 700, mag: 20, reserve: 140, reload: 2.6, spread: 2.8, ads: 0.3, recoil: 2.5, range: 55, zoom: 0.8, speed: 0.92, pen: 1, desc: 'Walnut and 7.62 NATO. Fit the EBR chassis kit and it becomes a Mk14.' }),
  W({ id: 'sr25', slot: 'p', cls: 'DMR', tier: 3, price: 2600, name: 'SR-25', dmg: 58, rpm: 360, mode: 'semi', mag: 20, reserve: 120, reload: 2.5, spread: 2.4, ads: 0.1, recoil: 2.0, range: 65, zoom: 0.45, speed: 0.93, pen: 1, desc: 'An AR-10 marksman rifle: AR controls, AR parts, 7.62 NATO.' }),
  W({ id: 'mpx', slot: 'p', cls: 'SMG', tier: 2, price: 1500, name: 'MPX', dmg: 22, rpm: 850, mag: 30, reserve: 210, reload: 2.0, spread: 2.4, ads: 0.7, recoil: 0.5, range: 22, falloff: 0.5, speed: 1.04, desc: 'A 9mm SMG that handles like an AR: buffer tube, AR grip, AR rail.' }),
  W({ id: 'benelli', slot: 'p', cls: 'SG', tier: 2, price: 1800, name: 'Benelli M4', dmg: 14, pellets: 8, rpm: 240, mode: 'semi', mag: 7, reserve: 42, reload: 0.5, shell: true, choke: 0.8, spread: 4.5, ads: 0.7, recoil: 3.0, range: 16, falloff: 0.25, speed: 0.98, desc: 'Semi-auto, tube-fed, AR stock and grip. Fast follow-ups, slow to top up (fit a speed loader).' }),
  W({ id: 'vepr', slot: 'p', cls: 'SG', tier: 2, price: 1700, name: 'Vepr-12', dmg: 13, pellets: 8, rpm: 280, mode: 'semi', mag: 8, reserve: 48, reload: 2.5, choke: 0.8, spread: 4.5, ads: 0.7, recoil: 2.9, range: 16, falloff: 0.25, speed: 0.98, desc: 'The better-mannered Saiga: same magazines, softer recoil.' }),
  W({ id: 'ar9', slot: 'p', cls: 'SMG', tier: 1, price: 900, name: 'AR-9', dmg: 22, rpm: 900, mag: 33, reserve: 198, reload: 2.1, spread: 2.6, ads: 0.8, recoil: 0.55, range: 20, falloff: 0.5, speed: 1.03, desc: 'An M4 lower with a 9mm blowback kit in it: Glock magazines, every AR part. Fit an M4 upper and it\'s a rifle again.' }),
  W({ id: 'aug9', slot: 'p', cls: 'SMG', tier: 2, price: 1500, name: 'AUG 9mm', dmg: 22, rpm: 750, mag: 33, reserve: 198, reload: 2.2, spread: 2.2, ads: 0.5, recoil: 0.45, range: 24, zoom: 0.62, falloff: 0.5, speed: 1.03, desc: 'The AUG with its 9mm conversion: a long, quiet-handling bullpup SMG on Glock magazines.' }),
  W({ id: 'crossbow', slot: 'p', cls: 'BOW', tier: 2, price: 1400, name: 'Crossbow', dmg: 210, rpm: 40, mode: 'semi', mag: 1, reserve: 20, reload: 1.7, spread: 0.8, ads: 0.05, recoil: 1.0, range: 60, falloff: 0.7, zoom: 0.6, speed: 1.0, pen: 1, tracer: 0x8b5a2b, desc: 'Silent. Enemies two steps away won\'t hear it. One bolt per reload.' }),

  // ----- SECONDARY -----
  W({ id: 'p9', slot: 's', cls: 'PST', tier: 0, price: 150, name: 'P9 Pistol', dmg: 24, rpm: 450, mode: 'semi', mag: 15, reserve: 90, reload: 1.5, spread: 2.2, ads: 0.8, recoil: 1.5, range: 18, speed: 1.0, desc: 'Standard issue. Better than throwing it.' }),
  W({ id: 'm1911', slot: 's', cls: 'PST', tier: 1, price: 300, name: 'M1911', dmg: 36, rpm: 380, mode: 'semi', mag: 8, reserve: 64, reload: 1.6, spread: 2, ads: 0.6, recoil: 2, range: 20, desc: 'A century of .45 ACP.' }),
  W({ id: 'g18', slot: 's', cls: 'MP', tier: 1, price: 500, name: 'G18 Auto', dmg: 20, rpm: 1100, mag: 33, reserve: 132, reload: 1.6, spread: 3.2, ads: 1.6, recoil: 0.9, range: 14, falloff: 0.5, desc: 'Full-auto pistol. Empty in a blink.' }),
  W({ id: 'skorp', slot: 's', cls: 'MP', tier: 1, price: 450, name: 'Skorpion', dmg: 19, rpm: 950, mag: 20, reserve: 140, reload: 1.8, spread: 3, ads: 1.5, recoil: 0.6, range: 14, falloff: 0.5, desc: 'Tiny machine pistol, controllable bite.' }),
  W({ id: 'auto9', slot: 's', cls: 'PST', tier: 2, price: 750, name: 'Auto-9', dmg: 28, rpm: 1100, mode: 'burst', burst: 3, mag: 18, reserve: 108, reload: 1.7, spread: 2.2, ads: 0.7, recoil: 1.2, range: 20, desc: 'Burst-fire sidearm for decisive people.' }),
  W({ id: 'deagle', slot: 's', cls: 'PST', tier: 2, price: 900, name: 'Desert Eagle', dmg: 72, rpm: 220, mode: 'semi', mag: 7, reserve: 42, reload: 1.9, spread: 2.5, ads: 0.4, recoil: 4, range: 30, pen: 1, desc: '.50 AE hand-howitzer.' }),
  W({ id: 'rev', slot: 's', cls: 'PST', tier: 2, price: 800, name: '.357 Revolver', dmg: 85, rpm: 160, mode: 'semi', mag: 6, reserve: 42, reload: 2.8, spread: 1.8, ads: 0.3, recoil: 4.5, range: 30, pen: 1, desc: 'Six for sure.' }),
  W({ id: 'sawn', slot: 's', cls: 'SG', tier: 2, price: 650, name: 'Sawed-Off', dmg: 16, pellets: 8, rpm: 400, mode: 'semi', mag: 2, reserve: 24, reload: 1.8, choke: 1.8, spread: 6, ads: 2.0, recoil: 5, range: 9, falloff: 0.25, desc: 'Pocket shotgun for close friends.' }),
  W({ id: 'hc500', slot: 's', cls: 'PST', tier: 3, price: 1400, name: '.500 Hand Cannon', dmg: 135, rpm: 110, mode: 'semi', mag: 5, reserve: 30, reload: 2.6, spread: 2, ads: 0.25, recoil: 6, range: 40, pen: 2, desc: 'Sidearm with sniper-rifle opinions.' }),
  W({ id: 'pocketgl', slot: 's', cls: 'GL', tier: 3, price: 1500, name: 'Pocket Launcher', dmg: 0, explosive: { r: 3.6, dmg: 130 }, rpm: 60, mode: 'semi', mag: 1, reserve: 8, reload: 1.6, spread: 1, ads: 0.5, recoil: 5, range: 80, desc: 'Single-shot 40mm. Emergency room-clearer.' }),
  W({ id: 'mp7', slot: 's', cls: 'MP', tier: 3, price: 1300, name: 'MP7 Compact', dmg: 24, rpm: 950, mag: 30, reserve: 180, reload: 1.9, spread: 2.2, ads: 0.8, recoil: 0.55, range: 20, pen: 1, desc: 'A full SMG that fits in a holster.' }),
  W({ id: 'usp', slot: 's', cls: 'PST', tier: 1, price: 500, name: 'USP .45', dmg: 38, rpm: 380, mode: 'semi', mag: 12, reserve: 72, reload: 1.6, spread: 1.8, ads: 0.4, recoil: 2, range: 22, desc: 'Match-grade .45. Takes a suppressor beautifully.' }),
  W({ id: 'mac10', slot: 's', cls: 'MP', tier: 1, price: 450, name: 'MAC-10', dmg: 22, rpm: 1100, mag: 30, reserve: 150, reload: 1.8, spread: 3.8, ads: 2, recoil: 0.9, range: 12, falloff: 0.5, desc: 'A brick that sprays .45 ACP.' }),
  W({ id: 'akimbo', slot: 's', cls: 'PST', tier: 2, price: 900, name: 'Akimbo Berettas', dmg: 24, rpm: 700, mode: 'semi', mag: 30, reserve: 150, reload: 2.6, spread: 2.8, ads: 2.8, recoil: 1.2, range: 18, akimbo: true, desc: 'One in each hand, alternating. No aiming down sights, no regrets.' }),
  W({ id: 'judge', slot: 's', cls: 'SG', tier: 2, price: 700, name: 'The Judge', dmg: 16, pellets: 5, rpm: 200, mode: 'semi', mag: 5, reserve: 35, reload: 2.6, choke: 2.2, spread: 4.5, ads: 1.8, recoil: 4, range: 8, falloff: 0.25, desc: 'A revolver that fires .410 buckshot.' }),
  W({ id: 'g19', slot: 's', cls: 'PST', tier: 1, price: 350, name: 'G19 Compact', dmg: 24, rpm: 450, mode: 'semi', mag: 15, reserve: 90, reload: 1.4, spread: 2.2, ads: 0.75, recoil: 1.5, range: 18, speed: 1.0, desc: 'Compact 9mm. Takes every Glock magazine, and a stock if you want one.' }),
  W({ id: 'derringer', slot: 's', cls: 'PST', tier: 1, price: 250, name: 'Derringer', dmg: 70, rpm: 300, mode: 'semi', mag: 2, reserve: 30, reload: 1.6, spread: 2.5, ads: 0.8, recoil: 4, range: 12, desc: 'Two shots of .45 Colt in your palm.' }),
];
G.WEAPONS = {};
G.WEAPON_LIST.forEach((w) => { w.snd = G.CLASS_SND[w.cls]; G.WEAPONS[w.id] = w; });
// Fire selectors (X): the positions a gun has, the first its default. Most select-fire guns come set to semi
// with full auto a click away. Cheap open-bolt guns and belt-fed machine guns have no semi: full auto only.
// The burst guns have semi and their burst (burstRpm: a burst faster than the gun's cyclic rate); the AN-94
// semi and its two-round hyper burst.
G.AUTO_ONLY = ['mac10', 'uzi', 'aa12', 'm249', 'pkm', 'm60', 'shredder'];
G.FIRE_MODES = { br3: ['semi', 'burst'], an94: ['semi', 'hyper'], auto9: ['semi', 'burst'] };
G.WEAPON_LIST.forEach((w) => { w.modes = G.FIRE_MODES[w.id] || (w.mode === 'semi' ? ['semi'] : G.AUTO_ONLY.includes(w.id) ? [w.mode] : ['semi', w.mode]); });
G.MODE_NAME = { semi: 'SEMI', auto: 'AUTO', burst: 'BURST', hyper: 'HYPER' };
// Chambers. A closed-bolt gun (most of them) holds a round in its chamber as well as the ones in its magazine or
// tube (w.chamber: its type, or null): it fires that one, and the action feeds the next from the magazine. A
// reload with one chambered keeps it (30+1); run dry, the chamber's empty too and the reload ends by working the
// action; a magazine put in by hand leaves it empty, and the first pull of the trigger (or R) racks a round in.
// Open-bolt guns fire as the bolt closes on a round from the magazine (nothing waits in the chamber), and some
// guns' chambers are their magazine: revolvers, break actions, the Garand's clip, launchers, the crossbow and the
// railgun (and the akimbo pair, counted as one).
G.OPEN_BOLT = ['uzi', 'mac10', 'ppsh', 'thompson', 'aa12', 'm249', 'pkm', 'm60', 'shredder'];
G.chambered = (def) => {
  if (!def || G.OPEN_BOLT.includes(def.id) || def.enbloc || def.akimbo || ['GL', 'BOW', 'RAIL'].includes(def.cls)) return false;
  const P = G.Gunsmith && G.Gunsmith.PLATFORMS[def.id];
  return !(P && (P.arch === 'revolver' || P.arch === 'derringer' || (P.spec && P.spec.rcv === 'break')));
};
// Bolt hold-open: the action locks back on the last round, so a reload from empty is a magazine change and a
// thumb on the bolt catch (or the slide stop), not a full rack. Every pistol with a slide, the AR-15 family and the
// rifles and SMGs built the same way; not the AK family, the MP5's roller bolt, the open-bolt guns or a bolt-action.
G.BOLT_HOLD = new Set(['scar', 'scarl', 'g36', 'aug', 'aug9', 'tavor', 'fal', 'm14', 'mk14', 'sr25', 'barrett', 'mpx', 'mp7', 'vector', 'skorp', 'svd', 'ar9', 'm27', 'hk416', 'br3']);
G.boltHold = (def) => {
  const P = def && G.Gunsmith && G.Gunsmith.PLATFORMS[def.id];
  return !!P && (P.arch === 'pistol' || G.BOLT_HOLD.has(def.id) || (P.arch === 'rifle' && (P.spec.rcv || 'ar') === 'ar')); // (the AR-15 pattern: a bolt catch over the well)
};
// what's in the gun, all told: the magazine (or tube) and the chamber
G.loaded = (w) => (w ? w.mag + (w.chamber ? 1 : 0) : 0);
// Magazine families: guns that take the same magazines (one set of magazine parts, js/parts.js MAG_FAMS).
//   stanag: NATO 5.56 (AR-15 pattern): the M4, HK416, F2000, Tavor, SCAR-L and M27
//   mp5: the MP5 and the MP5SD
//   akm: 7.62x39 AK pattern: the AK, the Galil ACE (built to take AK magazines) and the RPK
//   ak74: 5.45x39: the AK-74M, AKS-74U and AN-94
//   glock: 9mm Glock pattern: the P9, G18, G19, and the AR-9 and AUG 9mm conversions
//   m14: the M14 and the Mk14 EBR (an M14 in a chassis)
//   saiga12: the Saiga-12 and the Vepr-12
// (The G36 and AUG are 5.56 too but use their own; the other 7.62x51 rifles, and the .45s, each have their own.)
G.MAG_FAMILY = {
  m4: 'stanag', hk416: 'stanag', f2: 'stanag', tavor: 'stanag', scarl: 'stanag', m27: 'stanag', mp5: 'mp5', mp5sd: 'mp5', ak: 'akm', galil: 'akm', rpk: 'akm',
  ak74: 'ak74', aks74u: 'ak74', an94: 'ak74', p9: 'glock', g18: 'glock', g19: 'glock', ar9: 'glock', aug9: 'glock', m14: 'm14', mk14: 'm14', saiga: 'saiga12', vepr: 'saiga12',
};
G.magFam = (wid) => G.MAG_FAMILY[wid] || wid;
// does a magazine made for gun mw go in gun gid?
G.magFits = (mw, gid) => G.magFam(mw) === G.magFam(gid);
// fed from a belt box (the machine guns), rather than a magazine (an LMG like the RPK that takes rifle magazines)
G.beltFed = (def) => def.cls === 'LMG' && !G.MAG_FAMILY[def.id];

// Interior-ballistics inputs for the gunshot synthesizer (js/gunshot-synth.js), one per weapon.
// Same fields as tactical_game's weapon specs. shotCount > 1 = buckshot (diffuse crack).
// Weapons without an entry (the railgun) keep their procedural sound.
const GS = (barrel, caliber, muzzleDevice, pressure, grain, bulletWeight, boltMass, boltLoudness, actionType, caseMaterial, caseLength, shotCount = 1) =>
  ({ barrel, caliber, muzzleDevice, pressure, grain, bulletWeight, boltMass, boltLoudness, actionType, caseMaterial, caseLength, shotCount });
G.GUN_SPECS = {
  m4:       GS(14.5, 5.56, 'flash', 55000, 0.70, 62, 0.35, 0.50, 'gas', 'brass', 45),
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
  shredder: GS(22.0, 7.62, 'flash', 60000, 0.90, 147, 0.20, 0.30, 'gas', 'brass', 51),
  mk14:     GS(18.0, 7.62, 'flash', 60000, 0.90, 168, 0.55, 0.55, 'gas', 'brass', 51),
  r700:     GS(24.0, 7.62, 'none', 60000, 1.10, 175, 0.05, 0.10, 'recoil', 'brass', 51),
  barrett:  GS(29.0, 12.7, 'brake', 55000, 1.60, 660, 0.80, 0.70, 'recoil', 'brass', 99),
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
  derringer:GS(3.0, 11.43, 'none', 14000, 0.50, 250, 0.05, 0.05, 'recoil', 'brass', 33),
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
};

// Suppressed fire (suppressors are muzzle parts, see js/parts.js): damage factor and the fallback sound.
G.SUPPRESSOR = { dmg: 0.92, snd: { f: 900, len: 0.12, boom: 0.15, vol: 0.25 } };

// Body armour and helmets that suspects wear (the squad's kit, carriers, plates, helmets and belts, is in
// js/gear.js, and works the same way). Each protects certain zones; stop[zone] is
// [vs handgun rounds and buckshot, vs rifle rounds]: the share of a round's wound it stops when new. Armour-
// piercing rounds (penetration 2+) get through twice as well. It wears: every round it takes costs durability
// (a rifle round 1, a handgun round 0.5, a pellet 0.2), and protection falls to about a third as it's used up.
// A stopped round still bruises (blunt trauma: a tenth of the wound). 'head' is the top of the head, which is
// all a helmet covers; 'face' is below its brim.
G.ARMOR_LIST = [
  { id: 'none', kind: 'vest', name: 'No Armour', tier: 0, stop: {}, dur: 0, speed: 1, price: 0, desc: 'Just your shirt.' },
  { id: 'soft', kind: 'vest', name: 'Soft Vest (IIIA)', tier: 1, stop: { chest: [0.9, 0.12], abdomen: [0.9, 0.12] }, dur: 6, speed: 1, price: 500,
    desc: 'Kevlar panels, chest and stomach. Stops handgun rounds and buckshot; rifle rounds go straight through.' },
  { id: 'steel', kind: 'vest', name: 'Steel Plate Carrier (III)', tier: 2, stop: { chest: [0.95, 0.85], abdomen: [0.85, 0.1] }, dur: 6, speed: 0.95, price: 1300,
    desc: 'Steel plates over the heart and lungs, soft armour below. Stops most rifle rounds to the chest. Heavy.' },
  { id: 'ceramic', kind: 'vest', name: 'Ceramic Plate Carrier (IV)', tier: 3, stop: { chest: [0.97, 0.92], abdomen: [0.9, 0.12] }, dur: 5, speed: 0.97, price: 2200,
    desc: 'Ceramic plates: lighter, and they stop even armour-piercing rounds, but they crack as they do.' },
  { id: 'assault', kind: 'vest', name: 'Assault Armour', tier: 4, stop: { chest: [0.97, 0.92], abdomen: [0.95, 0.65], uarm: [0.8, 0.1], thigh: [0.6, 0.05] }, dur: 8, speed: 0.88, price: 3200,
    desc: 'Plates front, back and sides, a groin plate, shoulder and thigh protection. Slow.' },
  { id: 'nohelm', kind: 'helmet', name: 'No Helmet', tier: 0, stop: {}, dur: 0, speed: 1, price: 0, desc: '' },
  { id: 'ach', kind: 'helmet', name: 'Ballistic Helmet (IIIA)', tier: 1, stop: { head: [0.9, 0.15] }, dur: 3, speed: 1, price: 600,
    desc: 'Stops handgun rounds to the top of the head. Not to your face.' },
  { id: 'riflehelm', kind: 'helmet', name: 'Rifle-rated Helmet', tier: 3, stop: { head: [0.95, 0.55] }, dur: 3, speed: 0.99, price: 1700,
    desc: 'Turns some rifle rounds too. Still not your face.' },
  { id: 'visor', kind: 'helmet', name: 'Helmet with Ballistic Visor', tier: 4, stop: { head: [0.95, 0.55], face: [0.85, 0.2] }, dur: 4, speed: 0.97, price: 2800,
    desc: 'Rifle-rated, with a visor that stops handgun rounds to the face.' },
];
G.ARMORS = {};
G.ARMOR_LIST.forEach((a) => (G.ARMORS[a.id] = a));


// Enemy archetypes. acc = base hit chance at close range; dmg per bullet (per pellet for shotgunners)
// Opponents are what a police tactical team actually faces: armed suspects in street clothes, a few with
// body armour, not super-soldiers. People have human health; armour (vest = fraction of torso damage stopped)
// and helmets do the protecting. comply = base chance to surrender when shouted at, fake = chance a
// surrender is a ruse and they go back for the gun. style picks the clothing on the character rig.
// morale = starting nerve (0..1): it drains under fire and when friends go down; at 0.3 they break and run.
// Only `hunt` types press an attack, and only while their nerve holds; everyone else holds their ground.
// steady scales how much fear costs them (professionals shrug off more).
G.ENEMIES = {
  suspect: { draw: 0.55, morale: 0.4, style: 'suspect', wpn: 'p9', name: 'Armed Suspect', hp: 100, speed: 2.2, range: 22, pref: 6, dmg: 13, pellets: 1, burst: [1, 3], rof: 0.28, pause: [0.7, 1.4], acc: 0.36, cr: 50, scale: 1, headMult: 2, comply: 0.45, fake: 0.15, snd: 'PST' },
  grunt: { draw: 1.0, morale: 0.55, style: 'suspect', wpn: 'ak', name: 'Gunman', hp: 100, speed: 2.1, range: 28, pref: 9, dmg: 11, pellets: 1, burst: [3, 6], rof: 0.11, pause: [0.9, 1.7], acc: 0.36, cr: 65, scale: 1, headMult: 2, comply: 0.3, fake: 0.12, snd: 'AR' },
  rusher: { draw: 0.9, morale: 0.65, hunt: true, style: 'suspect', wpn: 'saiga', name: 'Shotgunner', hp: 100, speed: 2.9, range: 9, pref: 2.5, dmg: 7, pellets: 6, burst: [1, 1], rof: 0.9, pause: [0.9, 1.3], acc: 0.5, cr: 70, scale: 1, headMult: 2, comply: 0.35, fake: 0.1, snd: 'SG' },
  marksman: { ready: true, morale: 0.5, style: 'suspect', wpn: 'r700', name: 'Lookout', hp: 100, speed: 1.9, range: 60, pref: 15, dmg: 45, pellets: 1, aimTime: 1.2, pause: [2.0, 3.0], acc: 0.75, cr: 90, scale: 1, headMult: 2, comply: 0.4, fake: 0.05, snd: 'SNP' },
  heavy: { ready: true, morale: 0.85, steady: 0.3, hunt: true, style: 'armored', nades: true, wpn: 'm249', name: 'Enforcer', hp: 150, armor: 'heavy', speed: 1.9, range: 30, pref: 8, dmg: 10, pellets: 1, burst: [6, 12], rof: 0.08, pause: [1.2, 2.0], acc: 0.38, cr: 160, scale: 1.04, headMult: 1.6, comply: 0.1, fake: 0, snd: 'LMG' },
  warden: { ready: true, morale: 1.0, style: 'armored', boss: true, nades: true, wpn: 'scar', name: 'The Kingpin', hp: 600, armor: 'boss', speed: 2.0, range: 40, pref: 8, dmg: 14, pellets: 1, burst: [3, 6], rof: 0.1, pause: [0.8, 1.4], acc: 0.45, cr: 1500, scale: 1.06, headMult: 1.6, comply: 0, fake: 0, snd: 'BR' },
  civ: { style: 'civ', civ: true, name: 'Civilian', hp: 100, speed: 1.1, run: 3.2, scale: 1, headMult: 2, cr: 0 },
};

// home: share of rooms furnished as a home (the rest are storage, offices and break rooms)
// layout: 'rooms' (rooms and corridors, the default), 'warehouse' or 'houses' (js/level.js)
// noFog: a clear view to the far end (the fog colour is still the backdrop)
G.THEMES = [
  { name: 'Apartment', layout: 'apartments', foes: 2, crowd: 2, big: 2, home: 1, reflect: 0.3, floor: '#4a443d', wall: '#b8ab95', crate: '#8a6a3a', fog: 0x0e0c0a, light: 0xffd8a8, ceil: '#cfc8ba' },
  { name: 'Warehouse', layout: 'warehouse', noFog: true, home: 0, reflect: 0.3, floor: '#57504a', wall: '#7c6e5b', crate: '#8a6a3a', fog: 0x16130f, light: 0xffd49a, ceil: '#2a2622' },
  { name: 'Bunker', entry: 'vault', home: 0.45, reflect: 0.4, floor: '#3a4042', wall: '#5a6160', crate: '#4d5a3c', fog: 0x0b0f11, light: 0xa8c8ff, ceil: '#1d2224' },
  { name: 'Suburbs', layout: 'houses', home: 1, reflect: 0.28, floor: '#5a4a3a', wall: '#9fae98', crate: '#8a6a3a', fog: 0x111723, light: 0xffe0b0, ceil: '#d6d2c4' },
  { name: 'Research Lab', home: 0.4, reflect: 0.36, floor: '#8d9399', wall: '#b9bec4', crate: '#5d6b7a', fog: 0x12161a, light: 0xe6f2ff, ceil: '#3a3f44' },
  { name: 'Foundry', home: 0.3, reflect: 0.3, floor: '#3a2a22', wall: '#5e3d2b', crate: '#6a5a4a', fog: 0x1a0c06, light: 0xff9a5a, ceil: '#24160f' },
  { name: 'Cold Storage', home: 0.35, reflect: 0.4, floor: '#4f5d68', wall: '#7f97a8', crate: '#5f6f7a', fog: 0x0a1218, light: 0x9fe0ff, ceil: '#26323a' },
  // a music festival at night, outdoors: big open spaces, the fog pushed far back, moonlight, more people about
  { name: 'Festival', layout: 'festival', fence: 'hoarding', home: 0, reflect: 0.2, floor: '#26331f', wall: '#5b7480', crate: '#8a6a3a', fog: 0x060912, light: 0xffe2c0, ceil: '#d8dcde', fogNear: 30, fogFar: 150, hemi: 0x5a6a96, hemiI: 0.55, crowd: 2, foes: 1.5, night: 35 },
];

// the hangar between levels (js/hangar.js): a daylit hall with a helipad outside it
G.HANGAR_ROWS = 55; // the shooting range north of the hangar: tile rows (js/level.js layHangar; js/hangar.js shifts the hall by two metres a row)
G.HANGAR_THEME = { name: 'Hangar', layout: 'hangar', hub: true, noFog: true, home: 0, reflect: 0.35, floor: '#6c7075', wall: '#98a0a8', crate: '#8a6a3a', fog: 0x86a6c8, light: 0xfff2dc, ceil: '#c9cdd0', hemi: 0xe4ecf6, hemiI: 0.85 };

G.PLAYER_COLORS = [0x3fa9f5, 0x7bd34a, 0xf5a623, 0xd94fd9, 0x2fd6c4, 0xf2e94e, 0xff6b6b, 0xffffff];

G.VENDOR_QUIPS = {
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

// ---------------------------------------------------------------- wounds
// Rounds are lethal the way real ones are, both ways. A round to an unarmoured head kills outright (a helmet
// covers the top of the head, not the face). Elsewhere a hit takes
// a share of a person's life (a "standard person": tougher types like the Enforcer and the Kingpin have more),
// set by where it lands and by the round. [central, peripheral] for a reference 5.56 round (damage 28):
// central when its path goes through the middle of the part (heart and lungs, liver and spine, the femoral
// artery), peripheral when it clips a flank or an edge. Centre mass takes about 2 rifle or pistol rounds;
// heavier rounds take 1-2, limbs 3-5.
G.WOUNDS = { chest: [0.62, 0.42], abdomen: [0.56, 0.36], uarm: [0.34, 0.24], farm: [0.2, 0.16], thigh: [0.46, 0.3], shin: [0.22, 0.17] };
G.WOUND_CENTRAL = 0.55; // a path within 55% of the part's radius from its middle counts as central
G.WOUND_REF = 28;
// how hard a round hits, relative to the reference: heavier rounds wound more, but not in proportion
G.woundPower = (dmg) => Math.pow(Math.max(1, dmg) / G.WOUND_REF, 0.7);
// a wound before armour: the part, whether the round went through its middle, how hard it hits
G.woundOf = (zone, central, k) => (G.WOUNDS[zone] || G.WOUNDS.thigh)[central ? 0 : 1] * k;
// what kind of round it is, as far as armour cares
G.threat = (def) => (def.pen >= 2 ? 'ap' : def.cls === 'PST' || def.cls === 'MP' || def.cls === 'SMG' || (def.cls === 'SG' && def.pellets > 1) ? 'handgun' : 'rifle');
// the share of a wound this armour stops on that zone, at its condition (0 used up .. 1 new). The round
// matters too: armour-piercing ammo gets through more, hollow points flatten on armour.
G.armorStop = (a, zone, def, cond = 1) => {
  const s = a && a.stop[zone];
  if (!s) return 0;
  const t = G.threat(def);
  let v = t === 'handgun' ? s[0] : s[1] * (t === 'ap' ? 0.5 : 1);
  if (def.apRound && t !== 'ap') v *= 0.6; // (a round that's already armour-piercing doesn't get it twice)
  if (def.armorK) v = Math.min(0.99, v * def.armorK);
  return v * (0.35 + 0.65 * G.U.clamp(cond, 0, 1));
};

// ---------------------------------------------------------------- ammunition
// Calibers (from each gun's G.GUN_SPECS bore and case) and the boxes their loose rounds come in. group decides
// which ammo types exist for it; box: rounds in a box of ball from the quartermaster; per: price per round.
G.CALIBERS = {
  '5.56/45': { name: '5.56×45', group: 'rifle', box: 30, per: 1.2 }, '7.62/39': { name: '7.62×39', group: 'rifle', box: 30, per: 1.1 },
  '7/43': { name: '.277 Fury', group: 'rifle', box: 30, per: 1.8 }, '7.62/51': { name: '7.62×51', group: 'rifle', box: 20, per: 1.8 },
  '9/19': { name: '9×19', group: 'pistol', box: 50, per: 0.6 }, '5.7/29': { name: '5.7×28', group: 'pistol', box: 50, per: 1.1 },
  '11.43/23': { name: '.45 ACP', group: 'pistol', box: 50, per: 0.9 }, '18.5/70': { name: '12 gauge', group: 'shotgun', box: 12, per: 2 },
  '7.62/54': { name: '7.62×54R', group: 'rifle', box: 20, per: 1.8 }, '12.7/99': { name: '.50 BMG', group: 'rifle', box: 10, per: 8 },
  '40/46': { name: '40 mm', group: 'grenade', box: 3, per: 45 }, '7.65/17': { name: '.32 ACP', group: 'pistol', box: 50, per: 0.6 },
  '12.7/33': { name: '.50 AE', group: 'pistol', box: 20, per: 2.5 }, '9.07/33': { name: '.357 Magnum', group: 'pistol', box: 30, per: 1.4 },
  '12.7/41': { name: '.500 S&W', group: 'pistol', box: 20, per: 3.5 }, '4.6/30': { name: '4.6×30', group: 'pistol', box: 40, per: 1.2 },
  '5.6/39': { name: '5.45×39', group: 'rifle', box: 30, per: 1 }, '7.62/63': { name: '.30-06', group: 'rifle', box: 16, per: 2 },
  '9/39': { name: '9×39', group: 'rifle', box: 20, per: 2.2 }, '11.6/53': { name: '.45-70', group: 'rifle', box: 20, per: 2.5 },
  '8.6/69': { name: '.338 Lapua', group: 'rifle', box: 10, per: 6 }, '7.62/25': { name: '7.62×25', group: 'pistol', box: 50, per: 0.7 },
  '10.4/63': { name: '.410 bore', group: 'shotgun', box: 15, per: 1.5 }, '11.43/33': { name: '.45 Colt', group: 'pistol', box: 30, per: 1.2 },
  bolt: { name: 'crossbow bolts', group: 'bolt', box: 6, per: 12 }, cell: { name: 'rail slugs', group: 'cell', box: 8, per: 15 },
};
G.calOf = (def) => {
  if (def.cls === 'BOW') return 'bolt';
  if (def.cls === 'RAIL') return 'cell';
  const g = G.GUN_SPECS[def.id];
  return g ? g.caliber + '/' + g.caseLength : 'cell';
};
// Ammo types. Their effect on the round: dmgK (wound), armorK (how much more armour stops it), apRound (gets
// through armour), penD (bodies it carries on through), rangeK, spreadK, pelletsK, slug, tracer (colour),
// quiet (with a suppressor, heard no further than a crossbow). k: price per round relative to ball.
G.AMMO = {
  ball: { name: 'FMJ ball', tag: 'FMJ', k: 1, desc: 'Full metal jacket. The standard round.' },
  hp: { name: 'Hollow point', tag: 'HP', k: 1.8, dmgK: 1.3, armorK: 1.35, penD: -1, desc: 'Opens up in flesh: bigger wounds, stops in the first body. Flattens on armour.' },
  ap: { name: 'Armour-piercing', tag: 'AP', k: 2.4, dmgK: 0.9, apRound: true, penD: 1, desc: 'Hardened core: punches through armour and through bodies, smaller wounds.' },
  tracer: { name: 'Tracer', tag: 'TR', k: 1.3, tracer: 0xff4a2a, desc: 'Burns red all the way out: you see exactly where it goes (so do they).' },
  subsonic: { name: 'Subsonic', tag: 'SUB', k: 1.6, dmgK: 0.85, rangeK: 0.7, quiet: true, desc: 'No supersonic crack: through a suppressor it is barely heard. Weaker, and drops off sooner.' },
  buck: { name: '00 buckshot', tag: 'BUCK', k: 1, desc: 'Nine pellets. The standard shotgun load.' },
  slug: { name: 'Slug', tag: 'SLUG', k: 1.7, slug: true, desc: 'One heavy lead slug: accurate, hits like a rifle, goes through.' },
  birdshot: { name: 'Birdshot', tag: 'BIRD', k: 0.7, pelletsK: 2.5, dmgK: 0.3, spreadK: 1.5, desc: 'A cloud of tiny pellets. Painful, rarely lethal past a few metres, useless on armour.' },
  flechette: { name: 'Flechette', tag: 'FLCH', k: 2.6, apRound: true, dmgK: 0.75, spreadK: 0.7, desc: 'Steel darts: tight pattern, gets through soft armour.' },
  he: { name: 'HE grenade', tag: 'HE', k: 1, desc: '40 mm high explosive.' },
  broadhead: { name: 'Broadhead bolt', tag: 'BOLT', k: 1, desc: 'A hunting bolt.' },
  railslug: { name: 'Tungsten slug', tag: 'SLUG', k: 1, desc: 'Magnetically launched.' },
};
G.AMMO_TYPES = { rifle: ['ball', 'hp', 'ap', 'tracer', 'subsonic'], pistol: ['ball', 'hp', 'ap', 'tracer', 'subsonic'], shotgun: ['buck', 'slug', 'birdshot', 'flechette'], grenade: ['he'], bolt: ['broadhead'], cell: ['railslug'] };
// How fast a round leaves the muzzle (m/s), for whether it cracks going past (only above the speed of sound,
// 343 m/s). Reference velocities by caliber at a reference barrel length (inches), scaled gently by the
// build's barrel; how far it carries before drag takes 63% of its speed (m: pellets slow fast).
G.MUZZLE_V = {
  // (the drag lengths from real retained velocities: 5.56 keeps about 73% of its speed at 300 m, 7.62×51 76%,
  // .338 86%, .50 BMG 91%; 9 mm about 87% at 100 m, .45 ACP 94%; heavy subsonic 9×39 barely slows)
  '5.56/45': [940, 20, 950], '7.62/39': [715, 16.3, 1000], '7/43': [920, 16, 1050], '7.62/51': [840, 22, 1100],
  '9/19': [370, 4.5, 700], '5.7/29': [715, 10.4, 550], '11.43/23': [260, 5, 1600], '18.5/70': [400, 18, 70],
  '7.62/54': [830, 28, 1100], '12.7/99': [880, 29, 3000], '40/46': [76, 12, 2000], '7.65/17': [300, 4, 500],
  '12.7/33': [450, 6, 850], '9.07/33': [440, 4, 500], '12.7/41': [550, 8, 600], '4.6/30': [720, 7, 550],
  '5.6/39': [880, 16, 900], '7.62/63': [820, 24, 1100], '9/39': [295, 7.9, 2000], '11.6/53': [600, 22, 700],
  '8.6/69': [915, 27, 2000], '7.62/25': [450, 4.6, 600], '10.4/63': [330, 3, 60], '11.43/33': [290, 5, 900],
  bolt: [120, 20, 300], cell: [2000, 20, 3000],
};
G.SOUND_SPEED = 343;
// a round's speed (m/s) d metres from the muzzle, from this build, with this load
G.roundSpeed = (def, am, d = 0) => {
  const cal = G.calOf(def), ref = G.MUZZLE_V[cal];
  if (!ref) return 0;
  const barrel = def.barrelIn || (G.GUN_SPECS[def.id] || {}).barrel || ref[1];
  let v = ref[0] * Math.pow(Math.max(1, barrel) / ref[1], 0.2);
  if (am === 'slug') v = Math.max(v, 470);
  // subsonic loads, and guns built to be (the integrally suppressed MP5SD and VSS), stay under Mach 1
  if (am === 'subsonic' || def.integral) v = Math.min(v, 310);
  return v * Math.exp(-d / (am === 'slug' ? 350 : ref[2])); // (a slug carries its speed; pellets shed it)
};
// Rounds are projectiles (js/player.js fly): they slow with drag over dragOf metres (to 37% of their speed) and
// fall with gravity, so every gun's sights are zeroed: the round leaves a hair above the line of sight, crosses
// it at zeroOf metres and drops below it past that. Handguns, SMGs and shotguns at 25 m, carbines and machine
// guns at 50, marksman and sniper rifles at 100, a launcher's leaf sight at 40. The sights sit sightH metres
// above the bore, so the round starts that far under your eye and climbs to the line: that's what gives a
// carbine zeroed at 50 m its second zero out near 200 (and puts a round low on something very close).
G.GRAVITY = 9.81;
G.zeroOf = (def) => ({ PST: 25, MP: 25, SMG: 25, SG: 25, BOW: 20, GL: 40, DMR: 100, SNP: 100, RAIL: 0 })[def.cls] ?? 50;
G.sightH = (def) => ({ PST: 0.02, MP: 0.025, SMG: 0.05, SG: 0.035, BOW: 0.05, GL: 0.06, RAIL: 0 })[def.cls] ?? 0.065;
G.dragOf = (def, am) => { const ref = G.MUZZLE_V[G.calOf(def)]; return am === 'slug' ? 350 : ref ? ref[2] : 600; };
G.ballFor = (cal) => G.AMMO_TYPES[(G.CALIBERS[cal] || { group: 'cell' }).group][0];
// how often each type turns up loaded in a found gun (relative): ball and buckshot mostly, AP and flechette rarely
G.AMMO_RARITY = { ball: 10, hp: 3, tracer: 3, subsonic: 2, ap: 1, buck: 10, slug: 4, birdshot: 3, flechette: 1, he: 1, broadhead: 1, railslug: 1 };
G.rollAmmo = (cal, rnd = Math.random) => {
  const types = G.AMMO_TYPES[(G.CALIBERS[cal] || { group: 'cell' }).group];
  let x = rnd() * types.reduce((a, t) => a + (G.AMMO_RARITY[t] || 1), 0);
  for (const t of types) { x -= G.AMMO_RARITY[t] || 1; if (x <= 0) return t; }
  return types[0];
};
// a type for that caliber, or its ball
G.ammoOk = (cal, am) => (G.AMMO_TYPES[(G.CALIBERS[cal] || { group: 'cell' }).group].includes(am) ? am : G.ballFor(cal));
// a gun firing a round of this type: its stats as that round sees them
G.roundDef = (def, am) => {
  const A = G.AMMO[am];
  if (!A || A.k === 1 && !A.tracer && !A.slug) return def;
  const d = Object.create(def);
  if (A.dmgK) d.dmg = def.dmg * A.dmgK;
  if (A.penD) d.pen = Math.max(0, (def.pen || 0) + A.penD);
  if (A.apRound) d.apRound = true;
  if (A.armorK) d.armorK = A.armorK;
  if (A.rangeK) d.range = def.range * A.rangeK;
  if (A.spreadK) { if (def.choke) d.choke = def.choke * A.spreadK; else { d.spread = def.spread * A.spreadK; d.ads = def.ads * A.spreadK; } } // a shot load opens (or tightens) the pattern
  if (A.pelletsK) d.pellets = Math.max(1, Math.round(def.pellets * A.pelletsK));
  if (A.slug) { d.dmg = def.dmg * def.pellets * 0.55; d.pellets = 1; d.choke = 0; d.range = def.range * 2; d.pen = (def.pen || 0) + 1; }
  if (A.tracer) d.tracer = A.tracer;
  if (A.quiet) d.quiet = true;
  return d;
};
// durability a round costs the armour it hits
G.armorWear = (def) => (def.pellets > 1 ? 0.2 : G.threat(def) === 'handgun' ? 0.5 : 1);

// ---------------------------------------------------------------- enemy kit
// What suspects carry moves up through gear tiers at its own pace with the level, the way the squad's own
// kit does: early levels are cheap handguns, sawn-offs and street SMGs with no armour; later ones bring rifles,
// plate carriers and helmets. Each suspect rolls its own tier around the level's (a few a tier lower or higher).
G.gearTier = (level) => (level <= 2 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4);
G.ENEMY_GEAR = {
  // weapon pools by type, tiers 1-4
  weapons: {
    suspect: [['p9', 'rev', 'derringer'], ['p9', 'm1911', 'usp', 'rev', 'g19'], ['usp', 'm1911', 'g18', 'deagle', 'g19'], ['g18', 'deagle', 'usp']],
    grunt: [['mac10', 'uzi', 'skorp', 'aks74u', 'ar9'], ['ak', 'mp5', 'uzi', 'thompson', 'aks74u', 'ak74', 'mpx'], ['ak', 'm4', 'galil', 'mp5', 'vector', 'ak74', 'scarl', 'aug9'], ['hk416', 'scar', 'an94', 'tavor', 'aug', 'scarl', 'm27']],
    rusher: [['sawn', 'dbl'], ['pump', 'dbl', 'sawn'], ['pump', 'saiga', 'ksg', 'vepr', 'benelli'], ['saiga', 'aa12', 'ksg', 'benelli', 'vepr']],
    marksman: [['lever', 'mosin'], ['mosin', 'r700', 'm14'], ['r700', 'svd', 'mk14', 'm14', 'sr25'], ['svd', 'awm', 'mk14', 'sr25']],
    heavy: [['pkm', 'rpk'], ['pkm', 'm249', 'rpk'], ['m249', 'pkm', 'm60', 'rpk'], ['m60', 'm249']],
    warden: [['scar'], ['scar', 'fal'], ['scar', 'fal'], ['scar', 'hk416']],
  },
  // chance of a soft vest / steel plates / ceramic plates, and of a IIIA / rifle-rated helmet, by tier
  vest: [[0.04, 0, 0], [0.3, 0.05, 0], [0.4, 0.22, 0.06], [0.35, 0.3, 0.2]],
  helmet: [[0, 0], [0.1, 0], [0.28, 0.05], [0.35, 0.2]],
  // the Enforcer is always armoured, more heavily as tiers go up; the Kingpin wears the best
  fixed: {
    heavy: { vest: ['steel', 'steel', 'ceramic', 'assault'], helmet: ['ach', 'ach', 'riflehelm', 'riflehelm'] },
    boss: { vest: ['assault', 'assault', 'assault', 'assault'], helmet: ['riflehelm', 'visor', 'visor', 'visor'] },
  },
};
