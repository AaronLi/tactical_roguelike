// What every file of the game shares. The game is plain scripts (no import/export: each js/*.ts compiles to a
// dist/js/*.js that index.html loads with a <script> tag, in order), so everything a file makes for the others goes on
// one global object, G (G.U, G.Level, G.Me...). Each file declares what it adds (GameModules, below; interfaces merge
// across the scripts), and G has nothing else: a name no file declares is an error.

/** The game's namespace: each file's module, hung off one global. */
interface GameNamespace extends GameModules {}

/**
 * What each file puts on G, by name, as it's made. A file declares its own: `const G_Level = { ... }; G.Level = G_Level;`
 * and `interface GameModules { Level: typeof G_Level }` (interfaces merge across the scripts).
 */
interface GameModules {}

interface Window {
  G: GameNamespace;
  /** three.js r149, from the CDN (index.html, js/exportworker.ts). Untyped: @types/three for r149 isn't installed. */
  THREE: any;
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
declare var THREE: any;
/** PeerJS, from the CDN (index.html). */
declare var Peer: any;
