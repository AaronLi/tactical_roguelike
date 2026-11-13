'use strict';
// The human models: who a character's body is. Twenty figures (ten men, ten women: models/characters/human_variants.py), each
// one skinned mesh set on the same skeleton as js/rig.ts's joints, in assets/models/humans/<id>.glb. What the game knows of each
// without its file is js/humandata.ts (its height's scale, its colours, the fit of the gear on it): a character is the right
// size and its kit the right fit from the moment it's made, and the body itself is put on when its file has come (js/rig.ts
// attachHuman: till then the old figure of boxes and tubes stands in).
//
//   G.Humans.ids                 every figure's id (m01..m10, f01..f10)
//   G.Humans.pick(o)             whose body a character has: by their name and animal (an officer), or their seed
//   G.Humans.def(id)             its HumanDef
//   G.Humans.ensure(id)          Promise<parts | null>: its file loaded and taken apart
//   G.Humans.get(id)             the parts if they're loaded, else null
//   G.Humans.boot()              every figure's file, loaded behind the menu
//
// A part is one material's faces: { geo (shared: never disposed with a body), mat (its material's name: shirt, upsleeve, sleeve,
// trousers, boots, neck, hand, finger, skin, eyeskin, hair, brow, lip, stubble, eye, iris), color, head (it rides the head),
// bones (names, letters only: 'upperarmR'), inv (their inverse rest matrices, in the file's frame: y up, the figure facing +z) }.
interface HumanPart { geo: THREE.BufferGeometry; mat: string; color: number; head: boolean; bones: string[]; inv: THREE.Matrix4[] }
const G_Humans = (() => {
  const DIR = 'assets/models/humans/';
  const DATA = G.HumanData, ids = Object.keys(DATA);
  const loaded = new Map<string, HumanPart[]>(), loading = new Map<string, Promise<HumanPart[] | null>>();
  const HEAD = new Set(['skin', 'eyeskin', 'hair', 'brow', 'lip', 'stubble', 'eye', 'iris']);
  const letters = (s: string) => s.replace(/[^a-zA-Z]/g, '');
  function ensure(id: string): Promise<HumanPart[] | null> {
    if (!DATA[id]) return Promise.resolve(null);
    let p = loading.get(id);
    if (!p) {
      p = G.Models.loadFile(DIR + id + '.glb').then((scene: any) => {
        const parts: HumanPart[] = [];
        scene.traverse((o: any) => {
          if (!o.isSkinnedMesh) return;
          const mat = letters(String(o.material.name || '').split('.')[0]);
          parts.push({ geo: o.geometry, mat, color: o.material.color.getHex(), head: HEAD.has(mat), bones: o.skeleton.bones.map((b: any) => letters(b.name)), inv: o.skeleton.boneInverses });
        });
        loaded.set(id, parts);
        return parts;
      }, () => { loading.delete(id); return null; });
      loading.set(id, p);
    }
    return p;
  }
  const mix = (x: number) => (Math.imul(x >>> 0, 2654435761) >>> 0) >>> 7;
  function pick(o: any): string {
    if (o.human && DATA[o.human]) return o.human;
    if (o.mannequin || o.vex) return 'm01';
    let k = (o.seed || 0) >>> 0;
    if (o.animal || o.callName) { k = 7; for (const ch of String(o.callName || '') + '|' + String(o.animal || '')) k = (Math.imul(k, 31) + ch.charCodeAt(0)) >>> 0; }
    return ids[mix(k) % ids.length];
  }
  const boot = () => { for (const id of ids) ensure(id); };
  return { ids, pick, def: (id: string): HumanDef | null => DATA[id] || null, ensure, get: (id: string) => loaded.get(id) || null, boot };
})();
G.Humans = G_Humans;
interface GameModules { Humans: typeof G_Humans }
