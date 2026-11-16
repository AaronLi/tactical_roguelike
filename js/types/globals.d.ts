// What every file of the game shares: the globals the page makes (THREE, PeerJS, the gunshot synthesiser) and the standard types the game widens.
// The files reach each other by import (docs/modules-plan.md); the console's object G is built by js/debugglobals.ts.

interface Window {
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

// (THREE itself, value and types: js/types/three-global.d.ts)
/** PeerJS, from the CDN (index.html). */
declare var Peer: any;
