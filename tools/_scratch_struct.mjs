import { loadGame } from './model_env.mjs';
import { sweepOf, defOf } from './model_sweep.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const stat = {}; const inc = (k, id) => { const a = (stat[k] = stat[k] || { n: 0, ex: new Set() }); a.n++; if (a.ex.size < 4) a.ex.add(id); };
for (const id of Object.keys(GS.PLATFORMS)) {
  const { list } = sweepOf(GS, id);
  for (const e of list) {
    const { group, info } = GM.display(defOf(G, id, e.build));
    const anim = new Map(); for (const [k, v] of Object.entries(info.anim)) if (v && v.isObject3D) anim.set(v, k);
    group.traverse((o) => {
      if (o === group) return;
      const kind = o.isMesh ? 'mesh' : anim.has(o) ? 'part_' + anim.get(o) : 'group';
      const par = o.parent === group ? 'root' : anim.has(o.parent) ? 'part_' + anim.get(o.parent) : o.parent.isMesh ? 'MESH' : 'group';
      inc(kind + ' in ' + par, id);
      const r = o.rotation, s = o.scale;
      if (Math.abs(r.x) + Math.abs(r.y) + Math.abs(r.z) > 1e-9) inc(kind + ' ROTATED', id);
      if (Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) > 1e-9) inc(kind + ' SCALED', id);
      if (!o.isMesh && o.children.length === 0) inc(kind + ' EMPTY', id);
      if (o.isMesh) { if (o.userData.display || o.name) inc('mesh named/display', id); if (!Array.isArray(o.material) === false) inc('multi-material', id); if (o.geometry.groups && o.geometry.groups.length) inc('geom groups', id); if (!o.visible) inc('invisible mesh', id); }
      else if (!o.visible) inc(kind + ' invisible', id);
      if (Object.keys(o.userData).filter((k) => k !== 'slot').length) inc(kind + ' userData ' + Object.keys(o.userData).join(','), id);
    });
  }
}
for (const [k, a] of Object.entries(stat).sort()) console.log(k.padEnd(40), a.n, [...a.ex].join(' '));
