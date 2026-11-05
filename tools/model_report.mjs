// A side view of a gun as a PNG, with no GPU: a tiny z-buffered triangle rasteriser (forward to the right, up up, the lateral axis as depth). Used by
// tools/check_models_assembly.mjs --report to show a wrong build: the assembled gun | the recipe's | where they differ, with markers at info.support
// (a plus) and the sight point (an x at [fSight, sy]).
import fs from 'fs'; import zlib from 'zlib';
import { meshesOf } from './model_sweep.mjs';

const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), cr = Buffer.alloc(4); len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
export function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const slotColour = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; const a = (h % 360) / 60, f = a - Math.floor(a), q = 1 - f, v = 0.85, k = Math.floor(a) % 6; return [[v, v * f, 0.15], [v * q, v, 0.15], [0.15, v, v * f], [0.15, v * q, v], [v * f, 0.15, v], [v, 0.15, v * q]][k].map((x) => Math.round(x * 255)); };

/** Rasterises a gun's meshes (meshesOf) into { id: Int16Array of slot index per pixel (-1 none), shade: Uint8Array } in a w x h frame: forward f in [f0, f0 + w / s], up y in [y0, y0 + h / s]. */
function raster(ms, w, h, f0, y0, s, tags) {
  const id = new Int16Array(w * h).fill(-1), depth = new Float32Array(w * h).fill(-1e9), shade = new Uint8Array(w * h);
  for (const m of ms) {
    const ti = tags.indexOf(m.tag), v = m.v;
    for (let i = 0; i < v.length; i += 9) {
      const px = [0, 1, 2].map((k) => (-v[i + k * 3 + 2] - f0) * s), py = [0, 1, 2].map((k) => h - 1 - (v[i + k * 3 + 1] - y0) * s), dz = [0, 1, 2].map((k) => v[i + k * 3]);
      const x0 = Math.max(0, Math.floor(Math.min(...px))), x1 = Math.min(w - 1, Math.ceil(Math.max(...px))), y1 = Math.min(h - 1, Math.ceil(Math.max(...py))), y0b = Math.max(0, Math.floor(Math.min(...py)));
      const d = (py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2]); if (Math.abs(d) < 1e-9) continue;
      // a flat shade from the face's normal (the lateral component: faces toward the viewer are lighter)
      const ax = v[i + 3] - v[i], ay = v[i + 4] - v[i + 1], az = v[i + 5] - v[i + 2], bx = v[i + 6] - v[i], by = v[i + 7] - v[i + 1], bz = v[i + 8] - v[i + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, nl = Math.hypot(nx, ny, nz) || 1, sh = 150 + Math.round(90 * Math.abs(nx / nl));
      for (let y = y0b; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const l1 = ((py[1] - py[2]) * (x + 0.5 - px[2]) + (px[2] - px[1]) * (y + 0.5 - py[2])) / d, l2 = ((py[2] - py[0]) * (x + 0.5 - px[2]) + (px[0] - px[2]) * (y + 0.5 - py[2])) / d, l3 = 1 - l1 - l2;
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
        const z = l1 * dz[0] + l2 * dz[1] + l3 * dz[2], o = y * w + x;
        if (z > depth[o]) { depth[o] = z; id[o] = ti; shade[o] = sh; }
      }
    }
  }
  return { id, shade };
}
function cross(buf, W, w, h, ox, f0, y0, s, f, y, col, plus) {
  const cx = Math.round(ox + (f - f0) * s), cy = Math.round(h - 1 - (y - y0) * s);
  for (let d = -6; d <= 6; d++) for (const [x, yy] of plus ? [[cx + d, cy], [cx, cy + d]] : [[cx + d, cy + d], [cx + d, cy - d]]) if (x >= ox && x < ox + w && yy >= 0 && yy < h) { const o = (yy * W + x) * 3; buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; }
}

