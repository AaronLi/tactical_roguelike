// The places her helm flies in, as data (js/helm.ts hubPlace, boardPlace + boardMove, assaultPlace: what the server builds its helm's
// geometry from) against what the page built as it set the place up (S.boxes, S.floorAt, S.wps): the waypoints' ids, kinds, order and
// places, the boxes, the ground sampled on a grid.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/helm_geo.mjs --port 8151     (and "mute&fly", "mute&assault")
export default async ({ ev, sleep, log }) => {
  await sleep(6000);
  log('GEO ' + await ev(`(() => { const Sp = G.Space, S = Sp.S, H = Sp.helmGeo, SD = G.SpaceData;
    let P;
    if (S.kind === 'hub') P = H.hubPlace(SD.HUB_BERTH, S.board, (i) => Sp.isGone(i));
    else if (S.kind === 'board') { P = H.boardPlace(S.map, S.zdef, S.zact, 'x'); H.boardMove(P.wps, S.zdef, P.out0, S.zt0 + (S.t - S.ztAt), S.zone.position, S.zone.quaternion); }
    else P = H.assaultPlace(S.berth, () => S.stage);
    const pw = S.wps.filter((w) => w.kind !== 'anchor' || S.kind !== 'hub' || true), ids = (l) => l.map((w) => w.id + ':' + w.kind + (w.hide ? '-' : '')).join(' ');
    const dp = Math.max(0, ...pw.map((w, i) => P.wps[i] ? w.p.distanceTo(P.wps[i].p) : 1e9));
    const bx = JSON.stringify(S.boxes) === JSON.stringify(P.boxes);
    let fd = 0, n = 0; if (S.floorAt || P.floorAt) for (let x = S.berth.x - 900; x <= S.berth.x + 900; x += 60) for (let z = S.berth.z - 900; z <= S.berth.z + 900; z += 60) { const a = S.floorAt ? S.floorAt(x, z) : -1e9, b = P.floorAt ? P.floorAt(x, z) : -1e9; fd = Math.max(fd, Math.abs(a - b)); n++; }
    return JSON.stringify({ kind: S.kind, page: ids(pw), data: ids(P.wps), sameIds: ids(pw) === ids(P.wps), maxWpOff: +dp.toFixed(6), sameBoxes: bx, boxes: S.boxes.length, floorSamples: n, maxFloorOff: fd }); })()`));
};
