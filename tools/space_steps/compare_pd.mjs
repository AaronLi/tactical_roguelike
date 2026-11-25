// The same torpedo attack on any version of the game (before the battle moved to the server, docs/space-server.md, and after): her put
// 5 km off the mission ship with her scanners on, a torpedo at her first 3D fix of the mission ship; the mission ship's picture of it
// (the page's own suite before; the server's, F8's, after), its end, the frames and the profiler's sections over the run.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/compare_pd.mjs --port 8151 --gpu      (a version served on another port: its own)
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  const pic = `((su) => (G.Space.sv ? G.Space.sv(su) : su))`;
  await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); Sp.ew().own.scans.forEach((s, k) => { s.mode = 'round'; if (G.Net && Sp.svb) G.Net.toHost({ t: 'ssec', a: [k, 0, s.sec.c, s.sec.h, s.notch ? 1 : 0] }); }); G.Radar.show = 1; G.Radar.sel = 'hull';
    const foe = Sp.ew().foe, d = new THREE.Vector3(-0.87, -0.1, 0.5).normalize().applyQuaternion(S.Q); S.P.copy(foe.P).addScaledVector(d, 5000); S.V.set(0, 0, 0); return 1; })()`);
  let fix = null; for (let i = 0; i < 120 && !fix; i++) { await sleep(500); fix = await ev(`(() => { const ew = G.Space.ew(), f = ${pic}(ew.own).fus.find(q => ew.foe && q.pl.distanceTo(ew.foe.P) < 600); return f ? f.n : null; })()`); }
  if (!fix) { log('RESULT no fix'); return; }
  await ev(`(() => { if (G.Prof) { G.Prof.on = true; G.Prof.reset(); } window.__fr = { n: 0, t0: performance.now(), worst: 0, last: performance.now() }; const f = () => { const W = window.__fr, t = performance.now(); W.worst = Math.max(W.worst, t - W.last); W.last = t; W.n++; if (!W.stop) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
  await ev(`(() => { const Sp = G.Space, d = Sp.dbgTorp(); d.TP.pick = ${JSON.stringify(fix)}; d.TP.cool = 0; d.fire(); const ew = Sp.ew(); window.__pd = { t0: ew.rt, hostile: null, end: null, minR: 1e9, id: null };
    window.__piv = setInterval(() => { const ew = Sp.ew(), P = window.__pd, tp = d.TP.list[0], t = +(ew.rt - P.t0).toFixed(2), su = ${pic}(ew.foe);
      if (tp) { P.id = tp.rt.id; P.minR = Math.min(P.minR, tp.p.distanceTo(ew.foe.P)); P.last = tp.p.distanceTo(ew.foe.P); }
      else if (P.id && P.end == null) P.end = t;
      if (P.id && P.hostile == null && su && su.ass.some((a) => a.cls === 'HOSTILE' && ((a.c && a.c.p.id === P.id) || (a.f && ((a.f.a && a.f.a.p.id === P.id) || (a.f.b && a.f.b.p.id === P.id)))))) P.hostile = t;
      if (P.id && P.hostile == null && su && su.ass.some((a) => a.cls === 'HOSTILE' && a.r < 6000 && a.vc > 150)) P.hostileAny = P.hostileAny ?? t; }, 50); return 1; })()`);
  for (let i = 0; i < 40 && !(await ev('window.__pd.end != null')); i++) await sleep(500);
  await sleep(500);
  const r = await ev(`(() => { clearInterval(window.__piv); const P = window.__pd, W = window.__fr; W.stop = 1; const s = (performance.now() - W.t0) / 1000;
    const sm = G.Prof ? G.Prof.summary() : null, prof = sm ? { frame: sm.frame, cpu: sm.cpu, top: Object.fromEntries(Object.entries(sm.sections).filter(([k]) => /^space|^render|^rig|^hud|^radar/i.test(k)).slice(0, 14).map(([k, v]) => [k, v.avg])) } : null;
    return JSON.stringify({ hostile: P.hostile ?? P.hostileAny ?? null, end: P.end, how: P.minR < 40 ? 'hit' : 'shot down', closest: Math.round(P.minR), fps: +(W.n / s).toFixed(1), worstFrame: +W.worst.toFixed(1), prof }); })()`);
  log('RESULT ' + r);
};
