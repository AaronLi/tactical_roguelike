// Steps for tools/space_shot.mjs: the fast channel's browser test (tools/netfast_test.html), then the game's own path end to end: a page
// hosting and a second game in an iframe joined to it through PeerJS; ServerHost.fast streams to everyone and to one player, every page's
// Net.onFast counts what comes. Twice: the simulation on the page (?serverthread=0) and in its worker (reached through the DevTools
// protocol's target sessions).
//   PORT=8162 node serve.js   (after npx tsc -p .)
//   node tools/space_shot.mjs "mute" tools/netfast_steps.mjs --port 8162 --nowait [--gpu]   (NETFAST=loop|fallback|peerjs|game|game-page|game-worker|all, default all)
export default async ({ ev, send, on, sleep, log }) => {
  const port = +(process.argv[process.argv.indexOf('--port') + 1]) || 8162, which = process.env.NETFAST || 'all', base = `http://127.0.0.1:${port}`;
  const wait = async (expr, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); } return false; };
  let fail = 0;
  const expect = (c, what) => { log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fail++; };
  if (!which.startsWith('game')) {
    await send('Page.navigate', { url: base + '/tools/netfast_test.html' });
    expect(await wait('!!window.__netfastReady'), 'test page loaded');
    const R = await ev(`runTests(${JSON.stringify(which)})`, 180000);
    log(JSON.stringify(R, null, 1));
    for (const [name, s] of Object.entries(R)) {
      if (name === 'fallback') {
        expect(s.modeA === 'reliable' && s.got.n === s.st.sent && s.got.bad === 0 && s.st.fb === s.st.sent, `fallback: ${s.got.n}/${s.st.sent} whole over the reliable channel`);
        expect(s.closed.got.bad === 0 && s.closed.st.fb > 0 && s.closed.got.n === s.closed.st.sent, `fallback after the fast channel closed: ${s.closed.got.n}/${s.closed.st.sent}, ${s.closed.st.fb} the slow way`);
        continue;
      }
      if (s.error) { expect(false, `${name}: ${s.error}`); continue; }
      const sent = s.rates.sent.reduce((a, b) => a + b, 0);
      expect(s.handshake.up, `${name}: both sides on the fast channel`);
      expect(s.rates.got.bad === 0 && s.rates.got.n >= sent * 0.98, `${name}: ${s.rates.got.n}/${sent} paced messages whole (40 KB/20 Hz, 30 KB/10 Hz, 600 B/20 Hz), latency p50 ${s.rates.got.ms50} p95 ${s.rates.got.ms95} max ${s.rates.got.msMax} ms`);
      expect(s.burst.lastArrived && s.burst.bad === 0 && s.burst.inOrder, `${name}: burst of 300 x 40 KB: ${s.burst.got} arrived, ${s.burst.skipped} skipped, the newest arrived, none corrupt or late`);
      expect(s.loss.bad === 0 && Math.abs(s.loss.big - s.loss.expectBig) < 40 && Math.abs(s.loss.small - s.loss.expectSmall) < 40, `${name}: 20% packet loss: 40 KB ${s.loss.big}/200 (expected ~${s.loss.expectBig}), 600 B ${s.loss.small}/200 (~${s.loss.expectSmall}), ${s.loss.partial} given up half-made`);
      expect(s.reverse.n >= 19 && s.reverse.bad === 0, `${name}: the other way: ${s.reverse.n}/20`);
    }
  }
  const game = async (thread) => {
    const tag = thread ? '[worker] ' : '[page] ';
    // the game: host (A, the harness's page) and a joined player (B, an iframe: a game of its own)
    await send('Page.navigate', { url: base + (thread ? '/?mute' : '/?mute&serverthread=0') });
    expect(await wait('!!(window.G && G.Game && G.ServerLink && G.ServerLink.up && document.getElementById("btnHost"))', 120000), tag + 'game page up');
    expect((await ev('G.ServerLink.mode')) === (thread ? 'worker' : 'main'), tag + 'the simulation runs ' + (thread ? 'in its worker' : 'on the page'));
    // (sv(js): evaluated where the simulation is, SH its ServerHost: on the page, or in the worker through the DevTools protocol)
    let sv;
    if (!thread) sv = (js) => ev(`(async () => { const SH = G.ServerHost; return ${js}; })()`, 30000);
    else {
      let sid = null, q = 0; const replies = new Map(); // (sid: the first server thread attached, the host's: the iframe's game starts one of its own later)
      on('Target.attachedToTarget', (p) => { if (!sid && p.targetInfo.type === 'worker' && /serverworker/.test(p.targetInfo.url)) sid = p.sessionId; });
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
      for (let i = 0; i < 40 && !sid; i++) await sleep(100);
      expect(!!sid, tag + 'attached to the server thread');
      on('Target.receivedMessageFromTarget', (p) => { const m = JSON.parse(p.message); if (m.id && replies.has(m.id)) { replies.get(m.id)(m); replies.delete(m.id); } });
      sv = (js) => new Promise((res, rej) => {
        const id = ++q; replies.set(id, (m) => { const r = m.result; if (!r || r.exceptionDetails) rej(new Error(JSON.stringify(r && r.exceptionDetails).slice(0, 400))); else res(r.result.value); });
        send('Target.sendMessageToTarget', { sessionId: sid, message: JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: `(async () => { const SH = (await import('${base}/dist/js/serverhost.js')).ServerHost; return ${js}; })()`, awaitPromise: true, returnByValue: true } }) });
      });
    }
    await ev('G.Game.host(), 1');
    const hosted = await wait('!!(G.Net.code && G.ServerLink.cli)', 30000);
    expect(hosted, tag + 'hosting: ' + (await ev('G.Net.code + " " + document.getElementById("menuMsg").textContent').catch(() => '?')));
    if (!hosted) return;
    await ev(`(() => { const f = document.createElement('iframe'); f.id = 'peerB'; f.style.cssText = 'position:fixed;right:0;bottom:0;width:480px;height:270px;z-index:99999'; f.src = '/?mute'; document.body.appendChild(f); return 1; })()`);
    const B = 'document.getElementById("peerB").contentWindow';
    expect(await wait(`!!(${B}.G && ${B}.G.Game && ${B}.document.getElementById("btnHost"))`, 120000), tag + 'joining game up (iframe)');
    await ev(`(() => { const w = ${B}; w.G.Game.$('joinCode').value = G.Net.code; w.G.Game.join(); return 1; })()`);
    expect(await wait(`!!(${B}.G.Net.hostConn && G.Net.fast.size === 1)`, 30000), tag + 'joined: one remote player, a fast link each side');
    expect(await wait(`G.Net.fastStats()[[...G.Net.fast.keys()][0]].mode === 'fast' && ${B}.G.Net.hostFast.mode === 'fast'`, 5000), tag + 'the fast channel answered on both sides');
    // count what each page gets
    await ev(`(() => { const mk = () => { const t = { n: {}, bad: 0, kb: 0 }; return t; };
      window.__rxA = mk(); window.__rxB = mk();
      const on = (w, t) => w.G.Net.onFast((buf, ch) => { const dv = new DataView(buf); const seq = dv.getUint32(0, true); let good = dv.getUint32(4, true) === buf.byteLength; const b = new Uint8Array(buf); for (let i = 16; good && i < b.length; i += 97) if (b[i] !== ((i * 31 + seq) & 255)) good = false; if (!good) t.bad++; t.n[ch] = (t.n[ch] || 0) + 1; t.kb += buf.byteLength / 1024; });
      on(window, window.__rxA); on(${B}, window.__rxB); return 1; })()`);
    const bId = await ev(`${B}.G.Net.myId`);
    log(tag + 'the simulation: ' + JSON.stringify(await sv(`({ on: SH.on, id: SH.id, remotes: [...SH.remotes], ctl: !!SH.ctl })`)) + ', the joined player ' + bId);
    // stream from the simulation: ch 0 to everyone at 20 Hz (alternately 1 KB and 40 KB), ch 1 to B only at 10 Hz (30 KB), ch 2 to the host's own player only
    const sent = await sv(`(async () => {
      const mk = (seq, size) => { const b = new Uint8Array(size), dv = new DataView(b.buffer); dv.setUint32(0, seq, true); dv.setUint32(4, size, true); for (let i = 16; i < size; i++) b[i] = (i * 31 + seq) & 255; return b.buffer; };
      const me = SH.id, t0 = performance.now(); let k = 0, s = 0, held = 0;
      while (performance.now() - t0 < 4000) { k++; const big = mk(k, k % 2 ? 1000 : 40000); SH.fast(null, big, 0); if (big.byteLength) held++; if (k % 2) { s++; SH.fast(${JSON.stringify(bId)}, mk(s, 30000), 1); SH.fast(me, mk(s, 500), 2); } await new Promise((r) => setTimeout(r, 50)); }
      return { all: k, b: s, own: s, held };
    })()`);
    await sleep(500);
    const R = await ev(`({ sent: ${JSON.stringify(sent)}, A: window.__rxA, B: window.__rxB, stats: G.Net.fastStats(), bStats: ${B}.G.Net.fastStats() })`);
    expect(sent.held === 0, tag + 'the buffers were handed over (transferred: empty where they were made)');
    log(JSON.stringify(R, null, 1));
    expect(R.A.bad === 0 && R.A.n[0] === R.sent.all && R.A.n[2] === R.sent.own && !R.A.n[1], tag + `host's own page: ${R.A.n[0]}/${R.sent.all} of everyone's, ${R.A.n[2]}/${R.sent.own} of its own, none of B's (across the port)`);
    expect(R.B.bad === 0 && R.B.n[0] >= R.sent.all - 1 && R.B.n[1] >= R.sent.b - 1 && !R.B.n[2], tag + `joined page: ${R.B.n[0]}/${R.sent.all} of everyone's, ${R.B.n[1]}/${R.sent.b} of its own, none of the host's (PeerJS fast channel)`);
    // the fallback in the game: B's fast channel closed: the host's link goes the slow way
    await ev(`(() => { const l = [...G.Net.fast.values()][0]; l.dc.close(); return 1; })()`);
    expect(await wait(`[...G.Net.fast.values()][0].mode === 'reliable'`, 3000), tag + 'fast channel closed: the host falls back');
    await ev('window.__b0 = window.__rxB.n[0] || 0');
    await sv(`(async () => { for (let i = 0; i < 20; i++) { const b = new Uint8Array(40000), dv = new DataView(b.buffer); dv.setUint32(0, 100000 + i, true); dv.setUint32(4, 40000, true); for (let j = 16; j < 40000; j++) b[j] = (j * 31 + 100000 + i) & 255; SH.fast(null, b.buffer, 0); await new Promise((r) => setTimeout(r, 50)); } return 1; })()`); await sleep(800);
    const F = await ev(`({ got: window.__rxB.n[0] - window.__b0, bad: window.__rxB.bad, st: [...G.Net.fast.values()][0].st })`);
    expect(F.got === 20 && F.bad === 0, tag + `fallback in the game: ${F.got}/20 x 40 KB over the reliable connection (${F.st.fb} sent so)`);
    // a message the network's way still works beside it (chat)
    const chat = await ev(`(async () => { let got = 0; const w = ${B}; const was = w.G.Net.onClient; w.G.Net.onClient = (m) => { if (m && m.t === 'chat') got++; was(m); }; G.Net.toHost({ t: 'chat', m: 'fast channel test' }); await new Promise((r) => setTimeout(r, 1000)); w.G.Net.onClient = was; return got; })()`);
    expect(chat >= 1, tag + 'the reliable connection still carries the game (a chat line relayed)');
    };
  if (which === 'all' || which === 'game' || which === 'game-page') await game(false);
  if (which === 'all' || which === 'game' || which === 'game-worker') await game(true);
  log(fail ? `${fail} FAILED` : 'all ok');
  if (fail) throw new Error(fail + ' checks failed');
};
