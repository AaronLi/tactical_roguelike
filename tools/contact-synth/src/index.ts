// Public engine API (no DOM): import this from a game or a build script to bake sounds.
export * from './params.js';
export { MATERIALS, materialById, type Material } from './materials.js';
export { PRESETS, type Preset } from './presets.js';
export { render, type RenderResult, type RenderInfo } from './render.js';
export { encodeWav } from './wav.js';
export { simulateBoxDrop, classify as classifyBoxPart, axisAngle, quatMul, quatMatrix, boxSurfaces, type BoxDrop, type BoxDropResult, type BoxContact, type BoxPart, type Surface, type PoseSample } from './rigid.js';
export { renderScene, chainScenes, type Scene, type SceneTrack, type SceneElement, type RenderedScene } from './scene.js';
export {
  SCENES, RECON_CS6, RECON_CS6_DRY, PUMP_SHOTGUN,
  AR15_CHARGE, AR15_CHARGE_EMPTY, AR15_CHARGE_NO_MAG, AR15_BOLT_RELEASE, AR15_BOLT_RELEASE_EMPTY, AR15_BOLT_RELEASE_NO_MAG,
  AR15_MAG_IN, AR15_MAG_IN_EMPTY, AR15_MAG_OUT, AR15_MAG_OUT_EMPTY, AR15_LOAD_RACK_UNLOAD, AR15_MAG_IN_OUT, AR15_MAG_DROPS, MORE_MAG_DROPS, MAG_TYPES, magDrops, type MagType, arChargeScene, magDropScene, magDropSpec, type MagDropOptions,
  MORE_GUN_SCENES, chargeScene, type ChargeTiming,
  GUN_SPECS, gunScenes, derive, magTypeOf, chargeFromSpec, releaseFromSpec, magFromSpec, boltActionScene, roundInScene, SPEC_SCENES, type GunSpec,
  NO_FAMILY_SCENES, revolverOpen, revolverClose, revolverLoader, breakOpen, breakClose, breakLoad, beltOut, beltIn, enblocIn,
  SOLES, FLOORS, GAITS, STRIKE, deriveStep, stepScene, walkScene, kitElements, FOOTSTEP_SCENES, type SoleSpec, type FloorSpec, type GaitSpec, type StepSpec, type KitId,
} from './scenes/index.js';
