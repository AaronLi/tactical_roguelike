// The helm changing hands mid-flight, on the server (docs/space-server.md C3): the host flies (W held), gets up, and a second player
// (a game of its own in an iframe, joined through PeerJS) sits at the helm and flies on. The new pilot's steps are begun afresh on the
// server from her helm as it has it; the new pilot's page predicts from there (a correction or so as it takes over, then none). Each
// side's pilot, acks, corrections and states, and where each has her.
//   node tools/space_shot.mjs "mute&board=small&seed=3&host" tools/space_steps/handover_server.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  const wait = async (expr, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); } return false; };
  log('hosting: ' + await wait('!!(G.Net.code && G.Space.S.on && G.Space.S.kind === "board")', 60000));
  await ev(`(() => { const f = document.createElement('iframe'); f.id = 'peerB'; f.style.cssText = 'position:fixed;right:0;bottom:0;width:480px;height:270px;z-index:99999'; f.src = '/?mute'; document.body.appendChild(f); return 1; })()`);
  const B = `document.getElementById('peerB').contentWindow`;
  await wait(`!!(${B}.G && ${B}.G.Game && ${B}.document.getElementById("btnHost"))`, 120000);
  await ev(`(() => { const w = ${B}; w.G.Game.$('joinCode').value = G.Net.code; w.G.Game.join(); return 1; })()`);
  log('B aboard: ' + await wait(`!!(${B}.G.Space && ${B}.G.Space.S.on && ${B}.G.Space.S.kind === 'board')`, 120000));
  await wait('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()', 20000);
  await ev(`(() => { G.Space.dbgSit(0); G.Me.keys.KeyW = true; return 1; })()`);
  const st = async (tag) => log(tag + ' ' + await ev(`(async () => { const w = (await G.ServerLink.sworld()).w, a = G.Space, b = ${B}.G.Space, r = (v) => v.toArray().map(x => +x.toFixed(1)), c = (x) => { const k = x.C2(); return { on: k.on, acks: k.acks, fixes: k.fixes, states: k.states }; };
    return JSON.stringify({ ctl: { A: a.isCtl(), B: b.isCtl() }, A: c(a), B: c(b), server: w.fly && { on: w.fly.on, P: w.fly.P }, PA: r(a.S.P), PB: r(b.S.P) }); })()`));
  for (let i = 0; i < 4; i++) { await sleep(1500); await st('A flies'); }
  // the host gets up; the joined player takes the helm and flies on
  await ev(`(() => { G.Me.keys.KeyW = false; G.Me.seat = null; G.Net.toHost({ t: 'seat', s: -1 }); return 1; })()`);
  await ev(`(() => { const w = ${B}; w.G.Space.dbgSit(0); w.G.Me.keys.KeyW = true; return 1; })()`);
  for (let i = 0; i < 6; i++) { await sleep(1500); await st('B flies'); }
  log('B WHY ' + JSON.stringify(await ev(`${B}.G.Space.C2().why`)));
  log('B STATES ' + JSON.stringify(await ev(`${B}.G.Space.C2().whyS`)));
};
