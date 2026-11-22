// The breach, flown (docs/space-server.md C3): from a set start 150 m out from a breach site, square to it, W held: the breach assist
// takes her in, she breaches, the autopilot lays her in the hole, she's docked. Her pose and the helm's modes logged every 30 steps,
// the step she breached at and the site she's against: two runs (or before and after a change to the helm) compared line by line.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/breach_fp.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  await ev(`(() => { G.Space.dbgSit(0); return 1; })()`);
  for (let k = 0; k < 40 && !(await ev('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()')); k++) await sleep(500);
  await sleep(1000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, M = G.Me, n0 = Sp.SIM.steps, TS = G.Level.TS; window.__br = [];
    const st = G.ShipGen.sites(S.map).filter(q => Sp.dbgClear(q)).sort((a, b) => b.nz - a.nz || a.c - b.c)[0]; if (!st) return 'no site';
    const r = (v) => v.toFixed(3), fp = () => [S.P.x, S.P.y, S.P.z, S.Q.x, S.Q.y, S.Q.z, S.Q.w, S.V.x, S.V.y, S.V.z].map(r).join(',') + ' ' + [S.brLock ? 'lock' : '', S.brRound ? 'round' : '', S.auto ? 'auto' : '', S.docked ? 'DOCKED' : ''].filter(Boolean).join('+');
    const tick = () => { const n = Sp.SIM.steps - n0; window.__br.push(n + ' ' + fp()); if (S.docked || n > 1800) { window.__brDone = { n, berth: JSON.stringify(S.berth) }; for (const k of Object.keys(M.keys)) M.keys[k] = false; return; } Sp.SIM.hook = { n: Sp.SIM.steps + 30, f: tick }; };
    Sp.SIM.hook = { n: n0 + 1, f: () => { const fx = st.x + st.nx * TS / 2, fz = st.z + st.nz * TS / 2; S.P.set(fx + st.nx * 150, 0.2, fz + st.nz * 150); S.Q.copy(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(-st.nx, 0, -st.nz), new THREE.Vector3(0, 1, 0)))); S.V.set(-st.nx * 20, 0, -st.nz * 20); S.Wv.set(0, 0, 0); S.stick.set(0, 0); S.brLock = null; S.brRound = null;
      for (const k of Object.keys(M.keys)) M.keys[k] = false; M.keys.KeyW = true; tick(); } };
    return 'site ' + st.c + ' n ' + st.nx + ',' + st.nz; })()`));
  for (let k = 0; k < 60 && !(await ev('!!window.__brDone')); k++) await sleep(500);
  for (const l of await ev('window.__br')) log('BR ' + l);
  log('BR done ' + JSON.stringify(await ev('window.__brDone')));
  await sleep(1500);
  log('SERVER ' + await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, c = G.Space.C2(); return JSON.stringify({ docked: w.ship && w.ship.docked, fly: w.fly, acks: c.acks, fixes: c.fixes, states: c.states, errMax: c.errMax, cut: (G.Space.S.map.sp.cuts || []).length }); })()`));
};
