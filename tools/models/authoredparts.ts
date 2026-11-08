'use strict';
// Shared attachments made in Blender (models/parts/<slot>/<id>/<id>.glb + model.json), as the recipes see them. NOT generated and not data: the store
// starts empty and tools/model_env.mjs fills it from the files (tools/authored_parts.mjs reads them; docs/models.md "Authored parts").
// An authored optic is built like the S.* optics in recipes.ts: in the OPTIC'S OWN FRAME (origin on the top of the rail at the optic's mount point, metres,
// glTF axes), so the recipe places it with the gun's rail top and mount point, and the baker finds it only translates (one shared file for every gun).
// A piece of authored furniture (a stock, grip, muzzle device, handguard) likewise, its origin at the gun's mount point for its slot (furniture() below).
/** One mesh of an authored part: slot, catalogue material, geometry in the part's frame (three's axes), UVs where it has them, a display surface's canvas size. */
interface AuthoredPartMesh { slot: string; mat: string; pos: Float32Array; nrm: Float32Array; uv: Float32Array | null; idx: Uint16Array | Uint32Array; display?: { width: number; height: number }; name: string; part?: string }
/** An optic's sight data in its own frame (model.json `optic`). */
interface AuthoredOptic { sy: number; fSight: number; relief: number; reliefOnRiser?: number; reflex?: { f: number; y: number; w: number; h: number; round?: boolean; kind: string }; pip?: { f: number; y: number; r: number }; magnifier?: boolean; height: string }
/** A piece of furniture's anchors in its own frame (model.json `anchors`, [forward, up, right]): a stock's butt and cheek, a grip's grip, a muzzle device's muzzles, a handguard's support. */
interface AuthoredFurnitureAnchors { butt?: number[]; cheek?: number[]; grip?: number[]; muzzles?: number[][]; support?: number[]; pip?: number[]; hinge?: number[]; foot?: number[]; foot_end?: number[] }
/** A flip magnifier's data (model.json `magnifier`; GUN_MODEL_CONTRACT.authoredParts.magnifier): power, tube length, eye relief, its rear lens, how it flips. */
interface AuthoredMagnifier { px: number; len: number; relief: number; pip: { f: number; r: number }; flip: { part: string; axis: string; out_deg: number } }
/** finish: the material the catalogue entry's finish goes on (furniture; tools/authored_parts.mjs FINISH); part: a piece of furniture's own data (model.json `part`: a handguard's len...). */
interface AuthoredPartSrc { id: string; slot: string; optic: AuthoredOptic; anchors: AuthoredFurnitureAnchors | null; part: Record<string, any> | null; finish: string | null; magnifier?: AuthoredMagnifier | null; meshes: AuthoredPartMesh[] }
{
var G_AuthoredParts = {
  /** Every authored part by `<slot>/<id>` (filled by tools/model_env.mjs). */
  store: {} as Record<string, AuthoredPartSrc>,
  geo: new WeakMap<AuthoredPartMesh, THREE.BufferGeometry>(),
  /**
   * Builds an authored optic on the kit at the gun's mount point: `f` forward and `top` up (the rail's top). Returns the sight (sy, fSight, relief) in the
   * gun's frame and records the reflex window / pip lens, shifted the same way. The meshes are the optic's own and nothing else (the rail, riser or slide under it
   * is the mount's: `top` is the plane its foot rests on). onRiser: it stands on a riser, so its eye relief is the riser's (optic.reliefOnRiser, when the model gives one).
   */
  /** A part's meshes on the kit with their origin at `f` forward and `y` up (no rotation, no scaling: the file's shape on every gun). finish: the material for
   *  the meshes in the part's finish material (furniture), the others in their own. */
  geoOf(e: AuthoredPartMesh) {
    const A = G_AuthoredParts;
    let g = A.geo.get(e);
    if (!g) {
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(e.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(e.nrm, 3));
      if (e.uv) g.setAttribute('uv', new THREE.BufferAttribute(e.uv, 2));
      g.setIndex(new THREE.BufferAttribute(e.idx, 1));
      A.geo.set(e, g);
    }
    return g;
  },
  meshes(k: any, p: AuthoredPartSrc, f: number, y: number, finish?: THREE.Material | null) {
    const A = G_AuthoredParts;
    for (const e of p.meshes) {
      const mesh = k.place(A.geoOf(e), finish && p.finish && e.mat === p.finish ? finish : G.GunMaterials.byName(e.mat), 0, y, f);
      if (e.display) { mesh.userData.display = e.display; mesh.name = e.name; }
    }
  },
  /**
   * Builds an authored FLIP MAGNIFIER (GUN_MODEL_CONTRACT.authoredParts.magnifier) with its origin at the gun's mount_magnifier: `f` forward (the red dot's
   * fSight) and `y` up (its sy). The clamp's meshes go on the kit as they are; the tube's (under part_magn in the file) on a group of its own on the hinge
   * (anchors.hinge), which the caller makes the animated part (anim.magn). Returns the hinge, its place [f, y, x] in the gun's frame, and the part.
   */
  magnifier(k: any, key: string, f: number, y: number) {
    const A = G_AuthoredParts, p = A.get(key), h = (p.anchors && p.anchors.hinge) || [0, 0, 0];
    if (!p.magnifier) throw new Error(`authored part ${key} is not a magnifier (model.json has no "magnifier")`);
    for (const e of p.meshes) if (!e.part) k.place(A.geoOf(e), G.GunMaterials.byName(e.mat), 0, y, f);
    const hinge = k.hang(new THREE.Group(), h[2], y + h[1], f + h[0]);
    for (const e of p.meshes) if (e.part) { const mesh = new THREE.Mesh(A.geoOf(e), G.GunMaterials.byName(e.mat)); mesh.position.set(-h[2], -h[1], h[0]); mesh.userData.slot = k.slot; hinge.add(mesh); }
    return { hinge, at: [f + h[0], y + h[1], h[2]], p };
  },
  get(key: string) { const p = G_AuthoredParts.store[key]; if (!p) throw new Error(`authored part ${key} is not loaded (models/parts/${key}/)`); return p; },
  /**
   * Builds a piece of authored FURNITURE (a stock, grip, muzzle device, handguard: GUN_MODEL_CONTRACT.authoredParts.furniture) with its origin at the gun's mount
   * point for the slot, `f` forward and `y` up, its finish meshes in `finish` (the catalogue entry's, as the recipe's own part would have it). Returns the part:
   * its anchors moved into the gun's frame (muzzles, grip, support, butt, cheek) and its own data (a handguard's len).
   */
  furniture(k: any, key: string, f: number, y: number, finish?: THREE.Material | null) {
    const A = G_AuthoredParts, p = A.get(key), a = p.anchors || {}, at = (v: number[]) => [f + v[0], y + v[1], v[2]];
    A.meshes(k, p, f, y, finish);
    return { part: p.part || {}, muzzles: a.muzzles ? a.muzzles.map(at) : null, grip: a.grip ? at(a.grip) : null, support: a.support ? at(a.support) : null, butt: a.butt ? at(a.butt) : null, cheek: a.cheek ? at(a.cheek) : null };
  },
  place(k: any, key: string, f: number, top: number, onRiser = false) {
    const A = G_AuthoredParts, p = A.get(key);
    A.meshes(k, p, f, top);
    const o = p.optic;
    if (o.reflex) k.reflex = Object.assign({}, o.reflex, { f: f + o.reflex.f, y: top + o.reflex.y });
    if (o.pip) k.pip = { f: f + o.pip.f, y: top + o.pip.y, r: o.pip.r };
    return { sy: top + o.sy, fSight: f + o.fSight, relief: onRiser && o.reliefOnRiser != null ? o.reliefOnRiser : o.relief };
  },
};
G.AuthoredParts = G_AuthoredParts;
}
interface GameModules { AuthoredParts: typeof G_AuthoredParts; }
