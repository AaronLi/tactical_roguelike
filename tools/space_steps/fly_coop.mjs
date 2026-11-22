// Her flight on the server with a second player aboard (docs/space-server.md C2): the host's page (the pilot, debug start with &host)
// and a second game in an iframe joined to it (PeerJS); the pilot flies a scripted throttle, and the second page should follow her as
// the server flies her (its snapshots' pose, SVB.spAt fresh), not the pilot's relayed word. Her place on each page and the server's.
//   node tools/space_shot.mjs "mute&board=small&seed=3&host" tools/space_steps/fly_coop.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  const wait = async (expr, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); } return false; };
  log('hosting: ' + await wait('!!(G.Net.code && G.Space.S.on && G.Space.S.kind === "board")', 60000) + ' ' + await ev('G.Net.code'));
  await ev(`(() => { const f = document.createElement('iframe'); f.id = 'peerB'; f.style.cssText = 'position:fixed;right:0;bottom:0;width:480px;height:270px;z-index:99999'; f.src = '/?mute'; document.body.appendChild(f); return 1; })()`);
  const B = `document.getElementById('peerB').contentWindow`;
  log('B up: ' + await wait(`!!(${B}.G && ${B}.G.Game && ${B}.document.getElementById("btnHost"))`, 120000));
  await ev(`(() => { const w = ${B}; w.G.Game.$('joinCode').value = G.Net.code; w.G.Game.join(); return 1; })()`);
  log('B aboard: ' + await wait(`!!(${B}.G.Space && ${B}.G.Space.S.on && ${B}.G.Space.S.kind === 'board')`, 120000) + ' ' + await ev(`JSON.stringify({ phase: ${B}.G.Game.phase, kind: ${B}.G.Space.S.kind, ctl: ${B}.G.Space.isCtl() })`));
  await wait('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()', 20000);
  await ev(`(() => { G.Space.dbgSit(0); G.Me.keys.KeyW = true; return 1; })()`);
  const fps = () => ev(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); })`);
  for (let i = 0; i < 8; i++) {
    await sleep(500); log('host fps ' + await fps());
    if (i === 4) await ev(`(() => { G.Me.keys.KeyW = false; G.Me.keys.KeyD = true; G.Space.S.stick.set(0.5, 0); return 1; })()`);
    log(await ev(`(async () => { const w = (await G.ServerLink.sworld()).w, b = ${B}.G.Space, r = (v) => v.toArray().map(x => +x.toFixed(1));
      return JSON.stringify({ pilot: r(G.Space.S.P), server: w.fly && w.fly.P, B: r(b.S.P), BfromServer: +(b.S.t - b.svb().spAt).toFixed(2), Bsvb: b.svb().on && !!b.svb().snap, gapB: +b.S.P.distanceTo(G.Space.S.P).toFixed(1), c2: G.Space.C2().acks + "/" + G.Space.C2().fixes, step: G.Space.SIM.steps, ack: w.fly && w.fly.ack, q: w.fly && w.fly.q, hist: G.Space.C2().hist.length, svHz: w.prof && w.prof.n }); })()`));
  }
};
