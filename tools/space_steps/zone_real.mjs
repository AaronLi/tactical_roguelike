// A zone ship's real hull on the server (docs/space-server.md C1): the squad's ship put 3 km off another of the zone's ships; the page
// makes her level and swaps her real hull in (js/space.ts zoneReal), the server makes it too (js/spaceserver.ts warm) and its battle
// swaps her real hull's return in (js/svbattle.ts zoneReal). Her return as each has it (mean, max, size) side by side.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/zone_real.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S; const w = S.wps.find(w => w.id[0] === 't' && w.id !== 't' + S.zact); Sp.dbgSit(0); if (!w) return 'no zone ship'; const d = S.P.clone().sub(w.p).normalize(); S.P.copy(w.p).addScaledVector(d, 3000); S.V.set(0, 0, 0); return 'at ' + w.id + ' ' + w.name + ', ' + Math.round(S.P.distanceTo(w.p)) + ' m'; })()`));
  for (let i = 0; i < 8; i++) {
    await sleep(3000);
    log(await ev(`(async () => { const w = (await G.ServerLink.sworld()).w || {}, page = [...G.Space.ew().trf.values()].filter(t => /:1$/.test(t.key)).map(t => ({ id: t.id, mean: +t.rcs.mean.toFixed(3), max: +t.rcs.max.toFixed(3), sz: +t.sz.toFixed(2) })); return JSON.stringify({ page, server: w.real }); })()`));
  }
};
