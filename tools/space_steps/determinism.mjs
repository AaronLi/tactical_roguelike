export default async ({ ev, sleep, log }) => {
  await sleep(1000);
  log(await ev(`(() => { const Sp = G.Space; Sp.ew().own && Sp.ew().own.scans.forEach(s => { s.mode = 'round'; s.notch = false; }); window.__fp = null; const n0 = Sp.SIM.steps;
    const fp = () => { const ew = Sp.ew(), su = ew.own, S = Sp.S, r = (v) => v.toFixed(3); return { step: Sp.SIM.steps - n0, P: [S.P.x, S.P.y, S.P.z].map(r).join(','), zt: (S.zt0 + S.t - S.ztAt).toFixed(4), cons: su.scans.map(s => s.cons.map(c => c.n + '@' + c.r.toFixed(1)).join(' ')), fus: su.fus.map(f => f.n + ':' + r(f.pl.x)).join(' '), ass: su.ass.map(a => a.n + a.cls).join(' '), foe: ew.foe ? ew.foe.ass.map(a => a.n + a.cls).join(' ') : '' }; };
    Sp.SIM.hook = { n: n0 + 900, f: () => { window.__fp = fp(); } }; return 'hook at +900 steps from ' + n0; })()`));
  for (let i = 0; i < 60 && !(await ev('!!window.__fp')); i++) await sleep(500);
  log('FP ' + await ev('JSON.stringify(window.__fp)'));
};
