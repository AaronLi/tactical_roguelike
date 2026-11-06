'use strict';
// The highlights video, made off the main thread (js/highlights.ts renderPack starts it, from the main menu, with a
// recording the hangar's TVs saved; exportHere does the work): the game's own code loaded here as it is on the page,
// with its own renderer on an OffscreenCanvas. What it draws on goes through document.createElement('canvas'), which here gives an
// OffscreenCanvas; nothing else of the page is used.
(self as any).window = self;
(self as any).document = {
  createElement: (t: string) => (t === 'canvas' ? new OffscreenCanvas(1, 1) : { style: {} }),
  body: { prepend() {}, append() {}, appendChild() {} },
  addEventListener() {},
};
// three as the page has it (js/threeboot.ts: its module build, with the glTF loader, on the global THREE): a module, so it's
// imported (a classic worker can), and the game's own scripts, classic as on the page, after it
const booted = import('./threeboot.js').then(() => {
  importScripts(...['util', 'data', 'callsigns', 'parts', 'gear', 'medical', 'sim', 'materials', 'ballistics', 'damage', 'level', 'world', 'furnspec', 'furniture', 'homes', 'residents', 'furnmesh', 'lightgrid', 'render',
    'stickers', 'gunmaterials', 'gunmodels', 'modelbundles', 'glb', 'gunrig', 'viewmodel', 'vmanim', 'headgear', 'rig', 'scars', 'highlights'].map((f) => f + '.js'));
  // (the game the replay borrows from: the map the bodies fall on, and nobody's id)
  (G as any).Game = { map: null, phase: 'level' };
  (G as any).Net = { myId: '' };
  G.Models.setRoot('../../'); // (the game's folder, from here: assets/models, where the guns are)
  G.Stickers.base = '../../'; // (the game's folder, from here (dist/js/): its pictures, js/stickers.ts; a replay's file brings its own)
});

self.onmessage = async (e) => {
  try { await booted; } catch (err: any) { self.postMessage({ t: 'err', err: 'loading three.js: ' + String((err && err.stack) || err).slice(0, 2000) }); return; }
  if (e.data && e.data.t === 'mux') { try { G.Highlights.muxHere(e.data, (m: any) => self.postMessage(m)); } catch (err: any) { self.postMessage({ t: 'err', err: String((err && err.stack) || err).slice(0, 2000) }); } return; }
  if (!e.data || e.data.t !== 'go') return;
  try { await G.Highlights.exportHere(e.data, (m: any, tr?: any) => self.postMessage(m, tr || [])); }
  catch (err: any) { self.postMessage({ t: 'err', err: String((err && err.stack) || err).slice(0, 2000) }); }
};
