'use strict';
import { Models } from './glb.js';
import { HumanData } from './humandata.js';
export const Humans = (() => {
  const DIR = 'assets/models/humans/';
  const DATA = HumanData, ids = Object.keys(DATA);
  const loaded = new Map<string, HumanPart[]>(), loading = new Map<string, Promise<HumanPart[] | null>>();
  const HEAD = new Set(['skin', 'eyeskin', 'hair', 'brow', 'lip', 'stubble', 'eye', 'iris']);
  // the shared gear: loaded once, with the bodies (a body isn't in till it is; a gear file that fails leaves its pieces undrawn)
  const gearNodes = new Map<string, THREE.Object3D>();
  let gearP: Promise<void> | null = null;
  const gearLoad = () => gearP || (gearP = Models.loadFile(DIR + 'gear.glb').then((scene: any) => { for (const c of scene.children) gearNodes.set(c.name, c); }, (e: any) => { console.warn('[humans] gear.glb: ' + (e && e.message || e)); }));
  const letters = (s: string) => s.replace(/[^a-zA-Z]/g, ''), boneName = (s: string) => s.replace(/[^a-zA-Z0-9]/g, ''); // (a bone keeps its digits: index1L, index2L)
  function ensure(id: string): Promise<HumanPart[] | null> {
    if (!DATA[id]) return Promise.resolve(null);
    let p = loading.get(id);
    if (!p) {
      p = Promise.all([Models.loadFile(DIR + id + '.glb'), gearLoad()]).then(([scene]: any) => {
        const parts: HumanPart[] = [];
        scene.traverse((o: any) => {
          if (!o.isSkinnedMesh) return;
          const mat = letters(String(o.material.name || '').split('.')[0]);
          parts.push({ geo: o.geometry, mat, color: o.material.color.getHex(), head: HEAD.has(mat), bones: o.skeleton.bones.map((b: any) => boneName(b.name)), inv: o.skeleton.boneInverses });
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
  return { ids, pick, def: (id: string): HumanDef | null => DATA[id] || null, ensure, get: (id: string) => loaded.get(id) || null, boot, gear: (name: string) => gearNodes.get(name) || null };
})();
G.Humans = Humans;
declare global { interface GameModules { Humans: typeof Humans } }
