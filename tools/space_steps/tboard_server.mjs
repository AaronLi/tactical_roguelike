// Coming up with another of the zone's ships, on the server (docs/space-server.md C3): her put 450 m from zone ship t1 and flown at
// her (at her way, closing at 15 m/s, coasting); within 400 m (500 once her level's made) her helm has her made the level (js/helm.ts
// close: the server's, js/spaceserver.ts tboardTo), the squad's ship carried across as she was by her. Which ship's the level, the
// page's and the server's, and the acks, corrections and states every second.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/tboard_server.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  // (her radars' fixes against where the ships really are: the nearest few, in metres; her picture carried across the boarding unmoved)
  const picErr = `(() => { const S = G.Space.S, ew = G.Space.ew(), own = G.Space.sv(ew.own); if (!own) return null; const truth = [...S.wps.filter(w => /^t\d/.test(w.id) || w.id === 'ship').map(w => w.p), ...(ew.foeT ? [ew.foeT.p] : []), ...(() => { const R = G.Space.dbgRocks(); return R.near.map(k => R.p[k]); })()];
    const ds = own.fus.map(f => Math.min(...truth.map(t => t.distanceTo(f.pl)))).sort((a, b) => a - b); return JSON.stringify({ fus: own.fus.length, things: truth.length, nearest: ds.slice(0, 5).map(d => Math.round(d)) }); })()`;
  await sleep(2000);
  await ev(`(() => { G.Space.dbgSit(0); return 1; })()`);
  for (let k = 0; k < 40 && !(await ev('(() => { const S = G.Space.S; return !S.ftl && !S.auto && !S.warp && !S.docked && !S.veil; })()')); k++) await sleep(500);
  await sleep(1500);
  await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.ew().own.scans.forEach((sc) => { sc.mode = 'round'; }); S.tgt = S.wps.findIndex(q => q.id === 't1'); return 1; })()`); await sleep(14000);
  log('PICTURE before ' + await ev(picErr)); await sleep(2000); // (her way followed first: tv)
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, w = S.wps.find(q => q.id === 't1'); if (!w) return 'no t1'; let p0 = null;
    Sp.SIM.hook = { n: Sp.SIM.steps + 1, f: () => { p0 = w.p.clone(); Sp.SIM.hook = { n: Sp.SIM.steps + 30, f: () => { const v = w.p.clone().sub(p0).divideScalar(30 * Sp.STEP), d = new THREE.Vector3(0.6, 0.1, 0.8).normalize(); S.P.copy(w.p).addScaledVector(d, 450); S.Q.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.clone().negate())); S.V.copy(v).addScaledVector(d, -15); S.match = null; S.tgt = S.wps.indexOf(w); } }; } };
    return 'by t1, zact ' + S.zact; })()`));
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    await ev(`(() => { const S = G.Space.S, j = S.wps.findIndex(q => q.id === 't1'); if (j >= 0) S.tgt = j; return 1; })()`); // (kept on her: the page lets an unidentified ship's waypoint go, js/space.ts ewMarks)
    const r = await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, c = G.Space.C2(), S = G.Space.S, t1 = S.wps.find(q => q.id === 't1'); return JSON.stringify({ zact: S.zact, kind: S.kind, d: t1 ? Math.round(S.P.distanceTo(t1.p)) : null, tclose: S.tclose && +S.tclose.t.toFixed(2), serverK: w.k, ztd: G.Space.svb().snap ? +((S.zt0 + S.t - S.ztAt) - G.Space.svb().snap.zt).toFixed(3) : null, vrel: t1 ? +S.V.clone().sub(S.tv).length().toFixed(1) : null, tvJ: S.tvJ, tg: S.wps[S.tgt] && S.wps[S.tgt].id, tb: w.evc && w.evc.tboard, acks: c.acks, fixes: c.fixes, states: c.states, errMax: +c.errMax.toFixed(3) }); })()`);
    log(r); if (JSON.parse(r).zact === 1 && i > 3) { await sleep(3000); log(await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, c = G.Space.C2(); return JSON.stringify({ zact: G.Space.S.zact, serverK: w.k, acks: c.acks, fixes: c.fixes, states: c.states, errMax: +c.errMax.toFixed(3) }); })()`)); break; }
  }
  log('PICTURE after ' + await ev(picErr));
  log('WHY ' + JSON.stringify(await ev('G.Space.C2().why')));
  log('STATES ' + JSON.stringify(await ev('G.Space.C2().whyS')));
};
