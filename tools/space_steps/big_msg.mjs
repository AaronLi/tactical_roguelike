// A reliable message too big for one PeerJS JSON message (16300 bytes: it drops the player) sent in pieces and put together whole
// (js/net.ts bigSend, bigIn): the host's page and a second game in an iframe joined to it; 60 KB of text with accented letters each
// way (to the host, toHost; from it, relayTo), and the second player still connected after.
//   node tools/space_shot.mjs "mute&board=small&seed=3&host" tools/space_steps/big_msg.mjs --port 8151
export default async ({ ev, sleep, log }) => {
  const wait = async (expr, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); } return false; };
  log('hosting: ' + await wait('!!(G.Net.code && G.Space.S.on)', 60000));
  await ev(`(() => { const f = document.createElement('iframe'); f.id = 'peerB'; f.src = '/?mute'; document.body.appendChild(f); return 1; })()`);
  const B = `document.getElementById('peerB').contentWindow`;
  await wait(`!!(${B}.G && ${B}.G.Game && ${B}.document.getElementById("btnHost"))`, 120000);
  await ev(`(() => { const w = ${B}; w.G.Game.$('joinCode').value = G.Net.code; w.G.Game.join(); return 1; })()`);
  log('joined: ' + await wait(`!!(${B}.G.Net.hostConn && ${B}.G.Net.hostConn.open && G.Net.conns.size === 1)`, 60000));
  const big = "'éàü \\\\\"quote\\\\\" ' + 'x'.repeat(10)";
  await ev(`(() => { window.__got = null; const f0 = G.Net.onServer; G.Net.onServer = function (d, from) { if (d && d.t === '_bigtest') { window.__got = d.d.length + ':' + d.d.slice(0, 12); return; } return f0.call(this, d, from); };
    const w = ${B}, g0 = w.G.Net.onClient; w.__got = null; w.G.Net.onClient = function (d) { if (d && d.t === '_bigtest') { w.__got = d.d.length + ':' + d.d.slice(0, 12); return; } return g0.call(this, d); }; return 1; })()`);
  await ev(`(() => { const w = ${B}, s = (${big}).repeat(4000); w.G.Net.toHost({ t: '_bigtest', d: s }); return s.length; })()`);
  log('to the host: ' + await wait('!!window.__got', 15000) + ' ' + await ev('window.__got'));
  await ev(`(() => { const s = (${big}).repeat(4000), id = [...G.Net.conns.keys()][0]; G.Net.relayTo(id, { t: '_bigtest', d: s }); return s.length; })()`);
  log('from the host: ' + await wait(`!!${B}.__got`, 15000) + ' ' + await ev(`${B}.__got`));
  await sleep(2000);
  log('still connected: ' + await ev(`!!(${B}.G.Net.hostConn && ${B}.G.Net.hostConn.open && G.Net.conns.size === 1)`) + ', expected length ' + await ev(`(${big}).repeat(4000).length`));
};
