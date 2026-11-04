import { loadGame } from './model_env.mjs';
const G = loadGame(), GS = G.Gunsmith, GM = G.GunModels;
const id = process.argv[2] || 'm4';
const b = GS.defaultBuild(id);
console.log(JSON.stringify(b));
const def = GS.compile(id, b);
const { group, info } = GM.display(def);
const walk = (o, d) => {
  const slots = {};
  for (const c of o.children) if (c.isMesh) { slots[c.userData.slot] = (slots[c.userData.slot] || 0) + 1; }
  console.log(' '.repeat(d * 2) + o.type + ' ' + (info.anim && Object.entries(info.anim).find(([k, v]) => v === o) || [''])[0] + ' pos=' + o.position.toArray().map((v) => +v.toFixed(3)) + ' meshes=' + JSON.stringify(slots) + ' kids=' + o.children.length);
  for (const c of o.children) if (!c.isMesh) walk(c, d + 1);
};
walk(group, 0);
console.log(Object.keys(info).join(','), Object.entries(info.anim).map(([k, v]) => k + ':' + (v && v.isObject3D ? 'node' : typeof v)).join(' '));
