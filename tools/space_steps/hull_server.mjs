// Her hull on the server (docs/space-server.md C1): the squad's ship sat 1.5 km off the mission ship, its guns at her; the page's hull
// against the server's every 2 s (it only fires on a HOSTILE contact: sat still, transponder on, she isn't one; so mostly 30 knocked off) (the snapshot's hp is what the page draws), then a big knock (sdmg, as the ground would) to see the
// server's emergency jump home.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/hull_server.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); const foe = Sp.ew().foe, d = new THREE.Vector3(-0.87, -0.1, 0.5).normalize().applyQuaternion(S.Q); S.P.copy(foe.P).addScaledVector(d, 1500); S.V.set(0, 0, 0); return JSON.stringify({ kind: S.kind, hp: S.hp, hpMax: S.hpMax, hostile: S.state && S.state.hostile }); })()`));
  for (let i = 0; i < 3; i++) { await sleep(2000); const r = await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}; return JSON.stringify({ page: Math.round(G.Space.S.hp * 10) / 10, server: w.hp, dm: w.dm, evc: w.evc, on: w.on, guns: w.guns && w.guns.map(g => g.bt) }); })()`); log('t' + (i + 1) * 2 + ' ' + r); }
  await ev(`G.Net.toHost({ t: 'sdmg', d: 30 })`); await sleep(1500);
  log('after 30 ' + await ev(`(async () => JSON.stringify({ page: G.Space.S.hp, server: (await G.ServerLink.sworld()).w.hp }))()`));
  await ev(`G.Net.toHost({ t: 'sdmg', d: 1000 })`);
  for (let i = 0; i < 6; i++) { await sleep(1000); log('after knock ' + await ev(`JSON.stringify({ hp: G.Space.S.hp, lost: G.Space.S.lostAt, kind: G.Space.S.kind, on: G.Space.S.on })`)); }
};
