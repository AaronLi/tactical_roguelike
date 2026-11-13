// Steps for tools/space_shot.mjs: the anatomy the rounds are worked through (js/ballistics.ts segs: each segment's shape and the
// organs in it, fitted to the body by segFrame) drawn over bodies of several sizes, the body itself see-through.
//   node tools/space_shot.mjs "mute&hangar" tools/human_anatomy.mjs --out <dir> --gpu [--ids m09,m01,f03]
// Writes anatomy_front.png, anatomy_side.png, anatomy_back.png. White lines: the segments' shapes (what a round is in or out of).
import fs from 'node:fs'; import path from 'node:path';
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
export default async ({ ev, log }) => {
  const out = arg('--out') || '.', ids = (arg('--ids') || 'm09,m04,m01,m07,m05,f05,f04,f01,f03').split(',');
  await ev(`(async () => { for (const id of G.Humans.ids) await G.Humans.ensure(id); })()`);
  for (const [view, yaw] of [['front', 0], ['side', Math.PI / 2], ['back', Math.PI]]) {
    const url = await ev(`(() => {
      const T = THREE, B = G.Ballistics, ids = ${JSON.stringify(ids)}, sc = new T.Scene(); sc.background = new T.Color(0x15181c);
      sc.add(new T.HemisphereLight(0xffffff, 0x666666, 2));
      const COL = { brain: 0xf0a0b0, brainstem: 0xd070a0, heart: 0xe02020, lungL: 0xf0a8a0, lungR: 0xf0a8a0, liver: 0x8a3a22, stomach: 0xe0a040, spleen: 0x8040a0, kidney: 0xa05030, bowel: 0xd8b890, trachea: 0x60b0e0,
        aorta: 0xff5050, carotid: 0xff5050, iliac: 0xff5050, brachial: 0xff5050, femoral: 0xff5050 };
      const colOf = (id) => COL[id] || COL[id.replace(/[LR]$/, '')] || (B.ORG[id] && B.ORG[id].bone ? 0xf2ecd2 : (B.ORG[id.replace(/[LR]$/, '')] || {}).bone ? 0xf2ecd2 : 0x80d0a0);
      const skinM = new T.MeshBasicMaterial({ color: 0x8fa0b4, transparent: true, opacity: 0.38, depthWrite: false }), lineM = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false });
      const sph = new T.SphereGeometry(1, 16, 10), W = ids.length * 0.9 + 0.3;
      const rigs = ids.map((id, i) => {
        const rig = G.Rig.create({ style: 'civ', human: id, seed: 5, wear: null }); sc.add(rig.root);
        const p = { pos: new T.Vector3((i - (ids.length - 1) / 2) * 0.9, 0, 0), yaw: ${yaw}, pitch: 0, crouch: false, alert: false, lean: 0, state: 'alive' };
        if (${process.argv.includes('--rest')}) { rig.root.position.copy(p.pos); rig.root.rotation.y = p.yaw; } // (--rest: the joints as made, not the idle stance)
        else for (let k = 0; k < 20; k++) rig.update(1 / 30, p);
        rig.root.traverse((o) => { if (o.isMesh) { o.material = skinM; o.renderOrder = 1; } });
        for (const s of B.segs(rig)) {
          const b = B.boneOf(rig, s.bone); if (!b) continue;
          const n = B.segNode(rig, s, b);
          // the segment's own shape
          let g;
          if (s.kind === 'ell') { g = new T.SphereGeometry(1, 12, 8); g.scale(s.r[0], s.r[1], s.r[2]); g.translate(s.c[0], s.c[1], s.c[2]); }
          else { g = new T.CylinderGeometry(s.rx1, s.rx0, s.y1 - s.y0, 14, 1); g.scale(1, 1, s.kz); g.translate(0, (s.y0 + s.y1) / 2, 0); }
          const ln = new T.LineSegments(new T.EdgesGeometry(g, 20), lineM); ln.renderOrder = 5; n.add(ln);
          for (const [id, sh] of s.organs || []) {
            const m = new T.MeshLambertMaterial({ color: colOf(id), transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
            let mesh;
            if (sh[0] === 'ell') { mesh = new T.Mesh(sph, m); mesh.scale.set(sh[2][0], sh[2][1], sh[2][2]); mesh.position.set(sh[1][0], sh[1][1], sh[1][2]); }
            else { const a = new T.Vector3(...sh[1]), c = new T.Vector3(...sh[2]); mesh = new T.Mesh(new T.CylinderGeometry(sh[3], sh[3], Math.max(0.001, a.distanceTo(c)), 10), m); mesh.position.copy(a).add(c).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), c.clone().sub(a).normalize()); }
            mesh.renderOrder = B.ORG[id] && B.ORG[id].bone ? 8 : /lung|bowel|brain$/.test(id) ? 9 : 10; n.add(mesh);
          }
        }
        return rig;
      });
      const r = G.R.renderer, size = r.getSize(new T.Vector2()), asp = size.x / size.y, hh = Math.max(2.1, W / asp) / 2;
      const cam = new T.OrthographicCamera(-hh * asp, hh * asp, hh, -hh, 0.1, 50); cam.position.set(0, 0.98, -10); cam.lookAt(0, 0.98, 0);
      sc.updateMatrixWorld(true); r.setRenderTarget(null); r.render(sc, cam);
      const url = r.domElement.toDataURL('image/png');
      for (const rig of rigs) { sc.remove(rig.root); rig.dispose(); }
      return url;
    })()`);
    const f = path.join(out, `anatomy_${view}.png`); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); log('wrote ' + f);
  }
};
