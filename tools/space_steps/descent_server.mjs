// Down through the cloud on the server (docs/space-server.md C3): an assault's orbit, her put 500 m from the descent corridor headed
// in; her helm takes her through (js/helm.ts through, thruStep), the server's with it; then a few seconds flying in the air. The page's
// stage and the server's, the acks, corrections and states the page sent, every second.
//   node tools/space_shot.mjs "mute&assault" tools/space_steps/descent_server.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  await ev(`(() => { G.Space.dbgSit(0); return 1; })()`);
  for (let k = 0; k < 40 && !(await ev('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()')); k++) await sleep(500);
  await sleep(1500);
  log(await ev(`(() => { const S = G.Space.S, e = S.wps.find(w => w.id === 'entry'); G.Space.SIM.hook = { n: G.Space.SIM.steps + 1, f: () => { const d = new THREE.Vector3(0.3, 0.2, 1).normalize(); S.P.copy(e.p).addScaledVector(d, 500); S.Q.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.clone().negate())); S.V.copy(d).multiplyScalar(-80); } }; return 'put by the corridor'; })()`));
  for (let i = 0; i < 14; i++) {
    await sleep(1000);
    if (i === 8) await ev(`(() => { G.Me.keys.KeyW = true; return 1; })()`);
    log(await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, c = G.Space.C2(), S = G.Space.S; return JSON.stringify({ stage: S.stage, thru: !!S.thru, y: Math.round(S.P.y), server: w.fly && { stage: w.fly.stage, P: w.fly.P }, acks: c.acks, fixes: c.fixes, states: c.states, errMax: +c.errMax.toFixed(4) }); })()`));
  }
  log('WHY ' + JSON.stringify(await ev('G.Space.C2().why')));
  log('STATES ' + JSON.stringify(await ev('G.Space.C2().whyS')));
};
