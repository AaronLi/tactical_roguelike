'use strict';
// Binding animation to a gun model: what js/vmanim.ts needs to move a gun's parts and put hands on it, found on a MODEL
// (a group of slot-tagged meshes, `part_<key>` nodes with their pivots, and `info`: docs/models.md), whether the recipes
// (tools/models/recipes.ts, at bake time) built it or it came out of a .glb (js/glb.ts, js/gunmodels.ts: what the game does).
//
//   G.GunRig.bind(group, info, { def, side })   -> a GunRig: the live moving parts (an), the hand anchors in the gun's space (A),
//                                                  where the parts sit at rest, the magazine-check data (chk)
//   G.GunRig.magCheck(mag)                      -> the magazine-check data off a magazine part (the model's tags, or the recipe's refs)
//   G.GunRig.describe(group)                    -> the recipe's refs written down as data on the nodes, for the baker (see below)
//   G.GunRig.setLoaded(world, bolt, cocked)     -> a crossbow's bolt on the rail or not, its string cocked or not (a world model's)
//   G.GunRig.bipodPose(bipod, k)                -> a bipod's legs (the children of part_bipod, each with extras.leg.deploy) swung down by k (0 folded .. 1 standing the gun up)
//
// Nothing here knows how a gun was built: the parts are found by name (info.anim, whose values are the nodes themselves
// for a recipe's model, or the node NAMES for one read from a file) and the anchors are info's numbers.
//
// The magazine check (hold R: the magazine's pulled out to be looked at) shows what's in it on the magazine's own body:
// the top round, witness holes stamped with a count, or the rounds themselves through a clear body. A model says which
// of its meshes are those as DATA (docs/models.md "Magazine check"):
//   part_mag.extras.check = { w }                           w: the magazine's width, m (how wide a count label is)
//   <mesh>.extras.chk = { role, i, t? }                     role 'top': i 0 the top round's case, i 1 its tip
//                                                           role 'hole': a witness hole: i its order from the top, t 0 at the top .. 1 the bottom (how far down the stack it reads),
//                                                           side 1: on the back face (toward the shooter; the front has none); the mesh node's rotation is the face's tilt there
//                                                           role 'round': the i-th drawn round, t how far down; role 'tip': the tip of round i
// A recipe's model carries the same as live references (part.userData.chk = { w, top, holes, rounds }); magCheck reads either.
const G_GunRig = (() => {
  const T = THREE;
  /** The moving parts of a gun, by `info.anim` key: the live nodes (a crossbow's quarrel and strings too). */
  type Parts = GunRigParts;
  /** [forward, up, right] -> the gun's own space (x right, y up, z back). */
  const v = (p: number[] | null | undefined) => (p ? new T.Vector3(p[2] || 0, p[1], -p[0]) : null);

  /** The nodes info.anim names, as live nodes: a recipe's model already has them (values are nodes), a loaded file's has their names. */
  function parts(group: THREE.Object3D, info: GunRigInfo): Parts {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(info.anim || {})) {
      if (typeof val === 'string') { const n = group.getObjectByName(val); if (n) out[key] = n; } // (by node name: `part_<key>`)
      else out[key] = val; // (a node)
    }
    return out as Parts;
  }

  /**
   * What a magazine shows when it is looked at (js/vmanim.ts magFill): read off a magazine part. A model made by the recipes
   * has it as references (userData.chk); one from a file as tagged meshes (see the top of this file). Both give the same:
   * { w, top: [the top round's case, its tip], holes: [{ t, mesh }], rounds: [{ t, mesh, tip? }] }. Null when the magazine shows nothing.
   */
  function magCheck(mag: THREE.Object3D | null | undefined): GunRigMagChk | null {
    if (!mag) return null;
    const r = mag.userData.chk;
    if (r) return { key: '', top: r.top, holes: r.holes.map((h: any) => ({ t: h.t, i: h.i, side: h.side, mesh: h.mesh, n: 0 })), w: r.w, rounds: r.rounds.map((q: any) => ({ t: q.t, mesh: q.mesh, tip: q.tip })),
      ...(r.follower ? { spine: r.spine, follower: rest(r.follower.mesh, r.follower.t), springs: r.springs.map((q: any) => ({ ...rest(q.mesh, q.t), u: q.u })) } : {}) };
    const meta = mag.userData.check;
    if (!meta) return null;
    const top: THREE.Mesh[] = [], follow: GunRigPoseMesh[] = [], coils: (GunRigPoseMesh & { u: number })[] = [], holes: GunRigMagChk['holes'] = [], rounds: GunRigMagChk['rounds'] = [], tips: Record<number, THREE.Mesh> = {};
    mag.traverse((o: any) => {
      const c = o.isMesh && o.userData.chk;
      if (!c) return;
      if (c.role === 'top') top[c.i] = o; else if (c.role === 'hole') holes.push({ t: c.t, i: c.i, side: c.side === -1 ? -1 : 1, mesh: o, n: 0 });
      else if (c.role === 'round') rounds[c.i] = { t: c.t, mesh: o }; else if (c.role === 'tip') tips[c.i] = o;
      else if (c.role === 'follower') follow[0] = rest(o, c.t); else if (c.role === 'spring') coils[c.i] = { ...rest(o, c.t), u: c.u };
    });
    rounds.forEach((q, i) => { if (tips[i]) q.tip = tips[i]; });
    if (!top[0] || !top[1]) return null;
    return { key: '', top, holes: holes.sort((p, q) => p.i - q.i || q.side - p.side), w: meta.w, rounds: rounds.filter(Boolean), ...(follow[0] && meta.spine ? { spine: meta.spine, follower: follow[0], springs: coils.filter(Boolean) } : {}) };
  }
  /** A follower or spring coil as built: its mesh, the depth t it was drawn at (the magazine spine's) and its rest pose, so magFill can move it along the spine. */
  function rest(mesh: THREE.Mesh, t: number) { return { mesh, t, px: mesh.position.x, py: mesh.position.y, pz: mesh.position.z, rx: mesh.rotation.x }; }

  /**
   * Writes a recipe model's magazine-check references down as the data a file carries (the tags above) so a baker can export
   * them: tags the meshes (extras.chk), puts { w } on the part (extras.check) and drops the references (they can't be written
   * to a file). Idempotent; a model without a check is left alone.
   */
  function describe(group: THREE.Object3D) {
    group.traverse((p: any) => {
      const r = p.userData.chk;
      if (!r || !r.top) return;
      p.userData.check = { w: r.w, ...(r.follower ? { spine: r.spine.map((a: number[]) => a.map((v) => +v.toFixed(5))) } : {}) };
      if (r.follower) { r.follower.mesh.userData.chk = { role: 'follower', i: 0, t: r.follower.t }; r.springs.forEach((q: any, i: number) => { q.mesh.userData.chk = { role: 'spring', i, t: +q.t.toFixed(5), u: q.u }; }); }
      r.top.forEach((m: any, i: number) => { if (m) m.userData.chk = { role: 'top', i }; });
      r.holes.forEach((h: any) => { h.mesh.userData.chk = { role: 'hole', i: h.i, t: h.t, side: h.side }; });
      r.rounds.forEach((q: any, i: number) => { q.mesh.userData.chk = { role: 'round', i, t: q.t }; if (q.tip) q.tip.userData.chk = { role: 'tip', i }; });
      delete p.userData.chk;
    });
  }

  /**
   * Binds a gun model for animation. group: the model (the holder the gun hangs in, when there is one: the anchors are taken in
   * its space), info: its anchors and animated parts, o.def: the weapon (which action it has, the round it takes), o.side: -1 / 1
   * for an akimbo pair. Returns the rig vmanim poses every frame.
   */
  function bind(group: THREE.Object3D, info: GunRigInfo, o: { def: WeaponDef; side?: number }): GunRig {
    const def = o.def, an = parts(group, info);
    const A = { G: v(info.grip), S: v(info.support), W: v(info.magAt), port: v(info.port), ch: v(info.ch), slide: v(info.slide), cyl: v(info.cylAt), bolt: v(info.bolt) } as GunRigAnchors;
    if (info.load) A.load = { at: info.load.at.map(([f, y]) => v([f, y, 0])!), pitch: info.load.pitch }; // (a derringer: its open breeches, and how far its barrels tip)
    if (info.breech) { const rs = G.GunModels.roundShape(def as { id: string }), rd = G.GunModels.roundDims(def as { id: string }); A.breech = { at: v([info.breech.at[0], info.breech.at[1], 0])!, pitch: info.breech.pitch, long: info.breech.long, oal: rs ? rs.oal : rd ? rd.cs + (rd.pistol || rd.bd >= 0.01 ? rd.bd * 1.1 : rd.bl) : 0.05 }; } // (a Thor's: where its open breech is, and how long a round is to go in it)
    if (info.block && info.chamberAt && info.chamberAt.side === 'face') { // (a falling block: its chambers, where each round goes in, and how long a round is)
      const c = info.chamberAt, rd = G.GunModels.roundDims(def as { id: string });
      A.block = { at: c.heads.map(([x, y]) => new T.Vector3(x, y, -c.f)), oal: rd ? rd.cs + (rd.pistol || rd.bd >= 0.01 ? rd.bd * 1.1 : rd.bl) : 0.025 };
    }
    if (info.cup) A.cup = v(info.cup); // (a derringer: the left hand cupped under the frame, clear of the barrels as they tip)
    if (info.handle) A.H = v(info.handle.grab || [info.handle.f, info.handle.y, info.handle.x]); // (where the hand takes it)
    // the bottom of the magazine, where the hand takes hold of it
    if (an.mag) {
      // (a raked well, info.magRake: the magazine's axis turned back from straight down. magDn: down that axis, in the gun's frame;
      // the bottom is found square to it, the magazine's points turned upright about its top, so the hand takes the floorplate's middle)
      const rake = info.magRake || 0, up = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), rake);
      A.magDn = new T.Vector3(0, -1, 0).applyQuaternion(up.clone().invert());
      an.mag.updateMatrixWorld(true);
      const inv = new T.Matrix4().copy(group.matrixWorld).invert();
      const box = new T.Box3(), home = an.mag.position.clone();
      if (!rake) box.setFromObject(an.mag).applyMatrix4(inv);
      else {
        const p = new T.Vector3();
        an.mag.traverse((o: any) => {
          const pos = o.isMesh && o.geometry && o.geometry.attributes.position;
          if (!pos) return;
          const m = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
          for (let i = 0; i < pos.count; i++) box.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(m).sub(home).applyQuaternion(up));
        });
      }
      A.WB = new T.Vector3((box.min.x + box.max.x) / 2, info.magTop ? box.max.y : box.min.y, (box.min.z + box.max.z) / 2);
      if (rake) A.WB.applyQuaternion(up.clone().invert()).add(home);
      A.magHome = an.mag.position.clone(); A.magQ = an.mag.quaternion.clone();
      A.magGrab = A.WB.clone().sub(an.mag.position); // hand -> magazine origin offset (inverted below)
    }
    if (an.handle) A.handleHome = an.handle.position.clone();
    if (an.ch) A.chHome = an.ch.position.clone();
    if (an.cyl) A.cylHome = an.cyl.position.clone();
    if (an.bolt) A.boltHome = an.bolt.position.clone();
    if (an.barrel) A.barrelHome = an.barrel.position.clone(); // (a long-recoil barrel's)
    if (an.brk) A.brkHome = an.brk.position.clone(); // (a falling block's: where it sits shut, info.block)
    // recip: the handle rides the bolt (it jumps back each shot); open: an open-bolt gun, whose bolt (and a
    // riding handle with it) sits back, cocked, while there's a round to fire
    return { holder: group, info, side: o.side || 1, an, A, chk: magCheck(an.mag), travel: info.handle ? info.handle.travel : 0.07, lock: info.handle && info.handle.lock || 0, recip: !!(info.handle && info.handle.recip), open: G.OPEN_BOLT.includes(def.id) };
  }

  /**
   * A world model's crossbow: whether its bolt's on the rail (bolt) and its string's cocked (cocked: back at the latch). Other guns have no
   * such parts (userData.xb is only on a crossbow's, js/viewmodel.ts worldInstance). A bolt that's on the rail is always on a cocked string.
   */
  function setLoaded(g: THREE.Object3D, bolt: boolean, cocked?: boolean) {
    const x = g && g.userData.xb;
    if (!x) return;
    if (cocked == null) cocked = bolt;
    x.bolt.visible = !!bolt; x.cocked.visible = !!cocked; x.slack.visible = !cocked;
  }
  /**
   * The bipod's legs down by k (0 folded, 1 standing the gun up): each leg (a child of the bipod node) turns about its own pivot to its
   * `extras.leg.deploy` (radians, XYZ euler: the model says where its legs point and how they splay), eased: deploy * smoothstep(k).
   * bipod: an.bipod (the viewmodel's, a bound rig's: the model's part_bipod node), or a world model's userData.bipod (js/viewmodel.ts, js/rig.ts).
   */
  function bipodPose(bipod: THREE.Object3D | null | undefined, k: number) {
    if (!bipod) return;
    const e = k * k * (3 - 2 * k);
    for (const l of bipod.children) { const d: number[] | undefined = l.userData.leg && l.userData.leg.deploy; if (d) l.rotation.set(e * d[0], e * d[1], e * d[2]); }
  }

  return { bind, parts, magCheck, describe, setLoaded, bipodPose, v };
})();
G.GunRig = G_GunRig;

