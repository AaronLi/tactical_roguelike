'use strict';
// The highlights video, made off the main thread (js/highlights.js renderPack starts it, from the main menu, with a
// recording the hangar's TVs saved; exportHere does the work): the game's own code loaded here as it is on the page,
// with its own renderer on an OffscreenCanvas. What it draws on goes through document.createElement('canvas'), which here gives an
// OffscreenCanvas; nothing else of the page is used.
self.window = self;
self.document = {
  createElement: (t) => (t === 'canvas' ? new OffscreenCanvas(1, 1) : { style: {} }),
  body: { prepend() {}, append() {}, appendChild() {} },
  addEventListener() {},
};
importScripts('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js');
importScripts(...['util', 'data', 'callsigns', 'parts', 'gear', 'medical', 'materials', 'ballistics', 'damage', 'level', 'world', 'furniture', 'homes', 'lightgrid', 'render',
  'stickers', 'gunmodels', 'vmanim', 'headgear', 'rig', 'scars', 'highlights'].map((f) => f + '.js'));
// (the game the replay borrows from: the map the bodies fall on, and nobody's id)
G.Game = { map: null, phase: 'level' };
G.Net = { myId: '' };
G.Stickers.base = '../'; // (the game's folder, from here: its pictures, js/stickers.js; a replay's file brings its own)

self.onmessage = async (e) => {
  if (e.data && e.data.t === 'mux') { try { G.Highlights.muxHere(e.data, (m) => self.postMessage(m)); } catch (err) { self.postMessage({ t: 'err', err: String((err && err.stack) || err).slice(0, 2000) }); } return; }
  if (!e.data || e.data.t !== 'go') return;
  try { await G.Highlights.exportHere(e.data, (m, tr) => self.postMessage(m, tr || [])); }
  catch (err) { self.postMessage({ t: 'err', err: String((err && err.stack) || err).slice(0, 2000) }); }
};
