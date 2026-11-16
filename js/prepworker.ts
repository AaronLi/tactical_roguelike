'use strict';
// A level got ready ahead, off the main thread (js/prep.ts starts this, a module worker): the level laid out from its figures
// here as it is on the page (js/level.ts generate: the same level, as on the host), and the slow part of putting it on screen
// worked out, its light grid's sums (js/lightgrid.ts compute). Nothing's drawn here. What goes back is the sums, plain arrays
// handed over (not copied), and the level itself (copied: taken by js/space.ts for a ship seen from outside, then the level).
(self as any).window = self;
(self as any).document = { createElement: (t: string) => (t === 'canvas' ? new OffscreenCanvas(1, 1) : { style: {} }), body: { prepend() {}, append() {}, appendChild() {} }, addEventListener() {} };
// (the files it works with are what js/prepentry.ts imports: the entry file. Imported here, after the globals above are set and three.js
// is there, not at the top of this file: a static import would run first)
// (what it works with is what the entry's imports ran: each file is one module, so import('./level.js') is the one that ran, its exports)
const prepBooted = import('./threeboot.js').then(() => import('./prepentry.js')).then(() => Promise.all([import('./level.js'), import('./lightgrid.js')]));
self.onmessage = async (e) => {
  const m = e.data; if (!m || m.t !== 'prep') return;
  try {
    const [{ Level }, { LightGrid }] = await prepBooted;
    Object.assign(LightGrid.opts, m.opts || {});
    const map = Level.generate(m.seed, m.level, m.th, !!m.night, m.gen || null);
    (self as any).postMessage({ t: 'prep', key: m.key, map }); // (first, as it is: before anything's worked out from it)
    const d = LightGrid.compute(map);
    const tr: ArrayBuffer[] = [d.cur.buffer as ArrayBuffer]; for (const ly of d.layers) if (ly) tr.push(ly.at.buffer as ArrayBuffer, ly.v.buffer as ArrayBuffer);
    (self as any).postMessage({ t: 'prep', key: m.key, d }, tr);
  } catch (err: any) { (self as any).postMessage({ t: 'prep', key: m.key, err: String((err && err.stack) || err).slice(0, 1000) }); }
};
