// node tools/hash_tree.mjs <dir> [manifest-out]: sha1 of every file (path + bytes) and one overall hash: the proof that two bakes (-j 1 vs -j N) are byte-identical
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const dir = process.argv[2], lines = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else lines.push(path.relative(dir, p).replace(/\\/g, '/') + ' ' + crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')); } };
walk(dir);
if (process.argv[3]) fs.writeFileSync(process.argv[3], lines.join('\n'));
console.log(lines.length + ' files, tree hash ' + crypto.createHash('sha1').update(lines.join('\n')).digest('hex'));
