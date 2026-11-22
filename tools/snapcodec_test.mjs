// js/snapcodec.ts's writer and reader, round trip (and the fast channel's reassembly, js/netfast.ts, fed packets by hand: pieces out of
// order, lost, late, a newer message overtaking one being put together, the base64 fallback). After `npx tsc -p .`:
//   node tools/snapcodec_test.mjs
import { SnapWriter, SnapReader } from '../dist/js/snapcodec.js';
import { FastLink, CHUNK, b64, unb64 } from '../dist/js/netfast.js';
let fails = 0, n = 0;
const ok = (c, what) => { n++; if (!c) { fails++; console.log('FAIL', what); } };
const near = (a, b, e) => Math.abs(a - b) <= e;

// ---- the codec
{
  const w = new SnapWriter(3, 16);
  const ints = [0, 1, 127, 128, 300, 16383, 16384, 2 ** 31, 2 ** 40 + 5, Number.MAX_SAFE_INTEGER];
  const sints = [0, -1, 1, -64, 64, -1000000, 1000000, -(2 ** 40)];
  w.u8(255).i8(-128).u16(65535).i16(-32768).u32(4294967295).i32(-2147483648).f32(Math.PI).f64(Math.E).bool(true).bool(false);
  for (const v of ints) w.vu(v);
  for (const v of sints) w.vi(v);
  w.q(12.34, -100, 100, 16).q(-3, -5, 5, 8).q(0.123456789, 0, 1, 32).q(999, 0, 10, 16).str('').str('zone 7 · Ωmega ✓').bytes(new Uint8Array([9, 8, 7]));
  for (let i = 0; i < 2000; i++) w.f32(i * 0.5); // (growing past its first size many times)
  const buf = w.done();
  ok(buf instanceof ArrayBuffer && buf.byteLength === w.n, 'done() is an ArrayBuffer of the bytes written');
  const r = new SnapReader(buf);
  ok(r.version === 3, 'version');
  ok(r.u8() === 255 && r.i8() === -128 && r.u16() === 65535 && r.i16() === -32768 && r.u32() === 4294967295 && r.i32() === -2147483648, 'fixed ints');
  ok(near(r.f32(), Math.PI, 1e-6) && r.f64() === Math.E, 'floats');
  ok(r.bool() === true && r.bool() === false, 'bools');
  for (const v of ints) { const g = r.vu(); ok(g === v, `vu ${v} -> ${g}`); }
  for (const v of sints) { const g = r.vi(); ok(g === v, `vi ${v} -> ${g}`); }
  ok(near(r.q(-100, 100, 16), 12.34, 200 / 65535), 'q16');
  ok(near(r.q(-5, 5, 8), -3, 10 / 255), 'q8');
  ok(near(r.q(0, 1, 32), 0.123456789, 1e-9), 'q32');
  ok(r.q(0, 10, 16) === 10, 'q clamps');
  ok(r.str() === '' && r.str() === 'zone 7 · Ωmega ✓', 'strings');
  ok(r.bytes(3).join() === '9,8,7', 'bytes');
  let all = true; for (let i = 0; i < 2000; i++) if (r.f32() !== i * 0.5) all = false;
  ok(all, 'floats after growing');
  ok(r.left === 0, 'read to the end');
  let threw = false; try { r.u8(); } catch (e) { threw = e instanceof RangeError; }
  ok(threw, 'reading past the end throws');
  const sizes = [[0, 1], [127, 1], [128, 2], [16384, 3]];
  for (const [v, k] of sizes) { const x = new SnapWriter(1); x.vu(v); ok(x.n === 1 + k, `vu ${v} is ${k} bytes`); }
  const view = new Uint8Array(buf.byteLength + 4); view.set(new Uint8Array(buf), 4);
  ok(new SnapReader(view.subarray(4)).version === 3, 'a reader over a view');
}

