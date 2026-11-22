'use strict';
// A small binary codec for the server's high-rate snapshots (docs/space-server.md, C1 and Bandwidth): a writer and a reader over a
// DataView, little-endian, the first byte a format's version. What a snapshot holds is its own format's business (written field by
// field, in the same order on both sides); this is only the means: fixed-size ints and floats, variable-length unsigned ints, strings
// (UTF-8, their length first), raw bytes, and a float quantised into an int over a range.
// It runs anywhere: the page, the server's thread, and Node (tools/snapcodec_test.mjs).
// (made when first wanted: the file's loaded with the server's, in places that have no TextEncoder till a snapshot's written)
let encC: TextEncoder | null = null, decC: TextDecoder | null = null;
const enc = { encode: (s: string) => (encC || (encC = new TextEncoder())).encode(s) }, dec = { decode: (b: Uint8Array) => (decC || (decC = new TextDecoder())).decode(b) };

export class SnapWriter {
  buf: ArrayBuffer;
  dv: DataView;
  u8a: Uint8Array;
  n = 0; // (bytes written)
  constructor(version: number, size = 1024) {
    this.buf = new ArrayBuffer(Math.max(16, size));
    this.dv = new DataView(this.buf); this.u8a = new Uint8Array(this.buf);
    this.u8(version);
  }
  // (room for k more bytes: the buffer doubled as often as needed)
  need(k: number) {
    if (this.n + k <= this.buf.byteLength) return;
    let s = this.buf.byteLength * 2;
    while (s < this.n + k) s *= 2;
    const b = new ArrayBuffer(s), a = new Uint8Array(b);
    a.set(this.u8a.subarray(0, this.n));
    this.buf = b; this.dv = new DataView(b); this.u8a = a;
  }
  u8(v: number) { this.need(1); this.dv.setUint8(this.n, v); this.n += 1; return this; }
  i8(v: number) { this.need(1); this.dv.setInt8(this.n, v); this.n += 1; return this; }
  u16(v: number) { this.need(2); this.dv.setUint16(this.n, v, true); this.n += 2; return this; }
  i16(v: number) { this.need(2); this.dv.setInt16(this.n, v, true); this.n += 2; return this; }
  u32(v: number) { this.need(4); this.dv.setUint32(this.n, v, true); this.n += 4; return this; }
  i32(v: number) { this.need(4); this.dv.setInt32(this.n, v, true); this.n += 4; return this; }
  f32(v: number) { this.need(4); this.dv.setFloat32(this.n, v, true); this.n += 4; return this; }
  f64(v: number) { this.need(8); this.dv.setFloat64(this.n, v, true); this.n += 8; return this; }
  bool(v: boolean) { return this.u8(v ? 1 : 0); }
  // an unsigned int in 7-bit groups, low first (1 byte under 128, 2 under 16384, ... up to 2^53)
  vu(v: number) {
    v = Math.max(0, Math.floor(v));
    while (v >= 0x80) { this.u8((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
    return this.u8(v);
  }
  // a signed one, zigzagged (small magnitudes either side of 0 are short)
  vi(v: number) { v = Math.trunc(v); return this.vu(v < 0 ? -2 * v - 1 : 2 * v); }
  // v in [lo, hi] as an unsigned int of `bits` bits (8, 16 or 32), rounded to the nearest step; clamped
  q(v: number, lo: number, hi: number, bits: 8 | 16 | 32 = 16) {
    const m = bits === 32 ? 0xffffffff : (1 << bits) - 1, t = Math.round(((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * m);
    return bits === 8 ? this.u8(t) : bits === 16 ? this.u16(t) : this.u32(t);
  }
  str(s: string) { const b = enc.encode(s); this.vu(b.length); return this.bytes(b); }
  bytes(b: Uint8Array) { this.need(b.length); this.u8a.set(b, this.n); this.n += b.length; return this; }
  // the bytes written, as an ArrayBuffer of their own (transferable)
  done(): ArrayBuffer { return this.buf.slice(0, this.n); }
}

export class SnapReader {
  dv: DataView;
  u8a: Uint8Array;
  p = 0;
  version: number;
  constructor(buf: ArrayBuffer | ArrayBufferView) {
    const v = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    this.u8a = v; this.dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
    this.version = this.u8();
  }
  get left() { return this.dv.byteLength - this.p; }
  // (reading past the end throws a RangeError: a short or corrupt snapshot isn't read as zeros)
  at(k: number) { const p = this.p; if (p + k > this.dv.byteLength) throw new RangeError(`snapshot: ${k} bytes wanted at ${p} of ${this.dv.byteLength}`); this.p += k; return p; }
  u8() { return this.dv.getUint8(this.at(1)); }
  i8() { return this.dv.getInt8(this.at(1)); }
  u16() { return this.dv.getUint16(this.at(2), true); }
  i16() { return this.dv.getInt16(this.at(2), true); }
  u32() { return this.dv.getUint32(this.at(4), true); }
  i32() { return this.dv.getInt32(this.at(4), true); }
  f32() { return this.dv.getFloat32(this.at(4), true); }
  f64() { return this.dv.getFloat64(this.at(8), true); }
  bool() { return this.u8() !== 0; }
  vu() { let v = 0, m = 1, b; do { b = this.u8(); v += (b & 0x7f) * m; m *= 0x80; } while (b & 0x80 && m < 2 ** 56); return v; }
  vi() { const z = this.vu(); return z % 2 ? -(z + 1) / 2 : z / 2; }
  q(lo: number, hi: number, bits: 8 | 16 | 32 = 16) {
    const m = bits === 32 ? 0xffffffff : (1 << bits) - 1, t = bits === 8 ? this.u8() : bits === 16 ? this.u16() : this.u32();
    return lo + (t / m) * (hi - lo);
  }
  str() { const k = this.vu(), p = this.at(k); return dec.decode(this.u8a.subarray(p, p + k)); }
  bytes(k: number) { const p = this.at(k); return this.u8a.slice(p, p + k); }
}

export const SnapCodec = { SnapWriter, SnapReader };
