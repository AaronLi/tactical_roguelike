// js/snapdelta.ts: a snapshot put back from its base and its patch is the snapshot (random snapshots like the server's ground ones:
// people's rows moving, coming, going and reordered; the players' states; the counts), and an unchanged one costs nothing
//   node tools/snapdelta_test.mjs
import { SnapDelta } from '../dist/js/snapdelta.js';
let nid = 0, seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const row = (id) => [id, (rnd() * 4) | 0, +(rnd() * 50).toFixed(2), +(rnd() * 50).toFixed(2), +(rnd() * 6).toFixed(2), 100, 0, 0, 0, 0, 1, 0];
function next(s) {
  const e = s.e.filter(() => rnd() > 0.05).map((r) => (rnd() < 0.5 ? r.map((v, i) => (i >= 2 && i <= 4 ? +(v + rnd() - 0.5).toFixed(2) : i === 5 && rnd() < 0.1 ? v - 10 : v)) : r));
  if (rnd() < 0.3) e.push(row(1000 + (++nid)));
  if (rnd() < 0.1) e.reverse();
  const p = JSON.parse(JSON.stringify(s.p)); for (const k of Object.keys(p)) if (rnd() < 0.7) p[k].p = p[k].p.map((v) => +(v + rnd() - 0.5).toFixed(3));
  if (rnd() < 0.05) p['x' + ((rnd() * 99) | 0)] = { p: [0, 0, 0], w: 'gun' }; if (rnd() < 0.03) delete p[Object.keys(p)[0]];
  return { t: 'snap', e, p, x: [0, rnd() < 0.1 ? 1 : 0, 3, 0, [], 2], n: e.length, c: 0, b: 0, w: 0 };
}
let s = { t: 'snap', e: Array.from({ length: 20 }, (_, i) => row(i + 1)), p: { a: { p: [1, 2, 3], w: 'm4' }, b: { p: [4, 5, 6], w: 'mp5' } }, x: [0, 0, 3, 0, [], 2], n: 20, c: 0, b: 0, w: 0 };
const hist = [s]; let bad = 0, n = 0, full = 0, patch = 0;
for (let k = 0; k < 3000; k++) {
  const cur = next(hist[hist.length - 1]); hist.push(cur); if (hist.length > 30) hist.shift();
  const base = hist[(rnd() * (hist.length - 1)) | 0], d = SnapDelta.diff(base, cur), back = SnapDelta.apply(base, d);
  n++; full += JSON.stringify(cur).length; patch += JSON.stringify(d || {}).length;
  if (!SnapDelta.same(back, cur) || JSON.stringify(back) !== JSON.stringify(cur)) { if (++bad < 4) console.log('MISMATCH', JSON.stringify(d).slice(0, 300)); }
}
const same = SnapDelta.diff(s, JSON.parse(JSON.stringify(s)));
console.log(`${n - bad}/${n} put back exactly (keys in order too); a patch ${(100 * patch / full).toFixed(0)}% of the snapshot's JSON on average (against a base up to 30 back); unchanged: ${same === undefined ? 'nothing' : 'SOMETHING'}`);
process.exit(bad || same !== undefined ? 1 : 0);
