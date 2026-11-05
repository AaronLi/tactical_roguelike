'use strict';
// The game's gun models: every gun it shows (the gunsmith, the hangar, icons, the loot on the floor, everyone's gun in third person, the one in your
// hands) is a baked glTF (docs/models.md): per-part packs the baker made from the recipes (tools/models/), assembled for any build by js/glb.ts.
// There are no recipes here and no fallback to them. This file is the facade the rest of the game calls:
//
//   G.GunModels.display(def, skin)    -> { group, info }  every part as separate slot-tagged meshes (the gunsmith, the hangar, icons)
//   G.GunModels.world(def, skin)      -> a group          the third-person gun, merged one mesh per material, shared geometry (rigs, loot, evidence)
//   G.GunModels.viewmodel(def, skin)  -> a group | null   the first-person gun with its arms and animation (js/viewmodel.ts, js/vmanim.ts)
//   G.GunModels.whenReady(group, fn)  runs fn(ok) once a display or world model's meshes have come in (at once if they are in)
//   G.GunModels.roundDims / roundShape / roundProp / quarrel    the cartridges and the crossbow bolt (assets/models/props, tools/bake_props.mjs)
//   G.GunModels.boot() / preload...   what to have loaded (below)
//
// SYNCHRONOUS, FILLING IN. display() and world() return at once. If the build's packs are loaded the model is whole; if not, it is an EMPTY group that
// carries `userData.pending = true` and the right `info` (anchors, muzzles, sight windows: from the platform's index, which boot() loads for every
// platform at start), and the meshes arrive in it when the packs do (they are fetched at once). Whoever measured or cached the model asks
// whenReady(group, fn) to do it again then (icons, the gunsmith's framing, the hangar's racks, loot's resting place, a highlight's gear stage).
// The world model's merged meshes, its magazine, a crossbow's bolt and a bipod's legs all arrive that way. A missing pack never throws: the gun
// just stays empty. viewmodel() is the one that cannot be empty (the hands are bound to its parts): it returns null until the build is loaded
// (it asks for it), and js/player.ts, which sets the view model every frame it is not the right one, has it the frame it is.
//
// PRELOADING. boot(): every platform's index and the props (a quarter of a megabyte in all), at game start. preloadAll(): every pack of every
// platform, in the background, when the hangar is entered (everything it and the gunsmith can show). preload(defs, platforms): a level's start: the
// squad's kits, the level's enemy weapon pool, the loot (js/game.ts startLevel). Anything else is fetched when it is first asked for.
const G_GunModels = (() => {
  const T = THREE;

  // ---------------------------------------------------------------- props: the cartridges and the crossbow bolt
  interface RoundShape { oal: number; case: number[][]; bullet: number[][] }
  interface RoundEntry { file: string; dims: RoundDims; shape?: RoundShape }
  interface PropsIndex { version: number; rounds: Record<string, string>; keys: Record<string, RoundEntry>; quarrel: { file: string } }
  const PROPS = 'assets/models/props/';
  let pix: PropsIndex | null = null, propsDone = false, propsP: Promise<void> | null = null;
  const propScene = new Map<string, THREE.Object3D>();
  /** The props' index and every prop file (tiny: ~15 files, a few hundred bytes each). Resolves once they are all in, or have failed (they are then just not drawn). */
  function loadProps(): Promise<void> {
    return propsP || (propsP = G.Models.fetchJson(PROPS + 'index.json').then(async (ix: PropsIndex | null) => {
      if (!ix) return;
      const files = new Set<string>([ix.quarrel.file]);
      for (const e of Object.values(ix.keys)) files.add(e.file);
      await Promise.all([...files].map((f) => G.Models.loadFile(PROPS + f).then((s: THREE.Object3D) => { propScene.set(f, s); }, (e: any) => { console.warn('[props] ' + f + ': ' + (e && e.message || e)); })));
      pix = ix;
    }).catch((e) => { console.warn('[props] ' + (e && e.message || e)); }).then(() => { propsDone = true; }));
  }
  /** A baked prop's nodes copied into a group: own geometry (the viewmodel's disposes it), the catalogue's material where the file names one. */
  function propGroup(scene: THREE.Object3D, only?: (name: string) => boolean): THREE.Group {
    const g = new T.Group(), M = G.GunMaterials.M as Record<string, () => THREE.Material>;
    for (const c of scene.children) {
      if (only && !only(c.name)) continue;
      const n = c.clone(true);
      n.traverse((o: any) => {
        if (!o.isMesh) return;
        o.geometry = o.geometry.clone();
        const name = o.material && o.material.name;
        if (M[name]) o.material = M[name]();
      });
      g.add(n);
    }
    return g;
  }
  const roundEntry = (def: { id: string }) => (pix && pix.rounds[def.id] ? pix.keys[pix.rounds[def.id]] : null);
  /** The size of a gun's round (null for a gun with none): head, case length, bullet length and diameter, shell, pistol (tools/models/recipes.ts roundDims, baked into the props' index). */
  const roundDims = (def: { id: string }): RoundDims | null => { const e = roundEntry(def); return e ? e.dims : null; };
  /** The real outline of a gun's round, for the .50 BMG (null for every other). */
  const roundShape = (def: { id: string }): RoundShape | null => { const e = roundEntry(def); return e && e.shape || null; };
  /**
   * A cartridge to hold in the hand, centred on its middle with its nose to -z (kind 'shell': the whole round; 'case': a fired case, which only
   * the .50 has a drawing for), or a shotshell (a gun with a shell, or none: its hull and base, painted by js/vmanim.ts). Empty where there is nothing to show.
   */
  function roundProp(def: { id: string }, kind: 'shell' | 'case'): THREE.Group {
    const e = roundEntry(def), shell = pix && Object.values(pix.keys).find((k) => k.dims.shell);
    const g = e && !e.dims.shell ? (() => {
      const s = propScene.get(e.file); if (!s || (kind === 'case' && !e.shape)) return new T.Group();
      const r = propGroup(s, kind === 'case' ? (n) => n === 'case' : undefined); r.userData.cart = true; return r;
    })() : kind === 'shell' && shell && propScene.get(shell.file) ? propGroup(propScene.get(shell.file)!) : new T.Group();
    return g;
  }
  /** The crossbow's bolt for the hand: a nock, a shaft, three vanes and a head, 0.40 m, centred on its middle, nose to -z (tools/bake_props.mjs). */
  function quarrel(_centre?: boolean): { group: THREE.Group } {
    const s = pix && propScene.get(pix.quarrel.file);
    return { group: s ? propGroup(s) : new T.Group() };
  }

  // ---------------------------------------------------------------- waiting for packs
  /** The group's meshes have come in (or never will): fn(ok) now if they are in, else when they arrive (a display or world model's `userData.pending`). */
  function whenReady(g: THREE.Object3D, fn: (ok: boolean) => void) {
    const u = g.userData;
    if (u.pending) (u.waiters || (u.waiters = [])).push(fn); else fn(u.ok !== false);
  }
  function filled(g: THREE.Object3D, ok: boolean) {
    const u = g.userData, w: ((ok: boolean) => void)[] = u.waiters || [];
    u.pending = false; u.ok = ok; delete u.waiters;
    for (const fn of w) { try { fn(ok); } catch (e) { console.error(e); } }
  }
  const asked = new Map<string, Promise<boolean>>(), warned = new Set<string>();
  /** Fetches the packs a build needs (once at a time per build); resolves to whether it can be assembled now. */
  function request(def: any): Promise<boolean> {
    let p = asked.get(def.code);
    if (!p) asked.set(def.code, (p = G.Models.ensure(def).then((ok) => {
      asked.delete(def.code);
      if (!ok && !warned.has(def.code)) { warned.add(def.code); console.warn('[gun models] no baked model for ' + def.id + ' ' + def.code + ' (its packs or index did not load, or the baker has not covered this build)'); }
      return ok;
    })));
    return p;
  }
  /** What a gun's info says before its packs are in: from the platform's index (anchors, muzzles, sight windows, mounts); else the barest of guesses, filled over when they are. */
  function infoBefore(def: any): any {
    const M = G.Models as any, info = (M.infoOf ? M.infoOf(def) : M.infoFromIndex(def));
    return info || { sy: 0.06, fSight: 0.2, relief: 0.1, muzzles: [[0.5, 0, 0]], grip: [0.05, -0.05, 0], support: [0.3, -0.04, 0], anim: {} };
  }
  /** Moves an assembled model's nodes into the group that stood in for it. */
  function adopt(into: THREE.Object3D, from: THREE.Object3D, skip: string[] = []) {
    while (from.children.length) into.add(from.children[0]);
    for (const [k, v] of Object.entries(from.userData)) if (!skip.includes(k)) into.userData[k] = v;
  }

  // ---------------------------------------------------------------- display: every part separate (the gunsmith, the hangar, icons)
  function display(def: any, skin?: any): { group: THREE.Group; info: any } {
    const a = G.Models.assemble(def, skin);
    if (a) return a;
    const group = new T.Group(), info = infoBefore(def);
    group.userData.pending = true;
    request(def).then((ok) => {
      const b = ok ? G.Models.assemble(def, skin) : null;
      if (b) { adopt(group, b.group); Object.assign(info, b.info); }
      filled(group, !!b);
    });
    return { group, info };
  }

  // ---------------------------------------------------------------- world: the third-person gun, merged and shared (cached per build)
  const worldCache = new Map<string, ReturnType<typeof G.Viewmodel.worldProto>>();
  function worldProtoOf(def: any) {
    let proto = worldCache.get(def.code);
    if (!proto) {
      const a = G.Models.assemble(def);
      if (!a) return null;
      proto = G.Viewmodel.worldProto(a.group, a.info); // (takes the assembled model apart: nothing else holds it)
      worldCache.set(def.code, proto);
    }
    return proto;
  }
  function world(def: any, skin?: any): THREE.Group {
    if (typeof def === 'string') def = G.Gunsmith.fromCode(def);
    const proto = worldProtoOf(def);
    if (proto) { const g = G.Viewmodel.worldInstance(proto); if (skin && skin.length) G.Stickers.decorate(g, skin); return g; }
    const g = new T.Group(), info = infoBefore(def);
    g.userData.info = info; g.userData.pending = true;
    request(def).then((ok) => {
      const p = ok ? worldProtoOf(def) : null;
      if (p) { adopt(g, G.Viewmodel.worldInstance(p), ['info']); Object.assign(info, p.info); if (skin && skin.length) G.Stickers.decorate(g, skin); }
      filled(g, !!p);
    });
    return g;
  }

  // ---------------------------------------------------------------- viewmodel: the first-person gun
  function vmModel(a: { group: THREE.Group; info: any }): VmModel {
    const info = a.info;
    if (info.pip && typeof info.pip.parent === 'string' && info.anim) info.pip.parent = info.anim[info.pip.parent] || info.pip.parent; // (a magnifier's lens hangs on its hinge: the part's node)
    if (info.anim && info.anim.quarrelNock) { // (a crossbow's lit nock takes the load's colour: js/vmanim.ts, js/bolts.ts: it needs a material of its own)
      let mat: THREE.Material | null = null;
      info.anim.quarrelNock.traverse((o: any) => { if (o.isMesh && !mat) mat = o.material = o.material.clone(); });
      if (mat) info.quarrelMats = { nock: mat };
    }
    return { group: a.group, info };
  }
  /** The first-person gun, or null while the build's packs (or the props) are not in: it asks for them, and the caller asks again. */
  function viewmodel(def: any, skin?: any): THREE.Group | null {
    if (!propsDone) { loadProps(); return null; }
    const models: VmModel[] = [];
    for (let i = 0; i < (def.akimbo ? 2 : 1); i++) {
      const a = G.Models.assemble(def, skin);
      if (!a) { request(def); return null; }
      models.push(vmModel(a));
    }
    return G.Viewmodel.assemble(def, models) as THREE.Group;
  }
  /** Whether viewmodel(def) would give a gun now. */
  const viewmodelReady = (def: any) => propsDone && G.Models.ready(def);

  // ---------------------------------------------------------------- what to have loaded
  /** Game start: every platform's index and the props. Resolves when they are in. */
  const boot = (): Promise<void> => Promise.all([G.Models.boot(), loadProps()]).then(() => undefined);
  /** The hangar: every pack of every platform, the named ones first, in the background. */
  const preloadAll = (first: string[] = []) => { G.Models.preloadAll(first); };
  /**
   * Fetches what is about to be shown, most urgent first (the queue is in js/glb.ts): the builds in these defs at once (priority 0); then, `wholePlatforms`
   * (the gunsmith: a part swap should show at once) every pack of their platforms; and for the gun ids in `platforms` (a level's enemy pool) the default
   * build only. A level asks for no whole platforms: only the hangar warms everything (preloadAll). Resolves when the builds and the pool are in.
   */
  const platformsAsked = new Set<string>();
  function preload(defs: any[], platforms: string[] = [], wholePlatforms = true): Promise<void> {
    return boot().then(() => {
      const all: Promise<unknown>[] = [];
      for (const d of defs) if (d && d.id) { all.push(request(d)); if (wholePlatforms && !platformsAsked.has(d.id)) { platformsAsked.add(d.id); all.push(G.Models.preloadPlatform(d.id)); } }
      for (const id of platforms) { const d = G.Gunsmith.PLATFORMS[id] && G.Gunsmith.fromCode(G.Gunsmith.defaultCode(id)); if (d) all.push(G.Models.ensure(d, 1)); }
      return Promise.all(all).then(() => undefined);
    });
  }

  return { display, world, viewmodel, viewmodelReady, whenReady, roundDims, roundShape, roundProp, quarrel, boot, preloadAll, preload };
})();
G.GunModels = G_GunModels;
interface GameModules { GunModels: typeof G_GunModels }
