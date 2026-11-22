'use strict';
// The fast channel beside a PeerJS connection (js/net.ts): for the server's high-rate snapshots (docs/space-server.md, C1), which
// are worth nothing once a newer one is out. ArrayBuffers, unordered and unreliable (a lost packet isn't sent again), newest wins.
//
// Why not a second PeerJS DataConnection: PeerJS 1.5's `reliable: false` only makes its channel unordered (`ordered: false`, no
// maxRetransmits: a lost packet is still sent again until it arrives), and each DataConnection is a whole RTCPeerConnection of its
// own, ICE and all, through the matchmaking server again. So the fast channel is a second data channel on the reliable connection's
// own RTCPeerConnection (conn.peerConnection), made the same on both sides with a fixed id (`negotiated: true`): it needs no
// signalling and no renegotiation (the SCTP association is already up), it goes the way the reliable one goes (the direct path, or
// the same relay), and it is truly unreliable (`ordered: false, maxRetransmits: 0`).
//
// A negotiated channel opens on one side whether or not the other made one, so each side says hello on it (every 250 ms) until it
// hears from the other (a hello is answered); until then, or if it never does (an older game, a browser that won't), what's sent
// goes over the reliable JSON connection instead, as base64 ({t:'fastb'}), so nothing is lost but the speed.
//
// On the wire (the fast channel), one packet each: [1] hello, [2] its answer, or a piece of a message:
//   [3][ch u8][seq u32][i u16][n u16][bytes...]
// A message bigger than CHUNK bytes is cut into pieces (an SCTP message over ~16 KB isn't safe between browsers: Firefox to Chrome
// cuts it off at 16384). ch is the stream (the core snapshot, a sensor picture: each has its own newest), seq its message's number;
// a message is handed on only whole and only if it's newer than the last handed on from its stream: a piece of a newer message
// drops the one being put together; a late one is dropped.
export const FAST_ID = 9; // (the channel's stream id: PeerJS's own channel is 0 or 1, one a connection)
export const CHUNK = 16000; // (bytes a packet at most, its header too)
const HEAD = 10, HELLO = 1, ACK = 2, DATA = 3;
const newer = (a: number, b: number) => ((a - b) | 0) > 0; // (a after b, in a u32 that wraps)

export interface FastStats { sent: number; sentB: number; pkts: number; fb: number; skipped: number; got: number; gotB: number; late: number; partial: number; dropped: number }

// conn: a PeerJS DataConnection (JSON, reliable), or anything with its shape: peerConnection, open, send(obj), dataChannel
export class FastLink {
  conn: any;
  dc: RTCDataChannel | null = null;
  ok = false; // (heard from the other side on the fast channel: sending on it is worth it)
  onMsg: (buf: ArrayBuffer, ch: number) => void;
  seq = new Map<number, number>(); // (each stream's last message's number, sent)
  last = new Map<number, number>(); // (each stream's last handed on, got)
  rx = new Map<number, { seq: number; n: number; k: number; parts: (Uint8Array | null)[]; size: number }>(); // (each stream's message being put together)
  hello = 0 as unknown as ReturnType<typeof setInterval>;
  helloUntil = 0;
  drop = 0; // (tests: the share of packets sent on the fast channel thrown away instead)
  maxQueue = 256 * 1024; // (bytes waiting on a channel past which a message is skipped rather than queued: it'd be stale by its turn)
  st: FastStats = { sent: 0, sentB: 0, pkts: 0, fb: 0, skipped: 0, got: 0, gotB: 0, late: 0, partial: 0, dropped: 0 };

  constructor(conn: any, onMsg: (buf: ArrayBuffer, ch: number) => void, opts: { fast?: boolean } = {}) {
    this.conn = conn; this.onMsg = onMsg;
    if (opts.fast !== false) this.openFast();
  }
  openFast() {
    const pc: RTCPeerConnection | undefined = this.conn && this.conn.peerConnection;
    if (!pc || typeof pc.createDataChannel !== 'function') return;
    let dc: RTCDataChannel;
    try { dc = pc.createDataChannel('fast', { negotiated: true, id: FAST_ID, ordered: false, maxRetransmits: 0 }); } catch (e) { console.warn('net: no fast channel (' + e + '): snapshots go over the reliable one', e); return; }
    dc.binaryType = 'arraybuffer';
    this.dc = dc;
    dc.onmessage = (e: MessageEvent) => { if (e.data instanceof ArrayBuffer) this.packet(e.data); };
    dc.onclose = () => { if (this.dc === dc) { this.dc = null; this.ok = false; clearInterval(this.hello); } };
    const greet = () => {
      if (this.ok || performance.now() > this.helloUntil) { clearInterval(this.hello); return; }
      this.raw(new Uint8Array([HELLO]).buffer);
    };
    const start = () => { this.helloUntil = performance.now() + 15000; greet(); clearInterval(this.hello); this.hello = setInterval(greet, 250); };
    if (dc.readyState === 'open') start(); else dc.onopen = start;
  }
  close() {
    clearInterval(this.hello);
    const dc = this.dc; this.dc = null; this.ok = false;
    if (dc) { dc.onmessage = dc.onopen = dc.onclose = null; try { dc.close(); } catch (e) { /* gone */ } }
  }
  get mode() { return this.dc && this.ok && this.dc.readyState === 'open' ? 'fast' : 'reliable'; }

