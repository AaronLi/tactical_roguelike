// Times the enemy's point-defence response to one torpedo: launch, first paint, HOSTILE, cue, lock, q>=0.15, first burst, end.
export default async ({ ev, shot, sleep, log }) => {
  await sleep(2000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); const own = Sp.ew().own; own.scans.forEach(s => s.mode = 'round');
    const foe = Sp.ew().foe; return JSON.stringify({ kind: S.kind, docked: S.docked, foe: !!foe, hostile: S.state && S.state.hostile, gn: S.state && S.state.gn, d: foe ? Math.round(foe.P.distanceTo(S.P)) : null, guns: S.hull ? S.hull.guns.map(g => g.k).join(',') : null }); })()`));
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, foe = Sp.ew().foe, d = new THREE.Vector3(-0.87, -0.1, 0.5).normalize().applyQuaternion(S.Q); S.P.copy(foe.P).addScaledVector(d, ${+(process.env.PD_R || 4500)}); S.V.set(0, 0, 0); return 'moved to ' + Math.round(S.P.distanceTo(foe.P)); })()`));
  await sleep(1500); log(await ev(`JSON.stringify({ d: Math.round(G.Space.S.P.distanceTo(G.Space.ew().foe.P)), modes: G.Space.sv(G.Space.ew().own).scans.map(s => s.mode), cons: G.Space.sv(G.Space.ew().own).scans.map(s => s.cons.length) })`));
  // wait for a 3D fix on her
  await ev(`(() => { G.Radar.show = 1; G.Radar.sel = 'hull'; return 1; })()`); // (the mission ship's picture is the server's: F8's, asked for)
  const rt0 = await ev('G.Space.ew().rt'); let fix = null; for (let i = 0; i < 80 && !fix; i++) { await sleep(500); fix = await ev(`(() => { const f = G.Space.sv(G.Space.ew().own).fus.find(q => G.Space.ew().foe && q.pl.distanceTo(G.Space.ew().foe.P) < 600); return f ? f.n : null; })()`); }
  log('fix', fix, 'game s', (await ev('G.Space.ew().rt')) - rt0, await ev(`(() => { const ew = G.Space.ew(), o = G.Space.sv(ew.own), f = ew.foe; return JSON.stringify({ modes: o.scans.map(s => s.mode), plots: o.scans.map(s => s.plots.map(p => p.id + '@' + Math.round(p.r))), cons: o.scans.map(s => s.cons.map(c => c.n + ' h' + c.hits)), fus: o.fus.map(q => q.n + ' ' + Math.round(q.pl.distanceTo(f.P))), ass: o.ass.map(a => a.n + ' ' + a.cls), d: Math.round(G.Space.S.P.distanceTo(f.P)) }); })()`)); if (!fix) return;
  await ev(`(() => { const Sp = G.Space, d = Sp.dbgTorp(); d.TP.pick = ${JSON.stringify(fix)}; d.TP.cool = 0; window.__notch = ${process.env.NOTCH ? "true" : "false"}; d.fire(); window.__pd = { t0: G.Space.ew().rt, log: [], ev: {} }; { const f0 = G.HUD.feed; G.HUD.feed = function (m, ...r) { if (/shot down/.test(m)) window.__pd.ev['SHOT DOWN'] = +(G.Space.ew().rt - window.__pd.t0).toFixed(2); return f0.call(this, m, ...r); }; }
    const W = window.__pd, mark = (k) => { if (W.ev[k] == null) W.ev[k] = +((G.Space.ew().rt - W.t0)).toFixed(2); };
    window.__T = {}; window.__fcl = []; window.__tiv = setInterval(() => { const ew = Sp.ew(), su = ew.foe && Sp.sv(ew.foe); if (!su) return; const t = +((ew.rt - W.t0)).toFixed(2), mk = (k) => { if (window.__T[k] == null) window.__T[k] = t; }, S0 = G.Radar.sched(su), isT = (id) => !!id && id.startsWith('torp');
      const ids = (a) => [a.c && a.c.p.id, a.f && a.f.a && a.f.a.p.id, a.f && a.f.b && a.f.b.p.id, a.f && a.f.trk && a.f.trk.tgt].filter(Boolean);
      for (const a of su.ass) if (ids(a).some(isT)) { mk('in picture (' + (a.f ? 'belief' : 'one scanner') + ')'); if (a.cls === 'HOSTILE') mk('HOSTILE'); }
      if (S0.reqs.some(r => r.kind === 'acq' && r.plot && isT(r.plot.id))) mk('find request queued');
      for (const tr of su.trks) { const j = tr.job; const onT = j && ((j.plot && isT(j.plot.id)) || (j.tt && (isT(j.tt.tgt) || isT(tr.tgt)))); if (!onT) continue; mk('dish given it (' + j.kind + ')'); if (tr.st === 'slew') mk('dish slewing'); if (tr.st === 'acq') mk('dish sweeping its fan'); if (tr.st === 'track' && isT(tr.tgt)) mk('dish locked on'); }
      for (const q of S0.tts) if (isT(q.tgt)) { mk('ship track holds it'); if (q.est.q >= 0.15) mk('track good for guns (q>=0.15)'); }
      const fc = ew.fc; const f = fc ? fc.n + (isT(fc.id) ? '' : '(not torp)') : '-'; if (!window.__fcl.length || window.__fcl[window.__fcl.length - 1].f !== f) window.__fcl.push({ t, f });
    }, 50);
    window.__ol = []; window.__oiv = setInterval(() => { const ew = Sp.ew(), su = ew.foe && Sp.sv(ew.foe); if (!su) return; if (window.__notch != null) su.scans.forEach(sc => sc.notch = window.__notch); window.__ncons = Math.max(window.__ncons || 0, su.scans.reduce((n, sc) => n + sc.cons.length, 0)); const o = su.opt, t = +((ew.rt - W.t0)).toFixed(1); const ids = (a) => [a.c && a.c.p.id, a.f && a.f.a && a.f.a.p.id, a.f && a.f.b && a.f.b.p.id].filter(Boolean); const ta = su.ass.filter(a => ids(a).some(x => x.startsWith('torp'))).map(a => a.n + ':' + a.cls + (a.f ? '/k' + a.f.kind + (a.f.cls ? '/' + a.f.cls.k + Math.round(a.f.cls.conf * 100) : '') : '/contact') + ' vc' + Math.round(a.vc)); window.__ol.push(t + ' opt ' + o.st + ' ' + (o.job ? o.job.tt.n : '-') + ' px' + Math.round(o.px) + ' tgt ' + o.tgt + ' | torp: ' + ta.join(',')); }, 500);
    W.iv = setInterval(() => { const ew = Sp.ew(), foe = ew.foe, S = Sp.S, tp = d.TP.list[0]; const t = +((G.Space.ew().rt - W.t0)).toFixed(2);
      if (!tp) { mark('torp gone'); return; }
      const r = Math.round(tp.p.distanceTo(foe.P)); W.lastR = r; W.minR = Math.min(W.minR ?? 1e9, r);
      if (tp.thr > 0.05) mark('motor');
      const tid = tp.rt.id;
      if (foe.scans.some(sc => sc.plots.some(p => p.id === tid))) mark('painted');
      const a = foe.ass.find(q => q.plot && q.plot.id === tid); if (a) { mark('assessed ' + a.cls); if (a.cls === 'HOSTILE') mark('HOSTILE'); }
      if (ew.fc && ew.fc.id === tid) mark('fire control after it');
      foe.trks.forEach((tr, i) => { if (tr.tgt === tid) mark('trk' + i + ' on it (' + tr.st + ')'); if (tr.tgt === tid && tr.est.q >= 0.15) mark('trk' + i + ' q>=0.15'); });
      foe.trks.forEach((tr, i) => { const k = 'trk' + i + ' st=' + tr.st + ' tgt=' + (tr.tgt || '-'); if (W['s' + i] !== k) { W['s' + i] = k; W.log.push(t + ' r=' + r + ' ' + k + ' lockT=' + tr.lockT.toFixed(1) + ' q=' + (+tr.est.q).toFixed(2)); } });
      (S.hull ? S.hull.guns : []).forEach((g, i) => { if (g.bt > 0) mark('first burst'); });
      if (r < 1500) mark('inside 1.5 km');
      { const lk = foe.trks.find(tr => tr.tgt === tid && tr.st === 'track' && tr.est.p); if (lk && r < 2200 && (!W.lastE || t - W.lastE >= 0.2)) { W.lastE = t; const los = tp.p.clone().sub(foe.P).normalize(), e = lk.est.p.clone().sub(tp.p), ev = lk.est.v.clone().sub(tp.v), lat = e.clone().sub(los.clone().multiplyScalar(e.dot(los))), latv = ev.clone().sub(los.clone().multiplyScalar(ev.dot(los)));
        const tof = r / 1000, aimMiss = e.clone().addScaledVector(ev, tof).add(new THREE.Vector3(0, 1.5, 0)); const latAim = aimMiss.clone().sub(los.clone().multiplyScalar(aimMiss.dot(los)));
        W.log.push(t + ' r=' + r + ' SOL along=' + Math.round(e.dot(los)) + ' lat=' + lat.length().toFixed(1) + ' latv=' + latv.length().toFixed(1) + ' dv=' + Math.round(ev.dot(los)) + ' aimLat=' + latAim.length().toFixed(1) + ' err=' + (+lk.err).toFixed(4) + ' q=' + (+lk.est.q).toFixed(2) + ' tpv=' + Math.round(tp.v.clone().sub(foe.V||new THREE.Vector3()).length()) + ' bt=' + (S.hull.guns.map(g => (g.bt||0).toFixed(1)).join('/'))); } }
      for (const q of foe.ass) if (q.vc > 150 && !W['a' + q.key + q.cls]) { W['a' + q.key + q.cls] = 1; W.log.push(t + ' r=' + r + ' ASS ' + q.key + ' ' + q.cls + (q.f ? ' a=' + (q.f.a && q.f.a.n) + ' b=' + (q.f.b && q.f.b.n) + ' wpn=' + [...(foe.wpn || new Map()).keys()].join(',') + ' why=' + q.why : '') + ' r=' + Math.round(q.r) + ' vc=' + Math.round(q.vc) + ' sg=' + (q.c ? (+q.c.sg).toFixed(1) + ' h' + q.c.hits : 'F')); }
      for (const sc of foe.scans) for (const c of sc.cons) if (-c.vr > 150 && !W['c' + c.n]) { W['c' + c.n] = 1; W.log.push(t + ' r=' + r + ' CON ' + c.n + ' r=' + Math.round(c.r) + ' vr=' + Math.round(c.vr) + ' sg=' + (+c.sg).toFixed(1) + ' h' + c.hits); }
    }, 50); return 1; })()`);
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev('window.__pd.ev["torp gone"] != null && G.Space.ew().rt - window.__pd.t0 > window.__pd.ev["torp gone"] + 1')) break; }
  log(await ev(`(() => { const W = window.__pd; clearInterval(W.iv); return 'TIMELINE ' + JSON.stringify(window.__T) + ' FC ' + window.__fcl.map(q => q.t + ':' + q.f).join(' ') + ' ~ maxcons ' + window.__ncons + ' notch ' + window.__notch + ' ~ ' + window.__ol.join(' ~ ') + ' ~ ' + JSON.stringify({ ev: W.ev, minR: W.minR, lastR: W.lastR, log: W.log.slice(0, 90) }, null, 1); })()`));
};
