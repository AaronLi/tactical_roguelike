// three.js, before the game: the first import of js/main.ts, the page's entry file (and the highlights'
// export worker, js/exportworker.ts, imports it before the game's files). three has had no classic build since r160, but the
// game is scripts that share the global THREE (js/types/globals.d.ts), so this loads three's module build and hangs it there,
// with the two glTF add-ons the baked guns need (js/glb.ts: the GLTFLoader and the meshopt decoder), before any of them runs.
// (A module runs once everything it imports has, and imports run in the order written, so the game's files, imported after this one, find THREE.)
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
