'use strict';
// The page's end of the host's simulation (docs/threads.md). The simulation (G.Server, js/server.ts, run by js/serverhost.ts)
// has a thread of its own, a worker (js/serverworker.ts); the page is a player like any other: it draws, and it sends what
// you do. When the page hosts, its own player's messages go to the simulation on a MessagePort of their own (toServer) and
// come back on it (to G.Net.onClient); the remote players' come in over PeerJS, which needs the page, so they're relayed
// (fromPeer, join, leave), and what the simulation says to them is sent on from here (G.Net.relay, relayTo). The wire between
// a host and the players who join it is what it was.
// If a worker can't be had (none here, or it won't load), or with ?serverthread=0 in the URL, the simulation runs on the page
// instead: the same code, on ports within the page (mode 'main').
const G_ServerLink = {
  mode: null as 'worker' | 'main' | null,
  worker: null as Worker | null,
  ctl: null as MessagePort | null, // (the control port: for as long as the simulation's thread runs)
  cli: null as MessagePort | null, // (the host's own player's port: this session's)
  up: false,
  ready: null as Promise<void> | null,
  pend: [] as [any, Transferable[]][], // (said before the simulation was up: sent once it is)
  names: null as string[] | null,
  prof: null as { n: number; ms: number; max: number } | null, // (the simulation's last second of ticks: how many, their time, the worst)
  asks: new Map<number, (v: any) => void>(),
  qn: 0,
  warned: new Set<string>(),

  // recording the levels (js/recorder.ts, docs/recording.md): ?rec in the URL, or localStorage.rec = '1'
  recording() {
    try { if (new URLSearchParams(location.search).has('rec')) return true; } catch (e) { /* no URL */ }
    try { return localStorage.getItem('rec') === '1'; } catch (e) { return false; }
  },
  // A level's recording, saved: to the game's own server (serve.js writes it to recordings/), or, served from somewhere that
  // can't take it, downloaded as a file.
  async save(name: string, data: any) {
    const json = JSON.stringify(data), file = String(name).replace(/[^\w.-]/g, '_') + '.json';
    try {
      const r = await fetch('rec?name=' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
      if (r.ok) { console.log(`[rec] saved recordings/${file} (${(json.length / 1048576).toFixed(1)} MB)`); return; }
      console.warn('[rec] the server would not take it (' + r.status + '): downloading it instead');
    } catch (e) { console.warn('[rec] could not reach the server: downloading it instead', e); }
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  wanted() { try { return new URLSearchParams(location.search).get('serverthread') !== '0'; } catch (e) { return true; } },
  // The simulation's thread, started (once a page: its scripts take a moment to load, so it's started with the page, before
  // anyone hosts). Resolves once it's up.
  boot(): Promise<void> {
    if (this.ready) return this.ready;
    return (this.ready = new Promise<void>((done) => {
      const here = (why: string | null) => {
        if (why) console.warn('server thread: ' + why + ': the simulation runs on the page instead');
        this.mode = 'main';
        const ch = new MessageChannel();
        this.listen(ch.port1, done);
        G.ServerHost.attach(ch.port2);
      };
      if (!this.wanted()) return here(null);
      if (typeof Worker !== 'function') return here('this browser has no workers');
      let w: Worker;
      try { w = new Worker('dist/js/serverworker.js'); } catch (e) { return here('the worker could not be made (' + e + ')'); }
      const ch = new MessageChannel();
      let settled = false;
      const timer = setTimeout(() => fail('the worker had not started after 30 s'), 30000);
      const fail = (why: string) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { w.terminate(); } catch (e) { /* gone */ }
        this.worker = null; ch.port1.onmessage = null; ch.port1.close();
        here(why);
      };
      w.onerror = (e: ErrorEvent) => { if (!settled) { e.preventDefault(); fail('the worker would not load (' + (e.message || 'an error') + ')'); } };
      w.onmessage = (e: MessageEvent) => { if (e.data && e.data.k === 'err') fail(String(e.data.err)); };
      this.worker = w; this.mode = 'worker';
      this.listen(ch.port1, () => { settled = true; clearTimeout(timer); done(); });
      w.postMessage({ k: 'boot', ctl: ch.port2 }, [ch.port2]);
    }));
  },
  listen(port: MessagePort, onReady: () => void) {
    this.ctl = port;
    port.onmessage = (e: MessageEvent) => {
      if (port !== this.ctl) return;
      const c = e.data;
      if (!c || typeof c !== 'object') return;
      switch (c.k) {
        case 'ready': this.up = true; for (const [m, tr] of this.pend.splice(0)) port.postMessage(m, tr); onReady(); break;
        case 'bc': G.Net.relay(c.m, c.x); break;
        case 'to': G.Net.relayTo(c.id, c.m); break;
        case 'rec': this.save(c.name, c.data); break;
        case 'prof': this.prof = { n: c.n, ms: c.ms, max: c.max }; break;
        case 'digest': case 'stat': { const f = this.asks.get(c.q); if (f) { this.asks.delete(c.q); f(c); } break; }
      }
    };
  },
  post(c: any, tr: Transferable[] = []) {
    if (this.up && this.ctl) this.ctl.postMessage(c, tr); else this.pend.push([c, tr]);
  },

  // ---------------------------------------------------------------- a session (hosting, or solo)
  start(id: string) {
    this.boot();
    this.close();
    const ch = new MessageChannel(), port = ch.port1;
    this.cli = port;
    port.onmessage = (e: MessageEvent) => { if (this.cli === port && e.data && typeof e.data === 'object') G.Net.onClient(e.data); };
    this.post({ k: 'init', id, cli: ch.port2, rec: this.recording() }, [ch.port2]);
    if (this.names) this.post({ k: 'stickers', names: this.names });
  },
  stop() {
    if (!this.cli) return;
    this.close();
    this.post({ k: 'stop' });
  },
  close() { if (this.cli) { this.cli.onmessage = null; this.cli.close(); this.cli = null; } },
  // the host's own player's message, to the simulation (as a message off the network is: a copy)
  toServer(m: any) {
    const port = this.cli;
    if (!port) return;
    try { port.postMessage(m); } catch (e) {
      const t = String((m && m.t) || '?');
      if (!this.warned.has(t)) { this.warned.add(t); console.warn(`server thread: '${t}' couldn't be copied as it is; sent as JSON`, e); }
      port.postMessage(JSON.parse(JSON.stringify(m)));
    }
  },
  // a remote player's, off their connection; their connection opened, or dropped
  fromPeer(m: any, from: string) { if (this.cli) this.post({ k: 'in', from, m }); },
  join(id: string) { this.post({ k: 'join', id }); },
  leave(id: string) { this.post({ k: 'leave', id }); },
  // the stickers there are (the host's: the sticker box hands out one of them)
  stickers(names: string[]) { this.names = names.slice(); this.post({ k: 'stickers', names: this.names }); },

  // ---------------------------------------------------------------- questions (tests, and hunting a desync)
  ask(k: 'digest' | 'stat', o?: Record<string, unknown>): Promise<any> {
    const q = ++this.qn;
    return new Promise((res) => { this.asks.set(q, res); this.post(Object.assign({ k, q }, o || {})); });
  },
  // the simulation's level against the one on this screen: built from the same seed, they must be the same place
  // (same: the two descriptions are equal, the whole of them as JSON; differ: the parts whose fingerprints differ)
  async digest() {
    const s = await this.ask('digest', { json: true }), m = G.Game.map, parts: Record<string, string> = {};
    const mine = m && !m.hub ? G.ServerHost.digest(m, parts) : null, differ = Object.keys(parts).filter((k) => !s.parts || s.parts[k] !== parts[k]);
    const same = !!s.json && !!m && !!m.desc && s.json === JSON.stringify(m.desc);
    return { server: s.d, client: mine, same, bytes: s.json ? s.json.length : 0, differ, seed: s.seed, level: s.level, th: s.th, night: s.night };
  },
  stat() { return this.ask('stat'); },
};
G.ServerLink = G_ServerLink;
interface GameModules { ServerLink: typeof G_ServerLink; }
