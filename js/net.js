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

  host(cb, attempt = 0) {
    if (!this.available()) return cb('PeerJS failed to load (are you offline?)');
    const code = G.U.code(5);
    const peer = new Peer(this.PREFIX + code, { debug: 1 });
    this.peer = peer;
    let opened = false;
    peer.on('open', (id) => {
      opened = true;
      this.myId = id; this.isHost = true; this.code = code;
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
      if (!opened && e.type === 'unavailable-id' && attempt < 4) { peer.destroy(); this.host(cb, attempt + 1); return; }
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
    const peer = new Peer({ debug: 1 });
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
      conn.on('error', () => finish('Connection to host failed.'));
    });
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') finish('No game found with code ' + code + '.');
      else if (!done) finish('Network error: ' + e.type);
      else if (e.type !== 'peer-unavailable') console.warn('peer error', e);
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
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* already gone */ }
    this.peer = null; this.conns.clear(); this.hostConn = null;
    this.isHost = false; this.solo = false; this.myId = null; this.code = null;
  },
};
