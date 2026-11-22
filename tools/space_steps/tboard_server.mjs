// Coming up with another of the zone's ships, on the server (docs/space-server.md C3): her put 450 m from zone ship t1 and flown at
// her (at her way, closing at 15 m/s, coasting); within 400 m (500 once her level's made) her helm has her made the level (js/helm.ts
// close: the server's, js/spaceserver.ts tboardTo), the squad's ship carried across as she was by her. Which ship's the level, the
// page's and the server's, and the acks, corrections and states every second.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/tboard_server.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  await ev(`(() => { G.Space.dbgSit(0); return 1; })()`);
  for (let k = 0; k < 40 && !(await ev('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()')); k++) await sleep(500);
  await sleep(1500);
  await ev(`(() => { const S = G.Space.S; S.tgt = S.wps.findIndex(q => q.id === 't1'); return 1; })()`); await sleep(2000); // (her way followed first: tv)
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, w = S.wps.find(q => q.id === 't1'); if (!w) return 'no t1'; let p0 = null;
    Sp.SIM.hook = { n: Sp.SIM.steps + 1, f: () => { p0 = w.p.clone(); Sp.SIM.hook = { n: Sp.SIM.steps + 1, f: () => { const v = w.p.clone().sub(p0).divideScalar(Sp.STEP), d = new THREE.Vector3(0.6, 0.1, 0.8).normalize(); S.P.copy(w.p).addScaledVector(d, 450); S.Q.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.clone().negate())); S.V.copy(v).addScaledVector(d, -15); S.match = null; } }; } };
    return 'by t1, zact ' + S.zact; })()`));
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    const r = await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, c = G.Space.C2(), S = G.Space.S, t1 = S.wps.find(q => q.id === 't1'); return JSON.stringify({ zact: S.zact, kind: S.kind, d: t1 ? Math.round(S.P.distanceTo(t1.p)) : null, tclose: S.tclose && +S.tclose.t.toFixed(2), serverK: w.k, stc: w.fly && w.fly.tclose, tb: w.evc && w.evc.tboard, acks: c.acks, fixes: c.fixes, states: c.states, errMax: +c.errMax.toFixed(3) }); })()`);
    log(r); if (JSON.parse(r).zact === 1 && i > 3) { await sleep(3000); log(await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, c = G.Space.C2(); return JSON.stringify({ zact: G.Space.S.zact, serverK: w.k, acks: c.acks, fixes: c.fixes, states: c.states, errMax: +c.errMax.toFixed(3) }); })()`)); break; }
  }
  log('ARR ' + JSON.stringify(await ev('G.Space.C2().arr')));
  log('TRACE ' + JSON.stringify(await ev('(G.Space.C2().tr || []).slice(-30)')));
  log('WHY ' + JSON.stringify(await ev('G.Space.C2().why')));
  log('STATES ' + JSON.stringify(await ev('G.Space.C2().whyS')));
};
