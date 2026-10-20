'use strict';
// ---------------------------------------------------------------------------
// Weapon parts and the gunsmith.
//
// Every weapon is a platform: its receiver(s) and trigger group, plus slots. Parts attach to a slot by
// interface (mount): a muzzle device needs the thread the barrel provides, foregrips and lasers need the
// rails a handguard provides, optics need the receiver's top rail, and so on. Every slot has the gun's
// factory part plus aftermarket parts from (fictional) manufacturers.
//
// A build is { slot: partId }. G.Gunsmith.compile(id, build) turns it into an effective weapon def
// (stats changed by the parts) that the rest of the game uses exactly like the old weapon defs.
// Builds travel over the network as short codes ("m4/1a.2f.7..."), part indices in base 36.
//
// Part stats are deltas: ergo (points), recoil / acc / hip / reload / rpm / spin / vel (%),
// weight (kg). Absolutes in `set`: cap (rounds), zoom (ADS FOV multiplier), barrelIn (inches, for the
// gunshot synth), device (muzzle device, ditto), sup (suppressed).
// ---------------------------------------------------------------------------
G.Gunsmith = (() => {
  const PARTS = {}, LIST = [], PLATFORMS = {}, BY_MOUNT = new Map();
  // Shared magazines (G.MAG_FAMILY): [capacity, drum?, price, stats, tier] for each, std the standard one
  const MAG_FAMS = {
    stanag: { name: 'STANAG 5.56', brand: 'Graywater Arms', std: 30, model: { t: 'curved', len: 0.19, d: 0.064, c: 0.03, well: 'black' }, desc: 'The NATO pattern: fits the M4, HK416, F2000, Tavor, SCAR-L and M27.',
      caps: [[20, false, 90, { reload: -12, ergo: 3, weight: -0.12 }, 1], [30, false, 60, {}, 1], [40, false, 220, { reload: 8, ergo: -2, weight: 0.15 }, 2], [100, true, 620, { reload: 45, ergo: -9, weight: 0.9 }, 3]] },
    mp5: { name: 'MP5 9mm', brand: 'Kestrel Tactical', std: 30, model: { t: 'curved', len: 0.15, d: 0.04, c: 0.04, w: 0.022 }, desc: 'Fits the MP5 and MP5SD.',
      caps: [[15, false, 70, { reload: -12, ergo: 3, weight: -0.08 }, 1], [30, false, 50, {}, 1], [40, false, 200, { reload: 8, ergo: -2, weight: 0.1 }, 2], [50, true, 480, { reload: 35, ergo: -7, weight: 0.6 }, 3]] },
    akm: { name: 'AK 7.62x39', brand: 'Northmark', std: 30, model: { t: 'curved', len: 0.23, d: 0.072, c: 0.08, w: 0.028, m: 'park' }, desc: 'The AK pattern: fits the KV-47, Galil ACE and RPK.',
      caps: [[20, false, 90, { reload: -12, ergo: 3, weight: -0.12 }, 1], [30, false, 60, {}, 1], [40, false, 240, { reload: 10, ergo: -3, weight: 0.2 }, 2], [75, true, 600, { reload: 45, ergo: -9, weight: 1.0 }, 3]] },
    ak74: { name: 'AK 5.45x39', brand: 'Northmark', std: 30, model: { t: 'curved', len: 0.21, d: 0.068, c: 0.06, w: 0.026, m: 'polymer' }, desc: 'The AK-74 pattern: fits the AK-74M, AKS-74U and AN-94.',
      caps: [[20, false, 90, { reload: -12, ergo: 3, weight: -0.12 }, 1], [30, false, 60, {}, 1], [45, false, 240, { reload: 10, ergo: -3, weight: 0.2 }, 2], [60, false, 520, { reload: 22, ergo: -6, weight: 0.4 }, 3]] },
    glock: { name: 'Glock 9mm', brand: 'Hollowpoint Co.', std: 17, model: { t: 'pistol', len: 0.15 }, desc: 'The Glock pattern: fits the P9, G18, G19, AR-9 and AUG 9mm.',
      caps: [[15, false, 40, { reload: -6, ergo: 2, weight: -0.03 }, 1], [17, false, 40, {}, 1], [33, false, 160, { reload: 10, ergo: -4, weight: 0.12 }, 1], [50, true, 420, { reload: 30, ergo: -10, weight: 0.45 }, 3]] },
    m14: { name: 'M14 7.62', brand: 'Ironvale', std: 20, model: { t: 'straight', len: 0.15, d: 0.07, w: 0.026 }, desc: 'Fits the M14 and the Mk14 EBR.',
      caps: [[10, false, 80, { reload: -12, ergo: 3, weight: -0.15 }, 1], [20, false, 70, {}, 1], [30, false, 280, { reload: 10, ergo: -3, weight: 0.25 }, 2], [50, true, 640, { reload: 40, ergo: -9, weight: 1.0 }, 3]] },
    saiga12: { name: 'Saiga 12-gauge', brand: 'Bastion Gearworks', std: 8, model: { t: 'straight', len: 0.13, d: 0.09, w: 0.034, rake: 0.02 }, desc: 'Fits the Saiga-12 and Vepr-12.',
      caps: [[5, false, 80, { reload: -12, ergo: 3, weight: -0.15 }, 1], [8, false, 70, {}, 1], [12, false, 260, { reload: 10, ergo: -3, weight: 0.3 }, 2], [20, true, 620, { reload: 40, ergo: -9, weight: 1.1 }, 3]] },
  };
  // Receivers: guns that are the same core (a lower, a frame, an action) with a different kit in it. The core
  // takes any of its group's kits (a 'receiver' part), and the kit decides which gun it is: fit the AR-9 kit to
  // an M4 and you have an AR-9; the parts that fit the new gun stay on it. Each gun's own kit is its default.
  //   kits: { gun: [brand, name, price, tier, description] }
  const RCV = {
    ar15: { name: 'AR-15 lower receiver', kits: {
      m4: ['kestrel', 'M4 5.56 upper receiver group', 520, 1, 'Upper, bolt, gas system and barrel for 5.56: an M4 again.'],
      ar9: ['redline', 'AR-9 9mm conversion kit', 640, 2, 'A blowback 9mm upper and a magazine-well block for Glock magazines. Turns an M4 into a 9mm carbine.'] } },
    ak: { name: 'AK receiver and trunnion', kits: {
      ak: ['north', 'AKM 7.62×39 barrel and bolt group', 560, 1, 'Front trunnion, bolt and barrel for 7.62×39: a KV-47.'],
      ak74: ['north', 'AK-74 5.45×39 conversion group', 620, 2, 'Trunnion, bolt and barrel for 5.45×39: an AK-74M, on AK-74 magazines.'],
      rpk: ['sable', 'RPK heavy-barrel kit', 900, 2, 'Reinforced trunnion, a long heavy barrel and a bipod: a light machine gun on AK furniture.'] } },
    aug: { name: 'AUG stock group', kits: {
      aug: ['kestrel', 'AUG 5.56 barrel and bolt group', 600, 1, 'The rifle barrel and bolt: a 5.56 AUG.'],
      aug9: ['wraith', 'AUG 9mm conversion kit', 680, 2, 'A 9mm barrel, a blowback bolt and a magazine adapter for Glock magazines.'] } },
    mp5: { name: 'MP5 lower and trigger group', kits: {
      mp5: ['kestrel', 'MP5 standard upper', 480, 1, 'The plain MP5 upper and barrel.'],
      mp5sd: ['wraith', 'MP5SD integrally suppressed upper', 900, 2, 'A ported barrel inside its own suppressor: subsonic and very quiet.'] } },
    glock: { name: 'Glock-pattern frame', kits: {
      p9: ['hollow', 'P9 semi-auto slide and trigger', 180, 1, 'The plain semi-automatic.'],
      g18: ['hollow', 'G18 select-fire slide and trigger', 420, 2, 'A compensated slide and a selector: full auto.'] } },
    m14: { name: 'M14 action', kits: {
      m14: ['sable', 'M14 walnut stock and barrel group', 520, 1, 'Back into the walnut: an M14.'],
      mk14: ['paragon', 'Mk14 EBR chassis kit', 950, 2, 'The action in an aluminium chassis with a buffer-tube stock and a railed forend: a Mk14 EBR.'] } },
  };
  const RCV_OF = {};
  for (const [grp, r] of Object.entries(RCV)) for (const id of Object.keys(r.kits)) RCV_OF[id] = grp;
  // machine pistols (and the Glocks) take a stock; tube shotguns a side saddle or a speed loader. Neither
  // comes fitted.
  const PSTOCK = new Set(['p9', 'g18', 'g19', 'auto9']), SGLOAD = new Set(['pump', 'ksg', 'slug', 'benelli']);
  const add = (p) => {
    p.idx = LIST.length; p.st = p.st || {}; p.set = p.set || {}; p.tier = p.tier || 1;
    LIST.push(p); PARTS[p.id] = p;
    if (!BY_MOUNT.has(p.mount)) BY_MOUNT.set(p.mount, []);
    BY_MOUNT.get(p.mount).push(p);
    return p;
  };

  const SLOT_LABEL = {
    barrel: 'Barrel', muzzle: 'Muzzle', handguard: 'Handguard', stock: 'Stock', grip: 'Pistol grip', mag: 'Magazine',
    optic: 'Sight', magnifier: 'Magnifier', fg: 'Foregrip', tac: 'Tactical', charging: 'Charging handle', slide: 'Slide', motor: 'Drive motor',
    pump: 'Forend', tube: 'Magazine tube', loader: 'Loading', cap: 'Capacitor', limbs: 'Limbs', receiver: 'Receiver group',
    buttstock: 'Stock (on the adapter)', riserdot: 'Sight (on the riser)',
  };
  // Adapters: a part in a slot that gives another slot of the same kind on top of it (a buffer tube adapter in
  // the stock slot takes any AR stock; a riser on the rail takes a pistol red dot). slot -> the kind it takes.
  const ALIAS = { buttstock: 'stock', riserdot: 'optic' };
  // whether part p goes in slot s (its interface, and its kind or the kind the slot takes)
  const fitsSlot = (s, p) => !!(s && p) && (s.mount === p.mount || (p.alsoMounts || []).includes(s.mount)) && (s.slot === p.slot || ALIAS[s.slot] === p.slot);
  // display order
  const ORDER = ['receiver', 'slide', 'barrel', 'limbs', 'muzzle', 'handguard', 'pump', 'fg', 'tac', 'optic', 'riserdot', 'magnifier', 'charging', 'grip', 'stock', 'buttstock', 'mag', 'tube', 'loader', 'cap', 'motor'];

  // ------------------------------------------------------------------ brands (all fictional)
  const BR = {
    kestrel: 'Kestrel Arms', vantage: 'Vantage Tactical', ironvale: 'Ironvale', halcyon: 'Halcyon Defense', bright: 'Brightline Optics',
    north: 'Northmark', sable: 'Sable Ridge', corvid: 'Corvid Industries', talon: 'Talon & Ward', meridian: 'Meridian Precision',
    strix: 'Strix Optics', redline: 'Redline Firearms', bastion: 'Bastion Gearworks', kodiak: 'Kodiak Machining', lynx: 'Lynx Ballistics',
    oberon: 'Oberon Dynamics', gray: 'Graywater Supply', paragon: 'Paragon Tactical', valkyr: 'Valkyr Arms', cinder: 'Cinder Forge',
    atlas: 'Atlas & Pike', wraith: 'Wraithworks', osprey: 'Osprey Labs', hollow: 'Hollowpoint Co.',
  };
  const BRAND_KEYS = Object.keys(BR);

  // ------------------------------------------------------------------ shared families (aftermarket)
  // Muzzle threads. Each family: aftermarket devices. Factory devices are generated per platform.
  const THREAD = {
    r556: '5.56 ½-28', r762: '7.62 ⅝-24', rak: 'AK 14×1 LH', r9: '9mm ½-28', r45: '.45 .578-28', r57: 'PDW M10×1', r50: '.50 ⅞-14', rp: 'Pistol M13.5', sg: '12ga choke',
  };
  const DEV = { // model muzzle type -> synth muzzle device
    flash: 'flash', prong: 'flash', tri: 'flash', slant: 'brake', brake: 'brake', bigbrake: 'brake', comp: 'comp', cutts: 'comp', pcomp: 'comp',
    can: 'suppressor', shortcan: 'suppressor', longcan: 'suppressor', boxcan: 'suppressor', crown: 'none', choke: 'none', breacher: 'brake',
  };
  const rifleMuzzles = (fam, cal) => [
    { k: 'prong', b: 'talon', n: `Talon TPF-3 ${cal} flash hider`, t: 'prong', price: 160, st: { recoil: -2, ergo: 0, weight: 0.07 }, d: 'Three-prong flash hider. Kills flash, keeps the barrel light.' },
    { k: 'comp', b: 'kestrel', n: `Kestrel KS-7 ${cal} compensator`, t: 'comp', price: 240, st: { recoil: -9, ergo: -1, weight: 0.09 }, d: 'Vents gas upward. Keeps the muzzle down on follow-ups.' },
    { k: 'brake', b: 'kodiak', n: `Kodiak Bruin ${cal} muzzle brake`, t: 'brake', price: 300, st: { recoil: -14, ergo: -2, weight: 0.12 }, d: 'Big side ports. Shoots flat, very loud for everyone nearby.' },
    { k: 'can', b: 'wraith', n: `Wraithworks Hush ${cal} suppressor`, t: 'can', tier: 2, price: 700, st: { recoil: -10, ergo: -9, weight: 0.55, vel: 2 }, sup: true, d: 'Full-length suppressor. Shots are only heard close by and there is no flash.' },
    { k: 'short', b: 'osprey', n: `Osprey Mite ${cal} compact suppressor`, t: 'shortcan', tier: 2, price: 560, st: { recoil: -6, ergo: -5, weight: 0.32 }, sup: true, d: 'Short suppressor. A little louder than a full can, much handier.' },
    { k: 'cap', b: 'gray', n: `Graywater ${cal} thread protector`, t: 'crown', price: 40, st: { recoil: 3, ergo: 2, weight: -0.04 }, d: 'Nothing on the muzzle but a cap. Lightest option, most flash and kick.' },
    { k: 'a2', b: 'ironvale', n: `Ironvale A2 ${cal} birdcage`, t: 'flash', price: 90, st: { recoil: -1, weight: 0.05 }, d: 'The standard birdcage flash hider.' },
  ].map((o) => Object.assign(o, { fam }));
  const MUZZLES = {
    r556: rifleMuzzles('r556', '5.56'), r762: rifleMuzzles('r762', '7.62'), rak: rifleMuzzles('rak', 'AK'), r50: rifleMuzzles('r50', '.50').filter((o) => o.k !== 'short'),
    r9: [
      { k: 'comp', b: 'kestrel', n: 'Kestrel KS-9 compensator', t: 'comp', price: 180, st: { recoil: -7, ergo: -1, weight: 0.06 }, d: 'Pistol-calibre compensator.' },
      { k: 'can', b: 'wraith', n: 'Wraithworks Hush-9 suppressor', t: 'can', tier: 2, price: 520, st: { recoil: -8, ergo: -7, weight: 0.4 }, sup: true, d: 'Pistol-calibre can. Subsonic and very quiet.' },
      { k: 'short', b: 'osprey', n: 'Osprey Mite-9 compact suppressor', t: 'shortcan', tier: 2, price: 420, st: { recoil: -5, ergo: -3, weight: 0.24 }, sup: true, d: 'Short 9mm suppressor.' },
      { k: 'prong', b: 'talon', n: 'Talon TPF-9 flash hider', t: 'prong', price: 120, st: { recoil: -1, weight: 0.04 }, d: 'Small three-prong hider.' },
    ],
    rp: [
      { k: 'comp', b: 'redline', n: 'Redline RC-1 pistol compensator', t: 'pcomp', price: 220, st: { recoil: -12, ergo: -2, weight: 0.05 }, d: 'Slide-length compensator. Flat-shooting.' },
      { k: 'can', b: 'wraith', n: 'Wraithworks Whisper pistol suppressor', t: 'shortcan', tier: 2, price: 480, st: { recoil: -6, ergo: -8, weight: 0.2 }, sup: true, d: 'Quiet enough that the room next door won\'t hear it.' },
      { k: 'long', b: 'osprey', n: 'Osprey Longbill pistol suppressor', t: 'longcan', tier: 2, price: 600, st: { recoil: -9, ergo: -12, weight: 0.3 }, sup: true, d: 'Long pistol can. Quietest option, front-heavy.' },
    ],
    sg: [
      { k: 'choke', b: 'atlas', n: 'Atlas & Pike full choke', t: 'choke', price: 140, st: { acc: -22, hip: -12, ergo: 0, weight: 0.03 }, d: 'Tightens the pattern. Pellets stay together further out.' },
      { k: 'breach', b: 'bastion', n: 'Bastion Doorbreaker muzzle', t: 'breacher', price: 180, st: { acc: 14, hip: 6, recoil: -6, weight: 0.12 }, d: 'Standoff teeth for breaching. Wider pattern.' },
      { k: 'can', b: 'cinder', n: 'Cinder Forge Muffle-12 suppressor', t: 'boxcan', tier: 3, price: 900, st: { recoil: -12, ergo: -12, weight: 0.8 }, sup: true, d: 'Shotgun suppressor. Takes the edge off a 12-gauge report.' },
    ],
  };
  MUZZLES.rak.push({ k: 'slant', b: 'north', n: 'Northmark AK slant brake', t: 'slant', price: 110, st: { recoil: -6, weight: 0.05 }, d: 'Angled port pushes the muzzle down and right.' },
    { k: '74', b: 'north', n: 'Northmark AK-74 muzzle brake', t: 'brake', price: 150, st: { recoil: -11, ergo: -1, weight: 0.06 }, d: 'The AK-74\'s two-chamber brake. Flat, and very loud to the side.' },
    { k: 'boost', b: 'north', n: 'Northmark 74U booster', t: 'cutts', price: 120, st: { recoil: -4, weight: 0.05 }, d: 'Expansion chamber off a short-barrelled AK: tames the flash, keeps it cycling.' });
  MUZZLES.r50.push({ k: 'big', b: 'kodiak', n: 'Kodiak Titan .50 heavy brake', t: 'bigbrake', price: 420, st: { recoil: -20, ergo: -4, weight: 0.4 }, d: 'Massive baffle brake for full-power .50.' });
  MUZZLES.r9.push(
    { k: 'tri', b: 'ironvale', n: 'Ironvale TL-9 three-lug adapter', t: 'tri', price: 70, st: { weight: 0.03 }, d: 'Three-lug mount, the classic SMG muzzle.' },
    { k: 'a2', b: 'ironvale', n: 'Ironvale A2-9 flash hider', t: 'flash', price: 80, st: { recoil: -1, weight: 0.04 }, d: 'Birdcage-style hider for pistol calibres.' },
    { k: 'cap', b: 'gray', n: 'Graywater 9mm thread protector', t: 'crown', price: 30, st: { recoil: 2, ergo: 2, weight: -0.03 }, d: 'Bare muzzle.' });
  MUZZLES.sg.push(
    { k: 'cyl', b: 'atlas', n: 'Atlas & Pike cylinder bore', t: 'crown', price: 40, st: {}, d: 'No choke: an open pattern.' },
    { k: 'flash', b: 'bastion', n: 'Bastion 12ga flash hider', t: 'flash', price: 120, st: { recoil: -2, weight: 0.06 }, d: 'Cuts muzzle flash on a 12-gauge.' });
  MUZZLES.r45 = MUZZLES.r9.map((o) => Object.assign({}, o, { n: o.n.replace('-9', '-45').replace('KS-9', 'KS-45').replace('TPF-9', 'TPF-45') }));
  MUZZLES.r57 = MUZZLES.r9.map((o) => Object.assign({}, o, { n: o.n.replace('-9', '-57').replace('KS-9', 'KS-57').replace('TPF-9', 'TPF-57').replace('9mm', '5.7') }));
  MUZZLES.r45.forEach((o) => { o.n = o.n.replace('9mm', '.45'); });
  MUZZLES.r45.push({ k: 'cutts', b: 'atlas', n: 'Atlas & Pike Cutts compensator', t: 'cutts', price: 150, st: { recoil: -7, weight: 0.08 }, d: 'Slotted cup compensator, period-correct.' });
  for (const [fam, list] of Object.entries(MUZZLES)) for (const o of list) {
    add({ id: `mz.${fam}.${o.k}`, slot: 'muzzle', mount: 'mz:' + fam, brand: BR[o.b], name: o.n, desc: o.d, price: o.price, tier: o.tier || 1, st: o.st,
      set: { device: DEV[o.t], sup: !!o.sup }, model: { muzzle: o.t } });
  }

  // Handguards. Railed ones (rail, M-LOK) give foregrip and tactical slots.
  const HG_ST = { rail: { ergo: -3, weight: 0.32 }, mlok: { ergo: 3, weight: 0.16 }, carbine: { ergo: 4, weight: -0.08 }, wood: { ergo: 1, weight: 0.2 }, slim: { ergo: 3, weight: 0.05 }, box: { ergo: 0, weight: 0.2 }, stockfore: { ergo: 0, weight: 0.4 }, shroud: { ergo: 1, weight: 0.15 }, fins: { ergo: -1, weight: 0.25 } };
  const HG = {
    ar: [['vantage', 'Vantage VX-10 M-LOK 10"', { t: 'mlok', len: 0.26 }], ['vantage', 'Vantage VX-15 M-LOK 15"', { t: 'mlok', len: 0.36 }, 2], ['ironvale', 'Ironvale IR-12 quad rail', { t: 'rail', len: 0.3 }],
      ['gray', 'Graywater carbine handguard', { t: 'carbine', len: 0.17 }], ['vantage', 'Vantage VX-13 M-LOK (FDE)', { t: 'mlok', len: 0.32, m: 'tan' }, 2]],
    ak: [['north', 'Northmark polymer handguard', { t: 'wood', len: 0.2, m: 'polymer' }], ['ironvale', 'Ironvale AK quad rail', { t: 'rail', len: 0.2 }], ['vantage', 'Vantage AKX M-LOK', { t: 'mlok', len: 0.24 }, 2], ['sable', 'Sable Ridge hardwood handguard', { t: 'wood', len: 0.21, m: 'woodRed' }], ['north', 'Northmark plum polymer handguard', { t: 'wood', len: 0.2, m: 'woodRed' }]],
    box: [['ironvale', 'Ironvale BX rail system', { t: 'rail', len: 0.22 }], ['vantage', 'Vantage BX M-LOK', { t: 'mlok', len: 0.24 }, 2], ['gray', 'Graywater slim forend', { t: 'slim', len: 0.16 }]],
    smg: [['ironvale', 'Ironvale SMG tri-rail', { t: 'rail', len: 0.13 }], ['vantage', 'Vantage SMG M-LOK', { t: 'mlok', len: 0.15 }], ['north', 'Northmark slim forend (FDE)', { t: 'slim', len: 0.13, m: 'tan' }]],
    classic: [['sable', 'Sable Ridge walnut fore-end', { t: 'stockfore', len: 0.4, m: 'woodDark' }], ['north', 'Northmark synthetic fore-end', { t: 'stockfore', len: 0.4, m: 'polymer' }], ['ironvale', 'Ironvale chassis rail fore-end', { t: 'rail', len: 0.24 }, 2]],
    shroud: [['north', 'Northmark smooth barrel jacket', { t: 'slim', len: 0.18, m: 'blued' }], ['kodiak', 'Kodiak vented shroud', { t: 'shroud', len: 0.22, m: 'blued' }], ['ironvale', 'Ironvale finned cooler', { t: 'fins', len: 0.14 }]],
  };
  const railed = (t) => t === 'rail' || t === 'mlok';
  for (const [fam, list] of Object.entries(HG)) list.forEach(([b, n, spec, tier], i) => {
    add({ id: `hg.${fam}.${i}`, slot: 'handguard', mount: 'hg:' + fam, brand: BR[b], name: n, price: railed(spec.t) ? 320 : 180, tier: tier || 1, st: HG_ST[spec.t],
      desc: railed(spec.t) ? 'Railed: takes a foregrip and a laser.' : 'No rails.', model: { hg: spec }, provides: railed(spec.t) ? { fg: 'fg', tac: 'tac' } : null });
  });

  // Stocks
  const STK_ST = {
    m4: { ergo: 2, recoil: 0, weight: 0.25 }, crane: { ergo: -1, recoil: -5, weight: 0.35 }, pdw: { ergo: 6, recoil: 7, weight: 0.15 }, fixed: { ergo: -3, recoil: -8, weight: 0.5 },
    skeleton: { ergo: 3, recoil: -2, weight: 0.3 }, thumbhole: { ergo: -2, recoil: -9, weight: 0.6 }, wood: { ergo: -2, recoil: -6, weight: 0.7 }, akwood: { ergo: -2, recoil: -6, weight: 0.7 }, straight: { ergo: 0, recoil: -4, weight: 0.55 },
    sniper: { ergo: -4, recoil: -12, weight: 0.8 }, barrett: { ergo: -6, recoil: -15, weight: 1.0 }, wire: { ergo: 5, recoil: 4, weight: 0.2 }, folded: { ergo: 9, recoil: 22, weight: 0.1 },
  };
  const STK = {
    tube: [['kestrel', 'Kestrel CS-4 carbine stock', 'm4'], ['vantage', 'Vantage Crane stock (FDE)', 'crane', 'tan'], ['lynx', 'Lynx PDW-1 minimalist stock', 'pdw'], ['ironvale', 'Ironvale A-Fixed stock', 'fixed'], ['paragon', 'Paragon Raptor skeleton stock', 'skeleton']],
    ak: [['sable', 'Sable Ridge laminate stock', 'akwood', 'woodRed'], ['north', 'Northmark side-folder', 'skeleton', 'polymer'], ['gray', 'Graywater stock delete (folded)', 'folded'], ['kestrel', 'Kestrel AK tube adapter + CS-4', 'm4']],
    classic: [['sable', 'Sable Ridge walnut stock', 'wood', 'woodDark'], ['north', 'Northmark synthetic stock', 'sniper', 'polymer'], ['paragon', 'Paragon thumbhole stock', 'thumbhole', 'polymer'], ['atlas', 'Atlas & Pike straight-grip stock', 'straight', 'wood']],
    precision: [['meridian', 'Meridian PRS-2 precision stock', 'sniper', 'polymer'], ['paragon', 'Paragon Strike chassis stock', 'skeleton', 'black'], ['sable', 'Sable Ridge thumbhole stock', 'thumbhole', 'woodRed'], ['kodiak', 'Kodiak heavy recoil stock', 'barrett', 'park', 2]],
    smg: [['kestrel', 'Kestrel collapsing wire stock', 'wire'], ['ironvale', 'Ironvale fixed SMG stock', 'fixed'], ['gray', 'Graywater folded (stock delete)', 'folded'], ['vantage', 'Vantage Crane SMG stock', 'crane'], ['lynx', 'Lynx PDW-S sliding stock', 'pdw'], ['paragon', 'Paragon skeleton SMG stock', 'skeleton']],
    heavy: [['ironvale', 'Ironvale fixed buttstock', 'fixed'], ['paragon', 'Paragon skeleton buttstock', 'skeleton'], ['sable', 'Sable Ridge thumbhole buttstock', 'thumbhole', 'woodRed'], ['vantage', 'Vantage Crane adapter', 'crane']],
  };
  for (const [fam, list] of Object.entries(STK)) list.forEach(([b, n, type, sm, tier], i) => {
    add({ id: `stk.${fam}.${i}`, slot: 'stock', mount: 'stk:' + fam, brand: BR[b], name: n, price: type === 'folded' ? 60 : 200 + Math.round((STK_ST[type].weight || 0) * 150), tier: tier || 1,
      stype: type, st: STK_ST[type], desc: type === 'folded' ? 'No stock at all: very handy, hard to control.' : '', model: { stock: type, sm: sm || null } });
  });
  // Buffer tube adapters: on an AK, an SMG or a machine gun, a bare AR-15 buffer tube to take any AR stock
  const tubeAdapter = (p, name, brand) => Object.assign(p, { name, brand: BR[brand], price: 140, tier: 1, stype: 'tubeonly', st: { weight: 0.12, ergo: 1 }, model: { stock: 'tubeonly', sm: null },
    provides: { buttstock: 'stk:tube' }, desc: 'A bare AR-15 buffer tube: takes any AR stock. On its own it is as good as no stock.' });
  tubeAdapter(PARTS['stk.ak.3'], 'Kestrel AK buffer tube adapter', 'kestrel');
  tubeAdapter(PARTS['stk.heavy.3'], 'Vantage MG buffer tube adapter', 'vantage');


  // Pistol grips
  const GRIP = {
    ar: [['paragon', 'Paragon PG-23 ergonomic grip', 'ar', 'polymer', { ergo: 4, recoil: -1 }], ['talon', 'Talon vertical grip (FDE)', 'vertical', 'tan', { ergo: 2, recoil: -3 }], ['north', 'Northmark rubber overmold grip', 'ar', 'rubber', { ergo: 6 }], ['lynx', 'Lynx OD skeleton grip', 'ar', 'od', { ergo: 3, weight: -0.03 }]],
    ak: [['sable', 'Sable Ridge walnut grip', 'wood', 'woodDark', { ergo: 1 }], ['paragon', 'Paragon AK ergonomic grip', 'ar', 'polymer', { ergo: 5, recoil: -1 }], ['north', 'Northmark rubber AK grip', 'ar', 'rubber', { ergo: 6 }]],
    smg: [['paragon', 'Paragon SMG grip sleeve', 'vertical', 'polymer', { ergo: 3 }], ['north', 'Northmark rubber sleeve', 'vertical', 'rubber', { ergo: 5 }], ['lynx', 'Lynx FDE sleeve', 'vertical', 'tan', { ergo: 2 }]],
    pistol: [['north', 'Northmark rubber grip wrap', null, 'rubber', { ergo: 5, recoil: -2 }], ['sable', 'Sable Ridge walnut panels', null, 'woodDark', { ergo: 1 }], ['hollow', 'Hollowpoint stippled frame', null, 'park', { ergo: 4, hip: -5 }], ['lynx', 'Lynx FDE grip sleeve', null, 'tan', { ergo: 3 }]],
    rev: [['sable', 'Sable Ridge rosewood grips', null, 'woodRed', { ergo: 2 }], ['north', 'Northmark rubber combat grips', null, 'rubber', { ergo: 5, recoil: -4 }], ['atlas', 'Atlas & Pike walnut target grips', null, 'woodDark', { ergo: 3, hip: -4 }]],
  };
  for (const [fam, list] of Object.entries(GRIP)) list.forEach(([b, n, t, gm, st], i) => {
    add({ id: `gr.${fam}.${i}`, slot: 'grip', mount: 'gr:' + fam, brand: BR[b], name: n, price: 90, st, desc: '', model: t ? { gripT: t, gm } : { gm } });
  });

  // Optics on a picatinny rail (long guns). zoom = FOV multiplier when aiming. Model fields beyond the sight
  // type: dotR / dotLen (a red dot's tube), ret (its reticle: dot, dotG green, cdot circle-dot), riser (an open
  // reflex lifted to rifle height), px (magnification), levels (the powers a variable scope steps through: scroll
  // while aiming). (Appended only: a part's id is its place in the list.)
  const OPTICS = [
    ['bright', 'Brightline BUIS folding irons', { optic: 'irons' }, 0.86, 90, { ergo: 3 }, 1],
    ['bright', 'Brightline Pip red dot', { optic: 'reddot' }, 0.8, 260, { ergo: -1 }, 1],
    ['strix', 'Strix Owlet micro dot', { optic: 'reddot', dotR: 0.014, dotLen: 0.04 }, 0.78, 380, { ergo: 0, acc: -3 }, 1],
    ['strix', 'Strix HX-2 holographic', { optic: 'holo' }, 0.8, 520, { ergo: -2, acc: -4, hip: -3 }, 2],
    ['halcyon', 'Halcyon Lantern holographic', { optic: 'holo' }, 0.79, 440, { ergo: -2, acc: -3 }, 1],
    ['meridian', 'Meridian P2 prism 2×', { optic: 'prism', px: 2 }, 0.6, 600, { ergo: -4, acc: -7 }, 2],
    ['halcyon', 'Halcyon TA-4 combat scope 4×', { optic: 'acog' }, 0.45, 900, { ergo: -6, acc: -10 }, 2],
    ['meridian', 'Meridian LV-6 1-6× variable', { optic: 'lpvo', px: 4, levels: [1, 2, 4, 6] }, 0.52, 1100, { ergo: -7, acc: -9 }, 3],
    ['strix', 'Strix Hunter 3-9× scope', { optic: 'scope', scopeLen: 0.3, scopeObj: 0.025, px: 4, levels: [3, 4, 6, 9] }, 0.38, 800, { ergo: -9, acc: -14 }, 2],
    ['meridian', 'Meridian Longline 5-25× scope', { optic: 'scope', scopeLen: 0.38, scopeObj: 0.031, px: 8, levels: [5, 8, 12, 18, 25] }, 0.26, 1400, { ergo: -13, acc: -18 }, 3],
    ['osprey', 'Osprey Viper green dot', { optic: 'reddot', dotR: 0.017, dotLen: 0.048, ret: 'dotG' }, 0.8, 300, { ergo: 0, acc: -2 }, 1],
    ['kodiak', 'Kodiak Bulwark 34mm red dot', { optic: 'reddot', dotR: 0.024, dotLen: 0.066 }, 0.79, 560, { ergo: -3, acc: -5 }, 2],
    ['halcyon', 'Halcyon Ember open reflex on a riser', { optic: 'minidot', riser: 0.022 }, 0.8, 420, { ergo: 1, acc: -2 }, 1],
    ['vantage', 'Vantage Halo circle-dot sight', { optic: 'reddot', dotR: 0.02, dotLen: 0.05, ret: 'cdot' }, 0.8, 480, { ergo: -1, acc: -3, hip: -3 }, 2],
    ['meridian', 'Meridian P1 1× prism', { optic: 'prism', px: 1 }, 0.78, 420, { ergo: -2, acc: -5 }, 1],
    ['strix', 'Strix Lynx 1.5× prism', { optic: 'prism', px: 1.5 }, 0.7, 480, { ergo: -3, acc: -6 }, 1],
    ['halcyon', 'Halcyon TA-3 3× prism', { optic: 'prism', px: 3 }, 0.5, 700, { ergo: -5, acc: -9 }, 2],
  ];
  // magnified sights are looked through (scope overlay with the sight's own reticle)
  // Magnified sights show a picture-in-picture view at their magnification (variable scopes sit at a working
  // power). zoom stays the aim-sensitivity multiplier.
  const RETICLE = { scope: 'cross', acog: 'chevron', prism: 'chevron', lpvo: 'lpvo' };
  const scopeMag = (model, zoom) => model.px || ({ prism: 2, acog: 4, lpvo: 4 })[model.optic] || Math.min(8, Math.max(3, Math.round(1.6 / zoom)));
  const sightSet = (model, zoom) => (RETICLE[model.optic] ? { zoom, scoped: true, reticle: RETICLE[model.optic], magnif: scopeMag(model, zoom), levels: model.levels || null } : { zoom, scoped: false });
  const REFLEX = ['reddot', 'holo', 'minidot']; // (a magnifier goes behind these)
  OPTICS.forEach(([b, n, model, zoom, price, st, tier], i) => add({ id: `op.pic.${i}`, slot: 'optic', mount: 'op:pic', brand: BR[b], name: n, price, tier, st, set: sightSet(model, zoom),
    desc: model.levels ? `${model.levels[0]}–${model.levels[model.levels.length - 1]}× variable: scroll while aiming to change power` : RETICLE[model.optic] ? `${scopeMag(model, zoom)}× magnified` : REFLEX.includes(model.optic) ? 'Unmagnified. Takes a magnifier behind it.' : 'Unmagnified',
    model, provides: REFLEX.includes(model.optic) ? { magnifier: 'magn' } : null }));
  [['bright', 'Brightline tritium night sights', { optic: 'night' }, 0.8, 160, { hip: -4 }], ['strix', 'Strix Kite pistol red dot', { optic: 'minidot' }, 0.78, 420, { acc: -10, ergo: -2 }], ['halcyon', 'Halcyon Ember pistol dot', { optic: 'minidot' }, 0.76, 520, { acc: -13, ergo: -3 }, 2],
    ['osprey', 'Osprey Mite green pistol dot', { optic: 'minidot', ret: 'dotG' }, 0.77, 380, { acc: -10, ergo: -1 }],
    ['kodiak', 'Kodiak Keep enclosed pistol dot', { optic: 'minidot', closed: true }, 0.76, 560, { acc: -12, ergo: -4, weight: 0.03 }, 2],
    ['vantage', 'Vantage Halo circle-dot pistol sight', { optic: 'minidot', ret: 'cdot' }, 0.77, 480, { acc: -11, hip: -4, ergo: -2 }, 2]]
    .forEach(([b, n, model, zoom, price, st, tier], i) => add({ id: `op.pso.${i}`, slot: 'optic', mount: 'op:pso', brand: BR[b], name: n, price, tier, st, set: { zoom, scoped: false }, desc: '', model }));
  // A pistol optic riser: on a rifle's rail, lifting a pistol red dot (an RMR footprint) to the height of a
  // rifle's sight line. (In place of the old reflex-on-a-riser: same id.) Every pistol dot fits it.
  Object.assign(PARTS['op.pic.12'], { name: 'Halcyon pistol optic riser', price: 120, tier: 1, st: { weight: 0.05 }, set: {}, model: { optic: 'riser', riser: 0.022 }, provides: { riserdot: 'op:rmr' },
    desc: 'Lifts a pistol red dot to rifle height on a rail. Mount one on it.' });
  for (const p of BY_MOUNT.get('op:pso')) if (p.model.optic === 'minidot') { p.alsoMounts = ['op:rmr']; if (!BY_MOUNT.has('op:rmr')) BY_MOUNT.set('op:rmr', []); BY_MOUNT.get('op:rmr').push(p); }
  // Magnifiers: behind a red dot or holographic sight, flipped in or out of the way (scroll while aiming)
  [['bright', 'Brightline 2× micro magnifier', 2, 0.07, 300, { ergo: -2, weight: 0.2 }, 1], ['strix', 'Strix FTS 3× flip magnifier', 3, 0.085, 420, { ergo: -4, weight: 0.3 }, 2],
    ['meridian', 'Meridian 5× flip magnifier', 5, 0.1, 640, { ergo: -6, weight: 0.38 }, 3]]
    .forEach(([b, n, px, len, price, st, tier], i) => add({ id: `mgn.${i}`, slot: 'magnifier', mount: 'magn', brand: BR[b], name: n, price, tier, st, set: { magnifier: px },
      desc: `Flips in behind the dot for ${px}×, out of the way for 1× (scroll while aiming).`, model: { magnifier: { px, len } } }));

  // Foregrips and lasers (on railed handguards)
  [['talon', 'Talon VG-1 vertical grip', 'vertical', { recoil: -6, ergo: -2, weight: 0.12 }, 120], ['paragon', 'Paragon AFG angled grip', 'angled', { recoil: -3, ergo: 3, weight: 0.08 }, 150],
    ['lynx', 'Lynx Stub stubby grip', 'stubby', { recoil: -4, ergo: 1, weight: 0.07 }, 110], ['bastion', 'Bastion hand stop', 'stop', { recoil: -2, ergo: 4, weight: 0.03 }, 70],
    ['kodiak', 'Kodiak Ridge bipod', 'bipod', { recoil: -9, ergo: -6, weight: 0.42 }, 260]]
    .forEach(([b, n, t, st, price], i) => add({ id: `fg.${i}`, slot: 'fg', mount: 'fg', brand: BR[b], name: n, price, st, desc: '', model: { fg: t } }));
  // Lasers and weapon lights. set.laser: its colour (r / g); set.light: how bright. Both are switched on and off
  // with the mouse's side buttons (back: light, forward: laser); a laser only steadies hip fire while it's on.
  const tacDesc = (s) => (s.laser && s.light ? 'Laser and light: forward side button for the laser (steadier hip fire), back for the light.' : s.laser ? 'Laser: steadier hip fire while it\'s on (forward side mouse button).' : 'Weapon light: lights the way, and dazzles anyone you shine it at (back side mouse button).');
  [['oberon', 'Oberon LS-1 red laser', 'laser', { hip: -12, weight: 0.1 }, 260, 1, { laser: 'r' }], ['oberon', 'Oberon LS-2G green laser', 'laserG', { hip: -15, weight: 0.1 }, 380, 2, { laser: 'g' }],
    ['halcyon', 'Halcyon PQ-15 aiming module', 'peq', { hip: -19, ergo: -2, weight: 0.24 }, 560, 3, { laser: 'g', light: 1 }],
    ['oberon', 'Oberon WL-3 weapon light', 'light', { weight: 0.12 }, 220, 1, { light: 1 }], ['halcyon', 'Halcyon Torch-X high-output light', 'lightX', { ergo: -1, weight: 0.18 }, 360, 2, { light: 1.6 }]]
    .forEach(([b, n, t, st, price, tier, set], i) => add({ id: `tac.${i}`, slot: 'tac', mount: 'tac', brand: BR[b], name: n, price, tier, st, set, desc: tacDesc(set), model: { tac: t } }));
  [['oberon', 'Oberon Pocket laser', 'plaser', { hip: -12, weight: 0.05 }, 220, 1, { laser: 'r' }], ['halcyon', 'Halcyon Compact laser module', 'plaserG', { hip: -16, weight: 0.07 }, 340, 2, { laser: 'g' }],
    ['oberon', 'Oberon PL-1 pistol light', 'plight', { weight: 0.06 }, 180, 1, { light: 0.8 }], ['halcyon', 'Halcyon PX light and laser', 'pcombo', { hip: -12, weight: 0.09 }, 420, 2, { light: 0.8, laser: 'r' }]]
    .forEach(([b, n, t, st, price, tier, set], i) => add({ id: `ptac.${i}`, slot: 'tac', mount: 'ptac', brand: BR[b], name: n, price, tier, st, set, desc: tacDesc(set), model: { tac: t } }));
  [['kestrel', 'Kestrel extended latch', 'ext', { ergo: 3 }, 70], ['paragon', 'Paragon ambidextrous handle', 'ambi', { ergo: 5 }, 110], ['bastion', 'Bastion gas-busting ambi handle', 'ambi', { ergo: 4, reload: -4 }, 150]]
    .forEach(([b, n, t, st, price], i) => add({ id: `ch.ar.${i}`, slot: 'charging', mount: 'ch:ar', brand: BR[b], name: n, price, st, desc: '', model: { ch: t } }));
  [['north', 'Northmark polymer forend', { m: 'polymer' }, { ergo: 3, weight: -0.1 }], ['ironvale', 'Ironvale railed forend', { m: 'black', rail: true }, { ergo: -1, weight: 0.12 }, true], ['sable', 'Sable Ridge walnut forend', { m: 'woodDark' }, { ergo: 1 }]]
    .forEach(([b, n, pm, st, rails], i) => add({ id: `pump.${i}`, slot: 'pump', mount: 'pump', brand: BR[b], name: n, price: 140, st, desc: rails ? 'Railed: takes a laser.' : '', model: { pumpPatch: pm }, provides: rails ? { tac: 'tac' } : null }));
  [['kestrel', 'Kestrel speed loader', { reload: -30 }, 120], ['redline', 'Redline moon clips', { reload: -42 }, 220]]
    .forEach(([b, n, st, price], i) => add({ id: `ld.${i}`, slot: 'loader', mount: 'loader', brand: BR[b], name: n, price, st, desc: 'Reloads the whole cylinder at once.' }));
  // Tube shotguns: shells on the receiver, or a loader that pushes several into the tube at a go (perLoad: shells
  // per push, each push slower than a single shell)
  [['bastion', 'Bastion six-shell side saddle', 'saddle', { reload: -18, ergo: -2, weight: 0.18 }, null, 140, 1, 'Shells on the receiver, right where your hand goes: each one loads a little faster.'],
    ['redline', 'Redline twin-shell carrier', 'twin', { reload: 30, ergo: -1, weight: 0.08 }, 2, 220, 1, 'Two shells into the tube with every push.'],
    ['kestrel', 'Kestrel Quad speed loader', 'quad', { reload: 85, ergo: -3, weight: 0.12 }, 4, 380, 2, 'Four shells into the tube at once: about twice as fast to fill.']]
    .forEach(([b, n, t, st, per, price, tier, desc], i) => add({ id: `sgl.${i}`, slot: 'loader', mount: 'sgload', brand: BR[b], name: n, price, tier, st, set: per ? { perLoad: per } : {}, desc, model: { saddle: t } }));
  // Stocks for pistols: none comes with one; any of these makes a pistol far steadier (and less handy)
  [['kestrel', 'Kestrel PS-1 folding pistol stock', 'wire', null, { ergo: -4, recoil: -22, hip: -6, weight: 0.3 }, 260, 1],
    ['lynx', 'Lynx pistol brace', 'pdw', null, { ergo: -1, recoil: -14, hip: -4, weight: 0.2 }, 200, 1],
    ['vantage', 'Vantage carbine stock kit', 'crane', 'tan', { ergo: -7, recoil: -30, hip: -8, weight: 0.45 }, 380, 2]]
    .forEach(([b, n, t, sm, st, price, tier], i) => add({ id: `stk.pistol.${i}`, slot: 'stock', mount: 'stk:pistol', brand: BR[b], name: n, price, tier, stype: t, st, desc: 'Clips to the back of the frame: a shoulder stock on a pistol.', model: { stock: t, sm } }));

  // descriptive names for factory parts, by model type
  const NAMES = {
    muzzle: { flash: 'flash hider', prong: 'three-prong flash hider', slant: 'slant brake', brake: 'muzzle brake', bigbrake: 'heavy muzzle brake', comp: 'compensator', cutts: 'Cutts compensator', tri: 'three-lug adapter', crown: 'crowned muzzle' },
    handguard: { rail: 'quad rail handguard', mlok: 'M-LOK handguard', wood: 'handguard', slim: 'slim forend', box: 'forend', stockfore: 'fore-end', shroud: 'barrel shroud', fins: 'finned barrel', carbine: 'carbine handguard' },
    optic: { reddot: 'red dot sight', holo: 'holographic sight', acog: '4× combat scope', prism: '2× prism sight', scope: 'rifle scope', notch: 'iron sights', irons: 'iron sights', bead: 'bead sight', none: 'carry-handle sight' },
    stock: { m4: 'collapsible stock', crane: 'Crane stock', fixed: 'fixed stock', skeleton: 'skeleton stock', thumbhole: 'thumbhole stock', wood: 'wooden stock', straight: 'straight-grip stock', sniper: 'precision stock', barrett: 'recoil-buffer stock', wire: 'wire stock', folded: 'folding stock (folded)', pdw: 'PDW stock' },
  };
  const MATN = { polymer: 'polymer ', wood: 'wooden ', woodRed: 'laminate ', woodDark: 'walnut ', tan: 'FDE ', od: 'OD ', blued: '' };

  // ------------------------------------------------------------------ interface standards (the compatibility system)
  // A slot accepts any part made for its interface. Some interfaces are shared by many weapons (rails,
  // buffer tubes, threads); barrels, magazines and slides are made for one platform.
  const IFACE = {
    'op:pic': 'Picatinny top rail', 'op:pso': 'Pistol optic cut', 'op:rmr': 'Pistol optic riser', magn: 'Rail behind a red dot', fg: 'Underside rail (M-LOK / Picatinny)', tac: 'Side rail', ptac: 'Pistol accessory rail',
    'stk:tube': 'AR-15 buffer tube', 'stk:ak': 'AK stock trunnion', 'stk:classic': 'Rifle stock inletting', 'stk:precision': 'Precision stock mount', 'stk:smg': 'SMG stock mount', 'stk:heavy': 'Machine-gun buttstock mount',
    'gr:ar': 'AR-15 grip mount', 'gr:ak': 'AK grip mount', 'gr:smg': 'SMG grip frame', 'gr:pistol': 'Pistol grip frame', 'gr:rev': 'Revolver grip frame',
    'hg:ar': 'AR-15 barrel nut', 'hg:ak': 'AK handguard retainer', 'hg:box': 'Rifle forend mount', 'hg:smg': 'SMG forend mount', 'hg:classic': 'Rifle fore-end inletting', 'hg:shroud': 'Barrel jacket mount',
    'ch:ar': 'AR-15 upper receiver', pump: 'Pump action bar', loader: 'Revolver cylinder', 'stk:pistol': 'Pistol stock lug', sgload: 'Shotgun receiver',
  };
  function ifaceName(mount) {
    if (IFACE[mount]) return IFACE[mount];
    const [kind, rest] = mount.split(':');
    if (kind === 'mz') return `${THREAD[rest] || rest} muzzle thread`;
    if (kind === 'rcv') return RCV[rest] ? RCV[rest].name : mount;
    const w = G.WEAPONS[rest];
    const what = { br: 'barrel extension', pbr: 'barrel', mag: 'magazine well', sl: 'slide rails', tube: 'magazine tube', motor: 'drive housing', cap: 'capacitor bay', limbs: 'limb pockets' }[kind] || kind;
    return w ? `${w.name} ${what}` : mount;
  }
  // canonical model key, for spotting identical parts
  const canon = (m) => JSON.stringify(m || {}, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, kk) => { if (v[kk] != null) o[kk] = v[kk]; return o; }, {}) : v));
  // Parts missing from a slot cost something (a rifle with no stock is hard to control).
  const EMPTY = { stock: { recoil: 25, ergo: 8 }, buttstock: { recoil: 25, ergo: 8 } }; // (an adapter with nothing on it: no stock)
  const GRIP_NAME = { ar: 'A2 pistol grip', wood: 'wooden grip', vertical: 'grip sleeve' };

  // ------------------------------------------------------------------ platforms
  const CLS_ERGO = { AR: 52, BR: 42, SMG: 64, SG: 46, LMG: 26, DMR: 40, SNP: 34, GL: 38, RAIL: 30, PST: 74, MP: 68, BOW: 44 };
  const CLS_KG = { AR: 3.3, BR: 4.1, SMG: 2.6, SG: 3.4, LMG: 8.5, DMR: 4.6, SNP: 5.5, GL: 5.2, RAIL: 7.5, PST: 0.9, MP: 1.6, BOW: 3.4 };
  const pick = (i) => BR[BRAND_KEYS[i % BRAND_KEYS.length]];
  let pi = 0;

  // P(id, arch, base model spec, slot setup). Slot setup keys:
  //   barrel: model barrel spec, thread: muzzle thread family, muzzle: factory muzzle type
  //   handguard / stock / grip / optic: [family, factory model value(s)]
  //   mag: factory magazine spec ('internal' for a fixed magazine), fg: factory foregrip, charging: 'ar'
  //   pistol-only: slide (spec patch), ptac. Specials handled by arch.
  function P(id, arch, spec, s) {
    const def = G.WEAPONS[id], gs = G.GUN_SPECS[id] || {};
    const plat = { id, arch, spec, slots: [], defaults: {} };
    PLATFORMS[id] = plat;
    const brandA = pick(pi), brandB = pick(pi + 7), brandC = pick(pi + 13);
    pi++;
    const slot = (name, mount, req, bare) => plat.slots.push({ slot: name, mount, req: !!req, bare: !!bare }); // bare: nothing fitted from the factory
    const factory = (slotName, mount, o) => {
      const p = add(Object.assign({ id: `${id}.${slotName}`, slot: slotName, mount, brand: 'Factory', name: `${def.name} ${SLOT_LABEL[slotName].toLowerCase()}`, desc: 'Factory part.', price: 0, factory: true, plat: id }, o));
      plat.defaults[slotName] = p.id;
      return p;
    };
    const own = (o) => add(Object.assign({ plat: id }, o));
    // A standard attachment: reuse the identical product if one exists on this interface, otherwise make an
    // OEM product that every weapon with the same interface can use. It's this weapon's default.
    const oemBrand = pick(pi + 3);
    const std = (slotName, mount, model, o) => {
      const key = canon(model);
      let p = (BY_MOUNT.get(mount) || []).find((q) => !q.factory && canon(q.model) === key);
      if (!p) p = add(Object.assign({ id: `oem.${mount.replace(':', '.')}.${(BY_MOUNT.get(mount) || []).length}`, slot: slotName, mount, brand: oemBrand, desc: 'Standard-issue part.', price: 120, tier: 1, oem: true, model }, o, { name: `${oemBrand.split(' ')[0]} ${o.name}` }));
      plat.defaults[slotName] = p.id;
      return p;
    };

    // barrel: factory + short + long (archetype decides what "length" means)
    if (s.barrel) {
      const mount = 'br:' + id;
      slot('barrel', mount, true);
      const B = s.barrel, inch = gs.barrel || 16;
      const patch = (k) => (arch === 'rifle' ? { barrel: Object.assign({}, B, { len: B.len * k }) } : { blen: (B.len || 0.1) * k });
      const thread = s.thread ? { muzzle: 'mz:' + s.thread } : null;
      if (s.integral) { // integrally suppressed: the can is the barrel
        factory('barrel', mount, { name: `${def.name} integrally suppressed barrel`, model: { integral: s.integral }, set: { barrelIn: inch, sup: true, device: 'suppressor' } });
        own({ id: `${id}.br.long`, slot: 'barrel', mount, brand: brandB, name: `${brandB.split(' ')[0]} extended integral barrel`, price: 520, tier: 2, model: { integral: { len: s.integral.len * 1.2, r: s.integral.r } },
          st: { vel: 4, acc: -6, ergo: -4, weight: 0.25 }, set: { barrelIn: inch * 1.2, sup: true, device: 'suppressor' }, desc: 'Longer integral suppressor: quieter and more accurate.' });
        own({ id: `${id}.br.open`, slot: 'barrel', mount, brand: brandC, name: `${brandC.split(' ')[0]} unsuppressed conversion barrel`, price: 380, model: { integral: null, barrel: B }, provides: thread,
          st: { vel: 8, ergo: 6, weight: -0.3 }, set: { barrelIn: inch * 1.1, sup: false }, desc: 'Converts it to a normal threaded barrel. Loud, but takes any muzzle device.' });
      } else {
        factory('barrel', mount, { name: `${def.name} ${inch.toFixed(1)}" barrel`, model: patch(1), set: { barrelIn: inch }, provides: thread });
        const shortK = arch === 'revolver' ? 0.55 : 0.74, longK = arch === 'revolver' ? 1.6 : 1.25;
        own({ id: `${id}.br.short`, slot: 'barrel', mount, brand: brandA, name: `${brandA.split(' ')[0]} ${(inch * shortK).toFixed(1)}" short barrel`, price: 280, model: patch(shortK), provides: thread,
          st: { vel: -14, acc: 12, ergo: 6, weight: -0.35, recoil: 5 }, set: { barrelIn: inch * shortK }, desc: 'Shorter and handier. Less velocity, less reach.' });
        own({ id: `${id}.br.long`, slot: 'barrel', mount, brand: brandB, name: `${brandB.split(' ')[0]} ${(inch * longK).toFixed(1)}" match barrel`, price: 460, tier: 2, model: patch(longK), provides: thread,
          st: { vel: 10, acc: -12, ergo: -6, weight: 0.4, recoil: -3 }, set: { barrelIn: inch * longK }, desc: 'Longer, heavier match barrel. More velocity and accuracy.' });
      }
      // the muzzle slot comes from the barrel's thread (an integral suppressor has none)
      if (s.thread) {
        const dev = !gs.muzzleDevice || gs.muzzleDevice === 'suppressor' ? DEV[s.muzzle] || 'none' : gs.muzzleDevice;
        std('muzzle', 'mz:' + s.thread, { muzzle: s.muzzle || 'crown' }, { name: NAMES.muzzle[s.muzzle || 'crown'] || 'muzzle device', set: { device: dev } });
        if (s.integral) delete plat.defaults.muzzle;
      }
    }
    if (s.handguard) {
      const [fam, hg] = s.handguard, rails = railed(hg.t);
      slot('handguard', 'hg:' + fam, true);
      std('handguard', 'hg:' + fam, { hg }, { name: `${hg.t === 'stockfore' ? '' : (hg.len * 39.37).toFixed(1) + '" '}${hg.t === 'wood' || hg.t === 'stockfore' ? MATN[hg.m || 'wood'] || '' : hg.m === 'tan' ? 'FDE ' : ''}${NAMES.handguard[hg.t] || 'handguard'}`,
        st: HG_ST[hg.t], price: rails ? 300 : 180, desc: rails ? 'Railed: takes a foregrip and a laser.' : 'No rails.', provides: rails ? { fg: 'fg', tac: 'tac' } : null });
    }
    if (s.fg) std('fg', 'fg', { fg: s.fg }, { name: `${s.fg} grip` });
    if (s.optic) {
      let [fam, model] = s.optic;
      // everything leaves the factory with iron sights except sniper rifles, which come scoped
      if (fam === 'pic' && !['irons', 'notch', 'bead', 'none'].includes(model.optic) && def.cls !== 'SNP' && def.cls !== 'RAIL') model = { optic: 'irons' };
      slot('optic', 'op:' + fam);
      // a weapon's own iron sights stay with it; anything that mounts on the rail is a product
      if (['notch', 'bead', 'none'].includes(model.optic)) factory('optic', 'op:' + fam, { name: `${def.name} ${NAMES.optic[model.optic]}`, desc: 'The weapon\'s own sights. Fit an optic to the rail instead.', model, set: sightSet(model, def.zoom) });
      else std('optic', 'op:' + fam, model, { name: `${model.optic === 'scope' && def.zoom ? scopeMag(model, def.zoom) + '× ' : ''}${NAMES.optic[model.optic] || 'sight'}`, set: sightSet(model, def.zoom), price: { reddot: 240, holo: 420, acog: 850, prism: 550, scope: 750 }[model.optic] || 200 });
    }
    if (s.charging) { slot('charging', 'ch:' + s.charging); std('charging', 'ch:' + s.charging, { ch: 'std' }, { name: 'standard charging handle', price: 50 }); }
    if (s.grip) {
      const [fam, t, gm] = s.grip;
      slot('grip', 'gr:' + fam, true);
      std('grip', 'gr:' + fam, t ? { gripT: t, gm: gm || null } : { gm: gm || null }, { name: `${gm ? MATN[gm] || '' : ''}${GRIP_NAME[t] || 'grip panels'}${gm ? '' : ' (matches the furniture)'}`, price: 70 });
    }
    if (s.stock) {
      const [fam, type, sm] = s.stock;
      slot('stock', 'stk:' + fam);
      std('stock', 'stk:' + fam, { stock: type, sm: sm || null }, { name: `${sm ? MATN[sm] || '' : ''}${NAMES.stock[type] || 'stock'}`, stype: type, st: STK_ST[type], price: 200 + Math.round((STK_ST[type].weight || 0) * 150) });
    }
    const fam = G.MAG_FAMILY && G.MAG_FAMILY[id], F = fam && MAG_FAMS[fam];
    if (s.mag && F && s.mag !== 'internal') {
      // a magazine family: one set of magazines (made with the first gun of the family), on a shared mount, so
      // a magazine from any of them is the same part in any of them
      const mount = 'mag:' + fam;
      slot('mag', mount, true);
      if (!(BY_MOUNT.get(mount) || []).length) {
        const M = F.model || s.mag;
        for (const [cap, drum, price, st, tier] of F.caps) {
          add({ id: `${fam}.mag.${cap}`, slot: 'mag', mount, fam, brand: cap === F.std ? 'Factory' : F.brand, factory: cap === F.std, tier, price,
            name: `${F.name} ${cap}-round ${drum ? 'drum' : 'magazine'}`, st, set: { cap },
            model: { mag: drum ? { t: 'drum', r: 0.068, dw: 0.05, m: M.m || null } : Object.assign({}, M, { len: (M.len || 0.15) * Math.pow(cap / F.std, 0.7) }) },
            desc: `${F.desc} ${drum ? 'Huge capacity; heavy and slow to reload.' : cap < F.std ? 'Short: quicker to swap, fewer rounds.' : cap > F.std ? 'Long: more rounds, slower to swap.' : ''}` });
        }
      }
      const parts = BY_MOUNT.get(mount);
      plat.defaults.mag = (parts.find((p) => p.set.cap === def.mag) || parts.find((p) => p.set.cap === F.std)).id;
      for (const p of parts) p.variant = true;
      plat.magVariants = true;
    } else if (s.mag) {
      const mount = 'mag:' + id, M = s.mag, cap = def.mag;
      slot('mag', mount, true);
      if (M === 'internal') {
        factory('mag', mount, { name: `${def.name} internal magazine`, model: {}, set: { cap } });
        own({ id: `${id}.mag.box`, slot: 'mag', mount, brand: brandA, name: `${brandA.split(' ')[0]} ${cap * 2}-round detachable box`, price: 340, tier: 2, model: { mag: { t: 'straight', len: 0.08, d: 0.07, w: 0.026 } },
          st: { ergo: -2, weight: 0.2 }, set: { cap: cap * 2, shell: false, reload: def.shell ? 2.4 : def.reload * 0.9 }, desc: 'Detachable box magazine conversion: swap the whole magazine.' });
      } else if (M.t === 'ammobox') {
        factory('mag', mount, { name: `${def.name} ${cap}-round box`, model: { mag: M }, set: { cap } });
        own({ id: `${id}.mag.big`, slot: 'mag', mount, brand: brandA, name: `${brandA.split(' ')[0]} ${cap * 2}-round assault box`, price: 520, tier: 2, model: { mag: Object.assign({}, M, { scale: 1.4 }) },
          st: { reload: 22, ergo: -6, weight: 1.6 }, set: { cap: cap * 2 }, desc: 'Double-capacity belt box. Heavy.' });
        own({ id: `${id}.mag.small`, slot: 'mag', mount, brand: brandB, name: `${brandB.split(' ')[0]} ${Math.round(cap / 2)}-round bag`, price: 180, model: { mag: Object.assign({}, M, { scale: 0.75 }) },
          st: { reload: -20, ergo: 6, weight: -0.9 }, set: { cap: Math.round(cap / 2) }, desc: 'Half-size soft pouch. Light and quick to change.' });
      } else {
        const isDrum = M.t === 'drum';
        factory('mag', mount, { name: `${def.name} ${cap}-round ${isDrum ? 'drum' : 'magazine'}`, model: { mag: M }, set: { cap } });
        const scaled = (k) => Object.assign({}, M, { len: (M.len || 0.15) * k });
        if (isDrum) {
          const stick = Math.max(5, Math.round(cap * 0.45));
          own({ id: `${id}.mag.stick`, slot: 'mag', mount, brand: brandA, name: `${brandA.split(' ')[0]} ${stick}-round stick magazine`, price: 160, model: { mag: { t: 'straight', len: 0.16, d: 0.035, w: 0.024, rake: 0.01 } },
            st: { reload: -30, ergo: 7, weight: -0.6 }, set: { cap: stick }, desc: 'Box magazine instead of the drum. Faster reloads, far fewer rounds.' });
          own({ id: `${id}.mag.big`, slot: 'mag', mount, brand: brandB, name: `${brandB.split(' ')[0]} ${Math.round(cap * 1.4)}-round high-cap drum`, price: 560, tier: 3, model: { mag: Object.assign({}, M, { r: (M.r || 0.075) * 1.15, dw: (M.dw || 0.05) * 1.15 }) },
            st: { reload: 18, ergo: -5, weight: 0.5 }, set: { cap: Math.round(cap * 1.4) }, desc: 'Bigger drum.' });
        } else {
          const small = Math.max(2, Math.round(cap * 0.66)), big = Math.round(cap * 1.5);
          own({ id: `${id}.mag.small`, slot: 'mag', mount, brand: brandA, name: `${brandA.split(' ')[0]} ${small}-round compact magazine`, price: 90, model: { mag: scaled(0.72) },
            st: { reload: -12, ergo: 3, weight: -0.12 }, set: { cap: small }, desc: 'Short magazine. Quicker to swap, fewer rounds.' });
          own({ id: `${id}.mag.ext`, slot: 'mag', mount, brand: brandB, name: `${brandB.split(' ')[0]} ${big}-round extended magazine`, price: 260, tier: 2, model: { mag: scaled(1.38) },
            st: { reload: 12, ergo: -3, weight: 0.25 }, set: { cap: big }, desc: 'Long magazine. More rounds, slower to swap.' });
          if (!s.noDrum && cap >= 15) own({ id: `${id}.mag.drum`, slot: 'mag', mount, brand: brandC, name: `${brandC.split(' ')[0]} ${Math.round(cap * 2.5)}-round drum`, price: 620, tier: 3,
            model: { mag: { t: 'drum', r: 0.068, dw: 0.05, m: M.m || null } }, st: { reload: 45, ergo: -9, weight: 0.9 }, set: { cap: Math.round(cap * 2.5) }, desc: 'Huge capacity. Heavy and slow to reload.' });
        }
      }
      // Detachable magazines (and belt boxes) aren't attachments: they're magazines, items you carry. Whichever
      // one is in the gun is its 'mag' part (capacity, reload, handling), so the slot stays in the build but
      // not in the gunsmith. (A conversion from an internal magazine is a real modification, and stays one.)
      if (M !== 'internal') { for (const p of BY_MOUNT.get(mount) || []) p.variant = true; plat.magVariants = true; }
    }
    if (s.tube) { // tube magazine (shotguns, lever action)
      const mount = 'tube:' + id, cap = def.mag;
      slot('tube', mount, true);
      factory('tube', mount, { name: `${def.name} ${cap}-round tube`, model: { tube: s.tube }, set: { cap } });
      own({ id: `${id}.tube.ext`, slot: 'tube', mount, brand: brandA, name: `${brandA.split(' ')[0]} +2 tube extension`, price: 160, model: { tube: s.tube + 0.08 }, st: { ergo: -3, weight: 0.15 }, set: { cap: cap + 2 }, desc: 'Two more shells.' });
      own({ id: `${id}.tube.short`, slot: 'tube', mount, brand: brandB, name: `${brandB.split(' ')[0]} short tube`, price: 80, model: { tube: Math.max(0.12, s.tube - 0.12) }, st: { ergo: 4, weight: -0.15 }, set: { cap: Math.max(2, cap - 2) }, desc: 'Lighter, two fewer shells.' });
    }
    if (s.pump) { slot('pump', 'pump'); factory('pump', 'pump', { model: { pumpPatch: {} } }); }
    if (s.loader) { slot('loader', 'loader'); factory('loader', 'loader', { name: `${def.name} loose rounds`, desc: 'Load the cylinder by hand.' }); }
    if (s.slide) {
      const mount = 'sl:' + id, S0 = s.slide;
      slot('slide', mount, true);
      factory('slide', mount, { model: { slide: S0 } });
      own({ id: `${id}.sl.port`, slot: 'slide', mount, brand: brandA, name: `${brandA.split(' ')[0]} ported slide`, price: 300, model: { slide: Object.assign({}, S0, { vent: true }) }, st: { recoil: -6, ergo: 2, weight: -0.05 }, desc: 'Lightening cuts and ports. Snappier, softer.' });
      own({ id: `${id}.sl.comp`, slot: 'slide', mount, brand: brandB, name: `${brandB.split(' ')[0]} compensated slide`, price: 420, tier: 2, model: { slide: Object.assign({}, S0, { comp: true }) }, st: { recoil: -14, ergo: -3, weight: 0.08 }, desc: 'Built-in compensator. Flat-shooting, a touch nose-heavy.' });
      own({ id: `${id}.sl.long`, slot: 'slide', mount, brand: brandC, name: `${brandC.split(' ')[0]} long slide`, price: 380, tier: 2, model: { slide: Object.assign({}, S0, { len: (S0.len || 0.19) * 1.12 }) }, st: { vel: 5, acc: -10, ergo: -3, weight: 0.1 }, desc: 'Longer sight radius and barrel.' });
    }
    if (s.pbarrel) { // pistols: plain, threaded (takes a muzzle device), match
      const mount = 'pbr:' + id;
      slot('barrel', mount, true);
      factory('barrel', mount, { model: {}, set: { barrelIn: gs.barrel || 4.5 } });
      own({ id: `${id}.br.thr`, slot: 'barrel', mount, brand: brandA, name: `${brandA.split(' ')[0]} threaded barrel`, price: 220, model: { thread: true }, provides: { muzzle: 'mz:rp' }, st: { weight: 0.02 }, set: { barrelIn: (gs.barrel || 4.5) + 0.5 }, desc: 'Threaded: takes a compensator or suppressor.' });
      own({ id: `${id}.br.match`, slot: 'barrel', mount, brand: brandB, name: `${brandB.split(' ')[0]} match barrel`, price: 300, tier: 2, model: { match: true }, st: { acc: -15, vel: 4, weight: 0.03 }, set: { barrelIn: (gs.barrel || 4.5) + 0.3 }, desc: 'Tighter tolerances.' });
    }
    if (s.ptac) { slot('tac', 'ptac'); }
    if (PSTOCK.has(id)) slot('stock', 'stk:pistol', false, true);
    if (SGLOAD.has(id)) slot('loader', 'sgload', false, true);
    // the receiver group: this gun's own kit in the shared core (see RCV)
    const rg = RCV_OF[id];
    if (rg) {
      const mount = 'rcv:' + rg, [b, n, price, tier, desc] = RCV[rg].kits[id];
      slot('receiver', mount, true);
      plat.defaults.receiver = (PARTS[`rcv.${id}`] || add({ id: `rcv.${id}`, slot: 'receiver', mount, brand: BR[b], name: n, price, tier, desc, becomes: id, model: {} })).id;
    }
    if (s.motor) {
      slot('motor', 'motor:' + id, true);
      factory('motor', 'motor:' + id, { model: { motor: 'std' } });
      own({ id: `${id}.motor.torque`, slot: 'motor', mount: 'motor:' + id, brand: brandA, name: `${brandA.split(' ')[0]} high-torque motor`, price: 700, tier: 3, model: { motor: 'torque' }, st: { spin: -45, weight: 1.2, ergo: -4 }, desc: 'Spins up nearly twice as fast.' });
      own({ id: `${id}.motor.volt`, slot: 'motor', mount: 'motor:' + id, brand: brandB, name: `${brandB.split(' ')[0]} overvolted drive`, price: 800, tier: 3, model: { motor: 'volt' }, st: { rpm: 18, recoil: 14, spin: 15 }, desc: 'Fires faster. Kicks harder, slower to start.' });
    }
    if (s.cap) {
      const mount = 'cap:' + id, cap = def.mag;
      slot('cap', mount, true);
      factory('cap', mount, { name: `${def.name} capacitor bank`, model: { cap: 'std' }, set: { cap } });
      own({ id: `${id}.cap.big`, slot: 'cap', mount, brand: brandA, name: `${brandA.split(' ')[0]} deep-cycle bank`, price: 900, tier: 3, model: { cap: 'big' }, st: { reload: 25, weight: 1.0, ergo: -5 }, set: { cap: cap + 2 }, desc: 'Two more shots per charge.' });
      own({ id: `${id}.cap.rapid`, slot: 'cap', mount, brand: brandB, name: `${brandB.split(' ')[0]} rapid-charge cells`, price: 700, tier: 3, model: { cap: 'rapid' }, st: { reload: -35, weight: -0.5 }, set: { cap: Math.max(2, cap - 1) }, desc: 'Recharges much faster, one shot fewer.' });
    }
    if (s.limbs) {
      const mount = 'limbs:' + id;
      slot('limbs', mount, true);
      factory('limbs', mount, { model: { limb: 'std' } });
      own({ id: `${id}.limbs.heavy`, slot: 'limbs', mount, brand: brandA, name: `${brandA.split(' ')[0]} 200 lb heavy limbs`, price: 600, tier: 2, model: { limb: 'heavy' }, st: { vel: 22, reload: 30, weight: 0.5, ergo: -5 }, desc: 'Harder-hitting bolts. Slower to cock.' });
      own({ id: `${id}.limbs.compact`, slot: 'limbs', mount, brand: brandB, name: `${brandB.split(' ')[0]} compact limbs`, price: 400, model: { limb: 'compact' }, st: { vel: -10, reload: -20, ergo: 8, weight: -0.4 }, desc: 'Narrow and quick.' });
    }
    // every platform with an optic slot and a ptac declared gets the frame rail
    plat.slots.sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot));
    plat.ergo = CLS_ERGO[def.cls] || 50; plat.kg = CLS_KG[def.cls] || 3;
  }

  // Rifles (archetype: rifle). Receivers keep what isn't a part (bullpup shell, carry handles, bolts, levers, bipods on fixed forends).
  P('m4', 'rifle', { L: 0.21 }, { barrel: { len: 0.33 }, thread: 'r556', muzzle: 'flash', handguard: ['ar', { t: 'rail', len: 0.24 }], stock: ['tube', 'm4'], grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.19, d: 0.064, c: 0.03, well: 'black' }, optic: ['pic', { optic: 'reddot' }], charging: 'ar' });
  P('ak', 'rifle', { rcv: 'ak', L: 0.28, rm: 'blued', fm: 'wood' }, { barrel: { len: 0.32 }, thread: 'rak', muzzle: 'slant', handguard: ['ak', { t: 'wood', len: 0.2 }], stock: ['ak', 'akwood'], grip: ['ak', 'wood'], mag: { t: 'curved', len: 0.23, d: 0.072, c: 0.08, w: 0.028, m: 'park' }, optic: ['pic', { optic: 'notch' }] });
  P('f2', 'rifle', { rcv: 'bullpup', L: 0.45, fm: 'polymer', railTop: false, carry: 0.28 }, { barrel: { len: 0.25 }, thread: 'r556', muzzle: 'flash', grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.13, d: 0.06 }, optic: ['pic', { optic: 'irons' }] });
  P('g36', 'rifle', { rcv: 'box', L: 0.3, H: 0.07, W: 0.042, rm: 'green', fm: 'green', optF: 0.17 }, { barrel: { len: 0.32 }, thread: 'r556', muzzle: 'flash', handguard: ['box', { t: 'box', len: 0.2 }], stock: ['heavy', 'skeleton'], grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.17, d: 0.062, c: 0.025, m: 'clear' }, optic: ['pic', { optic: 'acog' }] });
  P('br3', 'rifle', { L: 0.23, rm: 'tan', fm: 'tan' }, { barrel: { len: 0.37 }, thread: 'r762', muzzle: 'comp', handguard: ['ar', { t: 'mlok', len: 0.3, m: 'tan' }], stock: ['tube', 'crane'], grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.19, d: 0.064, c: 0.03, well: 'tan' }, optic: ['pic', { optic: 'holo' }], charging: 'ar' });
  P('scar', 'rifle', { L: 0.28, rm: 'tan', fm: 'tan' }, { barrel: { len: 0.33 }, thread: 'r762', muzzle: 'flash', handguard: ['ar', { t: 'rail', len: 0.24, m: 'tan' }], stock: ['heavy', 'fixed'], grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.15, d: 0.07, w: 0.026, well: 'tan' }, optic: ['pic', { optic: 'holo' }] });
  P('tavor', 'rifle', { rcv: 'bullpup', L: 0.42, fm: 'od' }, { barrel: { len: 0.24 }, thread: 'r556', muzzle: 'flash', grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.16, d: 0.06, c: 0.02 }, optic: ['pic', { optic: 'reddot' }] });
  P('hk416', 'rifle', { L: 0.22 }, { barrel: { len: 0.35 }, thread: 'r556', muzzle: 'flash', handguard: ['ar', { t: 'rail', len: 0.3 }], fg: 'vertical', stock: ['tube', 'crane'], grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.19, d: 0.064, c: 0.03, well: 'black', m: 'tan' }, optic: ['pic', { optic: 'holo' }], charging: 'ar' });
  P('aug', 'rifle', { rcv: 'bullpup', L: 0.42, fm: 'od', railTop: false, optF: 0.3, vfg: 0.04, vfgM: 'od' }, { barrel: { len: 0.3, m: 'black' }, thread: 'r556', muzzle: 'flash', grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.15, d: 0.06, m: 'clear' }, optic: ['pic', { optic: 'acog' }] });
  P('galil', 'rifle', { rcv: 'ak', L: 0.27, rm: 'black', fm: 'polymer', optF: 0.2 }, { barrel: { len: 0.31 }, thread: 'rak', muzzle: 'brake', handguard: ['ak', { t: 'rail', len: 0.2 }], stock: ['ak', 'skeleton'], grip: ['ak', 'wood'], mag: { t: 'curved', len: 0.24, d: 0.072, c: 0.08, w: 0.028 }, optic: ['pic', { optic: 'reddot' }] });
  P('an94', 'rifle', { rcv: 'ak', L: 0.28, rm: 'black', fm: 'polymer' }, { barrel: { len: 0.32 }, thread: 'rak', muzzle: 'brake', handguard: ['ak', { t: 'wood', len: 0.22, m: 'polymer' }], stock: ['ak', 'skeleton'], grip: ['ak', 'wood'], mag: { t: 'curved', len: 0.21, d: 0.068, c: 0.06, w: 0.026, m: 'polymer' }, optic: ['pic', { optic: 'notch' }] });
  P('fal', 'rifle', { rcv: 'box', L: 0.3, H: 0.07, W: 0.04, rm: 'park', fm: 'polymer', optF: 0.24, carry: 0.15, carrySide: true }, { barrel: { len: 0.44 }, thread: 'r762', muzzle: 'flash', handguard: ['box', { t: 'wood', len: 0.22, m: 'polymer' }], stock: ['heavy', 'fixed'], grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.19, d: 0.07, w: 0.026 }, optic: ['pic', { optic: 'irons' }] });
  P('mk14', 'rifle', { L: 0.25, optF: 0.16 }, { barrel: { len: 0.35 }, thread: 'r762', muzzle: 'flash', handguard: ['ar', { t: 'rail', len: 0.3 }], fg: 'bipod', stock: ['tube', 'crane'], grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.15, d: 0.07, w: 0.026 }, optic: ['pic', { optic: 'scope', scopeLen: 0.3 }], charging: 'ar' });
  P('garand', 'rifle', { rcv: 'round', L: 0.23, rm: 'park', fm: 'wood', gripT: 'none', optF: 0.12 }, { barrel: { len: 0.56, m: 'park' }, thread: 'r762', muzzle: 'crown', handguard: ['classic', { t: 'stockfore', len: 0.48 }], stock: ['classic', 'wood'], optic: ['pic', { optic: 'irons' }] });
  P('svd', 'rifle', { rcv: 'ak', L: 0.3, rm: 'blued', fm: 'woodRed', gripT: 'none', optF: 0.18 }, { barrel: { len: 0.55 }, thread: 'r762', muzzle: 'flash', handguard: ['ak', { t: 'wood', len: 0.25 }], stock: ['precision', 'thumbhole'], mag: { t: 'straight', len: 0.12, d: 0.07, w: 0.026, rake: 0.02 }, noDrum: true, optic: ['pic', { optic: 'scope', scopeLen: 0.28 }] });
  P('vss', 'rifle', { rcv: 'ak', L: 0.28, rm: 'blued', fm: 'woodRed', gripT: 'none', optF: 0.17 }, { barrel: { len: 0.2 }, integral: { len: 0.32, r: 0.022 }, thread: 'rak', muzzle: 'crown', stock: ['precision', 'thumbhole'], mag: { t: 'straight', len: 0.1, d: 0.07, w: 0.026 }, optic: ['pic', { optic: 'scope', scopeLen: 0.25 }] });
  P('lever', 'rifle', { irons: 'buckhorn', rcv: 'round', L: 0.2, rm: 'blued', fm: 'wood', gripT: 'none', optF: 0.24, lever: true }, { barrel: { len: 0.45, taper: 0.85 }, thread: 'r762', muzzle: 'crown', tube: 0.4, handguard: ['classic', { t: 'wood', len: 0.22 }], stock: ['classic', 'straight'], optic: ['pic', { optic: 'irons' }] });
  P('r700', 'rifle', { rcv: 'round', L: 0.22, rm: 'blued', fm: 'polymer', gripT: 'none', optF: 0.12, bolt: 0.06 }, { barrel: { len: 0.57, taper: 0.8 }, thread: 'r762', muzzle: 'crown', handguard: ['classic', { t: 'stockfore', len: 0.36 }], stock: ['precision', 'sniper'], mag: 'internal', optic: ['pic', { optic: 'scope' }] });
  P('mosin', 'rifle', { rcv: 'round', L: 0.22, rm: 'blued', fm: 'wood', gripT: 'none', optF: 0.13, bolt: 0.06 }, { barrel: { len: 0.68, taper: 0.8 }, thread: 'r762', muzzle: 'crown', handguard: ['classic', { t: 'stockfore', len: 0.62 }], stock: ['classic', 'wood'], mag: 'internal', optic: ['pic', { optic: 'scope', scopeLen: 0.24, scopeObj: 0.02 }] });
  P('awm', 'rifle', { rcv: 'box', L: 0.26, H: 0.07, W: 0.05, rm: 'green', fm: 'green', optF: 0.18, bolt: 0.08, bipod: 0.26 }, { barrel: { len: 0.62 }, thread: 'r762', muzzle: 'brake', handguard: ['box', { t: 'box', len: 0.28 }], stock: ['precision', 'skeleton'], grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.08, d: 0.09, w: 0.03 }, noDrum: true, optic: ['pic', { optic: 'scope', scopeLen: 0.36, scopeObj: 0.03 }] });
  P('barrett', 'rifle', { rcv: 'box', L: 0.46, H: 0.11, W: 0.06, rm: 'park', grip: 0.08, optF: 0.24, bipod: 0.2 }, { barrel: { len: 0.56, r: 0.014 }, thread: 'r50', muzzle: 'bigbrake', handguard: ['box', { t: 'box', len: 0.24, m: 'park' }], stock: ['precision', 'barrett'], grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.1, d: 0.12, w: 0.04 }, noDrum: true, optic: ['pic', { optic: 'scope', scopeLen: 0.36, scopeObj: 0.032 }] });
  P('uzi', 'rifle', { irons: 'ar', rcv: 'box', L: 0.2, H: 0.07, W: 0.045, rm: 'park', grip: 0.07, support: 0.2 }, { barrel: { len: 0.06 }, thread: 'r9', muzzle: 'crown', stock: ['smg', 'wire'], grip: ['smg', 'vertical'], mag: { t: 'straight', f: 0.085, y: -0.14, len: 0.1, d: 0.03, rake: 0 }, optic: ['pic', { optic: 'notch' }] });
  P('mp5', 'rifle', { irons: 'hk', rcv: 'box', L: 0.26, H: 0.06, W: 0.038, optF: 0.12 }, { barrel: { len: 0.1 }, thread: 'r9', muzzle: 'tri', handguard: ['smg', { t: 'slim', len: 0.13, m: 'polymer' }], stock: ['smg', 'fixed'], grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.15, d: 0.04, c: 0.04, w: 0.022 }, optic: ['pic', { optic: 'irons' }] });
  P('mp5sd', 'rifle', { irons: 'hk', rcv: 'box', L: 0.26, H: 0.06, W: 0.038, optF: 0.12, support: 0.36 }, { barrel: { len: 0.1 }, integral: { len: 0.2, r: 0.025 }, thread: 'r9', muzzle: 'crown', stock: ['smg', 'fixed'], grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.15, d: 0.04, c: 0.04, w: 0.022 }, optic: ['pic', { optic: 'irons' }] });
  P('vector', 'rifle', { rcv: 'box', L: 0.22, H: 0.11, W: 0.05, rm: 'polymer' }, { barrel: { len: 0.1 }, thread: 'r45', muzzle: 'flash', handguard: ['smg', { t: 'box', len: 0.06 }], stock: ['tube', 'crane'], grip: ['ar', 'ar'], mag: { t: 'straight', f: 0.13, y: -0.06, len: 0.11, d: 0.03 }, optic: ['pic', { optic: 'reddot' }] });
  P('thompson', 'rifle', { rcv: 'round', L: 0.26, rm: 'blued', fm: 'wood', optF: 0.1, vfg: 0.08, vfgM: 'wood' }, { barrel: { len: 0.24 }, thread: 'r45', muzzle: 'cutts', handguard: ['shroud', { t: 'fins', len: 0.12 }], stock: ['classic', 'wood'], grip: ['ak', 'wood'], mag: { t: 'drum', f: 0.14, r: 0.075, dw: 0.05, m: 'blued' }, optic: ['pic', { optic: 'irons' }] });
  P('ppsh', 'rifle', { rcv: 'round', L: 0.22, rm: 'blued', fm: 'wood', gripT: 'none' }, { barrel: { len: 0.27 }, thread: 'r9', muzzle: 'comp', handguard: ['shroud', { t: 'shroud', len: 0.25, m: 'blued' }], stock: ['classic', 'wood'], mag: { t: 'drum', f: 0.08, r: 0.07, dw: 0.045, m: 'blued' }, optic: ['pic', { optic: 'notch' }] });
  P('pump', 'rifle', { rcv: 'round', L: 0.22, rm: 'blued', fm: 'wood', gripT: 'none', pump: { f: 0.05, len: 0.16 } }, { barrel: { len: 0.44, r: 0.0105 }, thread: 'sg', muzzle: 'crown', tube: 0.4, pump: true, stock: ['classic', 'straight'], optic: ['pic', { optic: 'bead' }] });
  P('dbl', 'rifle', { rcv: 'break', L: 0.12, fm: 'wood', gripT: 'none', barrels: [-0.0105, 0.0105] }, { barrel: { len: 0.6, r: 0.0105 }, handguard: ['classic', { t: 'wood', len: 0.2 }], stock: ['classic', 'wood'], optic: ['pic', { optic: 'bead' }] });
  P('saiga', 'rifle', { rcv: 'ak', L: 0.33, rm: 'black', fm: 'polymer' }, { barrel: { len: 0.48, r: 0.011 }, thread: 'sg', muzzle: 'crown', handguard: ['ak', { t: 'wood', len: 0.2, m: 'polymer' }], stock: ['ak', 'skeleton'], grip: ['ak', 'wood'], mag: { t: 'straight', len: 0.13, d: 0.09, w: 0.034, rake: 0.02 }, optic: ['pic', { optic: 'notch' }] });
  P('aa12', 'rifle', { rcv: 'box', L: 0.33, H: 0.08, W: 0.05 }, { barrel: { len: 0.28, r: 0.012 }, thread: 'sg', muzzle: 'flash', handguard: ['box', { t: 'box', len: 0.15 }], stock: ['heavy', 'fixed'], grip: ['ar', 'ar'], mag: { t: 'drum', f: 0.16, r: 0.085, dw: 0.07 }, optic: ['pic', { optic: 'reddot' }] });
  P('ksg', 'rifle', { rcv: 'bullpup', L: 0.4, fm: 'polymer', extra: 'ksgTubes', pump: { f: 0.0, len: 0.14 }, vfg: 0.07 }, { barrel: { len: 0.26, r: 0.0105 }, thread: 'sg', muzzle: 'crown', pump: true, grip: ['ar', 'ar'], optic: ['pic', { optic: 'reddot' }] });
  P('slug', 'rifle', { rcv: 'round', L: 0.25, rm: 'black', fm: 'polymer', optF: 0.14 }, { barrel: { len: 0.47, r: 0.0105 }, thread: 'sg', muzzle: 'crown', tube: 0.38, handguard: ['classic', { t: 'wood', len: 0.24, m: 'polymer' }], stock: ['tube', 'm4'], grip: ['ar', 'ar'], optic: ['pic', { optic: 'irons' }] });
  P('m249', 'rifle', { rcv: 'box', L: 0.32, H: 0.08, W: 0.05, feed: true, optF: 0.2, carry: 0.46 }, { barrel: { len: 0.38 }, thread: 'r556', muzzle: 'flash', handguard: ['box', { t: 'rail', len: 0.18 }], fg: 'bipod', stock: ['heavy', 'fixed'], grip: ['ar', 'ar'], mag: { t: 'ammobox', f: 0.12, m: 'od' }, optic: ['pic', { optic: 'irons' }] });
  P('pkm', 'rifle', { rcv: 'box', L: 0.33, H: 0.075, W: 0.045, rm: 'blued', fm: 'woodRed', feed: true, bipod: 0.56 }, { barrel: { len: 0.52, taper: 0.9 }, thread: 'r762', muzzle: 'flash', stock: ['heavy', 'thumbhole'], grip: ['ak', 'wood'], mag: { t: 'ammobox', f: 0.13, m: 'park' }, optic: ['pic', { optic: 'notch' }] });
  P('m60', 'rifle', { rcv: 'box', L: 0.33, H: 0.08, W: 0.05, rm: 'park', fm: 'polymer', feed: true, optF: 0.25, bipod: 0.52, carry: 0.52 }, { barrel: { len: 0.45 }, thread: 'r762', muzzle: 'flash', handguard: ['box', { t: 'box', len: 0.2 }], stock: ['heavy', 'fixed'], grip: ['ar', 'ar'], mag: { t: 'ammobox', f: 0.15, m: 'od' }, optic: ['pic', { optic: 'irons' }] });
  P('skorp', 'rifle', { rcv: 'box', L: 0.16, H: 0.05, W: 0.032, rm: 'blued', grip: 0.01, support: 0.14 }, { barrel: { len: 0.08, r: 0.007 }, thread: 'r9', muzzle: 'crown', stock: ['smg', 'folded'], grip: ['ak', 'wood', 'woodDark'], mag: { t: 'curved', f: 0.1, len: 0.1, d: 0.026, c: 0.03, w: 0.016 }, optic: ['pic', { optic: 'notch' }] });
  P('mac10', 'rifle', { irons: 'ar', rcv: 'box', L: 0.22, H: 0.07, W: 0.05, rm: 'park', grip: 0.06, support: 0.2 }, { barrel: { len: 0.04, r: 0.008 }, thread: 'r45', muzzle: 'crown', stock: ['smg', 'folded'], grip: ['smg', 'vertical'], mag: { t: 'straight', f: 0.075, y: -0.14, len: 0.09, d: 0.03, rake: 0 }, optic: ['pic', { optic: 'notch' }] });
  P('mp7', 'rifle', { rcv: 'box', L: 0.26, H: 0.07, W: 0.042, rm: 'polymer', grip: 0.06, optF: 0.1, vfg: 0.0, vfgM: 'polymer' }, { barrel: { len: 0.06, r: 0.007 }, thread: 'r57', muzzle: 'flash', stock: ['tube', 'm4'], grip: ['smg', 'vertical'], mag: { t: 'straight', f: 0.075, y: -0.14, len: 0.07, d: 0.026, rake: 0 }, noDrum: true, optic: ['pic', { optic: 'reddot' }] });
  // the 2nd round
  P('ak74', 'rifle', { rcv: 'ak', L: 0.28, rm: 'black', fm: 'polymer' }, { barrel: { len: 0.31 }, thread: 'rak', muzzle: 'brake', handguard: ['ak', { t: 'wood', len: 0.2, m: 'woodRed' }], stock: ['ak', 'skeleton', 'polymer'], grip: ['ak', 'wood'], mag: { t: 'curved', len: 0.21, d: 0.068, c: 0.06, w: 0.026 }, optic: ['pic', { optic: 'notch' }] });
  P('aks74u', 'rifle', { rcv: 'ak', L: 0.26, rm: 'black', fm: 'woodRed', optF: 0.2 }, { barrel: { len: 0.15 }, thread: 'rak', muzzle: 'cutts', handguard: ['ak', { t: 'wood', len: 0.12, m: 'woodRed' }], stock: ['ak', 'skeleton'], grip: ['ak', 'wood'], mag: { t: 'curved', len: 0.21, d: 0.068, c: 0.06, w: 0.026 }, optic: ['pic', { optic: 'notch' }] });
  P('rpk', 'rifle', { rcv: 'ak', L: 0.3, rm: 'blued', fm: 'wood', bipod: 0.46 }, { barrel: { len: 0.5, taper: 0.9 }, thread: 'rak', muzzle: 'crown', handguard: ['ak', { t: 'wood', len: 0.2 }], stock: ['ak', 'akwood'], grip: ['ak', 'wood'], mag: { t: 'curved', len: 0.23, d: 0.072, c: 0.08, w: 0.028 }, optic: ['pic', { optic: 'notch' }] });
  P('scarl', 'rifle', { L: 0.27, rm: 'tan', fm: 'tan' }, { barrel: { len: 0.3 }, thread: 'r556', muzzle: 'flash', handguard: ['ar', { t: 'rail', len: 0.22, m: 'tan' }], stock: ['heavy', 'fixed'], grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.19, d: 0.064, c: 0.03 }, optic: ['pic', { optic: 'irons' }] });
  P('m27', 'rifle', { L: 0.22 }, { barrel: { len: 0.4 }, thread: 'r556', muzzle: 'flash', handguard: ['ar', { t: 'rail', len: 0.34 }], fg: 'bipod', stock: ['tube', 'crane'], grip: ['ar', 'ar'], mag: { t: 'curved', len: 0.19, d: 0.064, c: 0.03 }, optic: ['pic', { optic: 'irons' }], charging: 'ar' });
  P('m14', 'rifle', { rcv: 'round', L: 0.25, rm: 'park', fm: 'wood', gripT: 'none', optF: 0.14 }, { barrel: { len: 0.45 }, thread: 'r762', muzzle: 'flash', handguard: ['classic', { t: 'stockfore', len: 0.4 }], stock: ['classic', 'wood'], mag: { t: 'straight', len: 0.15, d: 0.07, w: 0.026 }, optic: ['pic', { optic: 'irons' }] });
  P('sr25', 'rifle', { L: 0.25, optF: 0.15 }, { barrel: { len: 0.45 }, thread: 'r762', muzzle: 'flash', handguard: ['ar', { t: 'mlok', len: 0.34 }], stock: ['tube', 'crane'], grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.15, d: 0.07, w: 0.026 }, optic: ['pic', { optic: 'scope', scopeLen: 0.3 }], charging: 'ar' });
  P('mpx', 'rifle', { L: 0.2, optF: 0.1 }, { barrel: { len: 0.16 }, thread: 'r9', muzzle: 'flash', handguard: ['ar', { t: 'mlok', len: 0.17 }], stock: ['tube', 'pdw'], grip: ['ar', 'ar'], mag: { t: 'straight', len: 0.15, d: 0.034, w: 0.022, rake: 0.008 }, optic: ['pic', { optic: 'irons' }], charging: 'ar' });
  P('benelli', 'rifle', { rcv: 'round', L: 0.24, rm: 'black', fm: 'polymer', optF: 0.12 }, { barrel: { len: 0.45, r: 0.0105 }, thread: 'sg', muzzle: 'crown', tube: 0.38, handguard: ['classic', { t: 'wood', len: 0.22, m: 'polymer' }], stock: ['tube', 'm4'], grip: ['ar', 'ar'], optic: ['pic', { optic: 'irons' }] });
  P('vepr', 'rifle', { rcv: 'ak', L: 0.34, rm: 'black', fm: 'polymer' }, { barrel: { len: 0.42, r: 0.011 }, thread: 'sg', muzzle: 'crown', handguard: ['ak', { t: 'rail', len: 0.22 }], stock: ['ak', 'skeleton'], grip: ['ak', 'wood'], mag: { t: 'straight', len: 0.13, d: 0.09, w: 0.034, rake: 0.02 }, optic: ['pic', { optic: 'irons' }] });
  P('ar9', 'rifle', { L: 0.21 }, { barrel: { len: 0.2 }, thread: 'r9', muzzle: 'flash', handguard: ['ar', { t: 'carbine', len: 0.17 }], stock: ['tube', 'm4'], grip: ['ar', 'ar'], mag: { t: 'pistol' }, optic: ['pic', { optic: 'irons' }], charging: 'ar' });
  P('aug9', 'rifle', { rcv: 'bullpup', L: 0.42, fm: 'od', railTop: false, optF: 0.3, vfg: 0.04, vfgM: 'od' }, { barrel: { len: 0.24, m: 'black' }, thread: 'r9', muzzle: 'crown', grip: ['ar', 'ar'], mag: { t: 'pistol' }, optic: ['pic', { optic: 'acog' }] });
  P('sawn', 'rifle', { rcv: 'break', L: 0.12, fm: 'wood', barrels: [-0.0105, 0.0105], gripT: 'wood', grip: 0.0, support: 0.16 }, { barrel: { len: 0.26, r: 0.0105 }, handguard: ['classic', { t: 'wood', len: 0.12 }], grip: ['ak', 'wood', 'wood'], optic: ['pic', { optic: 'bead' }] });
  // pistols
  const pst = (id, slide, gm, extra) => P(id, 'pistol', Object.assign({ gm }, extra), { slide, pbarrel: true, grip: ['pistol', null, gm], mag: { t: 'pistol' }, optic: ['pso', { optic: 'notch' }], ptac: true });
  pst('p9', { len: 0.186 }, 'polymer');
  pst('usp', { len: 0.182, w: 0.028 }, 'polymer');
  pst('m1911', { len: 0.196, sm: 'blued', w: 0.024 }, 'wood', { fm: 'blued', hammer: true });
  pst('g18', { len: 0.17, comp: true }, 'polymer', { ext: 1 });
  pst('auto9', { len: 0.25, sm: 'gunmetal', vent: true, w: 0.03 }, 'gunmetal', { fm: 'gunmetal', ext: 1 });
  pst('deagle', { len: 0.252, sm: 'steel', w: 0.032 }, 'rubber', { fm: 'steel' });
  pst('g19', { len: 0.17 }, 'polymer');
  pst('akimbo', { len: 0.2, sm: 'blued', w: 0.026 }, 'woodDark', { fm: 'blued' });
  // revolvers
  P('rev', 'revolver', { cl: 0.042, cr: 0.021 }, { barrel: { len: 0.1 }, grip: ['rev', null, 'woodDark'], optic: ['pso', { optic: 'notch' }], loader: true });
  P('hc500', 'revolver', { cl: 0.05, cr: 0.026, comp: true }, { barrel: { len: 0.2 }, grip: ['rev', null, 'woodDark'], optic: ['pso', { optic: 'notch' }], loader: true });
  P('judge', 'revolver', { cl: 0.072, cr: 0.026, m: 'blued' }, { barrel: { len: 0.075 }, grip: ['rev', null, 'rubber'], optic: ['pso', { optic: 'notch' }], loader: true });
  P('derringer', 'derringer', {}, { barrel: { len: 0.09 }, grip: ['rev', null, 'woodDark'] });
  // specials
  P('p90', 'p90', {}, { barrel: { len: 0.04 }, thread: 'r57', muzzle: 'flash', optic: ['pic', { optic: 'reddot' }], mag: { t: 'p90' }, noDrum: true });
  P('shredder', 'minigun', {}, { barrel: { len: 0.55 }, motor: true, mag: { t: 'ammobox', f: 0.12, m: 'od' }, optic: ['pic', { optic: 'none' }] });
  P('m32', 'launcher', { drum: true }, { barrel: { len: 0.3 }, stock: ['tube', 'm4'], optic: ['pic', { optic: 'reddot' }] });
  P('pocketgl', 'launcher', {}, { barrel: { len: 0.3 }, stock: ['smg', 'wire'], optic: ['pic', { optic: 'notch' }] });
  P('rail', 'railgun', {}, { barrel: { len: 0.55 }, cap: true, stock: ['precision', 'skeleton'], optic: ['pic', { optic: 'scope', scopeLen: 0.26, scopeObj: 0.022 }] });
  P('crossbow', 'crossbow', {}, { limbs: true, stock: ['precision', 'sniper'], optic: ['pic', { optic: 'reddot' }] });

  // anything without a platform entry (shouldn't happen) gets a bare one
  for (const def of G.WEAPON_LIST) if (!PLATFORMS[def.id]) P(def.id, 'rifle', {}, {});
  // Calibration: the weapon's tuned stats are what its default build shoots like, so each platform carries
  // the negated sum of its default parts' effects. Changing a part changes the stats relative to that.
  const STAT_KEYS = ['ergo', 'recoil', 'acc', 'hip', 'weight', 'vel', 'reload', 'rpm', 'spin'];
  for (const plat of Object.values(PLATFORMS)) {
    plat.offset = {};
    for (const k of STAT_KEYS) plat.offset[k] = -Object.values(plat.defaults).reduce((a, pid) => a + ((PARTS[pid] && PARTS[pid].st[k]) || 0), 0);
  }

  // ------------------------------------------------------------------ builds
  const defaultBuild = (id) => Object.assign({}, PLATFORMS[id] ? PLATFORMS[id].defaults : {});
  // Slots available with this build: the platform's own, plus whatever the installed parts provide.
  function slotsOf(id, build) {
    const plat = PLATFORMS[id], out = plat.slots.map((s) => Object.assign({ parent: null }, s));
    for (let i = 0; i < out.length; i++) {
      const p = build[out[i].slot] && PARTS[build[out[i].slot]];
      if (p && p.provides) for (const [sl, mount] of Object.entries(p.provides)) if (!out.some((o) => o.slot === sl)) out.push({ slot: sl, mount, req: false, parent: out[i].slot });
    }
    out.sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot));
    return out;
  }
  // the slots the gunsmith (and the gun's own panel) shows: not the magazine, where it's a magazine you carry
  const visibleSlots = (id, build) => slotsOf(id, build).filter((s) => !(s.slot === 'mag' && PLATFORMS[id].magVariants));
  // what a magazine variant holds
  const magCap = (wid, vid) => (vid && PARTS[vid] && PARTS[vid].set.cap) || G.WEAPONS[wid].mag;
  // Drop parts whose slot no longer exists (e.g. a laser after swapping to an unrailed handguard).
  function prune(id, build) {
    const removed = [];
    let changed = true;
    while (changed) {
      changed = false;
      const avail = slotsOf(id, build);
      for (const [sl, pid] of Object.entries(build)) {
        const s = avail.find((a) => a.slot === sl);
        if (!s || !PARTS[pid] || (!fitsSlot(s, PARTS[pid]) && !s.req)) { removed.push(pid); delete build[sl]; changed = true; }
      }
    }
    return removed;
  }
  function encode(id, build) {
    const ids = Object.values(build).filter((p) => PARTS[p]).map((p) => PARTS[p].idx).sort((a, b) => a - b);
    return id + '/' + ids.map((n) => n.toString(36)).join('.');
  }
  function decode(code) {
    const [id, rest] = String(code).split('/');
    if (rest === undefined) return { id, build: defaultBuild(id) };
    const build = {};
    for (const s of rest.split('.')) {
      const p = LIST[parseInt(s, 36)];
      if (!p) continue;
      const alt = Object.keys(ALIAS).find((a) => ALIAS[a] === p.slot);
      build[build[p.slot] && alt ? alt : p.slot] = p.id; // (two of a kind: one's on the other's adapter)
    }
    for (const [alt, sl] of Object.entries(ALIAS)) if (build[alt] && build[sl] && !(PARTS[build[sl]].provides || {})[alt]) [build[sl], build[alt]] = [build[alt], build[sl]];
    prune(id, build);
    return { id, build };
  }
  // A receiver group from another gun of its family in the build: the gun is that one now, but only the
  // receiver group changed. Every other part stays exactly as it was: the ones that fit carry on, a core part
  // made for the old gun (its barrel, its slide) stays on but doesn't fit (it won't fire until the right one's
  // in), and optional parts with nowhere to go on the new gun come off. Nothing of the new gun's comes with it.
  // Returns { id, build, off } or null.
  function convert(id, build) {
    const r = build.receiver && PARTS[build.receiver];
    if (!r || !r.becomes || r.becomes === id || !PLATFORMS[r.becomes]) return null;
    const to = r.becomes, nb = { receiver: build.receiver }, off = [];
    const magSlot = PLATFORMS[to].slots.find((x) => x.slot === 'mag');
    if (magSlot) nb.mag = build.mag && PARTS[build.mag] && PARTS[build.mag].mount === magSlot.mount ? build.mag : PLATFORMS[to].defaults.mag; // (the magazine in it: see Me.convert)
    const carried = Object.entries(build).filter(([sl]) => sl !== 'receiver' && sl !== 'mag').sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
    for (const [sl, pid] of carried) {
      const p = PARTS[pid], s = p && slotsOf(to, nb).find((x) => x.slot === sl);
      if (s && (s.mount === p.mount || s.req)) nb[sl] = pid; else if (p) off.push(pid);
    }
    for (const pid of prune(to, nb)) if (carried.some(([, q]) => q === pid)) off.push(pid);
    return { id: to, build: nb, off };
  }
  // the kits that would make this gun something else
  const kitsFor = (id) => { const rg = RCV_OF[id]; return rg ? Object.keys(RCV[rg].kits).filter((k) => k !== id).map((k) => `rcv.${k}`) : []; };
  // what converting a `from` into a `to` takes besides the receiver group: the core parts of the `to` made for
  // it alone (its barrel, its slide...), where the `from`'s don't fit
  function convParts(from, to) {
    const P0 = PLATFORMS[from], P1 = PLATFORMS[to];
    return P1.slots.filter((s) => s.req && s.slot !== 'receiver' && s.slot !== 'mag' && P1.defaults[s.slot] && !P0.slots.some((q) => q.slot === s.slot && q.mount === s.mount)).map((s) => P1.defaults[s.slot]);
  }
  // a part's price when it's bought outright (a gun's own factory parts have none: they come with it)
  const buyPrice = (p) => p.price || ({ barrel: 320, slide: 260, handguard: 200 })[p.slot] || 150;

  // ------------------------------------------------------------------ compile: build -> weapon def
  const cache = new Map();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function compile(id, build) {
    build = build || defaultBuild(id);
    const code = encode(id, build);
    if (cache.has(code)) return cache.get(code);
    const base = G.WEAPONS[id], plat = PLATFORMS[id], gs = G.GUN_SPECS[id] || {};
    const d = Object.create(base);
    const s = Object.assign({ ergo: 0, recoil: 0, acc: 0, hip: 0, weight: 0, vel: 0, reload: 0, rpm: 0, spin: 0 }, plat.offset);
    for (const sl of slotsOf(id, build)) if (!build[sl.slot] && EMPTY[sl.slot] && !sl.bare) for (const [k, v] of Object.entries(EMPTY[sl.slot])) s[k] += v; // e.g. no stock
    let perLoad = 1, levels = null, magnifier = 0, light = 0, laser = null, laserHip = 0, cap = base.mag, zoom = base.zoom, barrelIn = gs.barrel, device = gs.muzzleDevice || 'none', sup = false, hasMuzzleSlot = false, shell = base.shell, reload = base.reload, scoped = base.zoom <= 0.5, reticle = 'cross', magnif = scoped ? scopeMag({}, base.zoom) : 1;
    const parts = Object.values(build).map((p) => PARTS[p]).filter(Boolean);
    for (const p of parts) {
      for (const k in s) s[k] += p.st[k] || 0;
      if (p.set.cap != null) cap = p.set.cap;
      if (p.set.zoom != null) zoom = p.set.zoom;
      if (p.set.scoped != null) { scoped = p.set.scoped; reticle = p.set.reticle || 'cross'; magnif = p.set.magnif || 1; }
      if (p.set.barrelIn != null) barrelIn = p.set.barrelIn;
      if (p.set.shell != null) shell = p.set.shell;
      if (p.set.reload != null) reload = p.set.reload;
      if (p.set.perLoad != null) perLoad = p.set.perLoad;
      if (p.set.levels) levels = p.set.levels;
      if (p.set.magnifier) magnifier = p.set.magnifier;
      if (p.set.light) light = Math.max(light, p.set.light);
      if (p.set.laser) { laser = p.set.laser; laserHip += p.st.hip || 0; }
      if (p.slot === 'barrel' && p.set.sup != null) { sup = p.set.sup; if (p.set.device) device = p.set.device; }
      if (p.provides && p.provides.muzzle) hasMuzzleSlot = true;
    }
    const mz = build.muzzle && PARTS[build.muzzle];
    if (hasMuzzleSlot) { device = mz ? mz.set.device : 'none'; sup = !!(mz && mz.set.sup); }
    d.code = code; d.build = Object.assign({}, build); d.parts = parts; d.stats = s;
    d.modified = parts.some((p) => plat.defaults[p.slot] !== p.id) || Object.keys(build).length !== Object.keys(plat.defaults).length;
    // core parts taken off (a barrel, a grip...): it won't fire until they're back
    d.missing = slotsOf(id, build).filter((sl) => sl.req && !build[sl.slot]).map((sl) => sl.slot);
    // ...or a core part made for another gun (a barrel of the wrong calibre, after a receiver swap)
    d.misfit = slotsOf(id, build).filter((sl) => sl.req && build[sl.slot] && PARTS[build[sl.slot]] && PARTS[build[sl.slot]].mount !== sl.mount).map((sl) => sl.slot);
    d.missing = d.missing.concat(d.misfit);
    d.dmg = Math.round(base.dmg * (1 + s.vel * 0.006) * 10) / 10;
    d.range = Math.round(base.range * (1 + s.vel * 0.01));
    d.recoil = base.recoil * clamp(1 + s.recoil / 100, 0.3, 2);
    d.spread = base.spread * clamp(1 + (s.hip + s.acc * 0.35) / 100, 0.3, 2);
    d.ads = base.ads * clamp(1 + s.acc / 100, 0.25, 2);
    d.mag = cap;
    d.shell = shell;
    d.perLoad = perLoad; // shells pushed into the tube at a time
    d.reload = reload * clamp(1 + s.reload / 100, 0.4, 2);
    d.rpm = Math.round(base.rpm * clamp(1 + s.rpm / 100, 0.5, 1.6));
    if (base.spinUp) d.spinUp = base.spinUp * clamp(1 + s.spin / 100, 0.3, 2);
    d.speed = base.speed * clamp(1 - s.weight * 0.02, 0.75, 1.1);
    d.zoom = zoom;
    d.scoped = scoped; d.reticle = reticle; d.magnif = magnif;
    // powers you can step through while aiming (scroll): a variable scope's, or 1× and a magnifier's behind a dot
    d.magnifier = !!magnifier && !scoped;
    if (d.magnifier) { const om = (build.optic && PARTS[build.optic] && PARTS[build.optic].model) || {}; levels = [1, magnifier]; d.reticle = om.ret || (om.optic === 'holo' ? 'holo' : 'dot'); }
    d.magLevels = levels && levels.length > 1 ? levels : null;
    d.magDef = d.magLevels ? Math.max(0, d.magLevels.indexOf(d.magnifier ? 1 : magnif)) : 0;
    // a light and a laser (switched on in the field); the laser's hip-fire help only counts while it's on
    d.light = light; d.laser = laser;
    d.spreadNoLaser = laserHip ? base.spread * clamp(1 + (s.hip - laserHip + s.acc * 0.35) / 100, 0.3, 2) : null;
    d.ergo = Math.round(plat.ergo + s.ergo);
    d.handling = clamp(1 + s.ergo / 100, 0.55, 1.45);
    d.weight = Math.max(0.3, plat.kg + s.weight);
    d.sup = sup;
    d.device = device;
    d.barrelIn = barrelIn;
    d.soundKey = gs.barrel ? `${id}:${(+barrelIn).toFixed(1)}:${device}` : id;
    d.value = base.price + parts.reduce((a, p) => a + (p.factory || plat.defaults[p.slot] === p.id ? 0 : p.price), 0);
    cache.set(code, d);
    return d;
  }
  const fromCode = (code) => { const { id, build } = decode(code); return G.WEAPONS[id] ? compile(id, build) : null; };
  // gunshot synth inputs for a sound key ("id:barrelInches:device" or a plain id)
  function soundSpec(key) {
    const [id, inch, dev] = String(key).split(':');
    const g = G.GUN_SPECS[id];
    if (!g) return null;
    return inch === undefined ? g : Object.assign({}, g, { barrel: +inch, muzzleDevice: dev });
  }
  // The model spec for a build: the platform's receiver spec with every installed part's patch applied.
  function modelSpec(def) {
    const plat = PLATFORMS[def.id];
    const spec = JSON.parse(JSON.stringify(plat.spec));
    // (in slot order, by the slot each is in: what's on an adapter goes over the adapter)
    const parts = Object.entries(def.build || defaultBuild(def.id)).filter(([, p]) => PARTS[p])
      .sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])).map(([, p]) => PARTS[p]);
    for (const p of parts) for (const [k, v] of Object.entries(p.model || {})) {
      if (k === 'pumpPatch') { spec.pump = Object.assign({}, spec.pump || {}, v); continue; }
      if (v && typeof v === 'object' && !Array.isArray(v) && spec[k] && typeof spec[k] === 'object') spec[k] = Object.assign({}, spec[k], v);
      else spec[k] = v;
    }
    spec.slotOf = {}; for (const p of parts) spec.slotOf[p.slot] = p.id;
    return spec;
  }

  // (parts added later go on the end of the list: a part's id in a weapon's code is its place in it)
  tubeAdapter(add({ id: 'stk.smg.6', slot: 'stock', mount: 'stk:smg' }), 'Lynx SMG buffer tube adapter', 'lynx');
  const compatible = (mount) => BY_MOUNT.get(mount) || [];
  const FITS = new Map(); // interface -> weapon ids that have (or can get) a slot for it
  for (const plat of Object.values(PLATFORMS)) {
    const mounts = new Set(plat.slots.map((s) => s.mount));
    for (let pass = 0; pass < 2; pass++) for (const m of [...mounts]) for (const p of compatible(m)) if (p.provides) for (const pm of Object.values(p.provides)) mounts.add(pm);
    for (const m of mounts) { if (!FITS.has(m)) FITS.set(m, []); FITS.get(m).push(plat.id); }
  }
  const fits = (mount) => FITS.get(mount) || [];

  // ------------------------------------------------------------------ the gunsmith's stock this visit
  // Three parts at a time, the same for the whole squad. Parts that fit more weapons turn up more often;
  // better parts appear deeper in the run.
  function rollStock(level, seed, n = 3) {
    const r = G.U.rng((seed ^ 0x6a5d) >>> 0), maxTier = Math.min(3, 1 + Math.floor(level / 2)), out = new Set();
    // (lights and lasers are few among hundreds of muzzles, stocks and grips: they're weighted up to turn up most visits)
    const pool = LIST.filter((p) => !p.factory && !p.variant && p.tier <= maxTier).map((p) => ({ p, w: Math.pow(fits(p.mount).length, 0.8) * (p.slot === 'tac' ? 9 : 1) }));
    while (out.size < n && pool.length) {
      let roll = r() * pool.reduce((a, x) => a + x.w, 0), i = 0;
      while (roll > pool[i].w && i < pool.length - 1) { roll -= pool[i].w; i++; }
      out.add(pool.splice(i, 1)[0].p.id);
    }
    return out;
  }
  // Take the aftermarket parts off a weapon (traded in or replaced) and put them in a stash.
  function strip(def, stash) {
    for (const pid of Object.values(def.build || {})) { const p = PARTS[pid]; if (p && !p.factory && !p.variant && p.becomes !== def.id) stash[pid] = (stash[pid] || 0) + 1; } // (a magazine isn't a part; its own receiver kit is the gun)
  }

  return {
    PARTS, LIST, PLATFORMS, SLOT_LABEL, BRANDS: BR, ifaceName, fits, fitsSlot, ALIAS,
    defaultBuild, slotsOf, visibleSlots, magCap, prune, encode, decode, compile, fromCode, soundSpec, modelSpec, rollStock, compatible, strip, convert, kitsFor, convParts, buyPrice, RCV,
    defaultCode: (id) => encode(id, defaultBuild(id)),
  };
})();
