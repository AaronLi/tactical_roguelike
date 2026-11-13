// Steps for tools/space_shot.mjs: every human model (js/humans.ts) stood in rows in a scene of its own, dressed and kitted,
// to see that the clothes and the gear fit each body.   node tools/space_shot.mjs "mute&hangar" tools/human_lineup.mjs --out <dir> --gpu
// Writes lineup_<set>_<view>.png: sets clothes (no gear), light, assault, heavy; views front, side, back.
import fs from 'node:fs'; import path from 'node:path';
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const only = arg('--ids'); // (a few of them, closer: --ids m04,f03)
export default async ({ ev, sleep, log }) => {
  const out = arg('--out') || '.';
  await ev(`(async () => { for (const id of G.Humans.ids) await G.Humans.ensure(id); })()`);
  const KITS = {
    clothes: null,
    light: { helmet: 'h.bump', carrier: 'c.ghost', belt: 'b.duty', bp: 2, lg: 'l.shin', gr: 'g.flap' },
    assault: { helmet: 'h.fast', carrier: 'c.assault', plate: 1, cp: 3, sh: 's.deltoid', gr: 'g.flap', belt: 'b.battle', bp: 4, lg: 'l.thigh', pack: 'k.assault', ifak: 1 },
    heavy: { helmet: 'h.rifle', carrier: 'c.heavy', plate: 1, cp: 4, sh: 's.plate', gr: 'g.pelvis', belt: 'b.war', bp: 6, lg: 'l.full', pack: 'k.ruck', ifak: 1 },
    recon: { helmet: 'h.ach', carrier: 'c.recon', cp: 4, sh: 's.axil', gr: 'g.plate', belt: 'b.battle', bp: 2, lg: 'l.wrap' },
  };
  const sets = arg('--sets');
  for (const [set, kit] of Object.entries(KITS).filter(([k]) => !sets || sets.split(',').includes(k))) for (const [view, yaw] of [['front', 0.35], ['side', Math.PI / 2], ['back', Math.PI - 0.35]]) {
    const url = await ev(`(() => {
      const T = THREE, ids = ${JSON.stringify(only ? only.split(',') : null)} || G.Humans.ids, sc = new T.Scene(); sc.background = new T.Color(0x70777f);
      sc.add(new T.HemisphereLight(0xffffff, 0x555555, 1.6)); const d = new T.DirectionalLight(0xffffff, 1.8); d.position.set(-2, 4, -5); sc.add(d);
      const per = Math.min(10, ids.length), rows = Math.ceil(ids.length / per), LOOKS = [{ top: 'combat', topC: 0x4d5639, pants: 'combat', pantsC: 0x3a3d40, gloves: 'tactical' }, { top: 'tshirt', topC: 0x9ec5e8, pants: 'jeans', pantsC: 0x2b3550, gloves: 'none' },
        { top: 'hoodie', topC: 0x5a3a2a, pants: 'cargo', pantsC: 0x4a4030, gloves: 'fingerless' }, { top: 'longsleeve', topC: 0x2f4a3a, pants: 'jeans', pantsC: 0x3a3a3c, gloves: 'leather' }];
      const H = G.Humans; if (${process.argv.includes('--prim')}) G.Humans = null; // (--prim: the old figure, to compare)
      const rigs = ids.map((id, i) => {
        const rig = G.Rig.create({ style: 'tactical', bare: true, human: id, seed: 11 + i, look: Object.assign({ eyes: i % 5 === 2 ? 'glasses' : i % 5 === 4 ? 'shooting' : 'none' }, LOOKS[i % 4]) });
        rig.setKit(${JSON.stringify(kit)}); sc.add(rig.root);
        const p = { pos: new T.Vector3((i % per - (per - 1) / 2) * 0.95, -Math.floor(i / per) * 2.15, 0), yaw: ${yaw}, pitch: 0, crouch: false, alert: false, lean: 0, state: 'alive' };
        for (let k = 0; k < 20; k++) rig.update(1 / 30, p);
        return rig;
      });
      G.Humans = H;
      const w = per * 0.95 + 0.3, h = rows * 2.15, r = G.R.renderer, size = r.getSize(new T.Vector2()), asp = size.x / size.y, hh = Math.max(h, w / asp) / 2;
      const cam = new T.OrthographicCamera(-hh * asp, hh * asp, hh, -hh, 0.1, 50); cam.position.set(0, 1.0 - (rows - 1) * 1.075, -10); cam.lookAt(0, 1.0 - (rows - 1) * 1.075, 0);
      sc.updateMatrixWorld(true); r.setRenderTarget(null); r.render(sc, cam);
      const url = r.domElement.toDataURL('image/png');
      for (const rig of rigs) { sc.remove(rig.root); rig.dispose(); }
      return url;
    })()`);
    const f = path.join(out, `lineup_${set}_${view}${only ? '_close' : ''}.png`); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); log('wrote ' + f);
  }
};
