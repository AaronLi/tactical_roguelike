'use strict';
// .zip files, written and read (the highlights' recordings: js/highlights.js). Each file deflated by the browser's own
// compressor (CompressionStream 'deflate-raw') when it has one and that makes it smaller, else stored as it is; a
// CRC-32 for each, the central directory at the end. No ZIP64: a file and the whole of it under 4 GB.
G.Zip = (() => {
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const te = new TextEncoder(), td = new TextDecoder();
  const piped = async (b, stream) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(stream)).arrayBuffer());
  const deflate = (b) => (typeof CompressionStream === 'function' ? piped(b, new CompressionStream('deflate-raw')).catch(() => null) : Promise.resolve(null));
  const inflate = (b) => piped(b, new DecompressionStream('deflate-raw'));
  // files: [{ name, data: Uint8Array | string }] -> a Blob
  async function write(files) {
    const parts = [], dir = [];
    const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    let off = 0;
    for (const f of files) {
      const raw = typeof f.data === 'string' ? te.encode(f.data) : f.data, name = te.encode(f.name), crc = crc32(raw);
      const z = raw.length > 64 ? await deflate(raw) : null, packed = z && z.length < raw.length ? z : raw, method = packed === raw ? 0 : 8;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
      h.setUint32(14, crc, true); h.setUint32(18, packed.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h, name, packed);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, packed.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      dir.push(c, name);
      off += 30 + name.length + packed.length;
    }
    const dirLen = dir.reduce((a, d) => a + d.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, dirLen, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...dir, e], { type: 'application/zip' });
  }
  // a Blob (or File) -> Map of name -> Uint8Array
  async function read(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
    let e = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('not a zip file');
    const n = dv.getUint16(e + 10, true), out = new Map();
    let p = dv.getUint32(e + 16, true);
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('a broken zip file');
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = td.decode(buf.subarray(p + 46, p + 46 + nl));
      const at = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), packed = buf.subarray(at, at + size);
      if (!name.endsWith('/')) out.set(name, method === 0 ? packed.slice() : method === 8 ? await inflate(packed) : null);
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  return { write, read, crc32 };
})();
