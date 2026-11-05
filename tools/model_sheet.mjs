// Contact sheets of the edge cases: `node tools/model_cases.mjs --sheet <dir>` -> <dir>/index.html and one page per gun <dir>/<gun>.html, every case a
// side view (the gun assembled from the packs, one colour per slot, a common scale per gun) labelled with its `why` and its build. Open index.html.
import fs from 'fs'; import path from 'path';
import { defOf } from './model_sweep.mjs';
import { sideViews } from './model_report.mjs';
const keyOf = (b) => Object.keys(b).sort().map((s) => s + '=' + b[s]).join(','); // (not imported from model_cases.mjs, which loads this)

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function sheets(G, cases, regressions, dir) {
  const { loadGameWithModels } = await import('./model_env.mjs');
  const GW = await loadGameWithModels(), M = GW.Models; // (the assembled guns: the packs must be baked)
  fs.mkdirSync(dir, { recursive: true });
  const all = [...cases, ...regressions], plats = [...new Set(all.map((c) => c.platform))], index = [];
  for (const id of plats) {
    await M.preloadPlatform(id);
    if (!M.platformLoaded(id)) { console.error(`${id}: no packs (run npm run bake:models)`); continue; }
    const mine = all.filter((c) => c.platform === id), asms = [], keep = [];
    for (const c of mine) { const a = M.assemble(defOf(GW, id, c.build)); if (a && !a.approx) { asms.push(a); keep.push(c); } else console.error(`${id} [${c.why}]: not assembled`); }
    const files = keep.map((c, i) => path.join(dir, `${id}_${String(i + 1).padStart(2, '0')}.png`));
    const legend = sideViews(files, asms);
    const html = `<!doctype html><meta charset="utf-8"><title>${id} edge cases</title><style>body{font:13px system-ui,sans-serif;margin:16px;background:#fafafa;color:#222}figure{margin:0 0 18px;padding:8px;background:#fff;border:1px solid #ddd}figcaption b{display:block}code{font-size:11px;color:#666;word-break:break-all}img{max-width:100%}.reg{border-color:#c60}.sw{display:inline-block;width:10px;height:10px;margin:0 3px 0 10px}</style>
<h1>${id} <small>${keep.length} cases</small></h1><p><a href="index.html">all guns</a>${legend.map((l) => `<span class="sw" style="background:rgb(${l.rgb})"></span>${esc(l.tag)}`).join('')}</p>
${keep.map((c, i) => `<figure class="${c.regression ? 'reg' : ''}"><img src="${path.basename(files[i])}" loading="lazy"><figcaption><b>${esc(c.why)}</b><code>${esc(keyOf(c.build))}</code></figcaption></figure>`).join('\n')}`;
    fs.writeFileSync(path.join(dir, id + '.html'), html);
    index.push(`<li><a href="${id}.html">${id}</a> (${keep.length})</li>`);
    console.log(id.padEnd(10), keep.length, 'cases');
  }
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Gun edge cases</title><body style="font:14px system-ui;margin:16px"><h1>Edge cases, ${all.length} builds on ${index.length} platforms</h1><ul style="columns:5">${index.join('')}</ul>`);
  console.log(`sheets written to ${dir}/index.html`);
}
