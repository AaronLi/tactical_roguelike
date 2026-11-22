// Her flight's fingerprint (docs/space-server.md C2): sat at the helm, a scripted input (keys and the stick) set at fixed steps, her
// pose and way logged at each (the zone's clock held at a set time from the start: not kept to the server's, which runs on its own); two runs (or a run before and after a change to the flight) compared line by line.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/fly_fp.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); return JSON.stringify({ seat: Sp.mySeat() && Sp.mySeat().k, ctl: Sp.isCtl(), docked: S.docked }); })()`));
  for (let k = 0; k < 40 && !(await ev('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()')); k++) await sleep(500);
  await sleep(1000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, M = G.Me, n0 = Sp.SIM.steps; window.__fly = [];
    const plan = [[0, ['KeyW']], [120, ['KeyW', 'KeyD']], [240, ['KeyQ', 'Space'], 0.6, -0.4], [360, ['KeyX']], [480, ['KeyS', 'KeyC'], -0.3, 0.2], [600, []], [720, null]];
    const r = (v) => v.toFixed(4), fp = () => [S.P.x, S.P.y, S.P.z, S.Q.x, S.Q.y, S.Q.z, S.Q.w, S.V.x, S.V.y, S.V.z].map(r).join(',');
    let i = 0; const next = () => { const p = plan[i]; window.__fly.push((Sp.SIM.steps - n0) + ' ' + fp() + (S.ftl || S.auto || S.warp || S.brLock || S.brRound ? ' [' + [S.ftl && 'ftl', S.auto && 'auto', S.warp && 'warp', S.brLock && 'brLock', S.brRound && 'brRound'].filter(Boolean).join(' ') + ']' : '')); if (!p[1]) { window.__flyDone = 1; return; }
      for (const k of Object.keys(M.keys)) M.keys[k] = false; for (const k of p[1]) M.keys[k] = true; if (p[2] != null) S.stick.set(p[2], p[3]); i++; Sp.SIM.hook = { n: n0 + plan[i][0], f: next }; };
    Sp.svb().ztSync = false; Sp.SIM.hook = { n: n0 + 1, f: () => { S.zt0 = 1000; S.ztAt = S.t; S.P.set(300, 130, 1700); S.Q.set(-0.0396, 0.0752, 0.0029, 0.9964).normalize(); S.V.set(0, 0, -40); S.Wv.set(0, 0, 0); S.stick.set(0, 0); S.spin = 0; i = 0; next(); } }; return 'from ' + n0; })()`));
  for (let k = 0; k < 60 && !(await ev('!!window.__flyDone')); k++) await sleep(500);
  for (const l of await ev('window.__fly')) log('FLY ' + l);
};
