// Types js/parts.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/parts.ts.

interface Part { // a part as the catalog holds it
  id: string; idx: number; slot: SlotKind; mount: string; st: Record<string, number>; set: PartSet; tier: number;
  brand: string; name: string; desc: string; price: number; model?: PartModel; provides?: Record<string, string | { mount: string; bare?: boolean; brace?: Record<string, number> }> | null;
  chassis?: Record<string, string | { mount: string; bare?: boolean; brace?: Record<string, number> }>; not?: string[]; only?: string; alsoMounts?: string[]; factory?: boolean; oem?: boolean; fam?: string; plat?: string;
  stype?: string; variant?: boolean; retired?: boolean; becomes: string /* (a receiver kit: the gun it makes) */;
  skin?: string; alt?: boolean; skinName?: string; /* (a skin family: the parts of one mount that are one part in different finishes; skin is the family's root part, alt a member that isn't it, skinName the finish) */
  into?: string; /* (a part merged into another, the same part in the same finish: it's retired, and a saved gun with it gets that one) */
  hgScale?: boolean; /* (a handguard of a type that comes in lengths: its figures follow its length against the gun's own handguard's) */
  authored?: { height: string }; /* (a part modelled in Blender: models/parts, docs/models.md) */
  len?: number; /* (a shared long-gun barrel: its length in inches, what fits is each gun's factory length's 0.6x-1.6x) */
  profile?: string; /* (a shared barrel's profile: BARREL_PROFILES, absent = standard) */
  ownBarrel?: boolean; /* (a gun's own barrel with a length (the modelled AKs'): its figures by its length as a shared one's, its model its own (model), not the shared tube (lenModel)) */
  seller?: string; /* (sold only at one counter: 'nj' Nightjar's (js/shop.ts offers.njParts), never on the gunsmith's pedestals or Timberline's stumps) */
}

interface Slot { // a slot on a weapon platform (a nested one also has the parent slot it opens from)
  slot: SlotName; mount: string; req: boolean; bare?: boolean; parent?: string | null; brace?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Weapon parts and the gunsmith.
//
// Every weapon is a platform: its receiver(s) and trigger group, plus slots. Parts attach to a slot by
// interface (mount): a muzzle device needs the thread the barrel provides, foregrips and lasers need the
// rails a handguard provides, optics need the receiver's top rail, and so on. Every slot has the gun's
// factory part plus aftermarket parts from (fictional) manufacturers.
//
// A build is { slot: partId }. Gunsmith.compile(id, build) turns it into an effective weapon def
// (stats changed by the parts) that the rest of the game uses exactly like the old weapon defs.
// Builds travel over the network as short codes ("m4/1a.2f.7..."), part indices in base 36.
//
// Part stats are deltas: ergo (points), recoil / acc / hip / reload / rpm / spin / vel (%),
// weight (kg). Absolutes in `set`: cap (rounds), zoom (ADS FOV multiplier), barrelIn (inches, for the
// gunshot synth), device (muzzle device, ditto), sup (suppressed).
// ---------------------------------------------------------------------------
/** The kind of a slot on a weapon platform (a part's own slot is always one of these). */
type SlotKind = 'receiver' | 'slide' | 'barrel' | 'limbs' | 'muzzle' | 'handguard' | 'railmount' | 'pump' | 'fg' | 'tac' | 'optic' | 'magnifier' | 'charging' | 'grip' | 'stock' | 'mag' | 'tube' | 'loader' | 'cap' | 'motor';

/** A slot's name: its kind, an adapter's slot (buttstock, riserdot, the left tactical rail), or one of those again, numbered, where adapters nest. */
type SlotName = SlotKind | 'buttstock' | 'riserdot' | 'tacL' | `${SlotKind | 'buttstock' | 'riserdot' | 'tacL'}${number}`;

/** What a part sets outright (absolutes, where its st are deltas). */
interface PartSet {
  cap?: number; zoom?: number; scoped?: boolean; reticle?: string; magnif?: any; levels?: number[] | null; fp?: string; barrelIn?: number; barrelAdd?: number; device?: string; sup?: boolean; can?: string;
  ported?: boolean; shell?: number; reload?: number; magnifier?: number; full?: boolean; perLoad?: number; laser?: string; light?: number; calc?: number; ranger?: number;
}

/** What a part changes in the model spec (a patch: a nested spec only has the keys it changes). */
type PartModel = Omit<RecipeSpec<string | null>, 'mag' | 'hg' | 'pump'> & { mag?: Partial<MagSpec<string | null>>; hg?: Partial<HgSpec<string | null>>; pump?: Record<string, any>; pumpPatch?: Record<string, any> };