/** Writes `file`: the assembled gun | the recipe's | the difference (a pixel where the slot showing differs is red, where only one has anything, magenta / cyan). */
export async function sideBySide(file, w, asm, proc) {
  const a = meshesOf(asm.group, asm.info), p = meshesOf(proc.group, proc.info), all = [...a, ...p];
  const tags = [...new Set(all.map((m) => m.tag))].sort();
  let fmin = 1e9, fmax = -1e9, ymin = 1e9, ymax = -1e9;
  for (const m of all) for (let i = 0; i < m.v.length; i += 3) { const f = -m.v[i + 2], y = m.v[i + 1]; if (f < fmin) fmin = f; if (f > fmax) fmax = f; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  const s = Math.min(1100 / (fmax - fmin + 0.04), 420 / (ymax - ymin + 0.04)), f0 = fmin - 0.02, y0 = ymin - 0.02, pw = Math.ceil((fmax - fmin + 0.04) * s), ph = Math.ceil((ymax - ymin + 0.04) * s), gap = 6, W = pw * 3 + gap * 2;
  const A = raster(a, pw, ph, f0, y0, s, tags), P = raster(p, pw, ph, f0, y0, s, tags), buf = Buffer.alloc(W * ph * 3, 245);
  const put = (x, y, c) => { const o = (y * W + x) * 3; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; };
  const cols = tags.map(slotColour);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const o = y * pw + x, shade = (r, k) => { const i = r.id[o]; if (i < 0) return null; const sh = r.shade[o] / 255; return cols[i].map((c) => Math.round(c * sh)); };
    const ca = shade(A, 0), cp = shade(P, 1);
    if (ca) put(x, y, ca); if (cp) put(x + pw + gap, y, cp);
    const same = A.id[o] === P.id[o];
    put(x + 2 * (pw + gap), y, same ? (A.id[o] < 0 ? [250, 250, 250] : [205, 205, 205]) : A.id[o] < 0 ? [0, 190, 230] : P.id[o] < 0 ? [230, 0, 200] : [230, 30, 30]);
  }
  const sup = (info) => info.support, sight = (info) => [info.fSight, info.sy];
  for (const [ox, info] of [[0, asm.info], [pw + gap, proc.info], [2 * (pw + gap), asm.info]]) {
    cross(buf, W, pw, ph, ox, f0, y0, s, sup(info)[0], sup(info)[1], [0, 120, 0], true); cross(buf, W, pw, ph, ox, f0, y0, s, sight(info)[0], sight(info)[1], [0, 60, 220], false);
  }
  cross(buf, W, pw, ph, 2 * (pw + gap), f0, y0, s, proc.info.support[0], proc.info.support[1], [200, 120, 0], true); cross(buf, W, pw, ph, 2 * (pw + gap), f0, y0, s, proc.info.fSight, proc.info.sy, [200, 120, 0], false);
  writePng(file, W, ph, buf);
}

/**
 * Side views of several guns of one platform on a COMMON frame and scale (so lengths and heights compare across the sheet): writes files[i] for asms[i]
 * (the gun assembled, one colour per slot, w pixels wide); returns the slot legend [{ tag, rgb }].
 */
export function sideViews(files, asms, w = 760) {
  const all = asms.map((a) => meshesOf(a.group, a.info));
  let fmin = 1e9, fmax = -1e9, ymin = 1e9, ymax = -1e9;
  for (const ms of all) for (const m of ms) for (let i = 0; i < m.v.length; i += 3) { const f = -m.v[i + 2], y = m.v[i + 1]; if (f < fmin) fmin = f; if (f > fmax) fmax = f; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  const s = w / (fmax - fmin + 0.04), f0 = fmin - 0.02, y0 = ymin - 0.02, pw = Math.ceil((fmax - fmin + 0.04) * s), ph = Math.ceil((ymax - ymin + 0.04) * s);
  const tags = [...new Set(all.flatMap((ms) => ms.map((m) => m.tag)))].sort(), cols = tags.map(slotColour);
  all.forEach((ms, k) => {
    const R = raster(ms, pw, ph, f0, y0, s, tags), buf = Buffer.alloc(pw * ph * 3, 245);
    for (let o = 0; o < pw * ph; o++) { const i = R.id[o]; if (i < 0) continue; const sh = R.shade[o] / 255; for (let c = 0; c < 3; c++) buf[o * 3 + c] = Math.round(cols[i][c] * sh); }
    cross(buf, pw, pw, ph, 0, f0, y0, s, asms[k].info.support[0], asms[k].info.support[1], [0, 120, 0], true); cross(buf, pw, pw, ph, 0, f0, y0, s, asms[k].info.fSight, asms[k].info.sy, [0, 60, 220], false);
    writePng(files[k], pw, ph, buf);
  });
  return tags.map((tag, i) => ({ tag, rgb: cols[i] }));
}
