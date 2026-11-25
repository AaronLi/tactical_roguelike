// The shape providers' numbers for one boarded ship (js/hullshape.ts, js/rcstris.ts), worked out the same way in node
// (tools/shapes_node_check.mjs) and in the page (tools/space_steps/shapes_check.mjs, which sends this function's source to the
// page): so the two can be compared line for line. Pure: everything it uses comes in X.
//   X: { HullShape, rcs (js/rcstris.ts's exports), ShipGen, SpaceData }
export function shapeFp(X, map, def) {
  const f = (v, d = 4) => (Math.abs(v) < 5e-12 ? 0 : v).toFixed(d), sh = X.HullShape.of(map);
  const sum = (s) => { let a = 0; for (let i = 0; i < s.length; i++) a += s[i] * ((i % 97) + 1); return a; };
  const ch = X.rcs.hullRcs(map, sh), bare = X.rcs.rcsOfTris(sh.exact, sh.flags);
  const nT = sh.flags.length; let nStd = 0, nAdd = 0, nGun = 0; for (let t = 0; t < nT; t++) { if (!(sh.flags[t] & 3)) nStd++; if (sh.flags[t] & 4) nAdd++; if (sh.gun[t] >= 0) nGun++; }
  // (hullClear on her triangles, the guns fitted, with and without the radars' kit: which the page had when it first asked)
  const fitted = X.rcs.withGuns(sh, ch.fit), pA = X.rcs.hullClearPrep(fitted, sh.flags), pB = X.rcs.hullClearPrep(ch.tris, ch.flags);
  const sites = X.ShipGen.sites(map), clr = (P) => sites.map((s) => (X.rcs.hullClearTris(P, s, X.SpaceData.worldBoxes(def, X.SpaceData.berthAt(def, s))) ? '1' : '0')).join('');
  return {
    tris: nT, std: nStd, add: nAdd, gunTris: nGun,
    bbox: [...sh.bbox.min, ...sh.bbox.max].map((v) => f(v)).join(','),
    bboxAll: [...sh.bboxAll.min, ...sh.bboxAll.max].map((v) => f(v)).join(','),
    guns: sh.guns.map((g) => `${g.k}${g.inv ? 'v' : ''}@${f(g.x, 3)},${f(g.y, 3)},${f(g.z, 3)} hp${g.hp} c${f(g.cool, 6)}`).join(' '),
    fitGuns: ch.fit.guns.map((g) => f(g.oy, 4) + '/' + f(g.y, 4)).join(' '),
    scans: ch.su.scans.map((s) => [s.at.x, s.at.y, s.at.z].map((v) => f(v)).join(',')).join(' '),
    trks: ch.su.trks.map((s) => [s.at.x, s.at.y, s.at.z].map((v) => f(v)).join(',')).join(' '),
    kitTris: ch.kit.flags.length,
    rcsBare: `${bare.max.toPrecision(9)} ${bare.mean.toPrecision(9)} ${sum(bare.s).toPrecision(9)}`,
    rcs: `${ch.rcs.max.toPrecision(9)} ${ch.rcs.mean.toPrecision(9)} ${sum(ch.rcs.s).toPrecision(9)}`,
    clear: clr(pA), clearKit: clr(pB),
  };
}
// a zone ship's stand-in (js/hullshape.ts TrafficShape)
export function trafficFp(X, kind, seed) {
  const f = (v, d = 4) => (Math.abs(v) < 5e-12 ? 0 : v).toFixed(d), sh = X.TrafficShape.of(kind, seed), r = X.rcs.rcsOfTris(sh.exact, sh.flags);
  let a = 0; for (let i = 0; i < r.s.length; i++) a += r.s[i] * ((i % 97) + 1);
  return { kind, seed, len: f(sh.len, 6), tris: sh.flags.length, bbox: [...sh.bbox.min, ...sh.bbox.max].map((v) => f(v)).join(','), bboxAll: [...sh.bboxAll.min, ...sh.bboxAll.max].map((v) => f(v)).join(','), rcs: `${r.max.toPrecision(9)} ${r.mean.toPrecision(9)} ${a.toPrecision(9)}` };
}
