// Types js/gear.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/gear.ts.

type GDef = Record<string, any>; // a gun's definition (js/data.ts WEAPONS) or a gear definition (GearDef)

// a piece of gear's definition (LIST, DEFS): the fields that only some kinds have are optional
interface GearDef {
  id: string; kind: GearKind; brand: string; name: string; tier: number; price: number; speed: number; desc: string;
  off?: boolean; // (switched off: not offered anywhere, LIST leaves it out; DEFS still knows it)
  dur?: number; plate?: boolean; shoulder?: boolean; groin?: boolean; legs?: boolean; face?: boolean; thin?: boolean; col?: number;
  prot?: { at: string; layers: [string, number][] }[]; molle?: [number, number]; pouches?: [string, number, number][];
  kg?: number; fwd?: number; cut?: string; cover?: number; lower?: boolean; sz?: [number, number]; grids?: [number, number, string[] | null][];
  nvg?: boolean; nv?: NvSpec; lv?: number;
}

// night vision (kind 'nvg', on a helmet's shroud: d.nvg): what the tubes make of the view (js/render.ts nvPass). tubes: the
// image circles, each [left/right, up/down] of straight ahead and its radius (degrees); phos: the phosphor's colour (linear RGB);
// gain: the most it amplifies (the tube's generation); ir: how bright its IR illuminator is (switched on: Shift+N); grain: how
// much it scintillates in the dark; rest: how much of the plain view shows round the tubes (a monocular leaves the other
// eye's whole field; binoculars and panoramics block most of it); persist: the phosphor's afterglow (green P43 lingers
// longer than white P45); thermal: a thermal channel's outlines fused over it
interface NvSpec { tubes: [number, number, number][]; phos: [number, number, number]; gain: number; ir: number; grain: number; rest: number; persist?: number; thermal?: boolean; }

// a weapon as carried (Me.makeWeapon): its definition, the rounds in it and the state of its action; other files add the rest
interface GWeapon { def: WeaponDef; mag: number; ammo: string; tube: string[]; chamber?: string | null; fm?: string; sup?: unknown; noMag?: boolean; spent?: string[]; item?: GItem; stickers?: any[]; [field: string]: any; }

// An item: what k says it is decides which other fields it has. A magazine or a box: its gun (wid) or caliber (key), n rounds of
// type am, cap the most it holds (a magazine's rounds are r, bottom first); a medical item: mt, n; a part: pid; a pouch: pid, its
// grids; a gun: w; gear: gid, dur, grids, molle and what's fitted (plate, face, shoulder, groin, legs). The fields a kind doesn't have
// aren't there (the kind-specific ones are typed as present: check k first).
interface GItem {
  k: ItemKind; uid?: number;
  w: GWeapon; key: string; wid: string; cap: number; n: number; am: string; vid?: string | null; mt: string; pid: string; gid: string; dur: number;
  r: string[]; base?: string; grids?: GGrid[]; molle?: GGrid;
  plate?: GItem | null; face?: GItem | null; nvg?: GItem | null; dn?: boolean; shoulder?: GItem | null; groin?: GItem | null; legs?: GItem | null;
  tid?: number;
}

interface GCell { it: GItem; x: number; y: number; r: number; }

interface GGrid { id: number; w: number; h: number; accept: string[] | null; label: string; items: GCell[]; locker?: boolean; pack?: boolean; molle?: boolean; dump?: boolean; [field: string]: any; }

// what the quartermaster's gear is (the kinds of item that go on you), and every kind of item there is
type GearKind = 'carrier' | 'plate' | 'helmet' | 'face' | 'nvg' | 'shoulder' | 'groin' | 'legs' | 'belt' | 'pack' | 'ifak';

type ItemKind = 'gun' | 'mag' | 'ammo' | 'med' | 'frag' | 'flash' | 'tb' | 'sticky' | 'part' | 'pouch' | 'tube' | GearKind; // ('tube': a shotgun's magazine tube, drawn as an icon only)
