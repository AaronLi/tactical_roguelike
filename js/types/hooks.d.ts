// Types of G.Hooks (made in js/util.ts, so every file has it): what the simulation (the files the server's thread loads,
// the ones js/serverhost.ts and js/prepentry.ts reach) may ask of the page. A simulation file never names a
// page-only module (G.Audio, G.HUD, G.Me, G.Game...): it calls a hook, and the page file that owns the thing sets the hook
// as it loads (G.Hooks.click = ... in js/audio.ts). The server's thread loads none of those files, so there each hook
// stays unset; a call that was guarded before (G.Audio && ...) is guarded by the hook being set, and one that wasn't
// (G.HUD.toast(...)) still throws there, as it did. (docs/modules-plan.md phase 3; tools/deps.mjs --check enforces it.)
interface SimHooks {
  // --- js/arsenal.ts (the sidearm tree's progress)
  /** a gun's stat went up: the primary tree's challenges are the same kills, and a gun's attachments are earned with it (js/loadout.ts) */
  gunStat?: (id: string, stat: string) => void;
  /** a toast on the screen (js/hud.ts) */
  toast?: (title: string, text: string, sec?: number) => void;
  /** a line in the feed (js/hud.ts) */
  feed?: (html: string) => void;
  /** the UI's click sound, if it has one (js/audio.ts) */
  click?: () => void;
  /** what the screen shows of an enemy, by its id: ev.mine is what your rounds did to it (js/views.ts) */
  enemyView?: (id: number) => any;
  // --- js/damage.ts (what a hole or a fallen door does on the screen)
  /** a piece of wall shot away, as debris, if it's the level on the screen (js/game.ts, js/render.ts) */
  biteDebris?: (map: unknown, rec: { a: number[]; u: number[]; m: string; J: number }, n: number[]) => void;
  /** a door falls: the sound of it at the door (js/audio.ts) */
  doorFallSound?: (d: { x: number; z: number; fy?: number }) => void;
  /** a fallen door lands: the thump, by its distance from the camera (js/audio.ts) */
  doorKick?: (piv: THREE.Object3D) => void;
  /** a fallen door lands: the dust it raises (t: seconds into its fall; js/render.ts) */
  doorDust?: (t: number, x: number, y: number, z: number) => void;
  // --- js/data.ts
  /** a gun's model's own figures (js/glb.ts infoOf), once the model's platform index is loaded; null until then */
  modelInfo?: (def: Record<string, any>) => any;
  // --- js/gear.ts
  /** your own gun as built, when there's a you (js/player.ts); without it the gun's made as the simulation makes it */
  makeWeapon?: (id: string, build: any) => GWeapon;
  /** in a level, not the hangar (js/game.ts) */
  inField?: () => boolean;
  // --- js/level.ts
  /** the hangar's own fittings, added to its map (js/hangar.ts) */
  hangarDecorate?: (map: any) => void;
  // --- js/scars.ts
  /** how lit the point a puff of dust is at (js/render.ts partLight) */
  partLight?: (p: THREE.Vector3) => number;
  // --- js/stickers.ts
  /** your sticker collection, name -> how many (js/player.ts) */
  myStickers?: () => Record<string, number>;
  /** whether you're in a game with a host to talk to (js/net.ts) */
  online?: () => boolean;
  /** say something to the host (js/net.ts) */
  toHost?: (m: Record<string, unknown>) => void;
}
