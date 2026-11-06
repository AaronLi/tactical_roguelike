// THREE as a global, value and types, for the game's scripts (js/threeboot.ts puts it there). @types/three said this itself
// up to r149's types; it no longer does.
export * from 'three';
export as namespace THREE;
