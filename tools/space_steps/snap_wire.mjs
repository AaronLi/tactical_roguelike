// The wire to a joined player (docs/space-server.md, Bandwidth): the ground snapshot as what's changed since the last one they have, on
// the fast channel (js/server.ts sendSnap, js/game.ts), and the reliable connection deflated against what's gone before on it (js/net.ts
// zSend). The host's page and a second game in an iframe joined to it, aboard a boarding mission: over a few seconds, every snapshot the
// joined player put back is one the host's own page had whole (the same JSON); the bytes a second on the fast channel by stream and on
// the reliable one (its messages' JSON, and what was sent); then the same with a fifth of the fast channel's packets thrown away.
//   node tools/space_shot.mjs "mute&board=small&seed=3&host" tools/space_steps/snap_wire.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  const wait = async (expr, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); } return false; };
  log('hosting: ' + await wait('!!(G.Net.code && G.Space.S.on && G.Space.S.kind === "board")', 60000));
  await ev(`(() => { const f = document.createElement('iframe'); f.id = 'peerB'; f.style.cssText = 'position:fixed;right:0;bottom:0;width:480px;height:270px;z-index:99999'; f.src = '/?mute'; document.body.appendChild(f); return 1; })()`);
  const B = `document.getElementById('peerB').contentWindow`;
  await wait(`!!(${B}.G && ${B}.G.Game && ${B}.document.getElementById("btnHost"))`, 120000);
  await ev(`(() => { const w = ${B}; w.G.Game.$('joinCode').value = G.Net.code; w.G.Game.join(); return 1; })()`);
  log('B aboard: ' + await wait(`!!(${B}.G.Space && ${B}.G.Space.S.on && ${B}.G.Space.S.kind === 'board' && ${B}.G.Game.phase === 'level')`, 120000));
  await sleep(3000);
  // what each page's game is handed as a snapshot (the host's whole, across the thread; B's put back), and the bytes out of the host
  await ev(`(() => { const strip = (m) => { const o = { ...m }; delete o.L; return JSON.stringify(o); };
    window.__A = []; const a0 = G.Game.onMsg.bind(G.Game); G.Game.onMsg = (m) => { if (m && m.t === 'snap') { __A.push(strip(m)); if (__A.length > 200) __A.shift(); } return a0(m); };
    const w = ${B}; w.__B = []; const b0 = w.G.Game.onMsg.bind(w.G.Game); w.G.Game.onMsg = (m) => { if (m && m.t === 'snap') w.__B.push(strip(m)); return b0(m); };
    window.__fb = {}; const f0 = G.Net.fastOut.bind(G.Net); G.Net.fastOut = (to, buf, ch, own) => { if (to !== null || G.Net.fast.size) { const k = 'ch' + ch; __fb[k] = (__fb[k] || 0) + buf.byteLength * (to === null ? G.Net.fast.size : 1); } return f0(to, buf, ch, own); };
    return 1; })()`);
  const run = async (tag, secs) => {
    const z0 = await ev('JSON.stringify(G.Net.zStats())'), zb0 = await ev(`JSON.stringify(${B}.G.Net.zStats())`);
    await ev(`(() => { window.__fb = {}; ${B}.__B = []; return 1; })()`);
    await sleep(secs * 1000);
    await ev(`(() => { const w = ${B}; w.__Bk = w.__B; w.__B = []; return 1; })()`); await sleep(500); // (what B had, set aside; the host's page's own copies of the last of them given time to come)
    log(tag + ' ' + await ev(`(() => { const w = ${B}, A = new Set(__A), got = w.__Bk, ok = got.filter((s) => A.has(s)).length;
      const z0 = ${z0}, z1 = G.Net.zStats(), zb0 = ${zb0}, zb1 = w.G.Net.zStats(), per = (o1, o0, k) => { let a = 0; for (const id of Object.keys(o1)) if (o1[id]) a += o1[id][k] - ((o0[id] || {})[k] || 0); return a; };
      const kbs = (b) => +(b / ${secs} / 1000).toFixed(2), fast = Object.fromEntries(Object.entries(__fb).map(([k, v]) => [k, kbs(v)]));
      return JSON.stringify({ snapshotsToB: +(got.length / ${secs}).toFixed(1) + '/s', putBackExactly: ok + '/' + got.length, fastKBs: fast,
        reliableDown: { jsonKBs: kbs(per(z1, z0, 'json')), sentKBs: kbs(per(z1, z0, 'sent')) }, reliableUp: { jsonKBs: kbs(per(zb1, zb0, 'json')), sentKBs: kbs(per(zb1, zb0, 'sent')) }, deflateOn: { down: Object.values(z1).some((q) => q && q.on), up: Object.values(zb1).some((q) => q && q.on) } }); })()`));
  };
  await run('clean', 5);
  await ev(`(() => { for (const l of G.Net.fast.values()) l.drop = 0.2; return 1; })()`);
  await run('20% of fast packets lost', 5);
  await ev(`(() => { for (const l of G.Net.fast.values()) l.drop = 0; return 1; })()`);
  log('B still connected: ' + await ev(`!!(${B}.G.Net.hostConn && ${B}.G.Net.hostConn.open)`));
};
