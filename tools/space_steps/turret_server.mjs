// Her turrets' rounds on the server (docs/space-server.md C1): from 800 m off the mission ship, rounds as a turret sends them (sfire, with
// their damage), aimed straight at one of its hull guns; the server flies them (js/spacesim.ts shotsStep), and the gun's hp, the server's
// and the page's (from the gHit event and the snapshot), go down.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/turret_server.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); const foe = Sp.ew().foe, d = new THREE.Vector3(-0.87, -0.1, 0.5).normalize().applyQuaternion(S.Q); S.P.copy(foe.P).addScaledVector(d, 800); S.V.set(0, 0, 0); return JSON.stringify({ kind: S.kind, guns: S.hull.guns.map(g => g.k + ':' + g.hp) }); })()`));
  await sleep(3000);
  const st = async (tag) => log(tag + ' ' + await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}; return JSON.stringify({ page: G.Space.S.hull.guns.map(g => g.hp), server: (w.guns || []).map(g => g.hp), evc: w.evc }); })()`));
  await st('before');
  for (let k = 0; k < 3; k++) {
    await ev(`(() => { const S = G.Space.S, g = S.hull.guns[0], to = new THREE.Vector3(g.x, g.y, g.z), o = S.P.clone().add(new THREE.Vector3(0, 2, 0)), v = to.clone().sub(o).normalize().multiplyScalar(1100); G.Net.toHost({ t: 'sfire', a: [o.x, o.y, o.z, v.x, v.y, v.z, 3000, 0, 40] }); return 1; })()`);
    await sleep(1500); await st('after round ' + (k + 1));
  }
};
