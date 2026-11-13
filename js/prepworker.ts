'use strict';
// A level got ready ahead, off the main thread (js/prep.ts starts this, a classic worker): the level laid out from its figures
// here as it is on the page (js/level.ts generate: the same level, as on the host), and the slow part of putting it on screen
// worked out, its light grid's sums (js/lightgrid.ts compute). Nothing's drawn here. What goes back is plain arrays, handed
// over (not copied).
(self as any).window = self;
(self as any).document = { createElement: (t: string) => (t === 'canvas' ? new OffscreenCanvas(1, 1) : { style: {} }), body: { prepend() {}, append() {}, appendChild() {} }, addEventListener() {} };
const prepBooted = import('./threeboot.js').then(() => {
  importScripts(...['util', 'data', 'spacedata', 'shipgen', 'callsigns', 'arsenal', 'parts', 'gear', 'medical', 'sim', 'materials', 'ballistics', 'level', 'leveldesc', 'world', 'furnspec', 'furniture', 'homes', 'residents', 'furnmesh', 'lightgrid'].map((f) => f + '.js'));
});
self.onmessage = async (e) => {
  const m = e.data; if (!m || m.t !== 'prep') return;
  try {
    await prepBooted;
    Object.assign(G.LightGrid.opts, m.opts || {});
    const map = G.Level.generate(m.seed, m.level, m.th, !!m.night, m.gen || null), d = G.LightGrid.compute(map);
    const tr: ArrayBuffer[] = [d.cur.buffer as ArrayBuffer]; for (const ly of d.layers) if (ly) tr.push(ly.at.buffer as ArrayBuffer, ly.v.buffer as ArrayBuffer);
    (self as any).postMessage({ t: 'prep', key: m.key, d }, tr);
  } catch (err: any) { (self as any).postMessage({ t: 'prep', key: m.key, err: String((err && err.stack) || err).slice(0, 1000) }); }
};
