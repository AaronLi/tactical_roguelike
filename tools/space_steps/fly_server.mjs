// Her flight on the server (docs/space-server.md C2): the scripted flight of fly_fp.mjs, the pilot's page sending its steps (sin) and
// predicting; the server's flight (js/svbattle.ts flyOn) beside the page's at each mark, and how the page's predictions fared against
// the server's word (acks, the last and largest error, corrections); once, a prediction falsified by a metre, to see the server's word
// taken and the steps since flown again (to the same place: the error after it 0 again).
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/fly_server.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); return JSON.stringify({ seat: Sp.mySeat() && Sp.mySeat().k, ctl: Sp.isCtl() }); })()`));
  for (let k = 0; k < 40 && !(await ev('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()')); k++) await sleep(500);
  await sleep(1000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, M = G.Me, n0 = Sp.SIM.steps; window.__fly = [];
    const plan = [[0, ['KeyW']], [120, ['KeyW', 'KeyD']], [240, ['KeyQ', 'Space'], 0.6, -0.4], [360, ['KeyX']], [480, ['KeyS', 'KeyC'], -0.3, 0.2], [600, []], [720, null]];
    let i = 0; const next = () => { const p = plan[i]; window.__fly.push({ n: Sp.SIM.steps - n0, s: Sp.SIM.steps, P: S.P.toArray().map(v => +v.toFixed(2)) }); if (!p[1]) { window.__flyDone = 1; return; }
      for (const k of Object.keys(M.keys)) M.keys[k] = false; for (const k of p[1]) M.keys[k] = true; if (p[2] != null) S.stick.set(p[2], p[3]); i++; Sp.SIM.hook = { n: n0 + plan[i][0], f: next }; };
    Sp.SIM.hook = { n: n0 + 1, f: () => { i = 0; next(); } }; return 'from ' + n0; })()`));
  for (let k = 0; k < 30 && !(await ev('!!window.__flyDone')); k++) {
    await sleep(1000);
    if (k === 4) log('a prediction falsified (the server word on it should be taken, the steps since flown again to the same place): ' + await ev(`(() => { const h = G.Space.C2().hist; if (!h.length) return 'none waiting'; h[h.length - 1].post.P.x += 1; return 'step ' + h[h.length - 1].s; })()`));
    log(await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, c = G.Space.C2(); return JSON.stringify({ step: G.Space.SIM.steps, page: G.Space.S.P.toArray().map(v => +v.toFixed(2)), server: w.fly, acks: c.acks, err: +c.err.toFixed(5), errMax: +c.errMax.toFixed(5), fixes: c.fixes, hist: c.hist.length }); })()`));
  }
};
