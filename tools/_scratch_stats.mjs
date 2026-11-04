import fs from 'fs';
import { ROOT } from './model_env.mjs';
const dir = ROOT + '/assets/models/parts/';
const ids = fs.readdirSync(dir).filter((d) => fs.existsSync(dir + d + '/index.json'));
const dep = {}, size = {}, perPlat = [];
let entries = 0, files = 0, bytes = 0, gzTot = 0;
const zlib = await import('zlib');
for (const id of ids) {
  const ix = JSON.parse(fs.readFileSync(dir + id + '/index.json', 'utf8'));
  const seen = new Set(); let pb = 0, pgz = 0;
  for (const [tag, ti] of Object.entries(ix.tags)) {
    const k = tag + ': ' + (ti.dep.join('+') || '(none)'); const d = (dep[k] = dep[k] || { plats: new Set(), entries: 0, files: new Set(), bytes: 0 });
    d.plats.add(id);
    for (const e of ti.packs) { entries++; d.entries++; if (e.file && !seen.has(e.file)) { seen.add(e.file); const b = fs.readFileSync(dir + id + '/' + e.file); d.bytes += b.length; const gz = zlib.gzipSync(b, { level: 9 }).length; pb += b.length; pgz += gz; size[tag] = (size[tag] || 0) + gz; d.files.add(id + e.file); } }
  }
  files += seen.size; bytes += pb; gzTot += pgz; perPlat.push({ id, files: seen.size, bytes: pb, gz: pgz, ixBytes: fs.statSync(dir + id + '/index.json').size });
}
console.log('platforms', ids.length, 'entries', entries, 'files', files, 'raw', bytes, 'gz', gzTot);
perPlat.sort((a, b) => a.gz - b.gz);
const med = perPlat[Math.floor(perPlat.length / 2)];
console.log('per-platform gz: min', perPlat[0].id, perPlat[0].gz, 'median', med.id, med.gz, 'max', perPlat.at(-1).id, perPlat.at(-1).gz);
console.log('gz by tag:', JSON.stringify(Object.fromEntries(Object.entries(size).sort((a, b) => b[1] - a[1]))));
console.log('\ncoupling sets (tag: dep slots) | platforms | entries | files | MB raw');
for (const [k, d] of Object.entries(dep).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 45)) console.log(k.padEnd(46), String(d.plats.size).padStart(3), String(d.entries).padStart(5), String(d.files.size).padStart(5), (d.bytes / 1e6).toFixed(2));
