// The server's battle (js/svbattle.ts, docs/space-server.md phase C1) against the page's: both pictures side by side as the squad's ship
// sits off the mission ship with her scanners on, then a torpedo (fired on the page's fix, as torpedo_defence.mjs does: the page's storp
// makes it on the server too, taken over there when it comes onto its datalink), each side's timeline of it in the mission ship's
// picture; the snapshots and events the server sends (sss, sev: counted and sized off the host's own port); the worker's step cost.
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/server_battle.mjs --port 8163 --gpu      (env PD_R: the range, default 5000)
export default async ({ ev, sleep, log }) => {
  await sleep(2000);
  // (the host's own port: every sss / sev counted and sized as JSON, what a remote player's connection carries)
  await ev(`(() => { const N = G.Net, f0 = N.onClient; window.__sn = { sss: 0, sev: 0, sssB: 0, sevB: 0, ev: {}, t0: performance.now(), last: null }; N.onClient = function (m) { if (m && (m.t === 'sss' || m.t === 'sev')) { const W = window.__sn, b = JSON.stringify(m).length; W[m.t]++; W[m.t + 'B'] += b; if (m.t === 'sss') W.last = m; else for (const e of m.e) W.ev[e.k] = (W.ev[e.k] || 0) + 1; } return f0.call(this, m); }; N.onFast((b, ch) => { if (ch === 4) { const W = window.__sn; W.sss++; W.sssB += b.byteLength; } }); return 1; })()`); // (sss: bytes on the fast channel's stream 4, js/spacenet.ts sssBin)
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); const own = Sp.ew().own; own.scans.forEach((s, k) => { s.mode = 'round'; G.Net.toHost({ t: 'ssec', a: [k, 0, s.sec.c, s.sec.h, s.notch ? 1 : 0] }); });
    const foe = Sp.ew().foe; return JSON.stringify({ kind: S.kind, docked: S.docked, foe: !!foe, hostile: S.state && S.state.hostile, gn: S.state && S.state.gn, guns: S.hull ? S.hull.guns.map(g => g.k).join(',') : null }); })()`));
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, foe = Sp.ew().foe, d = new THREE.Vector3(-0.87, -0.1, 0.5).normalize().applyQuaternion(S.Q); S.P.copy(foe.P).addScaledVector(d, ${+(process.env.PD_R || 5000)}); S.V.set(0, 0, 0); return 'moved to ' + Math.round(S.P.distanceTo(foe.P)); })()`));
  // the two pictures, side by side
  const pageSum = `(() => { const ew = G.Space.ew(), sum = (su) => su ? { modes: su.scans.map(s => s.mode), plots: su.scans.map(s => s.plots.length), cons: su.scans.map(s => s.cons.length), fus: su.fus.length, bel: (su.bel || []).length, ass: su.ass.map(a => a.n + ':' + a.cls), trks: su.trks.map(t => t.st + (t.tgt ? ':' + t.tgt : '')), tts: su.sched ? su.sched.tts.map(q => q.n + (q.tgt ? ':' + q.tgt : '') + ' q' + (+q.est.q).toFixed(2)) : [] } : null;
    return { rt: +ew.rt.toFixed(2), own: sum(ew.own), foe: sum(ew.foe), fc: ew.fc, tg: ew.tg.map(t => t.id), guns: G.Space.S.hull ? G.Space.S.hull.guns.map(g => ({ k: g.k, hp: g.hp, bt: +(g.bt || 0).toFixed(2) })) : [], rounds: G.Space.S.rounds.length, torps: G.Space.dbgTorp().TP.list.map(tp => ({ id: tp.id, ph: tp.ph, lock: tp.lock })) }; })()`;
  const both = async (tag) => { const [p, s] = await Promise.all([ev(pageSum), ev('G.ServerLink.sworld()')]); const w = s.w;
    const line = (n, a) => a ? `${n} fus ${a.fus} bel ${a.bel} cons ${a.cons.join('/')} plots ${a.plots.join('/')} ass [${a.ass.join(' ')}] trks [${a.trks.join(' ')}] tts [${a.tts.join(' ')}]` : n + ' -';
    log(`--- ${tag}: page rt ${p.rt}, server t ${w && w.t} (world ${w && w.on ? 'on, k ' + w.k + ', built in ' + w.built + ' ms, ship ' + JSON.stringify(w.ship) : 'OFF'})`);
    log('  PAGE  ' + line('own', p.own)); log('  SERV  ' + line('own', w && w.own));
    log('  PAGE  ' + line('foe', p.foe) + ' fc ' + JSON.stringify(p.fc)); log('  SERV  ' + line('foe', w && w.foe) + ' fc ' + JSON.stringify(w && w.fc));
    log('  PAGE  tg ' + p.tg.join(',') + ' | guns ' + JSON.stringify(p.guns) + ' rounds ' + p.rounds + ' torps ' + JSON.stringify(p.torps));
    if (w && w.on) log('  SERV  tg ' + w.tg.join(',') + ' | guns ' + JSON.stringify(w.guns) + ' rounds ' + w.rounds + ' torps ' + JSON.stringify(w.torps) + ' crew ' + JSON.stringify(w.crew) + ' evc ' + JSON.stringify(w.evc) + ' dm ' + w.dm);
    return { p, w }; };
  for (let i = 0; i < 4; i++) { await sleep(3000); await both('settling ' + (i + 1)); }
  // a 3D fix on her on the page, then the torpedo
  let fix = null; for (let i = 0; i < 80 && !fix; i++) { await sleep(500); fix = await ev(`(() => { const f = G.Space.ew().own.fus.find(q => G.Space.ew().foe && q.pl.distanceTo(G.Space.ew().foe.P) < 600); return f ? f.n : null; })()`); }
  await both('page fix ' + fix); if (!fix) return;
  await ev(`(() => { const Sp = G.Space, d = Sp.dbgTorp(); d.TP.pick = ${JSON.stringify(fix)}; d.TP.cool = 0; d.fire(); const ew = Sp.ew(); window.__pd = { t0: ew.rt, T: {} };
    window.__piv = setInterval(() => { const ew = Sp.ew(), su = ew.foe, tp = d.TP.list[0]; if (!su) return; const t = +(ew.rt - window.__pd.t0).toFixed(2), mk = (k) => { if (window.__pd.T[k] == null) window.__pd.T[k] = t; };
      if (!tp) { mk('gone'); return; } const id = tp.rt.id, isT = (x) => x === id;
      for (const a of su.ass) { const ids = [a.c && a.c.p.id, a.f && a.f.a && a.f.a.p.id, a.f && a.f.b && a.f.b.p.id, a.f && a.f.trk && a.f.trk.tgt]; if (ids.some(isT)) { mk('in picture'); if (a.cls === 'HOSTILE') mk('HOSTILE'); } }
      for (const tr of su.trks) if (tr.tgt === id && tr.st === 'track') mk('dish locked on');
      for (const q of G.Radar.sched(su).tts) if (q.tgt === id) { mk('ship track holds it'); if (q.est.q >= 0.15) mk('track good for guns (q>=0.15)'); }
      if (ew.fc && ew.fc.id === id) mk('fire control after it');
      if (Sp.S.hull && Sp.S.hull.guns.some(g => (g.bt || 0) > 0)) mk('first burst');
      if (tp.p.distanceTo(su.P) < 1500) mk('inside 1.5 km'); }, 50); return 1; })()`);
  let gone = 0;
  for (let i = 0; i < 70; i++) { await sleep(1000); if (i % 5 === 4) await both('torpedo +' + (i + 1) + ' s');
    const s = await ev('G.ServerLink.sworld()'), pg = await ev('window.__pd.T.gone != null'); if (s.w && s.w.on && !s.w.torps.length && pg) { if (++gone > 2) break; } }
  const s = await ev('G.ServerLink.sworld()'), pT = await ev('window.__pd.T');
  log('TIMELINE page   ' + JSON.stringify(pT));
  log('TIMELINE server ' + JSON.stringify(s.w && s.w.marks));
  await both('end');
  const sn = await ev(`(() => { const W = window.__sn, s = (performance.now() - W.t0) / 1000; return { secs: +s.toFixed(1), sss: W.sss, sssHz: +(W.sss / s).toFixed(1), sssAvgB: Math.round(W.sssB / Math.max(1, W.sss)), sssKBs: +(W.sssB / s / 1024).toFixed(2), sev: W.sev, sevAvgB: Math.round(W.sevB / Math.max(1, W.sev)), sevKBs: +(W.sevB / s / 1024).toFixed(2), events: W.ev, lastSss: W.last }; })()`);
  log('NET ' + JSON.stringify(sn));
  log('PROF server step (whole worker step, last second) ' + JSON.stringify(s.prof) + ' battle alone ' + JSON.stringify(s.w && s.w.prof));
};
