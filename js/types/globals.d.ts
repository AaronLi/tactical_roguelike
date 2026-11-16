// What every file of the game shares. The game is ES modules (js/main.ts, which index.html loads, imports them all); each also
// puts what it makes on one global object, G (G.U, G.Level, G.Me...), for the console and the browser checks and for the files that read through it
// (docs/modules-plan.md). Each file declares what it adds (GameModules, below; interfaces merge
// across the scripts), and G has nothing else: a name no file declares is an error.

/** The game's namespace: each file's module, hung off one global. */
interface GameNamespace extends GameModules {}

/**
 * What each file puts on G, by name, as it's made. A file declares its own: `const G_Level = { ... }; G.Level = G_Level;`
 * and `interface GameModules { Level: typeof G_Level }` (interfaces merge across the scripts). A file that has become a module
 * (`export const Level = ...; G.Level = Level;`, tools/codemod_imports.mjs) says `declare global { interface GameModules { ... } }`.
 */
interface GameModules {}

interface Window {
  G: GameNamespace;
  /** three.js r186, its ES module build from the CDN, put here by js/threeboot.ts (the page, and js/exportworker.ts), typed by @types/three 0.186.0. */
  THREE: typeof import('three');
  /** The gunshot synthesiser (js/gunshot-synth.ts), on window so the export worker's copy finds it too. */
  GunshotSynth: any;
  /** Old Safari's names for the audio contexts. */
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
}

/**
 * Object.values / entries of something untyped (`any`) give `any`, as everything else does with `any`, not `unknown`
 * (the library's own overloads infer unknown from it). A typed object still gives its own value type.
 * (`0 extends 1 & O`: true only when O is any.)
 */
interface ObjectConstructor {
  values<O>(o: O): 0 extends 1 & O ? any[] : O extends ArrayLike<infer T> ? T[] : O extends { [k: string]: infer T } ? T[] : unknown[];
  entries<O>(o: O): 0 extends 1 & O ? [string, any][] : O extends ArrayLike<infer T> ? [string, T][] : O extends { [k: string]: infer T } ? [string, T][] : [string, unknown][];
}

/** Chrome's heap figures (js/profiler.ts): not in the standard. */
interface Performance {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
}

declare var G: GameNamespace;
// (THREE itself, value and types: js/types/three-global.d.ts)
/** PeerJS, from the CDN (index.html). */
declare var Peer: any;
