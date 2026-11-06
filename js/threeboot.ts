// three.js, before the game: the one ES module the page loads (index.html, first of the deferred scripts; and the highlights'
// export worker, js/exportworker.ts, imports it before its importScripts). three has had no classic build since r160, but the
// game is classic scripts on the global THREE (js/types/globals.d.ts), so this loads three's module build and hangs it there,
// with the two glTF add-ons the baked guns need (js/glb.ts: the GLTFLoader and the meshopt decoder), before any of them runs.
// (Deferred scripts and module scripts run in the order they're written, each when the document's parsed and it has
// downloaded, a module only once everything it imports has: so the game's scripts, all `defer` after this one, find THREE.)
//
// The version is pinned here and in package.json (three and @types/three, for the node tools and the types: keep them the
// same). jsDelivr's `+esm` builds: three's own files, with the add-ons' `import ... from 'three'` pointed at this same
// three@<version>/+esm, so the page and the add-ons share ONE copy of three (two copies break instanceof) with no import map,
// which a worker can't have.
import * as THREE_NS from 'https://cdn.jsdelivr.net/npm/three@0.186.1/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/loaders/GLTFLoader.js/+esm';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/meshopt_decoder.module.js/+esm';

// (a plain object, not the module's namespace, which can't be changed: js/util.ts swaps a class or two on it, and tools patch
// it the same way)
(globalThis as any).THREE = Object.assign({}, THREE_NS);
(globalThis as any).ThreeAddons = { GLTFLoader, MeshoptDecoder };
