// Public engine API (no DOM): import this from a game or a build script to bake sounds.
export * from './params.js';
export { MATERIALS, materialById } from './materials.js';
export { PRESETS } from './presets.js';
export { render } from './render.js';
export { encodeWav } from './wav.js';
export { simulateBoxDrop, classify as classifyBoxPart, axisAngle, quatMul, quatMatrix, boxSurfaces } from './rigid.js';
export { renderScene, chainScenes } from './scene.js';
export { SCENES, RECON_CS6, RECON_CS6_DRY, PUMP_SHOTGUN, AR15_CHARGE, AR15_CHARGE_EMPTY, AR15_CHARGE_NO_MAG, AR15_BOLT_RELEASE, AR15_BOLT_RELEASE_EMPTY, AR15_BOLT_RELEASE_NO_MAG, AR15_MAG_IN, AR15_MAG_IN_EMPTY, AR15_MAG_OUT, AR15_MAG_OUT_EMPTY, AR15_LOAD_RACK_UNLOAD, AR15_MAG_IN_OUT, AR15_MAG_DROPS, MORE_MAG_DROPS, MAG_TYPES, magDrops, arChargeScene, magDropScene, magDropSpec, MORE_GUN_SCENES, chargeScene, GUN_SPECS, gunScenes, derive, magTypeOf, chargeFromSpec, releaseFromSpec, magFromSpec, boltActionScene, roundInScene, SPEC_SCENES, SOLES, FLOORS, GAITS, STRIKE, deriveStep, stepScene, walkScene, kitElements, FOOTSTEP_SCENES, } from './scenes/index.js';
//# sourceMappingURL=index.js.map