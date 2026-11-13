// Steps for tools/space_shot.mjs: the ship being boarded seen from outside, off her bow and off her stern, from a camera of
// its own (her lines: js/shipmodel.ts hull).   node tools/space_shot.mjs "mute&board=large" tools/hull_views.mjs --out <dir> --gpu
// Writes hull_bow.png and hull_stern.png.
import fs from 'node:fs'; import path from 'node:path';
export default async ({ ev, sleep, log }) => {
  const out = process.argv[process.argv.indexOf('--out') + 1];
  for (let i = 0; i < 40 && await ev(`!!(G.Space.S.ftl || !G.Space.S.hull)`); i++) await sleep(500); // (out of the jump)
  await sleep(1500);
  const wing = await ev(`!!G.Space.S.map.sp.wing`); // (a flying wing: seen from ahead of her bow corner, and from astern of it)
  for (const [name, sx, sz] of wing ? [['bow', -1.25, -0.5], ['stern', 0.9, 0.9]] : [['bow', -1, 1], ['stern', 1, -1]]) {
    const url = await ev(`(() => { const T = THREE, S = G.Space.S, map = S.map, h = map.sp.hull, r = G.R.renderer, cam = new T.PerspectiveCamera(50, 16 / 9, 0.5, 4000);
      G.R.levelRoot.updateMatrixWorld(true); const M = G.R.levelRoot.matrixWorld, L = h.x1 - h.x0, c = new T.Vector3((h.x0 + h.x1) / 2, 3, map.sp.wing ? (h.z0 + h.z1) / 2 : h.zc), d = L * 0.78 + 30;
      cam.position.copy(c).add(new T.Vector3(${sx} * d * 0.72, d * 0.34, ${sz} * d * 1.02)).applyMatrix4(M); cam.up.set(0, 1, 0).transformDirection(M); cam.lookAt(c.clone().applyMatrix4(M)); cam.updateMatrixWorld(true);
      r.setRenderTarget(null); r.render(G.R.scene, cam); return r.domElement.toDataURL('image/png'); })()`);
    fs.writeFileSync(path.join(out, `hull_${name}.png`), Buffer.from(url.split(',')[1], 'base64')); log('wrote hull_' + name);
  }
};
