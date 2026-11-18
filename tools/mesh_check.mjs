// Mesh quality of authored models: for each .blend, the triangles the glTF export will have, counted and drawn (left side, right side,
// top) with the bad ones coloured: red long slivers (< 2 deg and > 1 cm), orange slivers (< 5 deg), purple zero-area, light blue keyhole
// n-gons. See .claude/skills/modeling-practices.
//   node tools/mesh_check.mjs models/parts/handguard/vantage_vx15/vantage_vx15.blend [more.blend ...] [--out dir] [--zoom 0.3]
//   node tools/mesh_check.mjs --all                  (every tracked .blend)
//   --only base,handguard_67: only the meshes of those slots (or with those object names)
// Writes <out>/<name>.png and <out>/report.json (default out: reports/mesh), prints a line per file. BLENDER=<path> if Blender isn't at
// the default place. --zoom f: also a close-up of the rear f of each model's length (<name>_zoom.png).
import { execFile, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const B = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const OUT = path.resolve(ROOT, opt('--out', 'reports/mesh')), ZOOM = +opt('--zoom', 0), ONLY = opt('--only', '');
let files = args.includes('--all') ? execSync('git ls-files "*.blend"', { cwd: ROOT }).toString().trim().split(/\r?\n/).filter((f) => !/face_options/.test(f)) : args.filter((a) => !a.startsWith('--'));
if (!files.length) { console.log('usage: node tools/mesh_check.mjs <file.blend ...> | --all [--out dir] [--zoom f]'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh_check_'));
const nameOf = (f) => path.relative(path.join(ROOT, 'models'), path.resolve(ROOT, f)).replace(/[\\/][^\\/]+\.blend$/, '').replace(/[\\/]/g, '_');
const run = (f) => new Promise((res) => {
  const j = path.join(TMP, nameOf(f) + '.json');
  execFile(B, ['-b', path.resolve(ROOT, f), '--python', path.join(ROOT, 'tools/mesh_check.py'), '--', j, ONLY], { maxBuffer: 1e8 }, (e, so, se) => { if (e) console.error(f, String(se).slice(-400)); res([f, j]); });
});
const COL = { long: '#e0302a', sliver: '#f09a30', zero: '#a000c0', key: '#9cc8f0' };
// tris: [[a, b, c, flag, normal]]; ax [h, v, d]: across, up, depth axes; the faces turned to the viewer, back to front
function draw(tris, ax, W, H, back, clip) {
  let mn = [1e9, 1e9], mx = [-1e9, -1e9];
  for (const t of tris) for (const c of t.slice(0, 3)) for (const k of [0, 1]) { mn[k] = Math.min(mn[k], c[ax[k]]); mx[k] = Math.max(mx[k], c[ax[k]]); }
  if (clip) mx[0] = mn[0] + (mx[0] - mn[0]) * clip;
  const s = Math.min((W - 20) / (mx[0] - mn[0] || 1), clip ? 1e9 : (H - 20) / (mx[1] - mn[1] || 1)), sg = back ? -1 : 1;
  if (clip) H = Math.ceil((mx[1] - mn[1]) * s) + 20;
  const ox = clip ? 0 : (W - (mx[0] - mn[0]) * s) / 2, oy = (H - (mx[1] - mn[1]) * s) / 2;
  const P = tris.filter((t) => sg * t[4][ax[2]] > -1e-6 && (!clip || t.slice(0, 3).some((c) => c[ax[0]] < mx[0]))).map((t) => ({ t, d: sg * (t[0][ax[2]] + t[1][ax[2]] + t[2][ax[2]]) })).sort((a, b) => a.d - b.d);
  let svg = '';
  for (const { t } of P) {
    const pts = t.slice(0, 3).map((c) => `${(ox + (c[ax[0]] - mn[0]) * s).toFixed(1)},${(H - oy - (c[ax[1]] - mn[1]) * s).toFixed(1)}`).join(' ');
    const l = Math.round(150 + 90 * Math.abs(t[4][ax[2]]));
    svg += `<polygon points="${pts}" fill="${COL[t[3]] || `rgb(${l},${l},${l + 6})`}" stroke="#202430" stroke-width="0.35" stroke-linejoin="round"/>`;
  }
  return { svg, H };
}
const rows = [], q = [...files];
await Promise.all(Array.from({ length: Math.min(6, q.length) }, async () => { while (q.length) rows.push(await run(q.shift())); }));
rows.sort((a, b) => a[0].localeCompare(b[0]));
const report = [];
for (const [f, j] of rows) {
  if (!fs.existsSync(j)) { report.push({ file: f, err: 'no output' }); continue; }
  const { stats: S, tris } = JSON.parse(fs.readFileSync(j, 'utf8')), name = nameOf(f) + (ONLY ? '_' + ONLY.replace(/[^a-z0-9_]+/gi, '-') : '');
  const ext = [0, 1, 2].map((a) => { let lo = 1e9, hi = -1e9; for (const t of tris) for (const c of t.slice(0, 3)) { lo = Math.min(lo, c[a]); hi = Math.max(hi, c[a]); } return hi - lo; });
  const h = [0, 1, 2].sort((a, b) => ext[b] - ext[a])[0], v = h === 2 ? 1 : 2, d = 3 - h - v, W = 1400, H = 700;
  const head = `${name}: ${S.objects} obj, ${S.verts} v, ${S.tris} tris | long slivers (red) ${S.long_slivers}, slivers (orange) ${S.slivers}, keyhole n-gons (blue) ${S.keyhole}, zero-area ${S.zero}, open edges ${S.open}, overlapping faces ${S.overlap_faces}`;
  const a = draw(tris, [h, v, d], W, H, false), b = draw(tris, [h, v, d], W, H, true), c = draw(tris, [h, d, v], W, 400, false);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${2 * H + 440}"><rect width="100%" height="100%" fill="#f4f4f0"/><text x="10" y="26" font-family="Arial" font-size="18">${head}</text><g transform="translate(0,40)">${a.svg}</g><g transform="translate(0,${40 + H})">${b.svg}</g><g transform="translate(0,${40 + 2 * H})">${c.svg}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, name + '.png'));
  if (ZOOM) {
    const z = draw(tris, [h, v, d], 1800, 0, false, ZOOM);
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${z.H + 40}"><rect width="100%" height="100%" fill="#f4f4f0"/><text x="10" y="26" font-family="Arial" font-size="20">${name}, rear ${Math.round(ZOOM * 100)}%</text><g transform="translate(0,40)">${z.svg}</g></svg>`)).png().toFile(path.join(OUT, name + '_zoom.png'));
  }
  report.push({ file: f, name, ...S });
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
fs.rmSync(TMP, { recursive: true, force: true });
const pct = (r) => Math.round((r.long_slivers + r.slivers + r.zero) / r.tris * 100);
for (const r of report) console.log(r.err ? `${r.file} ERR ${r.err}` : `${r.name.padEnd(34)} v${String(r.verts).padStart(6)} t${String(r.tris).padStart(6)} bad ${String(pct(r)).padStart(2)}% | long ${r.long_slivers} sliver ${r.slivers} zero ${r.zero} keyhole ${r.keyhole} open ${r.open} overlap ${r.overlap_faces}`);
console.log('pictures and report.json in ' + path.relative(ROOT, OUT));
