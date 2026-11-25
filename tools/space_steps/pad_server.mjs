// Setting down on a base's pad from the air, on the server (docs/space-server.md C3): an assault, down through the cloud (as
// descent_server.mjs), then her put 60 m over the pad, still; set down (L: js/helm.ts land, the autopilot's move), docked by the server
// (js/spaceserver.ts dock). The page's and the server's docked, the acks, corrections and states.
//   node tools/space_shot.mjs "mute&assault" tools/space_steps/pad_server.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  await ev(`(() => { G.Space.dbgSit(0); return 1; })()`);
  for (let k = 0; k < 40 && !(await ev('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()')); k++) await sleep(500);
  await sleep(1500);
  await ev(`(() => { const S = G.Space.S, e = S.wps.find(w => w.id === 'entry'); G.Space.SIM.hook = { n: G.Space.SIM.steps + 1, f: () => { const d = new THREE.Vector3(0.3, 0.2, 1).normalize(); S.P.copy(e.p).addScaledVector(d, 300); S.Q.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.clone().negate())); S.V.copy(d).multiplyScalar(-80); } }; return 1; })()`);
  for (let k = 0; k < 30 && (await ev('G.Space.S.stage')) !== 'atmo'; k++) await sleep(500);
  await sleep(1500);
  log('in the air: ' + await ev('G.Space.S.stage'));
  await ev(`(() => { const S = G.Space.S; G.Space.SIM.hook = { n: G.Space.SIM.steps + 1, f: () => { S.P.set(S.Dp.x + 20, S.Dp.y + 60, S.Dp.z + 20); S.V.set(0, 0, 0); S.Wv.set(0, 0, 0); } }; return 1; })()`);
  await sleep(1000);
  await ev('G.Space.dbgLand()');
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    log(await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, c = G.Space.C2(), S = G.Space.S; return JSON.stringify({ docked: S.docked, auto: !!S.auto, y: +(S.P.y - S.Dp.y).toFixed(2), server: w.fly && { docked: w.fly.docked, stage: w.fly.stage }, acks: c.acks, fixes: c.fixes, states: c.states }); })()`));
  }
  log('WHY ' + JSON.stringify(await ev('G.Space.C2().why')));
  log('STATES ' + JSON.stringify(await ev('G.Space.C2().whyS')));
};
