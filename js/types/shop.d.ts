// Types js/shop.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/shop.ts.

type ShopStock = Record<string, number>;

// this visit's shelves (genOffers): gear ids, weapon ids by slot, special ammo, pouches and magazines, and the plate / face shield each carrier / helmet comes with
interface ShopOffers { p: string[]; s: string[]; gear: string[]; ammo: ShopAmmo[]; pouches: { id: string; n: number }[]; mags: { id: string; n: number }[]; plates?: Record<string, string>; faces?: Record<string, string>; nvg?: string[]; njParts?: string[]; }

// Vex the quartermaster: between-level shop. A small rotating stock (a carrier or rig, two plates, a helmet, a
// belt and three weapon parts), seeded so the whole squad sees the same shelves. What you buy goes on you if
// there's a slot or pouch for it, otherwise into your locker; the Kit tab (js/invui.ts) is where you sort it.
// The stock is the squad's, shared: each thing he lists, as many of it as there are of you (baseStock), counted by
// the host (js/server.ts take/give). Buying asks the host for one first (take); you pay once it's yours, and if you
// can't (no room by then, say) it goes back on the shelf. Guns and the machines' supplies don't run out.
// a box of special rounds on the shelf: caliber, load, how many
interface ShopAmmo { cal: string; am: string; n: number; }
