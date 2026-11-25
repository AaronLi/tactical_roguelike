export default async ({ ev, sleep, log }) => {
  await sleep(9000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, ew = Sp.ew(); Sp.dbgSit(0); S.docked = false; S.P.copy(ew.foeT.p).add(new THREE.Vector3(2500, 400, 3000)); S.V.set(0, 0, 0); ew.own.scans.forEach(s => { s.mode = 'round'; s.notch = false; }); return 1; })()`));
  await sleep(2000);
  log(await ev(`(async () => { const Sp = G.Space, S = Sp.S, root = S.root, ds = []; let last = null, t0 = performance.now();
    await new Promise((res) => { const f = () => { S.V.copy(new THREE.Vector3(0, 0, -200).applyQuaternion(S.Q)); const p = root.getWorldPosition(new THREE.Vector3()); if (last) ds.push(p.distanceTo(last)); last = p; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const m = ds.reduce((a, b) => a + b, 0) / ds.length, sd = Math.sqrt(ds.reduce((a, b) => a + (b - m) ** 2, 0) / ds.length), zeros = ds.filter((d) => d < 1e-6).length;
    return 'frames ' + ds.length + ', move per frame avg ' + m.toFixed(3) + ' m, spread ' + (sd / m * 100).toFixed(0) + '%, frames with no movement ' + zeros; })()`));
};
