'use strict';
// Shared attachments made in Blender (models/parts/<slot>/<id>/<id>.glb + model.json), as the recipes see them. NOT generated and not data: the store
// starts empty and tools/model_env.mjs fills it from the files (tools/authored_parts.mjs reads them; docs/models.md "Authored parts").
// An authored optic is built like the S.* optics in recipes.ts: in the OPTIC'S OWN FRAME (origin on the top of the rail at the optic's mount point, metres,
// glTF axes), so the recipe places it with the gun's rail top and mount point, and the baker finds it only translates (one shared file for every gun).
/** One mesh of an authored part: slot, catalogue material, geometry in the part's frame (three's axes), UVs where it has them, a display surface's canvas size. */
interface AuthoredPartMesh { slot: string; mat: string; pos: Float32Array; nrm: Float32Array; uv: Float32Array | null; idx: Uint16Array | Uint32Array; display?: { width: number; height: number }; name: string }
/** An optic's sight data in its own frame (model.json `optic`). */
interface AuthoredOptic { sy: number; fSight: number; relief: number; reflex?: { f: number; y: number; w: number; h: number; round?: boolean; kind: string }; pip?: { f: number; y: number; r: number }; magnifier?: boolean; height: string }
interface AuthoredPartSrc { id: string; slot: string; optic: AuthoredOptic; meshes: AuthoredPartMesh[] }
{
var G_AuthoredParts = {
  /** Every authored part by `<slot>/<id>` (filled by tools/model_env.mjs). */
  store: {} as Record<string, AuthoredPartSrc>,
  geo: new WeakMap<AuthoredPartMesh, THREE.BufferGeometry>(),
  /**
   * Builds an authored optic on the kit at the gun's mount point: `f` forward and `top` up (the rail's top). Returns the sight (sy, fSight, relief) in the
   * gun's frame and records the reflex window / pip lens, shifted the same way. The meshes are the optic's own and nothing else (the rail under it is the mount's).
   */
  place(k: any, key: string, f: number, top: number) {
    const A = G_AuthoredParts, p = A.store[key];
    if (!p) throw new Error(`authored part ${key} is not loaded (models/parts/${key}/)`);
    const M = G.GunMaterials.M as Record<string, () => THREE.Material>;
    for (const e of p.meshes) {
      let g = A.geo.get(e);
      if (!g) {
        g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(e.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(e.nrm, 3));
        if (e.uv) g.setAttribute('uv', new THREE.BufferAttribute(e.uv, 2));
        g.setIndex(new THREE.BufferAttribute(e.idx, 1));
        A.geo.set(e, g);
      }
      const mesh = k.place(g, (M[e.mat] || M.black)(), 0, top, f);
      if (e.display) { mesh.userData.display = e.display; mesh.name = e.name; }
    }
    const o = p.optic;
    if (o.reflex) k.reflex = Object.assign({}, o.reflex, { f: f + o.reflex.f, y: top + o.reflex.y });
    if (o.pip) k.pip = { f: f + o.pip.f, y: top + o.pip.y, r: o.pip.r };
    return { sy: top + o.sy, fSight: f + o.fSight, relief: o.relief };
  },
};
G.AuthoredParts = G_AuthoredParts;
}
interface GameModules { AuthoredParts: typeof G_AuthoredParts; }
