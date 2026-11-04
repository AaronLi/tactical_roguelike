import { loadGame, loadModels } from './model_env.mjs';
import { collect, analyze, indexOf, verify } from './model_packs.mjs';
const G = loadGame(), env = { G, GS: G.Gunsmith, GM: G.GunModels }, Models = loadModels();
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const tot = { builds: 0, exact: 0, stretch: 0, bad: 0, packs: 0, infoBad: 0, exactInfo: 0, missing: 0 };
for (const id of Object.keys(G.Gunsmith.PLATFORMS).filter((i) => !only.length || only.includes(i))) {
  const t0 = Date.now();
  const C = collect(env, Models, id, { extra: +(process.env.EXTRA || 0) }), A = analyze(C), { ix, packs } = indexOf(A, Models, 'x'), res = verify(A, ix, packs, Models);
  tot.builds += res.builds; tot.exact += res.exact; tot.stretch += res.stretch; tot.bad += res.bad.length; tot.packs += packs.length; tot.infoBad += res.infoBad; tot.exactInfo += ix.totals.exact; tot.missing += res.missing;
  const anch = Object.keys(ix.anchors).length;
  console.log(id.padEnd(10), 'builds', res.builds, 'exact', res.exact, 'stretch', res.stretch, 'bad', res.bad.length, 'missing', res.missing, 'packs', packs.length, 'anchors', anch, 'exactInfo', ix.totals.exact, 'infoBad', res.infoBad, 'iter', A.iter, 'extra', res.extra, res.extraBad, 'maxDev', res.maxDev.toExponential(1), (Date.now() - t0) + 'ms');
  for (const b of res.bad.slice(0, 3)) console.log('   BAD', b.tag, b.dev, b.key.slice(0, 120));
}
console.log(JSON.stringify(tot));