  // (a packet on the fast channel: false if it couldn't be sent)
  raw(b: ArrayBuffer | Uint8Array) {
    const dc = this.dc;
    if (!dc || dc.readyState !== 'open') return false;
    try { dc.send(b as any); return true; } catch (e) { return false; }
  }

  // a message (an ArrayBuffer, or a view of one) to the other side, on stream ch (0-255). It isn't kept: the caller's to reuse.
  send(buf: ArrayBuffer | Uint8Array, ch = 0) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const s = ((this.seq.get(ch) || 0) + 1) >>> 0;
    this.seq.set(ch, s);
    this.st.sent++; this.st.sentB += b.length;
    if (this.mode === 'fast') {
      const dc = this.dc!;
      if (dc.bufferedAmount > this.maxQueue) { this.st.skipped++; return; }
      const per = CHUNK - HEAD, n = Math.max(1, Math.ceil(b.length / per));
      if (n > 0xffff) { this.st.skipped++; return; }
      for (let i = 0; i < n; i++) {
        const part = b.subarray(i * per, Math.min(b.length, (i + 1) * per)), p = new Uint8Array(HEAD + part.length), dv = new DataView(p.buffer);
        dv.setUint8(0, DATA); dv.setUint8(1, ch); dv.setUint32(2, s, true); dv.setUint16(6, i, true); dv.setUint16(8, n, true);
        p.set(part, HEAD);
        this.st.pkts++;
        if (this.drop && Math.random() < this.drop) { this.st.dropped++; continue; }
        this.raw(p);
      }
      return;
    }
    // (the fallback: the reliable connection, base64; skipped too if it's backed up)
    const c = this.conn;
    if (!c || !c.open) { this.st.skipped++; return; }
    const q = c.dataChannel && c.dataChannel.bufferedAmount;
    if (q > this.maxQueue) { this.st.skipped++; return; }
    this.st.fb++;
    try { c.send({ t: 'fastb', c: ch, s, b: b64(b) }); } catch (e) { /* closing */ }
  }

  // the reliable connection's {t:'fastb'}: a message that came the slow way
  fallback(m: any) {
    if (!m || typeof m.b !== 'string') return;
    const ch = (+m.c | 0) & 255, s = m.s >>> 0;
    let bytes: Uint8Array;
    try { bytes = unb64(m.b); } catch (e) { return; }
    this.deliver(ch, s, bytes);
  }

  packet(buf: ArrayBuffer) {
    const dv = new DataView(buf);
    if (!dv.byteLength) return;
    const k = dv.getUint8(0);
    if (k === HELLO) { this.ok = true; this.raw(new Uint8Array([ACK]).buffer); return; }
    if (k === ACK) { this.ok = true; return; }
    if (k !== DATA || dv.byteLength < HEAD) return;
    this.ok = true; // (anything from the other side: it has the channel)
    const ch = dv.getUint8(1), s = dv.getUint32(2, true), i = dv.getUint16(6, true), n = dv.getUint16(8, true);
    const last = this.last.get(ch);
    if (last !== undefined && !newer(s, last)) { this.st.late++; return; }
    const part = new Uint8Array(buf, HEAD);
    if (n <= 1) { this.deliver(ch, s, part); return; }
    if (i >= n) return;
    let r = this.rx.get(ch);
    if (r && r.seq !== s) {
      if (!newer(s, r.seq)) { this.st.late++; return; } // (a piece of an older message than the one being put together)
      this.st.partial++; r = undefined; // (a newer one's begun: the older one's given up)
    }
    if (!r) { r = { seq: s, n, k: 0, parts: new Array(n).fill(null), size: 0 }; this.rx.set(ch, r); }
    if (r.n !== n || r.parts[i]) return;
    r.parts[i] = part; r.k++; r.size += part.length;
    if (r.k < r.n) return;
    this.rx.delete(ch);
    const whole = new Uint8Array(r.size);
    let o = 0;
    for (const p of r.parts) { whole.set(p!, o); o += p!.length; }
    this.deliver(ch, s, whole);
  }

  deliver(ch: number, s: number, bytes: Uint8Array) {
    const last = this.last.get(ch);
    if (last !== undefined && !newer(s, last)) { this.st.late++; return; }
    this.last.set(ch, s);
    const r = this.rx.get(ch);
    if (r && !newer(r.seq, s)) { this.st.partial++; this.rx.delete(ch); }
    this.st.got++; this.st.gotB += bytes.length;
    // (a buffer of its own, exactly the message's: the handler may keep it)
    const out = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? (bytes.buffer as ArrayBuffer) : bytes.slice().buffer;
    try { this.onMsg(out, ch); } catch (e) { console.error('net: a fast message\'s handler threw', e); }
  }
}

export function b64(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}
export function unb64(s: string) {
  const t = atob(s), b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
  return b;
}
