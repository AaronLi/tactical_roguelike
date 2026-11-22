'use strict';
import { ReplayEnv } from './replayenv.js';
import { Hooks, U } from './util.js';
import { ServerLink } from './serverlink.js';
import { FastLink } from './netfast.js';
// Peer-to-peer transport (WebRTC via PeerJS). Star topology: the host is the authority,
// clients talk only to the host and the host relays. The host's authority is its simulation, in a thread of its own
// (js/serverlink.ts, docs/threads.md), and the host's game is a client of it like any other: toHost() goes to it on a port
// of its own, and its word comes back to onClient. What it says to the remote players is sent from here (relay, relayTo),
// and what they send comes in to onServer (js/game.ts hands it on to the simulation).
// Beside each connection, a fast one (js/netfast.ts): binary, unordered, unreliable, newest wins, for the simulation's high-rate
// snapshots (docs/space-server.md, C1). The simulation sends them with ServerHost.fast (to one player or everyone, a stream of its
// own each); the host's own page gets them across the thread's port (js/serverlink.ts), the remote players on their fast
// channel (or the reliable one, base64, where there's no fast one); every page hands them to onFast.
// PeerJS 1.5's JSON connection refuses a message of 16300 bytes or more, with an error that drops the player. One bigger goes in
// pieces (_pc: its JSON's UTF-8 bytes in base64, 11000 bytes a piece, as js/netfast.ts's slow way), put together again where it
// arrives (bigIn: the message whole, or null while pieces are still to come)
const BIG = 15000, BIG_PIECE = 11000;
let bigN = 0;
// The reliable connection compressed (each way on its own): every message deflated with what's gone before on it as its dictionary (the
// last 32 KB of the messages sent that way, the same on both sides: the connection's in order and nothing's lost), so one like the last
// costs little more than what changed (a snapshot 2.3 KB as JSON: some 90 bytes). One message at a time and at once (not a stream:
// fflate's streaming inflate holds back a message's end till more comes). On the wire {t:'z', d: base64}. Each side says it can ({t:'zhi'},
// once fflate's loaded); till the other's said so, what's sent to it is JSON as it is. fflate from jsDelivr, pinned, loaded when a
// connection opens (the game runs without it: nothing's compressed)
const FF_URL = 'https://cdn.jsdelivr.net/npm/fflate@0.8.3/+esm', Z_HIST = 32768;
let FF: any = null, ffP: Promise<any> | null = null;
function ffLoad(): Promise<any> { if (!ffP) ffP = import(/* @vite-ignore */ FF_URL as string).then((m) => (FF = m)).catch((e) => { console.warn('net: no compression (fflate did not load)', e); return null; }); return ffP; }
type ZSide = { on: boolean; sent: Uint8Array; got: Uint8Array; inB: number; outB: number; rawB: number };
const zOf = (conn: any): ZSide => conn._z || (conn._z = { on: false, sent: new Uint8Array(0), got: new Uint8Array(0), inB: 0, outB: 0, rawB: 0 });
const zHist = (h: Uint8Array, u: Uint8Array) => { const c = new Uint8Array(Math.min(Z_HIST, h.length + u.length)), keep = c.length - u.length; if (keep > 0) c.set(h.subarray(h.length - keep), 0); c.set(keep >= 0 ? u : u.subarray(-keep), Math.max(0, keep)); return c; };
const b64 = (u: Uint8Array) => { let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000))); return btoa(b); };
const unb64 = (s: string) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
// (said once a connection's open: this side can read what's deflated)
function zHello(conn: any) { ffLoad().then(() => { if (FF && conn.open) { try { conn.send({ t: 'zhi' }); } catch (e) { /* gone */ } } }); }
// (a message come: a hello noted (null back), a deflated one inflated, anything else as it is)
function zIn(conn: any, d: any): any {
  if (!d || typeof d !== 'object') return d;
  if (d.t === 'zhi') { zOf(conn).on = true; return null; }
  if (d.t !== 'z' || typeof d.d !== 'string') return d;
  if (!FF) { console.error('net: a deflated message and no fflate to read it'); return null; }
  const z = zOf(conn), u = FF.inflateSync(unb64(d.d), z.got.length ? { dictionary: z.got } : undefined);
  z.got = zHist(z.got, u);
  try { return JSON.parse(new TextDecoder().decode(u)); } catch (e) { console.error('net: a deflated message read wrong', e); return null; }
}
// (a message out: deflated where the other side can read it)
function zSend(conn: any, msg: any) {
  const z = conn._z as ZSide | undefined;
  if (!FF || !z || !z.on) { bigSend(conn, msg); return; }
  const u = new TextEncoder().encode(JSON.stringify(msg)), d = FF.deflateSync(u, z.sent.length ? { level: 6, dictionary: z.sent } : { level: 6 });
  z.sent = zHist(z.sent, u); z.rawB += u.length; z.outB += d.length;
  bigSend(conn, { t: 'z', d: b64(d) });
}
const bigParts = new Map<string, { n: number; got: number; d: string[]; at: number }>();
function bigSend(conn: any, msg: any) {
  const js = JSON.stringify(msg);
  if (js.length < BIG / 3 || new TextEncoder().encode(js).length < BIG) { conn.send(msg); return; }
  const u = new TextEncoder().encode(js), n = Math.ceil(u.length / BIG_PIECE), id = (++bigN).toString(36) + ':' + Date.now().toString(36);
  for (let i = 0; i < n; i++) { let b = ''; const part = u.subarray(i * BIG_PIECE, (i + 1) * BIG_PIECE); for (let j = 0; j < part.length; j++) b += String.fromCharCode(part[j]); conn.send({ t: '_pc', id, i, n, d: btoa(b) }); }
}
function bigIn(d: any, from: string): any {
  if (!d || d.t !== '_pc') return d;
  const key = from + '|' + d.id, now = Date.now(); let p = bigParts.get(key);
  if (!p) { p = { n: d.n | 0, got: 0, d: [], at: now }; bigParts.set(key, p); for (const [k, q] of bigParts) if (now - q.at > 30000) bigParts.delete(k); } // (one never finished: let go)
  if (p.d[d.i] == null && typeof d.d === 'string') { p.d[d.i] = d.d; p.got++; }
  if (p.got < p.n) return null;
  bigParts.delete(key);
  const bin = p.d.map((x) => atob(x)).join(''), u = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j);
  try { return JSON.parse(new TextDecoder().decode(u)); } catch (e) { console.error('net: a message in pieces put together wrong', e); return null; }
}
export const Net = {
  PREFIX: 'breachproto-v1-',
  peer: null as any,
  isHost: false,
  solo: false,
  myId: null as string | null,
  code: null as string | null,
  conns: new Map<string, any>(),
  hostConn: null as any,
  onServer: (() => {}) as (msg: any, from: string) => void,   // (msg, fromId)   — host only: a remote player's
  onClient: (() => {}) as (msg: any) => void,   // (msg)           — everyone
  onPeerJoin: (() => {}) as (id: string) => void, // (id)            — host only
  onPeerLeave: (() => {}) as (id: string) => void,// (id)            — host only
  onHostLost: () => {}, //                 — clients only
  fast: new Map<string, FastLink>(), // (host: each remote player's fast channel)
  hostFast: null as FastLink | null, // (client: the one to the host)
  fastFns: [] as ((buf: ArrayBuffer, ch: number) => void)[],
  // a snapshot from the simulation (every page, the host's too): buf is the handler's to keep; ch its stream
  onFast(fn: (buf: ArrayBuffer, ch: number) => void) { this.fastFns.push(fn); return () => { this.fastFns = this.fastFns.filter((f) => f !== fn); }; },
  gotFast(buf: ArrayBuffer, ch: number) { for (const f of this.fastFns) { try { f(buf, ch); } catch (e) { console.error('net: an onFast handler threw', e); } } },
  // host only: the simulation's snapshot (js/serverlink.ts, {k:'fast'}) to a remote player, or to every remote player (to null);
  // own: whether it's the host's own page's too (it's handed to onFast last: the remotes' copies are made first)
  fastOut(to: string | null, buf: ArrayBuffer, ch: number, own: boolean) {
    if (to === null) { for (const l of this.fast.values()) l.send(buf, ch); }
    else { const l = this.fast.get(to); if (l) l.send(buf, ch); }
    if (own) this.gotFast(buf, ch);
  },
  // (tests and F8: how each fast channel is doing)
  fastStats() {
    const r: Record<string, unknown> = {};
    for (const [id, l] of this.fast) r[id] = { mode: l.mode, ...l.st };
    if (this.hostFast) r.host = { mode: this.hostFast.mode, ...this.hostFast.st };
    return r;
  },
  // (tests: the reliable connections' compression: bytes of JSON sent, and deflated)
  zStats() {
    const r: Record<string, unknown> = {}, one = (c: any) => (c && c._z ? { on: c._z.on, json: c._z.rawB, sent: c._z.outB } : null);
    for (const [id, c] of this.conns) r[id] = one(c);
    if (this.hostConn) r.host = one(this.hostConn);
    return r;
  },

  available() { return typeof window.Peer === 'function'; },
  // How peers find a way to each other: several public STUN servers (a direct path through each side's router),
  // then relays (TURN) when there's no direct path: your own, if you've set one (Settings), then PeerJS's free
  // public one (often down: when it is, only a direct path works).
  opts(debug = 1) {
    const ice: RTCIceServer[] = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
    const own = U.store.get('turn', null);
    if (own && own.url) ice.push({ urls: own.url.split(/[\s,]+/).filter(Boolean), username: own.user || '', credential: own.pass || '' });
    ice.push({ urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' });
    return { debug, config: { iceServers: ice } };
  },

  // The room code is kept for this tab (a refresh hosts under the same code, so the squad can rejoin it). Just
  // after a refresh the matchmaking server can still be holding the old connection under that code for a
  // moment: try it again a few times before giving up on it for a new one.
  host(cb: (err: string | null, code?: string) => void, attempt = 0) {
    if (!this.available()) return cb('PeerJS failed to load (are you offline?)');
    let kept = null;
    try { kept = sessionStorage.getItem('bp_hostCode'); } catch (e) { /* storage unavailable */ }
    const code = kept && attempt < 6 ? kept : U.code(5);
    const peer = new Peer(this.PREFIX + code, this.opts());
    this.peer = peer;
    let opened = false;
    peer.on('open', (id: string) => {
      opened = true;
      this.myId = id; this.isHost = true; this.code = code;
      try { sessionStorage.setItem('bp_hostCode', code); } catch (e) { /* storage unavailable */ }
      cb(null, code);
    });
    peer.on('connection', (conn: any) => {
      let fl: FastLink | null = null;
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        const old = this.fast.get(conn.peer); if (old) old.close();
        this.fast.set(conn.peer, (fl = new FastLink(conn, () => { /* (nothing comes up this way yet) */ })));
        zHello(conn);
        this.onPeerJoin(conn.peer);
      });
      conn.on('data', (d0: any) => { const d = zIn(conn, bigIn(d0, conn.peer)); if (d && typeof d === 'object') { if (d.t === 'fastb') { if (fl) fl.fallback(d); } else this.onServer(d, conn.peer); } });
      const drop = () => {
        if (fl) { fl.close(); if (this.fast.get(conn.peer) === fl) this.fast.delete(conn.peer); fl = null; }
        if (this.conns.get(conn.peer) === conn) { this.conns.delete(conn.peer); this.onPeerLeave(conn.peer); }
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); });
    peer.on('error', (e: any) => {
      if (!opened && e.type === 'unavailable-id' && attempt < 10) { peer.destroy(); setTimeout(() => this.host(cb, attempt + 1), kept && attempt < 6 ? 1500 : 0); return; } // (our own code still held: wait; a stranger's: another)
      if (!opened) cb('Could not reach the matchmaking server (' + e.type + ')');
      else console.warn('peer error', e);
    });
  },

  hostSolo() {
    this.solo = true; this.isHost = true; this.myId = 'solo'; this.code = null;
  },

  join(code: string, cb: (err: string | null) => void) {
    if (!this.available()) return cb('PeerJS failed to load (are you offline?)');
    code = code.trim().toUpperCase();
    const peer = new Peer(this.opts());
    this.peer = peer;
    let done = false;
    const finish = (err: string | null) => { if (done) return; done = true; clearTimeout(timer); cb(err); };
    const timer = setTimeout(() => finish('Timed out connecting to host. Check the code, or the host\'s network may block peer-to-peer.'), 15000);
    peer.on('open', (id: string) => {
      this.myId = id;
      const conn = peer.connect(this.PREFIX + code, { reliable: true, serialization: 'json' });
      let fl: FastLink | null = null;
      conn.on('open', () => {
        this.hostConn = conn; this.code = code;
        if (this.hostFast) this.hostFast.close();
        this.hostFast = fl = new FastLink(conn, (buf, ch) => { if (this.hostConn === conn) this.gotFast(buf, ch); });
        zHello(conn);
        finish(null);
      });
      conn.on('data', (d0: any) => { const d = zIn(conn, bigIn(d0, 'host')); if (d && typeof d === 'object') { if (d.t === 'fastb') { if (fl) fl.fallback(d); } else this.onClient(d); } });
      conn.on('close', () => {
        if (fl) { fl.close(); if (this.hostFast === fl) this.hostFast = null; fl = null; }
        if (this.hostConn === conn) { this.hostConn = null; this.onHostLost(); }
      });
      conn.on('error', () => finish(this.noRoute));
    });
    peer.on('error', (e: any) => {
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
  lanInfo: (() => null) as () => any, // what a host's beacon says about its game (set by Game)
  beacon: null as any,
  _lanKey: undefined as string | null | undefined, // (this network's key, once worked out)
  async lanKey() {
    if (this._lanKey !== undefined) return this._lanKey;
    let ip: string | null = null;
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }), ips: string[] = [];
      pc.createDataChannel('x');
      pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => { const c = e.candidate && e.candidate.candidate; if (c && / typ srflx /.test(c)) ips.push(c.split(' ')[4]); };
      await pc.setLocalDescription(await pc.createOffer());
      for (let i = 0; i < 30 && pc.iceGatheringState !== 'complete' && !ips.some((a) => !a.includes(':')); i++) await new Promise((r) => setTimeout(r, 100));
      pc.close();
      ip = ips.find((a) => !a.includes(':')) || ips[0] || null; // (IPv4 first: behind one router, one address)
    } catch (e) { ip = null; }
    if (!ip) return (this._lanKey = null);
    let h = 2166136261; for (const ch of 'bp-lan|' + ip) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return (this._lanKey = h.toString(36));
  },
  lanId(key: string, k: number) { return this.PREFIX + 'lan-' + key + '-' + k; },
  // host: take the first free beacon slot on this network, answer whoever knocks
  async startBeacon() {
    this.stopBeacon();
    const key = await this.lanKey();
    if (!key || !this.isHost || this.solo || !this.peer) return;
    const tryK = (k: number) => {
      if (k >= this.LAN_SLOTS || !this.isHost || !this.peer) return;
      const b = new Peer(this.lanId(key, k), this.opts(0));
      this.beacon = b;
      let up = false;
      b.on('open', () => { up = true; });
      // (taken by another host on this network: the next slot. Before it's open, any error means that: Firefox
      // reports a taken id as a dropped socket rather than 'unavailable-id')
      b.on('error', (e: any) => { if (this.beacon === b && (!up || e.type === 'unavailable-id')) { b.destroy(); tryK(k + 1); } });
      b.on('connection', (conn: any) => {
        conn.on('open', () => { try { conn.send(Object.assign({ t: 'lan' }, this.lanInfo() || {}, { code: this.code })); } catch (e) { /* gone */ } setTimeout(() => conn.close(), 800); });
      });
      b.on('disconnected', () => { if (this.beacon === b && !b.destroyed) b.reconnect(); });
    };
    tryK(0);
  },
  stopBeacon() { try { if (this.beacon) this.beacon.destroy(); } catch (e) { /* gone */ } this.beacon = null; },
  // anyone: the games hosted on this network (resolves with [{ code, name, players, phase }], or null when the
  // network can't be told: no STUN answer)
  async lanScan(): Promise<any[] | null> {
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
          c.on('data', (d: any) => { if (d && d.t === 'lan' && typeof d.code === 'string') found.set(d.code, { code: d.code, name: String(d.name || '?').slice(0, 16), players: +d.players || 1, phase: String(d.phase || '') }); });
        }
        setTimeout(() => { clearTimeout(timer); done(); }, 3500);
      });
    });
  },

  toHost(msg: any) {
    if (this.isHost) ServerLink.toServer(msg); // (the simulation's thread: js/serverlink.ts)
    else if (this.hostConn && this.hostConn.open) zSend(this.hostConn, msg);
  },
  // host only: what the simulation says to every remote player (but exceptId), and to one of them (js/serverlink.ts)
  relay(msg: any, exceptId?: string | null) {
    for (const [id, c] of this.conns) if (id !== exceptId && c.open) { try { zSend(c, msg); } catch (e) { /* closing */ } }
  },
  relayTo(id: string, msg: any) {
    const c = this.conns.get(id);
    if (c && c.open) { try { zSend(c, msg); } catch (e) { /* closing */ } }
  },
  leave() {
    this.stopBeacon();
    const peer = this.peer;
    for (const l of this.fast.values()) l.close();
    this.fast.clear();
    if (this.hostFast) { this.hostFast.close(); this.hostFast = null; }
    this.peer = null; this.hostConn = null; // (first: closing the connection below isn't losing the host, it's leaving)
    try { if (peer) peer.destroy(); } catch (e) { /* already gone */ }
    this.conns.clear();
    this.isHost = false; this.solo = false; this.myId = null; this.code = null;
  },
};
ReplayEnv.Net = Net; // (what the replay asks of it: js/replayenv.ts)
Hooks.online = () => !!Net.myId; // (whether there's a host to tell about your sticker skin: js/stickers.ts share)
Hooks.toHost = (m) => Net.toHost(m);

