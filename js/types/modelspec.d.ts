// The gun model spec: what a gun platform is built from (js/parts.ts modelSpec), read by the recipes (tools/models/recipes.ts, bake time only) and
// by the game for what a platform is (which archetype, its receiver style, its sights). Types only.
// ---------------------------------------------------------------- what a recipe is given (the model spec)
/** A weapon platform's archetype: which recipe in tools/models/recipes.ts builds it. */
type ArchKind = 'rifle' | 'pistol' | 'revolver' | 'derringer' | 'minigun' | 'launcher' | 'railgun' | 'crossbow' | 'p90';
/** A long gun's receiver style (rifle()'s o.rcv). */
type RcvKind = 'ar' | 'ak' | 'aksu' | 'aug' | 'box' | 'break' | 'bullpup' | 'f2' | 'g36' | 'gm6' | 'mcx' | 'mpx' | 'qbz192' | 'qbz95' | 'round' | 'scar' | 'vector' | 'authored';
/** A sight: the optics, and the iron sights a gun carries. */
type OpticKind = 'irons' | 'notch' | 'bead' | 'none' | 'night' | 'riser' | 'reddot' | 'minidot' | 'holo' | 'acog' | 'prism' | 'lpvo' | 'scope' | 'augscope' | 'qbzirons' | 'authored';
/** An iron sight's pattern (S.irons). */
type IronsKind = 'ar' | 'ak' | 'hk' | 'buckhorn';
/** A reflex sight's reticle (reticleTex). */
type ReticleKind = 'dot' | 'dotG' | 'holo' | 'cdot';
type StockKind = 'tubeonly' | 'm4' | 'crane' | 'fixed' | 'skeleton' | 'thumbhole' | 'wood' | 'akwood' | 'straight' | 'sniper' | 'barrett' | 'pdw' | 'wire' | 'qbz' | 'mcx' | 'spearlt' | 'rattler' | 'scar' | 'g36' | 'aksu' | 'aksufold' | 'folded' | 'smgmount';
type MuzzleKind = 'crown' | 'flash' | 'prong' | 'brake' | 'bigbrake' | 'lynx' | 'comp' | 'slant' | 'cutts' | 'tri' | 'can' | 'shortcan' | 'longcan' | 'pcomp' | 'choke' | 'breacher' | 'boxcan';
type HandguardKind = 'rail' | 'mlok' | 'wood' | 'stockfore' | 'slim' | 'carbine' | 'shroud' | 'fins' | 'box' | 'g36' | 'sig' | 'qbz' | 'vector';
type ForegripKind = 'vertical' | 'angled' | 'stubby' | 'stop' | 'bipod';
type MagKind = 'curved' | 'straight' | 'pistol' | 'drum' | 'ammobox' | 'internal';
/** The size of a round, for the cartridges a clear magazine shows. */
interface RoundDims { head: number; cs: number; bl: number; bd: number; shell?: boolean; pistol?: boolean; cap?: number }
/** A magazine's model (M: how a material is named: a name in the catalog, a material once built). */
interface MagSpec<M = THREE.Material | null> { t?: MagKind; f: number; y: number; len?: number; d?: number; c?: number; w?: number; st?: number; ribs?: number; rake?: number; r?: number; dw?: number; scale?: number; m?: M; well?: M; rnd?: RoundDims | null }
/** A handguard's model. */
interface HgSpec<M = THREE.Material | null> { t: HandguardKind; len: number; m?: M; rails?: boolean; slots?: string; under?: boolean; aksu?: boolean; bl?: number; ext?: number }
/** Where a gun's charging handle is, and how it moves. */
interface CockHandle { f: number; y: number; x: number; travel?: number; recip?: boolean; style?: string; sz?: number; stem?: number; grab?: number[] }
/** A barrel's model. */
interface BarrelSpec { len?: number; r?: number; y?: number; taper?: number; back?: number /* (a shared barrel: how far behind the receiver's front its tube starts) */; [field: string]: any }
/**
 * What a recipe (rifle, pistol, revolver...) is built from: the platform's receiver spec with each fitted part's patch on
 * it (js/parts.ts modelSpec). Every key is optional: each archetype reads the ones it has. M: how a material is named.
 */
interface RecipeSpec<M = THREE.Material | null> {
  // the receiver
  rcv?: RcvKind; authored?: string; look?: string; L?: number; H?: number; W?: number; rm?: M; fm?: M; sm?: M; gm?: M; m?: M; irons?: IronsKind; railTop?: boolean; siderails?: boolean;
  carry?: number; carrySide?: boolean; cheek?: number | null; extra?: string; hammer?: boolean; feed?: boolean; chassis?: boolean; aksu?: boolean;
  // the action
  bolt?: number; lever?: boolean; cock?: Partial<CockHandle>; ch?: string; pump?: { f: number; len: number; m?: M; [field: string]: any }; tube?: number; tubeY?: number; saddle?: string | Record<string, any>;
  // the furniture
  grip?: number; gripT?: string; stock?: StockKind; hg?: HgSpec<M>; hgGap?: number; hgMax?: number; fg?: ForegripKind; fgAt?: number; vfg?: number; vfgM?: M; bipod?: number; slots?: string; under?: boolean;
  tac?: string; tacL?: string; tacAt?: { f: number; y: number; x: number }; railmount?: string | Record<string, any>; railExt?: number;
  // the barrel and what's on it
  barrel?: BarrelSpec; rib?: boolean /* (its barrels carry a rib along the top, whatever sight is fitted) */; mbr?: number /* (the barrel radius a muzzle device is drawn for: the gun's, whatever profile its barrel has) */; blen?: number; barrels?: number[]; integral?: { len: number; r: number } | null; muzzle?: MuzzleKind; thread?: boolean; match?: boolean; can?: { from: number; r: number }; comp?: boolean; recoilBarrel?: number; bIn?: number;
  // the sights
  optic?: OpticKind; apart?: string; optF?: number; optCut?: boolean | number; ironsAt?: number[]; sightRise?: number; magnifier?: number | Record<string, any>; riser?: number; ret?: ReticleKind; dotR?: number; dotLen?: number; px?: number; scopeLen?: number; scopeObj?: number; closed?: boolean;
  // the magazine and where things sit
  mag?: MagSpec<M>; magFit?: { len: number; c: number; d: number }; support?: number; chY?: number; chF?: number; slotOf?: Record<string, string>;
  // the odd ones
  avBarrel?: string; avMuzzle?: string; avMag?: string /* (an authored gun's variant barrel / magazine fitted: the file name beside the model, e.g. "barrel_short") */;
  boltTravel?: number /* (a manually cycled pistol: how far its bolt comes back, metres; the Welrod's) */;
  ext?: number; len0?: number; cr?: number; cl?: number; chambers?: number; limb?: string; motor?: string; cap?: string; drum?: boolean | Record<string, any>; slide?: Record<string, any>;
}
/** A recipe's spec as the catalog holds it, its materials still names ('tan', 'woodDark'). */
type ModelSpec = RecipeSpec<string | null>;
