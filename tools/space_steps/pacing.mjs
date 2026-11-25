export default async ({ ev, sleep, log }) => {
  await sleep(9000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, ew = Sp.ew(); Sp.dbgSit(0); S.docked = false; S.P.copy(ew.foeT.p).add(new THREE.Vector3(2500, 400, 3000)); S.V.set(0, 0, 0); ew.own.scans.forEach(s => { s.mode = 'round'; s.notch = false; }); return 1; })()`));
  await sleep(3000);
  log(await ev(`(async () => { const ew = G.Space.ew(), w0 = performance.now(), r0 = ew.rt, vs = []; let fr = 0, worst = 0, last = performance.now();
    await new Promise((res) => { const f = () => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; fr++; vs.push(G.Space.beltV().length()); if (n - w0 < 10000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const w = (performance.now() - w0) / 1000, g = ew.rt - r0; vs.sort((a, b) => a - b);
    return 'wall ' + w.toFixed(2) + ' s, sim ' + g.toFixed(2) + ' s (' + (g / w * 100).toFixed(1) + '%), ' + fr + ' frames, worst frame ' + worst.toFixed(0) + ' ms | belt speed median ' + vs[vs.length >> 1].toFixed(1) + ' m/s, max ' + vs[vs.length - 1].toFixed(1); })()`));
};
