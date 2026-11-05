// Public engine API (no DOM): import this from a game or a build script to bake sounds.
export * from './params.js';
export { MATERIALS, materialById, type Material } from './materials.js';
export { PRESETS, type Preset } from './presets.js';
export { render, type RenderResult, type RenderInfo } from './render.js';
export { encodeWav } from './wav.js';
export { renderScene, type Scene, type SceneTrack, type SceneElement, type RenderedScene } from './scene.js';
export { SCENES, RECON_CS6, RECON_CS6_DRY } from './scenes/recon-cs6.js';
