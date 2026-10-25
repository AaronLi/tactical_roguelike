'use strict';
// The highlights video, made off the main thread (js/highlights.js exportVideo starts it, exportHere does the work): the
// game's own code loaded here as it is on the page, with its own renderer on an OffscreenCanvas, so making a video
// doesn't stop the game. What it draws on goes through document.createElement('canvas'), which here gives an
// OffscreenCanvas; nothing else of the page is used.
self.window = self;
self.document = {
  createElement: (t) => (t === 'canvas' ? new OffscreenCanvas(1, 1) : { style: {} }),
  body: { prepend() {}, append() {}, appendChild() {} },
  addEventListener() {},
};
importScripts('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js');
importScripts(...['util', 'data', 'callsigns', 'parts', 'gear', 'medical', 'ballistics', 'level', 'world', 'furniture', 'lightgrid', 'render',
  'gunmodels', 'vmanim', 'headgear', 'rig', 'highlights'].map((f) => f + '.js'));
// (the game the replay borrows from: the map the bodies fall on, and nobody's id)
G.Game = { map: null, phase: 'level' };
G.Net = { myId: '' };

self.onmessage = async (e) => {
  if (e.data && e.data.t === 'tick') { G.Highlights.credit(e.data.n); return; } // (the page's frames: how many it may render)
  if (e.data && e.data.t === 'mux') { try { G.Highlights.muxHere(e.data, (m) => self.postMessage(m)); } catch (err) { self.postMessage({ t: 'err', err: String((err && err.stack) || err).slice(0, 2000) }); } return; }
  if (!e.data || e.data.t !== 'go') return;
  try { await G.Highlights.exportHere(e.data, (m, tr) => self.postMessage(m, tr || [])); }
  catch (err) { self.postMessage({ t: 'err', err: String((err && err.stack) || err).slice(0, 2000) }); }
};
