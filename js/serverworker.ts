'use strict';
// The host's simulation in a thread of its own (docs/threads.md): js/serverlink.ts starts it on the page, as a classic worker,
// and hands it its control port ({k:'boot', ctl}); js/serverhost.ts does the rest. It loads only what the simulation works
// with (the data, the guns' and gear's rules, the level as it's built and walked and seen through, the medical and the shop's
// reckonings), and nothing that draws or plays: no renderer, no rigs, no views, no sound, no DOM. three.js comes too, for its
// maths (holes and blasts and arcs are worked out in its vectors; a few files reach for it as they load), as the page has it
// (js/threeboot.ts). The level itself is made without it: its description, js/leveldesc.ts, and the world from that (docs/level-data.md).
(self as any).window = self;
// (what a file reaches for while it loads or builds a level: none of it is drawn here)
(self as any).document = { createElement: (t: string) => (t === 'canvas' ? new OffscreenCanvas(1, 1) : { style: {} }), body: { prepend() {}, append() {}, appendChild() {} }, addEventListener() {} };
// (the scripts, in the page's order: index.html)
const SERVER_SCRIPTS = ['util', 'data', 'callsigns', 'arsenal', 'parts', 'gear', 'medical', 'sim', 'materials', 'ballistics', 'level', 'leveldesc', 'world', 'furnspec', 'furniture', 'homes', 'residents',
  'scars', 'damage', 'stickers', 'route', 'shop', 'recorder', 'server', 'serverhost'];
const svBooted = import('./threeboot.js').then(() => {
  importScripts(...SERVER_SCRIPTS.map((f) => f + '.js'));
});

self.onmessage = async (e: MessageEvent) => {
  if (!e.data || e.data.k !== 'boot' || !e.data.ctl) return;
  try { await svBooted; } catch (err: any) { self.postMessage({ k: 'err', err: 'loading the server thread: ' + String((err && err.stack) || err).slice(0, 2000) }); return; }
  G.ServerHost.attach(e.data.ctl as MessagePort);
};
