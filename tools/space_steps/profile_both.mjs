// CPU profiles of both threads through a torpedo attack (docs/space-server.md, Performance): the page's (drawing, the HUD, the
// pilot's helm and its prediction) and the server worker's (the people, the AI and, after the migration, the whole space battle), the
// DevTools protocol's sampling profiler on each (the worker's through its target session). Self time by file and by function; the
// profiler's sections on the page; the server battle's own step cost where there is one (G.ServerLink.sworld).
//   node tools/space_shot.mjs "mute&board=small&seed=3" tools/space_steps/profile_both.mjs --port 8151 --gpu     (any version of the game)
export default async ({ ev, send, on, sleep, log }) => {
  let sid = null, q = 0; const replies = new Map();
  on('Target.attachedToTarget', (p) => { if (!sid && p.targetInfo.type === 'worker' && /serverworker/.test(p.targetInfo.url)) sid = p.sessionId; });
  on('Target.receivedMessageFromTarget', (p) => { const m = JSON.parse(p.message); if (m.id && replies.has(m.id)) { replies.get(m.id)(m); replies.delete(m.id); } });
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
  const wsend = (method, params = {}) => new Promise((res) => { const id = ++q; replies.set(id, (m) => res(m.result)); send('Target.sendMessageToTarget', { sessionId: sid, message: JSON.stringify({ id, method, params }) }); });
  await sleep(2500);
  log('worker attached: ' + !!sid);
  const pic = `((su) => (G.Space.sv ? G.Space.sv(su) : su))`;
  await ev(`(() => { const Sp = G.Space, S = Sp.S; Sp.dbgSit(0); Sp.ew().own.scans.forEach((s, k) => { s.mode = 'round'; if (Sp.svb) G.Net.toHost({ t: 'ssec', a: [k, 0, s.sec.c, s.sec.h, s.notch ? 1 : 0] }); }); G.Radar.show = 0;
    const foe = Sp.ew().foe, d = new THREE.Vector3(-0.87, -0.1, 0.5).normalize().applyQuaternion(S.Q); S.P.copy(foe.P).addScaledVector(d, 5000); S.V.set(0, 0, 0); return 1; })()`);
  let fix = null; for (let i = 0; i < 120 && !fix; i++) { await sleep(500); fix = await ev(`(() => { const ew = G.Space.ew(), f = ${pic}(ew.own).fus.find(q => ew.foe && q.pl.distanceTo(ew.foe.P) < 600); return f ? f.n : null; })()`); }
  log('fix ' + fix);
  await ev('(() => { if (G.Prof) { G.Prof.on = true; G.Prof.reset(); } return 1; })()');
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start');
  if (sid) { await wsend('Profiler.enable'); await wsend('Profiler.setSamplingInterval', { interval: 200 }); await wsend('Profiler.start'); }
  if (fix) await ev(`(() => { const d = G.Space.dbgTorp(); d.TP.pick = ${JSON.stringify(fix)}; d.TP.cool = 0; d.fire(); return 1; })()`);
  const g0 = await ev('G.Space.ew().rt'); await sleep(12000); const g1 = await ev('G.Space.ew().rt');
  const { profile } = await send('Profiler.stop'), wprof = sid ? (await wsend('Profiler.stop')).profile : null;
  const sum = (profile, tag) => {
    const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map(); let total = 0, idle = 0;
    for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]), dt = profile.timeDeltas[i] || 0; total += dt; const cf = n.callFrame, f = (cf.url || '').split('/').pop(), k = (cf.functionName || '(anon)') + ' ' + (f || '(native)') + ':' + (cf.lineNumber + 1); if (/\(idle\)|\(program\)|\(garbage collector\)/.test(cf.functionName)) { if (cf.functionName === '(idle)') idle += dt; } self.set(k, (self.get(k) || 0) + dt); }
    const busy = total - idle, byFile = new Map(); for (const [k, v] of self) { if (k.startsWith('(idle)')) continue; const f = k.split(' ')[1].split(':')[0] || '(native)'; byFile.set(f, (byFile.get(f) || 0) + v); }
    const pct = (v) => (v / busy * 100).toFixed(1) + '%';
    log(`${tag} sampled ${(total / 1e6).toFixed(1)} s, busy ${(busy / total * 100).toFixed(0)}% of it (game ${(g1 - g0).toFixed(1)} s)`);
    log(`${tag} FILES ` + [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ' ' + pct(v)).join(' | '));
    log(`${tag} TOP ` + [...self].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => k + ' ' + pct(v)).join(' | '));
  };
  sum(profile, 'PAGE'); if (wprof) sum(wprof, 'WORKER');
  log('SECTIONS ' + await ev(`(() => { const s = G.Prof.summary(); return 'frame ' + JSON.stringify(s.frame) + ' | ' + Object.entries(s.sections).filter(([k]) => /^space|^rigs|^render|^radar|^hud/.test(k)).slice(0, 16).map(([k, v]) => k + ' ' + v.avg + ' ms').join(' | '); })()`));
  log('BATTLE ' + await ev(`(async () => { if (!G.ServerLink.sworld) return 'none'; const r = await G.ServerLink.sworld(); return JSON.stringify({ battle: r.w && r.w.prof, worker: r.prof }); })()`));
};
