// Public engine API (no DOM): import this from a game or a build script to bake sounds.
export * from './params.js';
export { MATERIALS, materialById, type Material } from './materials.js';
export { PRESETS, type Preset } from './presets.js';
export { render, type RenderResult, type RenderInfo } from './render.js';
export { encodeWav } from './wav.js';
export { renderScene, type Scene, type SceneTrack, type SceneElement, type RenderedScene } from './scene.js';
export {
  SCENES, RECON_CS6, RECON_CS6_DRY, PUMP_SHOTGUN,
  AR15_CHARGE, AR15_CHARGE_EMPTY, AR15_CHARGE_NO_MAG, AR15_BOLT_RELEASE, AR15_BOLT_RELEASE_EMPTY, AR15_BOLT_RELEASE_NO_MAG,
} from './scenes/index.js';
