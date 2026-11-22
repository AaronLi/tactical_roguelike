export default async ({ ev, sleep, log }) => {
  await sleep(9000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, ew = Sp.ew(); Sp.dbgSit(0); S.docked = false; const foe = ew.foeT; S.P.copy(foe.p).add(new THREE.Vector3(2500, 400, 3000)); S.V.set(0, 0, 0); ew.own.scans.forEach(s => { s.mode = 'round'; s.notch = ${process.env.NOTCH ? 'true' : 'false'}; }); return 'own ship ' + Math.round(S.P.distanceTo(foe.p)) + ' m from the hull'; })()`));
  await sleep(16000);
  log(await ev(`(() => { const ew = G.Space.ew(), own = ew.own, S = G.Space.S, R = G.Radar; const fs = own.fus.filter(f => f.kf && f.kf.n >= 2).sort((a, b) => a.pl.distanceTo(S.P) - b.pl.distanceTo(S.P)).slice(0, ${+(process.env.N || 4)});
    for (const f of fs) R.want(own, { f, pri: 1, op: true }, ew.rt);
    window.__t0 = ew.rt; window.__L = []; window.__iv = setInterval(() => { const ew = G.Space.ew(); window.__L.push(ew.own.trks.map((t, k) => (t.job ? t.job.kind + (t.job.tt ? t.job.tt.n : '') : 'idle') + ':' + t.st).join(' | ')); }, 100);
    return 'asked for ' + fs.length + ' tracks: ' + fs.map(f => f.n + '@' + Math.round(f.pl.distanceTo(S.P)) + 'm ' + (new THREE.Vector3().copy(f.pl).sub(S.P).applyQuaternion(S.Q.clone().invert()).x > 0 ? 'stbd' : 'port')).join(', '); })()`));
  await sleep(10000);
  // a bearing search asked for, while they're busy: how long till a dish takes it up
  log(await ev(`(() => { const ew = G.Space.ew(), R = G.Radar, S = G.Space.S; window.__rq = ew.rt; R.wantRay(ew.own, new THREE.Vector3(0.3, 0.1, -1).applyQuaternion(S.Q), ew.rt); return 1; })()`));
  await sleep(4000);
  log(await ev(`(() => { clearInterval(__iv); const ew = G.Space.ew(), own = ew.own, R = G.Radar, S0 = R.sched(own), now = ew.rt;
    const tr = S0.tts.map(q => q.n + (q.op ? '*' : '') + ' pri' + q.pri + ' ' + R.rateOf(q, now).toFixed(2) + '/s looks ' + q.looks + ' miss ' + q.miss + ' q ' + q.est.q.toFixed(2) + ' tgt ' + q.tgt + (q.tgt ? ' err ' + Math.round(q.est.p.distanceTo((ew.trf && [...ew.trf.values()].find(t => t.id === q.tgt) || ew.foeT && ew.foeT.id === q.tgt && ew.foeT || { p: q.est.p }).p)) + 'm' : ''));
    const log = (S0.log || []).filter(l => l.t >= __t0).map(l => (l.t - __t0).toFixed(2) + ' trk' + l.k + ' ' + l.j);
    const ray = (S0.log || []).find(l => l.t >= __rq && l.j.startsWith('ray'));
    // how each dish spent its time (from the 0.1 s samples)
    const use = [0, 1].map(k => { const c = {}; for (const row of __L) { const s = row.split(' | ')[k].split(':')[0].replace(/T\d+/, ''); c[s] = (c[s] || 0) + 1; } return 'trk' + k + ' ' + Object.entries(c).map(([a, b]) => a + ' ' + Math.round(100 * b / __L.length) + '%').join(', '); });
    return 'tracks: ' + tr.join(' ; ') + String.fromCharCode(10) + use.join(String.fromCharCode(10)) + String.fromCharCode(10) + 'bearing search taken up after ' + (ray ? (ray.t - __rq).toFixed(2) + ' s by trk' + ray.k : 'not yet') + ', requests waiting ' + S0.reqs.length + String.fromCharCode(10) + 'jobs: ' + log.slice(0, 40).join(' / '); })()`));
};
