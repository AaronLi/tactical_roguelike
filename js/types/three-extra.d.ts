// What three.js r149 (the game's, from the CDN) has that @types/three 0.149.0 leaves out: the colour-space constants
// (their types are there; their values, 'srgb' and 'srgb-linear', are in r149 too).
export {};
declare module 'three' {
  export const SRGBColorSpace: SRGBColorSpace;
  export const LinearSRGBColorSpace: LinearSRGBColorSpace;
}
