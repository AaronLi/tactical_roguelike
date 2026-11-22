// What the space battle sends, by stream, over a few seconds of a boarding zone with her scanners on and flying (docs/space-server.md
// Bandwidth): the fast channel's streams (1 her radars' picture, 4 the snapshot, 5 the pilot's acks; 2, 3 F8's while it's open), the
// reliable channel's sev, and what the pilot's page sends up (sin). Bytes a second and the largest of each.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/wire_sizes.mjs --port 8151   (F8=1: with F8 open on the mission ship)
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); Sp.ew().own.scans.forEach((s, k) => { s.mode = 'round'; }); ${process.env.F8 ? "G.Radar.show = 1; G.Radar.sel = 'hull';" : ''}
    const W = window.__w = { t0: 0, fast: {}, rel: {}, up: {} }, add = (o, k, b) => { const q = o[k] || (o[k] = { n: 0, b: 0, max: 0 }); q.n++; q.b += b; q.max = Math.max(q.max, b); };
    G.Net.onFast((buf, ch) => { if (W.t0) add(W.fast, 'ch' + ch, buf.byteLength); });
    const f0 = G.Net.onClient; G.Net.onClient = function (m) { if (W.t0 && m && m.t) add(W.rel, m.t, JSON.stringify(m).length); return f0.call(this, m); };
    const h0 = G.Net.toHost; G.Net.toHost = function (m) { if (W.t0 && m && m.t) add(W.up, m.t, JSON.stringify(m).length); return h0.call(this, m); };
    return 1; })()`);
  await sleep(6000); // (the picture fills: contacts, beliefs, tracks)
  await ev(`(() => { window.__w.t0 = performance.now(); G.Me.keys.KeyW = true; return 1; })()`);
  await sleep(8000);
  log(await ev(`(() => { const W = window.__w, s = (performance.now() - W.t0) / 1000, f = (o) => Object.fromEntries(Object.entries(o).map(([k, q]) => [k, { kbs: +(q.b / s / 1024).toFixed(2), hz: +(q.n / s).toFixed(1), max: q.max }])); return JSON.stringify({ secs: +s.toFixed(1), fast: f(W.fast), reliable: f(W.rel), up: f(W.up) }); })()`));
};