// ---- the fast channel's reassembly (no channel: packets handed to it by hand)
const DATA = 3, HEAD = 10;
const pieces = (bytes, ch, seq) => {
  const per = CHUNK - HEAD, k = Math.max(1, Math.ceil(bytes.length / per)), out = [];
  for (let i = 0; i < k; i++) {
    const part = bytes.subarray(i * per, Math.min(bytes.length, (i + 1) * per)), p = new Uint8Array(HEAD + part.length), dv = new DataView(p.buffer);
    dv.setUint8(0, DATA); dv.setUint8(1, ch); dv.setUint32(2, seq, true); dv.setUint16(6, i, true); dv.setUint16(8, k, true); p.set(part, HEAD);
    out.push(p.buffer);
  }
  return out;
};
const msg = (size, seed) => { const b = new Uint8Array(size); for (let i = 0; i < size; i++) b[i] = (i * 31 + seed * 7) & 255; return b; };
const same = (a, b) => a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);
{
  const got = [];
  const L = new FastLink(null, (buf, ch) => got.push({ buf, ch }));
  const a = msg(40000, 1), pa = pieces(a, 0, 1);
  ok(pa.length === 3, '40 KB is 3 pieces');
  L.packet(pa[2]); L.packet(pa[0]); ok(got.length === 0, 'not handed on half');
  L.packet(pa[0]); L.packet(pa[1]); ok(got.length === 1 && same(got[0].buf, a) && got[0].ch === 0, 'put together out of order, a duplicate ignored');
  L.packet(pa[1]); ok(got.length === 1, 'a piece of one already handed on: late');
  // a newer message overtakes one being put together
  const b = msg(40000, 2), c = msg(40000, 3), pb = pieces(b, 0, 2), pc = pieces(c, 0, 3);
  L.packet(pb[0]); L.packet(pc[0]); L.packet(pb[1]); L.packet(pb[2]); L.packet(pc[1]); L.packet(pc[2]);
  ok(got.length === 2 && same(got[1].buf, c) && L.st.partial === 1, 'newest wins: 2 given up for 3, its late pieces dropped');
  // a lost piece: that message never comes, the next does
  const d = msg(20000, 4), e = msg(500, 5), pd = pieces(d, 0, 4), pe = pieces(e, 0, 5);
  L.packet(pd[0]); L.packet(pe[0]);
  ok(got.length === 3 && same(got[2].buf, e), 'a message missing a piece is dropped for the next');
  // a late small one
  L.packet(pieces(msg(100, 6), 0, 4)[0]); ok(got.length === 3, 'an older message after a newer one: dropped');
  // streams are their own
  L.packet(pieces(msg(100, 7), 1, 1)[0]); ok(got.length === 4 && got[3].ch === 1, 'stream 1 has its own numbers');
  // the u32 wraps
  L.packet(pieces(msg(10, 8), 2, 0xfffffffe)[0]); L.packet(pieces(msg(10, 9), 2, 1)[0]);
  ok(got.length === 6, 'the sequence number wraps');
  // the fallback's base64
  const f = msg(40000, 10);
  ok(same(unb64(b64(f)).buffer, f), 'base64 round trip');
  L.fallback({ t: 'fastb', c: 0, s: 9, b: b64(f) }); ok(got.length === 7 && same(got[6].buf, f), 'a message the slow way');
  L.fallback({ t: 'fastb', c: 0, s: 8, b: b64(f) }); ok(got.length === 7, 'the slow way is newest-wins too');
  const g = msg(25000, 11), gp = [g.subarray(0, 11000), g.subarray(11000, 22000), g.subarray(22000)];
  gp.forEach((p, i) => { ok(got.length === 7, 'the slow way in pieces: not before the last'); L.fallback({ t: 'fastb', c: 0, s: 10, i, n: 3, b: b64(p) }); });
  ok(got.length === 8 && same(got[7].buf, g), 'the slow way in pieces, put together');
  // a snapshot round trip through both
  const w = new SnapWriter(1); w.u32(1234).f32(1.5).str('ok'); const snap = w.done();
  L.packet(pieces(new Uint8Array(snap), 3, 1)[0]);
  const r = new SnapReader(got[8].buf); ok(r.version === 1 && r.u32() === 1234 && r.f32() === 1.5 && r.str() === 'ok', 'a snapshot through the channel');
}
console.log(`${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
