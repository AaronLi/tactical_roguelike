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
// imported, and the game's own files after it: js/exportentry.ts is the entry file, and its imports are the rest (imported here, after the globals
// above are set and three.js is there, not at the top of this file: a static import would run first)
const booted = import('./threeboot.js').then(async () => {
  await import('./exportentry.js');
  // (each of these is the module that ran above, its exports)
  const [{ Hooks }, { Models }, { Stickers }, { Highlights }, { ReplayEnv }] = await Promise.all([import('./util.js'), import('./glb.js'), import('./stickers.js'), import('./highlights.js'), import('./replayenv.js')]);
  // (the game the replay borrows from: the map the bodies fall on, and nobody's id)
  // (on ReplayEnv, where highlights, render, rig, vmanim and levelview read them: js/replayenv.ts; the rest of its fields stay null here, as G.Audio ... were unset)
  ReplayEnv.Game = { map: null, phase: 'level' } as any;
  ReplayEnv.Net = { myId: '' } as any;
  // (what those stand-ins answered the simulation's files before they asked through Hooks, js/types/hooks.d.ts: in a level,
  // and no map of this replay is the game's, so a wall's bite is no debris; online stays unset: no host)
  Hooks.inField = () => true;
  Hooks.biteDebris = () => {};
  Models.setRoot('../../'); // (the game's folder, from here: assets/models, where the guns are)
  Stickers.base = '../../'; // (the game's folder, from here (dist/js/): its pictures, js/stickers.ts; a replay's file brings its own)
  return Highlights;
});

self.onmessage = async (e) => {
  let Highlights: Awaited<typeof booted>;
  try { Highlights = await booted; } catch (err: any) { self.postMessage({ t: 'err', err: 'loading three.js: ' + String((err && err.stack) || err).slice(0, 2000) }); return; }
  if (e.data && e.data.t === 'mux') { try { Highlights.muxHere(e.data, (m: any) => self.postMessage(m)); } catch (err: any) { self.postMessage({ t: 'err', err: String((err && err.stack) || err).slice(0, 2000) }); } return; }
  if (!e.data || e.data.t !== 'go') return;
  try { await Highlights.exportHere(e.data, (m: any, tr?: any) => self.postMessage(m, tr || [])); }
  catch (err: any) { self.postMessage({ t: 'err', err: String((err && err.stack) || err).slice(0, 2000) }); }
};
