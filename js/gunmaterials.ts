'use strict';
// The game's material catalogue (docs/models.md: the contract's material names): every gun model uses these shared materials by
// NAME, so a baked glTF only says 'brass' or 'stipple' and the game puts its own material there (G.GunMaterials.M.<name>()).
//   G.GunMaterials.M.<name>()        the shared material
//   G.GunMaterials.std(key, ...)     a MeshStandardMaterial, made once per key
//   G.GunMaterials.relief(kind, cell) the bump map of a stippled or chequered material (a canvas, rebuilt at load: not stored in a file)
const G_GunMaterials = (() => {
const T = THREE;
const cache: any = {};
const std = (key: string, color: number, roughness: number, metalness: number, extra?: any) =>
  cache[key] || (cache[key] = new T.MeshStandardMaterial(Object.assign({ color, roughness, metalness }, extra)));
// a relief map tiling every `cell` metres: diamonds (chequering) or scattered pits (stippling), on a part's flat faces
const relief = (kind: string, cell: number) => {
  const key = 'relief' + kind;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080'; g.fillRect(0, 0, 64, 64);
  if (kind === 'chq') {
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 7;
    g.beginPath(); for (const o of [-64, 0, 64]) { g.moveTo(o, 0); g.lineTo(o + 64, 64); g.moveTo(o + 64, 0); g.lineTo(o, 64); } g.stroke();
  } else for (let i = 0; i < 70; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.beginPath(); g.arc((i * 37) % 64, (i * 23 + (i * i) % 17) % 64, 2.6, 0, Math.PI * 2); g.fill(); }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / cell, 1 / cell);
  return (cache[key] = t);
};
const M = {
  black: () => std('black', 0x25272b, 0.45, 0.5),
  gunmetal: () => std('gunmetal', 0x41464d, 0.35, 0.7),
  steel: () => std('steel', 0xa7adb4, 0.25, 0.9),
  blued: () => std('blued', 0x252a32, 0.3, 0.75),
  park: () => std('park', 0x3b3b37, 0.7, 0.4),
  polymer: () => std('polymer', 0x2a2b2e, 0.85, 0.05),
  tan: () => std('tan', 0xa18d67, 0.8, 0.05),
  od: () => std('od', 0x4d5639, 0.8, 0.05),
  green: () => std('green', 0x414c35, 0.75, 0.1),
  wood: () => std('wood', 0x7c4b27, 0.6, 0),
  woodDark: () => std('woodDark', 0x4f2d18, 0.6, 0),
  plum: () => std('plum', 0x3a201d, 0.5, 0), // (bakelite: an AK-74's grip)
  woodRed: () => std('woodRed', 0x8b4023, 0.55, 0),
  brass: () => std('brass', 0xbb933d, 0.3, 0.9),
  rubber: () => std('rubber', 0x161616, 0.95, 0),
  stipple: () => std('stipple', 0x232326, 0.95, 0.02, { bumpMap: relief('stp', 0.006), bumpScale: 0.2 }), // (a polymer grip's texture)
  chequer: () => std('chequer', 0x1c1c1e, 0.8, 0.05, { bumpMap: relief('chq', 0.0028), bumpScale: 0.22 }),
  chequerWood: () => std('chequerWood', 0x5b3019, 0.55, 0, { bumpMap: relief('chq', 0.0024), bumpScale: 0.22 }),
  rust: () => std('rust', 0x6b4d37, 0.8, 0.35),
  tape: () => std('tape', 0x7e8357, 0.9, 0),
  clear: () => std('clear', 0x95aaa5, 0.2, 0, { transparent: true, opacity: 0.45 }),
  glass: () => std('glass', 0x204050, 0.05, 0.6, { transparent: true, opacity: 0.25, depthWrite: false }),
  tubeDS: () => std('tubeDS', 0x1d1f22, 0.45, 0.5, { side: T.DoubleSide }),
  lens: () => std('lens', 0x3a6a8a, 0.05, 0.8),
  germanium: () => std('germanium', 0x2c2836, 0.08, 0.95, { emissive: 0x0c0614 }), // a thermal sight's objective: dark grey, a purple sheen
  // reflex sight glass: the front element carries the dot's reflective coating (a faint blue-violet tint)
  // (barely there: you look straight through a 1x sight's glass; only the faintest tint and sheen)
  reflexLens: () => std('reflexLens', 0x8a94d8, 0.04, 0.6, { transparent: true, opacity: 0.05, depthWrite: false }),
  clearLens: () => std('clearLens', 0xb4c4cc, 0.04, 0.5, { transparent: true, opacity: 0.025, depthWrite: false }),
  dot: () => std('dot', 0xff3030, 1, 0, { emissive: 0xff2020, emissiveIntensity: 3 }),
  amber: () => std('amber', 0xffaa20, 1, 0, { emissive: 0xff9a10, emissiveIntensity: 2.5 }),
  glow: () => std('glow', 0x40d8ff, 0.4, 0, { emissive: 0x30c8ff, emissiveIntensity: 2 }),
  sightPaint: () => std('sightPaint', 0xf4f2ea, 0.6, 0, { emissive: 0x2a2a28 }), // white dots and outlines
  tritium: () => std('tritium', 0x7dff8a, 0.5, 0, { emissive: 0x3dff5a, emissiveIntensity: 2.2 }), // night sights
  fibre: () => std('fibre', 0x2fe05a, 0.35, 0, { emissive: 0x1fb040, emissiveIntensity: 0.9 }), // a fibre-optic sight insert: green, bright with the light it gathers (less than tritium's glow)
  redInsert: () => std('redInsert', 0xd8261c, 0.5, 0, { emissive: 0x5a0a06 }), // revolver ramp insert
  string: () => std('string', 0xd8d0b8, 0.9, 0),
  fabric: () => std('fabric', 0x2f352b, 0.95, 0),
  glove: () => std('glove', 0x1b1c1e, 0.9, 0),
};
// ALIAS: an anonymous one-off colour (the contract's `m_<rrggbb>`) a model uses that the game draws as a catalogue material. The authored
// models' meshes are drawn by name (byName: the catalogue's, else an alias's, else black), so an anonymous colour with no alias is black.
//   m_2fe05a: the 2011's front sight fibre (models/p2011: a green rod across the post's top) -> fibre
const ALIAS: Record<string, string> = { m_2fe05a: 'fibre' };
const byName = (name: string | null | undefined): THREE.Material => {
  const all = M as Record<string, () => THREE.Material>, f = name ? all[name] || all[ALIAS[name]] : null;
  return f ? f() : M.black();
};
return { M, std, relief, byName, ALIAS };
})();
G.GunMaterials = G_GunMaterials;
interface GameModules { GunMaterials: typeof G_GunMaterials; }