/** The moving parts of a gun (js/gunrig.ts): by info.anim key, the live nodes. */
type GunRigParts = { mag?: THREE.Object3D; handle?: THREE.Object3D; ch?: THREE.Object3D; cyl?: THREE.Object3D; bolt?: THREE.Object3D; barrel?: THREE.Object3D; slide?: THREE.Object3D; brk?: THREE.Object3D; cover?: THREE.Object3D; bipod?: THREE.Object3D; pump?: THREE.Object3D; lever?: THREE.Object3D; quarrel?: THREE.Object3D; stringCocked?: THREE.Object3D; stringSlack?: THREE.Object3D };
/** Where a gun's round shows when it is checked (docs/models.md info.chamberAt). */
interface GunRigChamberAt { side: VmChamberSide; n: number; r: number; R: number; z: number; bore?: boolean; heads: number[][]; x: number; y: number; f: number; w: number }
/** What a model says about its moving parts and anchor points (docs/models.md `info`): [forward, up, right] each. */
interface GunRigInfo { magRake?: number | null; block?: { drop: number; lever: number } | null; modeDial?: { at: number[]; axis: number[]; modes: string[]; stepDeg: number } | null; hinge?: { sequence: { part: string; axis?: string | null; rotate_deg?: number | null; move?: number[] | null; frame?: string | null }[] } | null; anim?: Record<string, any>; grip?: number[]; support?: number[]; magAt?: number[]; port?: number[]; ch?: number[]; slide?: number[]; cylAt?: number[]; bolt?: number[]; boltTravel?: number; cup?: number[]; magTop?: boolean; recoilBarrel?: number; load?: { at: number[][]; pitch: number }; breech?: { at: number[]; pitch: number; long: string }; handle?: { grab?: number[]; f: number; y: number; x: number; travel: number; recip?: boolean; lock?: number }; chamberAt?: GunRigChamberAt; quarrelMats?: { nock?: THREE.MeshStandardMaterial } }
/** A hand's anchor points in the gun's space (null where the gun has none), and where its parts sit at rest. */
interface GunRigAnchors { G: THREE.Vector3; S: THREE.Vector3; W: THREE.Vector3 | null; port: THREE.Vector3 | null; ch: THREE.Vector3 | null; slide: THREE.Vector3 | null; cyl: THREE.Vector3 | null; bolt: THREE.Vector3 | null; P: THREE.Vector3; F: THREE.Vector3; load?: { at: THREE.Vector3[]; pitch: number }; breech?: { at: THREE.Vector3; pitch: number; long: string; oal: number }; cup?: THREE.Vector3 | null; H?: THREE.Vector3 | null; WB: THREE.Vector3; magHome?: THREE.Vector3; magQ: THREE.Quaternion; magDn?: THREE.Vector3 /* (down the magazine's axis: straight down, or a raked well's, info.magRake) */; magGrab?: THREE.Vector3; handleHome?: THREE.Vector3; chHome?: THREE.Vector3; cylHome?: THREE.Vector3; boltHome?: THREE.Vector3; barrelHome?: THREE.Vector3; brkHome?: THREE.Vector3; block?: { at: THREE.Vector3[]; oal: number } }
/** What a magazine shows when it is looked at: the top round (case, tip), witness holes (each with the count it stands for, once stamped), the rounds drawn through a clear body. */
interface GunRigPoseMesh { mesh: THREE.Mesh; t: number; px: number; py: number; pz: number; rx: number }
interface GunRigMagChk { spine?: number[][]; follower?: GunRigPoseMesh; springs?: (GunRigPoseMesh & { u: number })[]; key: string; top: THREE.Mesh[]; holes: { n: number; t: number; i: number; side: number; mesh: THREE.Mesh; lab?: THREE.Mesh }[]; labCap?: number; w: number; rounds: { t: number; mesh: THREE.Mesh; tip?: THREE.Mesh }[] }
/** One gun in the hands: its holder, its parts, its anchors, its magazine's check data. */
interface GunRig { holder: THREE.Object3D; info: GunRigInfo; side: number; an: GunRigParts; A: GunRigAnchors; chk: GunRigMagChk | null; travel: number; lock: number; recip: boolean; open: boolean; boltAm?: string }
interface GameModules { GunRig: typeof G_GunRig; }
