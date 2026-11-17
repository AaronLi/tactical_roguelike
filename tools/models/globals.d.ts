// What the baker's recipe files (tools/models/*.ts, classic scripts that tools/model_env.mjs runs in the context next to the game's compiled files) share:
// the global G they put their own names on (G.GunTraces, G.Authored, G.AuthoredParts, G.GunRecipes) and read the game's from. The game has no G (docs/modules-plan.md
// phase 7: js/debugglobals.ts builds the page's console object, tools/vm_game.mjs the tools' contexts); this declares what the recipes use of it.
import type { GunMaterials } from '../../js/gunmaterials.js';
import type { Gunsmith } from '../../js/parts.js';
import type { Stickers } from '../../js/stickers.js';
import type { U } from '../../js/util.js';
import type { GUN_SPECS } from '../../js/data.js';

interface RecipeGlobals {
  GunMaterials: typeof GunMaterials; Gunsmith: typeof Gunsmith; Stickers: typeof Stickers; U: typeof U; GUN_SPECS: typeof GUN_SPECS;
  GunTraces: typeof G_GunTraces; Authored: typeof G_Authored; AuthoredParts: typeof G_AuthoredParts; GunRecipes: typeof G_GunRecipes;
}
declare global { var G: RecipeGlobals; }
