'use strict';
// Peer-to-peer transport (WebRTC via PeerJS). Star topology: the host is the authority,
// clients talk only to the host and the host relays. The host is also a client of itself:
// toHost() / broadcast() short-circuit to local handlers so game code has one path.
G.Net = {
  PREFIX: 'breachproto-v1-',
  peer: null,
  isHost: false,
  solo: false,
  myId: null,
  code: null,
  conns: new Map(),
  hostConn: null,
  onServer: () => {},   // (msg, fromId)   — host only
  onClient: () => {},   // (msg)           — everyone
  onPeerJoin: () => {}, // (id)            — host only
  onPeerLeave: () => {},// (id)            — host only
  onHostLost: () => {}, //                 — clients only

  available() { return typeof window.Peer === 'function'; },
  // How peers find a way to each other: several public STUN servers (a direct path through each side's router),
  // then relays (TURN) when there's no direct path: your own, if you've set one (Settings), then PeerJS's free
  // public one (often down: when it is, only a direct path works).
  opts(debug = 1) {
    const ice = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
    const own = G.U.store.get('turn', null);
    if (own && own.url) ice.push({ urls: own.url.split(/[\s,]+/).filter(Boolean), username: own.user || '', credential: own.pass || '' });
    ice.push({ urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' });
    return { debug, config: { iceServers: ice } };
  },

  // The room code is kept for this tab (a refresh hosts under the same code, so the squad can rejoin it). Just
  // after a refresh the matchmaking server can still be holding the old connection under that code for a
  // moment: try it again a few times before giving up on it for a new one.
  host(cb, attempt = 0) {
    if (!this.available()) return cb('PeerJS failed to load (are you offline?)');
    let kept = null;
    try { kept = sessionStorage.getItem('bp_hostCode'); } catch (e) { /* storage unavailable */ }
    const code = kept && attempt < 6 ? kept : G.U.code(5);
    const peer = new Peer(this.PREFIX + code, this.opts());
    this.peer = peer;
    let opened = false;
    peer.on('open', (id) => {
      opened = true;
      this.myId = id; this.isHost = true; this.code = code;
      try { sessionStorage.setItem('bp_hostCode', code); } catch (e) { /* storage unavailable */ }
      cb(null, code);
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => { this.conns.set(conn.peer, conn); this.onPeerJoin(conn.peer); });
      conn.on('data', (d) => { if (d && typeof d === 'object') this.onServer(d, conn.peer); });
      const drop = () => { if (this.conns.get(conn.peer) === conn) { this.conns.delete(conn.peer); this.onPeerLeave(conn.peer); } };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); });
    peer.on('error', (e) => {
      if (!opened && e.type === 'unavailable-id' && attempt < 10) { peer.destroy(); setTimeout(() => this.host(cb, attempt + 1), kept && attempt < 6 ? 1500 : 0); return; } // (our own code still held: wait; a stranger's: another)
      if (!opened) cb('Could not reach the matchmaking server (' + e.type + ')');
      else console.warn('peer error', e);
    });
  },

  hostSolo() {
    this.solo = true; this.isHost = true; this.myId = 'solo'; this.code = null;
  },

  join(code, cb) {
    if (!this.available()) return cb('PeerJS failed to load (are you offline?)');
    code = code.trim().toUpperCase();
    const peer = new Peer(this.opts());
    this.peer = peer;
    let done = false;
    const finish = (err) => { if (done) return; done = true; clearTimeout(timer); cb(err); };
    const timer = setTimeout(() => finish('Timed out connecting to host. Check the code, or the host\'s network may block peer-to-peer.'), 15000);
    peer.on('open', (id) => {
      this.myId = id;
      const conn = peer.connect(this.PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { this.hostConn = conn; this.code = code; finish(null); });
      conn.on('data', (d) => { if (d && typeof d === 'object') this.onClient(d); });
      conn.on('close', () => { if (this.hostConn === conn) { this.hostConn = null; this.onHostLost(); } });
      conn.on('error', () => finish(this.noRoute));
    });
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') finish('No game found with code ' + code + '.');
      else if (e.type === 'webrtc' || e.type === 'negotiation-failed') finish(this.noRoute);
      else if (!done) finish('Network error: ' + e.type);
      else if (e.type !== 'peer-unavailable') console.warn('peer error', e);
    });
  },

  // ------------------------------------------------------------------ LAN discovery
  // A browser can't broadcast on its network, but everyone behind the same router shares a public address, which
  // WebRTC's STUN server tells us. A host takes one of a few beacon ids on the broker derived from that address;
  // "Find LAN games" knocks on each of them and every host there answers with its code, name and squad size.
  // (Still through the PeerJS broker, like every connection: it needs the internet, but no server of our own.)
  noRoute: 'Found the game, but could not open a connection to the host: neither a direct path through your networks nor the relay worked. Two different browsers on one computer cannot always reach each other; a VPN or a strict firewall can block it too.',
  LAN_SLOTS: 6,
  lanInfo: () => null, // what a host's beacon says about its game (set by G.Game)
  beacon: null,
  async lanKey() {
    if (this._lanKey !== undefined) return this._lanKey;
    let ip = null;
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), ips = [];
      pc.createDataChannel('x');
      pc.onicecandidate = (e) => { const c = e.candidate && e.candidate.candidate; if (c && / typ srflx /.test(c)) ips.push(c.split(' ')[4]); };
      await pc.setLocalDescription(await pc.createOffer());
      for (let i = 0; i < 30 && pc.iceGatheringState !== 'complete' && !ips.some((a) => !a.includes(':')); i++) await new Promise((r) => setTimeout(r, 100));
      pc.close();
      ip = ips.find((a) => !a.includes(':')) || ips[0] || null; // (IPv4 first: behind one router, one address)
    } catch (e) { ip = null; }
    if (!ip) return (this._lanKey = null);
    let h = 2166136261; for (const ch of 'bp-lan|' + ip) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return (this._lanKey = h.toString(36));
  },
  lanId(key, k) { return this.PREFIX + 'lan-' + key + '-' + k; },
  // host: take the first free beacon slot on this network, answer whoever knocks
  async startBeacon() {
    this.stopBeacon();
    const key = await this.lanKey();
    if (!key || !this.isHost || this.solo || !this.peer) return;
    const tryK = (k) => {
      if (k >= this.LAN_SLOTS || !this.isHost || !this.peer) return;
      const b = new Peer(this.lanId(key, k), this.opts(0));
      this.beacon = b;
      let up = false;
      b.on('open', () => { up = true; });
      // (taken by another host on this network: the next slot. Before it's open, any error means that: Firefox
      // reports a taken id as a dropped socket rather than 'unavailable-id')
      b.on('error', (e) => { if (this.beacon === b && (!up || e.type === 'unavailable-id')) { b.destroy(); tryK(k + 1); } });
      b.on('connection', (conn) => {
        conn.on('open', () => { try { conn.send(Object.assign({ t: 'lan' }, this.lanInfo() || {}, { code: this.code })); } catch (e) { /* gone */ } setTimeout(() => conn.close(), 800); });
      });
      b.on('disconnected', () => { if (this.beacon === b && !b.destroyed) b.reconnect(); });
    };
    tryK(0);
  },
  stopBeacon() { try { if (this.beacon) this.beacon.destroy(); } catch (e) { /* gone */ } this.beacon = null; },
  // anyone: the games hosted on this network (resolves with [{ code, name, players, phase }], or null when the
  // network can't be told: no STUN answer)
  async lanScan() {
    if (!this.available()) return null;
    const key = await this.lanKey();
    if (!key) return null;
    return new Promise((resolve) => {
      const found = new Map(), probe = new Peer(this.opts(0));
      const done = () => { try { probe.destroy(); } catch (e) { /* gone */ } resolve([...found.values()].filter((g) => g.code && g.code !== this.code)); };
      const timer = setTimeout(done, 5000);
      probe.on('error', () => { /* (an empty slot: peer-unavailable) */ });
      probe.on('open', () => {
        for (let k = 0; k < this.LAN_SLOTS; k++) {
          const c = probe.connect(this.lanId(key, k), { reliable: true, serialization: 'json' });
          c.on('data', (d) => { if (d && d.t === 'lan' && typeof d.code === 'string') found.set(d.code, { code: d.code, name: String(d.name || '?').slice(0, 16), players: +d.players || 1, phase: String(d.phase || '') }); });
        }
        setTimeout(() => { clearTimeout(timer); done(); }, 3500);
      });
    });
  },

  toHost(msg) {
    if (this.isHost) this.onServer(msg, this.myId);
    else if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  },
  // host only: send to all clients (and handle locally)
  broadcast(msg, exceptId) {
    for (const [id, c] of this.conns) if (id !== exceptId && c.open) { try { c.send(msg); } catch (e) { /* closing */ } }
    if (exceptId !== this.myId) this.onClient(msg);
  },
  sendTo(id, msg) {
    if (id === this.myId) { this.onClient(msg); return; }
    const c = this.conns.get(id);
    if (c && c.open) { try { c.send(msg); } catch (e) { /* closing */ } }
  },
  leave() {
    this.stopBeacon();
    const peer = this.peer;
    this.peer = null; this.hostConn = null; // (first: closing the connection below isn't losing the host, it's leaving)
    try { if (peer) peer.destroy(); } catch (e) { /* already gone */ }
    this.conns.clear();
    this.isHost = false; this.solo = false; this.myId = null; this.code = null;
  },
};
