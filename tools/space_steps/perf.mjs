// Times the enemy's point-defence response to one torpedo: launch, first paint, HOSTILE, cue, lock, q>=0.15, first burst, end.
export default async ({ ev, sleep, log, send, out }) => {
  await sleep(2000);
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); const own = Sp.ew().own; own.scans.forEach(s => s.mode = 'round');
    const foe = Sp.ew().foe; return JSON.stringify({ kind: S.kind, docked: S.docked, foe: !!foe, hostile: S.state && S.state.hostile, gn: S.state && S.state.gn, d: foe ? Math.round(foe.P.distanceTo(S.P)) : null, guns: S.hull ? S.hull.guns.map(g => g.k).join(',') : null }); })()`));
  log(await ev(`(() => { const Sp = G.Space, S = Sp.S, foe = Sp.ew().foe, d = new THREE.Vector3(-0.87, -0.1, 0.5).normalize().applyQuaternion(S.Q); S.P.copy(foe.P).addScaledVector(d, ${+(process.env.PD_R || 4500)}); S.V.set(0, 0, 0); return 'moved to ' + Math.round(S.P.distanceTo(foe.P)); })()`));
  await sleep(1500); log(await ev(`JSON.stringify({ d: Math.round(G.Space.S.P.distanceTo(G.Space.ew().foe.P)), modes: G.Space.ew().own.scans.map(s => s.mode), cons: G.Space.ew().own.scans.map(s => s.cons.length) })`));
  // wait for a 3D fix on her
  const rt0 = await ev('G.Space.ew().rt'); let fix = null; for (let i = 0; i < 80 && !fix; i++) { await sleep(500); fix = await ev(`(() => { const f = G.Space.ew().own.fus.find(q => G.Space.ew().foe && q.pl.distanceTo(G.Space.ew().foe.P) < 600); return f ? f.n : null; })()`); }
  log('fix', fix, 'game s', (await ev('G.Space.ew().rt')) - rt0, await ev(`(() => { const ew = G.Space.ew(), o = ew.own, f = ew.foe; return JSON.stringify({ own: o === ew.own, modes: o.scans.map(s => s.mode), plots: o.scans.map(s => s.plots.map(p => p.id + '@' + Math.round(p.r))), cons: o.scans.map(s => s.cons.map(c => c.n + ' h' + c.hits)), fus: o.fus.map(q => q.n + ' ' + Math.round(q.pl.distanceTo(f.P))), ass: o.ass.map(a => a.n + ' ' + a.cls), d: Math.round(G.Space.S.P.distanceTo(f.P)), tg: ew.tg.map(t => t.id) }); })()`)); if (!fix) return;
  await ev(`(() => { G.Prof.reset && G.Prof.reset(); return 1; })()`);
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start');
  await ev(`(() => { const d = G.Space.dbgTorp(); d.TP.pick = ${JSON.stringify(fix)}; d.TP.cool = 0; d.fire(); return 1; })()`);
  const g0 = await ev('G.Space.ew().rt'); await sleep(12000); const g1 = await ev('G.Space.ew().rt');
  const { profile } = await send('Profiler.stop');
  const sm = await ev(`(() => { const s = G.Prof.summary(); const sec = Object.entries(s.sections).filter(([k]) => /^space|^rigs|^render|^host|^radar/.test(k)).slice(0, 18).map(([k, v]) => k + ' ' + v.avg + ' ms (max ' + v.max + ')'); return 'frames ' + s.frames + ' over ' + s.seconds + ' s, frame avg ' + s.frame.avg + ' ms p95 ' + s.frame.p95 + ' | ' + sec.join(' | '); })()`);
  log('SECTIONS ' + sm);
  // self time per function from the samples
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map(); let total = 0;
  const dts = profile.timeDeltas; for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]), dt = dts[i] || 0; total += dt; const cf = n.callFrame, f = (cf.url || '').split('/').pop(), k = (cf.functionName || '(anon)') + ' ' + f + ':' + (cf.lineNumber + 1); self.set(k, (self.get(k) || 0) + dt); }
  const byFile = new Map(); for (const [k, v] of self) { const f = k.split(' ')[1].split(':')[0] || '(native)'; byFile.set(f, (byFile.get(f) || 0) + v); }
  const pct = (v) => (v / total * 100).toFixed(1) + '%';
  log('WALL ' + (total / 1e6).toFixed(1) + ' s sampled, game ' + (g1 - g0).toFixed(1) + ' s');
  log('FILES ' + [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ' ' + pct(v)).join(' | '));
  log('TOP ' + [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => k + ' ' + pct(v)).join(' | '));
};
