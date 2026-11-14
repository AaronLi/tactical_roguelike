'use strict';
// The level on the screen: three.js meshes made from the level's description (js/leveldesc.ts, docs/level-data.md), and
// nothing else. build(map) walks map.desc.draw in its order: a node a mesh (or a group, an instanced mesh, points, lines),
// its geometry one of three's (or a buffer the description gives), its material one per material id, its texture one per
// texture id (the procedural ones drawn here: the noise in them is each screen's own). Then what the screen needs to change
// later is picked out by the handles the description puts on it: the walls (js/damage.ts cuts cubes out of them), each door's
// pivot, leaf, knobs and hinges (G.Game.updateDoors, js/damage.ts), each pane (G.Views.breakGlass), the weapon case's and the
// boxes' lids, the cabinets' doors and shelves (G.Views). What the description leaves to others is done here where it falls:
// the furniture (js/furnmesh.ts build), what a foundry's machinery gives off (fx), the zipline trolleys (zipKit). Then the
// light grid (js/lightgrid.ts), and everything that never changes merged into a few meshes (mergeStatic).
interface LvViewPre { root: THREE.Group; it: Generator<void, void, void>; done: boolean; up?: unknown }
interface LvViewCtx { fm: LvMap; reg: Map<string, LvObj[]>; door: Record<string, LvObj[]> | null; geos: Map<LdGeo, THREE.BufferGeometry>; mats: (THREE.Material | null)[]; texs: (THREE.Texture | null)[]; D: LdDraw; map: LvMap }
const G_LevelView = {
  warned: new Set<string>(),
  // opts.pool false: no light grid and nothing merged (the hangar's bake); opts.hubFixed: the hangar's bake (tools/bake_hangar.mjs),
  // the nodes it bakes (hf) drawn and marked userData.hubFixed. Otherwise, with the baked hangar loaded, they're left out.
  skipHf: false, markHf: false,
  // build(map): all of it at once. Or a piece at a time, ahead of when it's wanted (a ship of the zone's the squad's ship is
  // closing with: js/space.ts zonePrep): begin(map) starts it, step(map, ms) does as much as fits in ms (true once it's all
  // made), and build(map) then finishes whatever's left and hands the same thing over. Made ahead, nothing of it is in the
  // scene and the light grid is left alone (it's the level on the screen's till build).
  build(map: LvMap, opts?: { pool?: boolean; hubFixed?: boolean }) {
    const pre = (map as any).viewPre as LvViewPre | null | undefined; (map as any).viewPre = null;
    if (pre && !opts) { this.markHf = this.skipHf = false; while (!pre.done) pre.done = !!pre.it.next().done; G.LightGrid.build(map); return pre.root; }
    const root = new THREE.Group(), it = this.steps(map, root, opts, false);
    while (!it.next().done) { /* (all of it) */ }
    return root;
  },
  begin(map: LvMap): LvViewPre { const root = new THREE.Group(); return ((map as any).viewPre = { root, it: this.steps(map, root, undefined, true), done: false }); },
  step(map: LvMap, ms: number) {
    const p = (map as any).viewPre as LvViewPre | null | undefined; if (!p) return true;
    this.markHf = this.skipHf = false;
    const t = performance.now(); while (!p.done && performance.now() - t < ms) p.done = !!p.it.next().done;
    return p.done;
  },
  *steps(map: LvMap, root: THREE.Group, opts: { pool?: boolean; hubFixed?: boolean } | undefined, ahead: boolean): Generator<void, void, void> {
    const pool = !opts || opts.pool !== false;
    if (pool) { map.dmg = null; for (const d of map.doors || []) { d.holes = null; d.gone = null; d.fallen = false; d.rest = null; } } // (a fresh start: js/damage.ts)
    this.markHf = !!map.hub && !!opts && !!opts.hubFixed;
    this.skipHf = !!map.hub && !this.markHf && !!(G.Hangar && G.Hangar.baked());
    const desc = map.desc!, D = desc.draw;
    const mats: (THREE.Material | null)[] = D.mats.map(() => null), texs: (THREE.Texture | null)[] = D.tex.map(() => null), geos = new Map<LdGeo, THREE.BufferGeometry>();
    const fms: LvMap[] = map.floors || [map];
    map.doorMeshes = []; map.winMeshes = [];
    const self = this;
    const floor = function* (fm: LvMap, parent: THREE.Object3D, nodes: LdNode[]): Generator<void, void, void> {
      const ctx: LvViewCtx = { fm, reg: new Map(), door: null, geos, mats, texs, D, map };
      for (const n of nodes) {
        // (a group of many: its children one at a time, into the group, as node would)
        if (ahead && n.t === 'g' && n.c && n.c.length > 8 && !n.h && !(n.hf && self.skipHf)) { const g = new THREE.Group() as LvObj; self.place(g, n); for (const c of n.c) { self.node(c, g, ctx); yield; } parent.add(g); }
        else self.node(n, parent, ctx);
        yield;
      }
      // the handles: this floor's walls, doors, panes, the case, the boxes and the cabinets
      const one = (k: string) => (ctx.reg.get(k) || [])[0] || null;
      const walls = one('walls');
      if (walls) { const wn = self.wallNode(nodes); fm.wallMesh = walls; fm.wallIdx = new Map(wn!.cells!.map((c, i) => [c, i])); fm.wallBase = (walls.instanceMatrix.array as Float32Array).slice(); }
      const mine: LvObj[] = [], all = map.doorMeshes;
      for (const [k, v] of ctx.reg) {
        if (k.startsWith('door:')) { mine.push(v[0]); all[+k.slice(5)] = v[0]; } // (by the door's id: numbered through the floors)
        else if (k.startsWith('pane:')) map.winMeshes[+k.slice(5)] = v[0];
      }
      fm.doorMeshes = fm === map ? all : mine;
      fm.caseView = one('case') ? { g: one('case'), lid: one('case.lid'), open: 0, synced: false } : undefined;
      fm.aboxView = one('abox') ? { g: one('abox'), lid: one('abox.lid'), lights: one('abox.lights'), key: null, open: 0, synced: false } : undefined;
      fm.sboxView = one('sbox') ? { g: one('sbox'), lid: one('sbox.lid'), card: one('sbox.card'), open: 0, name: null, synced: false } : undefined;
      fm.cabViews = (fm.cabinets || []).map((_c: LvCab, n: number) => ({ g: one('cab:' + n), door: one('cab:' + n + '.door'), slots: ctx.reg.get('cab:' + n + '.slot') || [], open: 0, key: null }));
    };
    if (map.floors) {
      // a building of several floors: each floor's nodes in its own group (at its height), then what's the building's
      const ctx: LvViewCtx = { fm: map, reg: new Map(), door: null, geos, mats, texs, D, map };
      for (const n of D.root) {
        if (n.t === 'g' && n.fl != null) { const g = new THREE.Group(); this.place(g, n); root.add(g); yield* floor(fms[n.fl], g, n.c || []); }
        else this.node(n, root, ctx);
        yield;
      }
      for (const [k, v] of ctx.reg) if (k.startsWith('pane:')) map.winMeshes[+k.slice(5)] = v[0];
      const b = fms[map.base || 0];
      map.caseView = b.caseView; map.aboxView = b.aboxView; map.sboxView = b.sboxView; map.cabViews = b.cabViews;
      for (const d of map.doors) if (d.pane) map.winMeshes[d.pane.id] = map.doorMeshes[d.id].userData.leaf; // (a glass door's pane: its leaf)
    } else yield* floor(map, root, D.root);
    map.lightPool = [];
    if (pool && !ahead) G.LightGrid.build(map); // every lamp, on every floor: js/lightgrid.ts
    if (pool) yield* this.mergeSteps(root, map);
  },
  wallNode(nodes: LdNode[]) { return nodes.find((n) => n.h === 'walls') || null; },

  // ---------------------------------------------------------------- a node, its geometry, material and texture
  node(n: LdNode, parent: THREE.Object3D, ctx: LvViewCtx) {
    const T = THREE;
    if (n.hf && this.skipHf) return null; // (the hangar's shell: in its baked scene)
    let o: LvObj | null = null;
    switch (n.t) {
      case 'm': o = new T.Mesh(this.geo(n.g!, ctx), Array.isArray(n.m) ? n.m.map((m) => this.mat(m, ctx)) : this.mat(n.m as number, ctx)) as LvObj; break;
      case 'g': o = new T.Group() as LvObj; break;
      case 'i': {
        const im = new T.InstancedMesh(this.geo(n.g!, ctx), this.mat(n.m as number, ctx), n.n!), m4 = new T.Matrix4(), c = new T.Color();
        if (n.tr) for (let i = 0; i < n.n!; i++) { m4.makeTranslation(n.tr[i * 3], n.tr[i * 3 + 1], n.tr[i * 3 + 2]); im.setMatrixAt(i, m4); }
        if (n.mx) for (let i = 0; i * 16 < n.mx.length; i++) { m4.fromArray(n.mx, i * 16); im.setMatrixAt(i, m4); }
        if (n.col) for (let i = 0; i * 3 < n.col.length; i++) im.setColorAt(i, c.setRGB(n.col[i * 3], n.col[i * 3 + 1], n.col[i * 3 + 2]));
        if (n.cnt != null) im.count = n.cnt;
        o = im as unknown as LvObj; break;
      }
      case 'p': case 'l': case 's': {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(new Float32Array(n.pos!), 3));
        if (n.col) g.setAttribute('color', new T.BufferAttribute(new Float32Array(n.col), 3));
        const m = this.mat(n.m as number, ctx);
        o = (n.t === 'p' ? new T.Points(g, m) : n.t === 'l' ? new T.Line(g, m) : new T.LineSegments(g, m)) as unknown as LvObj; break;
      }
      case 'h': this.hook(n, parent, ctx); return null;
    }
    if (!o) return null;
    this.place(o, n);
    if (n.hf && this.markHf) o.userData.hubFixed = true;
    if (n.h) {
      if (ctx.door && (n.h === 'leaf' || n.h === 'knob' || n.h === 'hk' || n.h === 'hp')) (ctx.door[n.h] || (ctx.door[n.h] = [])).push(o);
      else { const l = ctx.reg.get(n.h); if (l) l.push(o); else ctx.reg.set(n.h, [o]); }
    }
    if (n.c) {
      const outer = ctx.door, isDoor = !!n.h && n.h.startsWith('door:');
      if (isDoor) ctx.door = {};
      for (const c of n.c) this.node(c, o, ctx);
      if (isDoor) {
        // a door's pivot: turned by how far open the door is (G.Game.updateDoors), its leaf, knobs and hinges for what hits them
        const d = ctx.map.doors[+n.h!.slice(5)], H = ctx.door!, k = H.hk || [], p = H.hp || [];
        o.userData = { base: o.rotation.y, ang: d && d.open ? 1 : 0, sign: n.sg || 1, leaf: (H.leaf || [])[0], knobs: H.knob || [], hinges: k.map((q, i) => [q, p[i]]), slide: !!d && G.Level.slides(d), px: o.position.x, pz: o.position.z, w: (d && d.w) || G.Level.TS };
        if (!o.userData.slide) o.rotation.y = o.userData.base + (d && d.open ? Math.PI / 2 * 0.95 * (n.sg || 1) : 0);
      }
      ctx.door = outer;
    }
    parent.add(o);
    return o;
  },
  // where a node goes: its position, turn (Euler angles; or a quaternion; or facing a point: its +z toward it), scale, layers,
  // draw order, whether it's shown
  place(o: THREE.Object3D, n: LdNode) {
    if (n.p) o.position.set(n.p[0], n.p[1], n.p[2]);
    if (n.r) o.rotation.set(n.r[0], n.r[1], n.r[2]);
    if (n.q) o.quaternion.set(n.q[0], n.q[1], n.q[2], n.q[3]);
    if (n.look) o.lookAt(n.look[0], n.look[1], n.look[2]); // (before it's added to anything: as it stands on its own)
    if (n.s) o.scale.set(n.s[0], n.s[1], n.s[2]);
    if (n.l1) o.layers.enable(1); // (layer 1: what hides the evidence glow: walls, floors, doors)
    if (n.ro) o.renderOrder = n.ro;
    if (n.hid) o.visible = false;
  },
  hook(n: LdNode, parent: THREE.Object3D, ctx: LvViewCtx) {
    if (n.k === 'furniture') G.FurnMesh.build(ctx.fm, parent, this.tex(n.tex!, ctx));
    else if (n.k === 'fx') this.fx(ctx.fm, parent);
    else if (n.k === 'zipkit') { const kit = this.zipKit(); kit.position.set(n.p![0], n.p![1], n.p![2]); kit.rotation.y = n.r![1]; parent.add(kit); }
  },
  geo(g: LdGeo, ctx: LvViewCtx): THREE.BufferGeometry {
    const T = THREE, had = ctx.geos.get(g);
    if (had) return had;
    const a = g.a || [];
    let G0: THREE.BufferGeometry;
    if (g.k === 'proc') { G0 = this.geo(G.LevelDesc.proc(ctx.map.desc!, g), ctx); ctx.geos.set(g, G0); return G0; } // (a procedural surface: made from the description)
    switch (g.k) {
      case 'box': G0 = new T.BoxGeometry(a[0], a[1], a[2]); break;
      case 'plane': G0 = new T.PlaneGeometry(a[0], a[1], a[2], a[3]); break;
      case 'cyl': G0 = new T.CylinderGeometry(a[0], a[1], a[2], a[3], a[4], a[5] == null ? undefined : !!a[5]); break;
      case 'cone': G0 = new T.ConeGeometry(a[0], a[1], a[2], a[3], a[4] == null ? undefined : !!a[4]); break;
      case 'sphere': G0 = new T.SphereGeometry(a[0], a[1], a[2], a[3], a[4], a[5], a[6]); break;
      case 'circle': G0 = new T.CircleGeometry(a[0], a[1]); break;
      case 'torus': G0 = new T.TorusGeometry(a[0], a[1], a[2], a[3], a[4]); break;
      case 'ico': G0 = new T.IcosahedronGeometry(a[0], a[1]); break;
      case 'shape': { const p = g.pts!, sh = new T.Shape(); sh.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) sh.lineTo(p[i], p[i + 1]); sh.closePath(); G0 = new T.ShapeGeometry(sh); break; }
      case 'tube': { const p = g.pts!, v: THREE.Vector3[] = []; for (let i = 0; i < p.length; i += 3) v.push(new T.Vector3(p[i], p[i + 1], p[i + 2])); G0 = new T.TubeGeometry(new T.CatmullRomCurve3(v), a[0], a[1], a[2]); break; }
      case 'buf': {
        G0 = new T.BufferGeometry();
        G0.setAttribute('position', new T.BufferAttribute(new Float32Array(g.pos!), 3));
        if (g.nrm) G0.setAttribute('normal', new T.BufferAttribute(new Float32Array(g.nrm), 3));
        if (g.uv) G0.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.uv), 2));
        if (g.idx) G0.setIndex(g.idx);
        break;
      }
      case 'merge': { // (several geometries in one, their positions and normals end to end: none of them indexed)
        const parts = g.parts!.map((q) => this.geo(q, ctx));
        let n = 0; for (const q of parts) n += q.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
        for (const q of parts) { pos.set((q.attributes.position as THREE.BufferAttribute).array, o * 3); nor.set((q.attributes.normal as THREE.BufferAttribute).array, o * 3); o += q.attributes.position.count; ctx.geos.delete(g.parts![parts.indexOf(q)]); q.dispose(); }
        G0 = new T.BufferGeometry(); G0.setAttribute('position', new T.BufferAttribute(pos, 3)); G0.setAttribute('normal', new T.BufferAttribute(nor, 3));
        break;
      }
      default: throw new Error('level: no geometry ' + g.k);
    }
    for (const op of g.ops || []) {
      switch (op[0]) {
        case 'rx': G0.rotateX(op[1]); break;
        case 'ry': G0.rotateY(op[1]); break;
        case 'rz': G0.rotateZ(op[1]); break;
        case 's': G0.scale(op[1], op[2], op[3]); break;
        case 't': G0.translate(op[1], op[2], op[3]); break;
        case 'q': G0.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion(op[1], op[2], op[3], op[4]))); break;
        case 'ni': { const q = G0.toNonIndexed(); G0.dispose(); G0 = q; break; }
      }
    }
    if (g.col) G0.setAttribute('color', new T.BufferAttribute(new Float32Array(g.col), 3)); // (a colour a vertex)
    ctx.geos.set(g, G0);
    return G0;
  },
  mat(i: number, ctx: LvViewCtx): THREE.Material {
    const had = ctx.mats[i];
    if (had) return had;
    const T = THREE, sp = ctx.D.mats[i], o: Record<string, any> = {};
    for (const [k, v] of Object.entries(sp)) {
      if (k === 'k' || k === 'paint' || k === 'seed' || k === 'drop' || k === 'dim') continue;
      o[k] = k === 'map' ? this.tex(v as number, ctx) : k === 'blending' ? (v === 'add' ? T.AdditiveBlending : T.NormalBlending) : v; // (side: 0 front, 1 back, 2 both, as three numbers them)
    }
    let m: THREE.Material;
    switch (sp.k) {
      case 'std': m = new T.MeshStandardMaterial(o); if (sp.paint) (m as THREE.MeshStandardMaterial).defines!.LG_PAINT = 1; break; // (a resident's wallpaper: js/homes.ts paint)
      case 'basic': m = new T.MeshBasicMaterial(o); break;
      case 'points': m = new T.PointsMaterial(o); break;
      case 'line': m = new T.LineBasicMaterial(o); break;
      case 'outside': m = G.FurnMesh.outsideMaterial(G.U.rng(sp.seed), sp.drop); break; // (the city past an outside window: js/furnmesh.ts)
      default: throw new Error('level: no material ' + sp.k);
    }
    if (sp.dim != null) (m as THREE.MeshStandardMaterial).color.multiplyScalar(sp.dim); // (dead glass: its colour dimmed in linear light, as three's Color(hex).multiplyScalar)
    return (ctx.mats[i] = m);
  },
  tex(i: number, ctx: LvViewCtx): THREE.Texture {
    const had = ctx.texs[i];
    if (had) return had;
    const T = THREE, sp = ctx.D.tex[i], L = G.Level;
    const canvas = (w: number, h: number) => { const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h); c.width = w; c.height = h; return c; }; // (the highlights' export rebuilds the level in a worker)
    let tx: THREE.Texture;
    switch (sp.k) {
      case 'lv': tx = this._tex(sp.kind, sp.base); break;
      case 'grate': { // the bars: white where there's steel, clear between (the material's alphaTest cuts the gaps)
        const { PX, PITCH, CROSS, BAR } = L.GRATE, cv = canvas(PX, PX), g = cv.getContext('2d')! as CanvasRenderingContext2D;
        g.clearRect(0, 0, PX, PX); g.fillStyle = '#fff';
        for (let x = 0; x < PX; x += PITCH) g.fillRect(x, 0, BAR, PX); // the bearing bars
        for (let y = 0; y < PX; y += CROSS) g.fillRect(0, y, PX, BAR); // the cross bars
        tx = new T.CanvasTexture(cv as HTMLCanvasElement); tx.wrapS = tx.wrapT = T.RepeatWrapping; break;
      }
      case 'wired': { // bulletproof glass's steel wire
        const cv = canvas(128, 128), g = cv.getContext('2d')! as CanvasRenderingContext2D; g.clearRect(0, 0, 128, 128); g.strokeStyle = 'rgba(40,44,48,0.85)'; g.lineWidth = 2;
        for (let k = 0; k <= 128; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); }
        tx = new T.CanvasTexture(cv as HTMLCanvasElement); tx.wrapS = tx.wrapT = T.RepeatWrapping; break;
      }
      case 'glow': { // a soft round glow (a festival's bulbs and lanterns)
        const c = canvas(64, 64), g = c.getContext('2d')! as CanvasRenderingContext2D, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        tx = new T.CanvasTexture(c as HTMLCanvasElement); break;
      }
      case 'sign': { // a shop's lit sign
        const c = canvas(256, 64), g = c.getContext('2d')! as CanvasRenderingContext2D;
        g.fillStyle = '#16141a'; g.fillRect(0, 0, 256, 64); g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = sp.col; g.shadowBlur = 16; g.fillStyle = sp.col; g.fillText(sp.txt, 128, 34);
        tx = new T.CanvasTexture(c as HTMLCanvasElement); break;
      }
      case 'backdrop': { // the festival stage's backdrop, its name lit up (its spots from the festival's stream, at draw sp.at)
        const rnd = G.LevelDesc.rngAt(sp.seed, sp.at), c = canvas(1024, 384), g = c.getContext('2d')! as CanvasRenderingContext2D, gr = g.createLinearGradient(0, 0, 0, 384);
        gr.addColorStop(0, '#120a2a'); gr.addColorStop(1, '#3a0f3a'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 384);
        for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,${120 + rnd() * 120},${150 + rnd() * 100},${0.15 + rnd() * 0.3})`; g.beginPath(); g.arc(rnd() * 1024, rnd() * 384, 4 + rnd() * 30, 0, 7); g.fill(); }
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 110px sans-serif';
        g.shadowColor = '#ff4fd0'; g.shadowBlur = 30; g.fillStyle = '#ffe6fa'; g.fillText('SUMMER LIGHTS', 512, 160);
        g.font = 'bold 54px sans-serif'; g.shadowColor = '#40d0ff'; g.fillStyle = '#d8f6ff'; g.fillText('MUSIC  •  FOOD  •  ART', 512, 280);
        tx = new T.CanvasTexture(c as HTMLCanvasElement); break;
      }
      case 'welcome': { // the festival gate's arch
        const c = canvas(1024, 160), g2 = c.getContext('2d')! as CanvasRenderingContext2D; g2.fillStyle = '#2a1238'; g2.fillRect(0, 0, 1024, 160);
        g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.font = 'bold 96px sans-serif'; g2.shadowColor = '#ffb040'; g2.shadowBlur = 24; g2.fillStyle = '#fff2d8'; g2.fillText('WELCOME', 512, 84);
        tx = new T.CanvasTexture(c as HTMLCanvasElement); break;
      }
      case 'furn': { // one of js/furnspec.ts painters (G.FurnMesh.textures), from the festival's stream at draw sp.at (it counts what it draws: G.LevelDesc.TEX_DRAWS)
        const r0 = G.LevelDesc.rngAt(sp.seed, sp.at); let n = 0;
        tx = (G.FurnMesh.textures(() => { n++; return r0(); }) as Record<string, any>)[sp.fn](...(sp.args || []));
        const want = G.LevelDesc.TEX_DRAWS[sp.fn](G.LevelDesc.rngAt(sp.seed, sp.at));
        if (n !== want && !this.warned.has(sp.fn)) { this.warned.add(sp.fn); console.warn(`level: js/furnspec.ts painters().${sp.fn} drew ${n} times, js/leveldesc.ts TEX_DRAWS counts ${want}: what's drawn after it on the festival has moved`); }
        break;
      }
      default: throw new Error('level: no texture ' + sp.k);
    }
    if (sp.rep) tx.repeat.set(sp.rep[0], sp.rep[1]);
    return (ctx.texs[i] = tx);
  },
  // the real lights go to the lamps nearest p (a few times a second; now if `now`). (There are none now: the light grid
  // lights the level, js/lightgrid.ts. The pool stays empty.)
  LIGHTS: 12,
  // focus: where you're aiming, when you are (outdoors at night a third of the lights go to the lamps nearest it,
  // so what you look at down a scope at the far end of the field is lit)
  updateLights(map: LvMap, p: LvPt, now: boolean, focus: LvPt | null) {
    if (!map || !map.lightPool || !map.lightPool.length || !p) return;
    if (!now && (map.lightT = (map.lightT || 0) - 1) > 0) return;
    map.lightT = 12; // frames
    // (a building of several floors: the lamps on your own floor first, by a long way. The lights cast no shadows,
    // so a lamp downstairs would light the walls and furniture upstairs through the floor; only when there
    // aren't enough on yours, or you're right by a drop, do the nearest from another floor get one.)
    const L = G.Level, qf = (q: LvPt) => (map.floors ? L.floorAt(map, q.x, (q.y || 0) - 1.5, q.z) : 0);
    const by = (q: LvPt) => { const f = qf(q); return map.lamps.map((l): [LvLight, number] => [l, (l.x - q.x) * (l.x - q.x) + (l.z - q.z) * (l.z - q.z) + (map.floors && (l.fl || 0) !== f ? 900 : 0)]).sort((a, b) => a[1] - b[1]); };
    let near = by(p);
    if (focus && map.theme.layout === 'festival' && Math.hypot(focus.x - p.x, focus.z - p.z) > 20) {
      const n = map.lightPool.length, mine = near.slice(0, n - Math.floor(n / 3)), set = new Set(mine.map((e) => e[0]));
      near = mine.concat(by(focus).filter((e) => !set.has(e[0])).slice(0, Math.floor(n / 3)));
    }
    map.lightPool.forEach((pl, k) => {
      const e = near[k];
      if (!e) { pl.intensity = 0; return; }
      const l = e[0];
      pl.position.set(l.x, l.y!, l.z); pl.color.setHex(l.color!, THREE.LinearSRGBColorSpace); pl.intensity = Math.PI * l.i!; pl.distance = l.d!; // (l.i: in r149's units, as the light grid has it: js/util.ts)
    });
  },
  // A level's procedural textures: a tile's noise (the noise is this screen's own: Math.random) and its lines
  // ---------------------------------------------------------------- textures
  // ----------------------------------------------------------------- meshes
  // What a ship's made of (js/leveldesc.ts: a theme with space set), painted as the buildings' are: kind 'bulkhead', 'deck',
  // 'overhead' or 'cargo', then ':' and the ship's own colour (js/spacedata.ts THEMES accent).
  //   bulkhead  one wall tile's width and the wall's whole height (4 m): a kick plate, a lower panel, a rail with her colour
  //             along it, an upper panel, a strip of light over the doors' height, then ribbed plating and vents up to the trunking
  //   deck      two metres square: four plates with studded faces, one of them a grating, bolts at the corners
  //   overhead  frames crossing, a recessed panel between them, a cable run
  //   cargo     a container's side: corrugated, framed, a band of her colour and a label
  _shipTex(kd: string, base: string, acc: string) {
    const W = kd === 'bulkhead' ? 128 : 256, H = kd === 'bulkhead' ? 768 : 256, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!, dk = (a: number) => `rgba(0,0,0,${a})`, lt = (a: number) => `rgba(255,255,255,${a})`, R = Math.random;
    const rect = (x: number, y: number, w: number, h: number, f: string) => { g.fillStyle = f; g.fillRect(x, y, w, h); };
    const inset = (x: number, y: number, w: number, h: number) => { g.lineWidth = 2; g.strokeStyle = dk(0.3); g.strokeRect(x, y, w, h); g.lineWidth = 1; g.strokeStyle = lt(0.1); g.strokeRect(x + 2, y + 2, w - 4, h - 4); };
    const bolt = (x: number, y: number, r = 2.2) => { g.fillStyle = dk(0.4); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = lt(0.16); g.beginPath(); g.arc(x - 0.6, y - 0.6, r * 0.45, 0, 7); g.fill(); };
    rect(0, 0, W, H, base);
    for (let i = 0; i < W * H / 50; i++) { const v = R() * 2 - 1; g.fillStyle = v > 0 ? lt(v * 0.05) : dk(-v * 0.07); if (kd === 'bulkhead' || kd === 'cargo') g.fillRect(R() * W, R() * H, 1, 6 + R() * 26); else g.fillRect(R() * W, R() * H, 3 + R() * 14, 1); } // (brushed: its grain)
    if (kd === 'bulkhead') {
      const Y = (m: number) => Math.round(H * (1 - m / 4)), band = (m0: number, m1: number, f: string) => rect(0, Y(m1), W, Y(m0) - Y(m1), f);
      band(2.5, 4, dk(0.34)); // the plating over the light
      for (let m = 2.75; m < 3.7; m += 0.25) { band(m, m + 0.012, dk(0.3)); band(m - 0.012, m, lt(0.05)); }
      for (let x = 22; x < W - 22; x += 12) rect(x, Y(3.4), 6, Y(3.06) - Y(3.4), dk(0.55)); // a vent
      inset(14, Y(3.46), W - 28, Y(3.0) - Y(3.46));
      band(3.68, 3.86, dk(0.35)); band(3.86, 3.875, lt(0.12)); band(3.74, 3.76, acc); band(3.74, 3.76, dk(0.35)); // the trunking, a faint line of her colour on it
      band(2.34, 2.5, dk(0.5)); band(2.37, 2.47, '#eef4ff'); band(2.37, 2.385, acc); band(2.37, 2.385, lt(0.45)); // the strip of light, in its channel
      inset(8, Y(2.28), W - 16, Y(1.26) - Y(2.28)); for (const x of [15, W - 15]) for (const m of [2.22, 1.32]) bolt(x, Y(m));
      rect(W - 46, Y(2.12), 28, 14, dk(0.28)); rect(W - 43, Y(2.12) + 3, 12, 2, lt(0.35)); rect(W - 43, Y(2.12) + 8, 20, 2, lt(0.2)); // a stencilled plate
      band(1.04, 1.2, dk(0.5)); band(1.09, 1.15, acc); band(1.2, 1.21, lt(0.1)); // the rail
      band(0.25, 1.04, dk(0.1)); inset(8, Y(0.98), W - 16, Y(0.31) - Y(0.98)); for (const x of [15, W - 15]) for (const m of [0.92, 0.37]) bolt(x, Y(m));
      band(0, 0.25, dk(0.52)); for (let m = 0.04; m < 0.24; m += 0.05) band(m, m + 0.008, lt(0.07)); // the kick plate
      for (let i = 0; i < 26; i++) { g.fillStyle = dk(0.05 + R() * 0.08); g.fillRect(R() * W, Y(0.25 + R() * 0.9), 4 + R() * 22, 1 + R() * 2); } // (scuffed, low down)
      rect(0, 0, 2, H, dk(0.42)); rect(W - 2, 0, 2, H, dk(0.42)); rect(2, 0, 1, H, lt(0.08)); // the joint with the next
    } else if (kd === 'deck') {
      const P = W / 2;
      for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
        const x0 = px * P, y0 = py * P;
        if (px === 1 && py === 0) { // the grating
          rect(x0 + 6, y0 + 6, P - 12, P - 12, dk(0.3));
          for (let y = y0 + 12; y < y0 + P - 12; y += 9) for (let x = x0 + 12; x < x0 + P - 14; x += 26) rect(x, y, 20, 4, dk(0.6));
        } else for (let y = y0 + 14; y < y0 + P - 10; y += 12) for (let x = x0 + 14 + ((y / 12) & 1) * 6; x < x0 + P - 10; x += 12) { rect(x, y, 4, 2, lt(0.09)); rect(x, y + 2, 4, 1, dk(0.22)); } // studs
        g.lineWidth = 3; g.strokeStyle = dk(0.5); g.strokeRect(x0 + 1.5, y0 + 1.5, P - 3, P - 3); g.lineWidth = 1; g.strokeStyle = lt(0.09); g.strokeRect(x0 + 4.5, y0 + 4.5, P - 9, P - 9);
        for (const [bx, by] of [[9, 9], [P - 9, 9], [9, P - 9], [P - 9, P - 9]]) bolt(x0 + bx, y0 + by, 2.6);
      }
      for (let i = 0; i < 40; i++) { g.fillStyle = dk(0.04 + R() * 0.07); g.fillRect(R() * W, R() * H, 8 + R() * 40, 1 + R() * 2); } // (walked on)
    } else if (kd === 'overhead') {
      rect(0, 0, W, 18, dk(0.4)); rect(0, 18, W, 2, lt(0.08)); rect(0, 0, 18, H, dk(0.4)); rect(18, 0, 2, H, lt(0.08)); // the frames
      inset(34, 34, W - 50, H - 50); rect(W / 2 + 20, 20, 22, H - 20, dk(0.32)); for (let y = 30; y < H; y += 22) rect(W / 2 + 22, y, 18, 2, lt(0.08)); // a cable run
      for (const [x, y] of [[9, 9], [42, 42], [W - 24, 42], [42, H - 24], [W - 24, H - 24]]) bolt(x, y, 2.6);
    } else { // cargo
      for (let x = 14; x < W - 14; x += 16) { rect(x, 14, 8, H - 28, dk(0.16)); rect(x + 8, 14, 2, H - 28, lt(0.09)); rect(x - 1, 14, 1, H - 28, dk(0.2)); } // corrugated
      rect(0, Math.round(H * 0.56), W, 34, acc); rect(0, Math.round(H * 0.56), W, 34, dk(0.12));
      g.lineWidth = 14; g.strokeStyle = dk(0.42); g.strokeRect(7, 7, W - 14, H - 14); g.lineWidth = 1; g.strokeStyle = lt(0.12); g.strokeRect(14.5, 14.5, W - 29, H - 29);
      for (const [x, y] of [[0, 0], [W - 22, 0], [0, H - 22], [W - 22, H - 22]]) { rect(x, y, 22, 22, dk(0.35)); rect(x + 7, y + 7, 8, 8, dk(0.5)); } // corner castings
      rect(34, 38, 74, 44, '#e6e8e4'); for (let x = 40; x < 100; x += 3 + ((x * 7) % 5)) rect(x, 44, 1 + (x % 3), 20, '#15181a'); rect(40, 69, 46, 5, '#15181a'); // a label
    }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    return tex;
  },
  _tex(kind: string, base: string) {
    if (kind.indexOf(':') > 0) { const [kd, acc] = kind.split(':'); return this._shipTex(kd, base, acc); }
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = Math.random() * 40 - 20;
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 400})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    if (kind === 'floor') {
      g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
      g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.lineWidth = 1; g.stroke();
    } else if (kind === 'wall') {
      g.lineWidth = 2;
      g.strokeRect(1, 1, 126, 126);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 100, 128, 6);
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 20, 128, 3);
    } else if (kind === 'rock') { // (granite: crystals, cracks, no courses or skirting)
      for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,30,30' : '255,250,245'},${0.08 + Math.random() * 0.14})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      g.strokeStyle = 'rgba(40,24,20,0.3)'; g.lineWidth = 1;
      for (let i = 0; i < 5; i++) { let x = Math.random() * 128, y = Math.random() * 128; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 22; g.lineTo(x, y); } g.stroke(); }
    } else if (kind === 'plaster') {
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, 128, 128);
    } else if (kind === 'crate') {
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.strokeRect(4, 4, 120, 120);
      g.lineWidth = 2; for (let y = 24; y < 128; y += 24) { g.beginPath(); g.moveTo(6, y); g.lineTo(122, y); g.stroke(); }
      g.lineWidth = 6; g.beginPath(); g.moveTo(6, 6); g.lineTo(122, 122); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  },

  // each window: the wall below and above the opening, a frame, the pane (map.winMeshes[id], hidden when it
  // What a foundry's machinery gives off: sparks off the furnaces' slag doors and the hot saws, embers rising off the molten
  // steel in the ladles and the moulds (and a spatter of bright drops now and then), smoke over them, steam off the quench tank
  // and the mills: points that move on their own (each frame they're drawn), from the emitters the pieces name
  // (js/furniture.ts R[name].fx, placed by the generator: map.fx). Only the look: nothing in the game knows about them.
  fx(map: LvMap, root: THREE.Object3D) {
    const T = THREE, R = Math.random;
    const dot = (soft: boolean) => {
      const cv = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(32, 32); cv.width = cv.height = 32;
      const g = cv.getContext('2d')!, gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(soft ? 0.25 : 0.4, soft ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      return new T.CanvasTexture(cv);
    };
    const pool = (n: number, size: number, soft: boolean) => {
      const geo = new T.BufferGeometry(), pos = new Float32Array(n * 3).fill(-100), col = new Float32Array(n * 3);
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
      const pts = new T.Points(geo, new T.PointsMaterial({ size, map: dot(soft), vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      pts.frustumCulled = false; root.add(pts);
      return { pts, geo, pos, col, n, i: 0, soft, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), base: new Float32Array(n * 3), grav: new Float32Array(n), drag: new Float32Array(n) };
    };
    const hot = pool(1600, 0.08, false), haze = pool(240, 1.2, true);
    // one more of them: from (x, y, z) at (vx, vy, vz) for `life` seconds, its colour (r, g, b, sRGB: kept linear), falling
    // at `grav` (rising if it's less than 0), slowed by `drag` a second
    const emit = (P: Record<string, any>, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number, grav: number, drag: number) => {
      const i = P.i; P.i = (i + 1) % P.n;
      P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z; P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
      P.life[i] = P.max[i] = life; P.base[i * 3] = r ** 2.2; P.base[i * 3 + 1] = g ** 2.2; P.base[i * 3 + 2] = b ** 2.2; P.grav[i] = grav; P.drag[i] = drag;
    };
    const em = map.fx.map((f) => Object.assign({ acc: R(), t: R() * 6, on: 0, next: R() * 4 }, f));
    const spray = (e: Record<string, any>, n: number, speed: number, spread: number, up: number, life: number, cool: boolean) => { // (a burst along e.dir)
      const d = e.dir || [0, 0, 1];
      for (let k = 0; k < n; k++) {
        const s = speed * (0.6 + R() * 0.7);
        emit(hot, e.x + (R() - 0.5) * (e.r || 0.2), e.y + (R() - 0.5) * 0.2, e.z + (R() - 0.5) * (e.r || 0.2), d[0] * s + (R() - 0.5) * spread, d[1] * s + up * R(), d[2] * s + (R() - 0.5) * spread, life * (0.5 + R()), 1, cool ? 0.7 : 0.9, cool ? 0.3 : 0.55, 9.8, 0.25);
      }
    };
    const step = (dt: number) => {
      for (const e of em) {
        e.t += dt;
        if (e.kind === 'embers') { // rising slowly off molten metal, drifting, winking out
          e.acc += dt * (e.rate || 9);
          while (e.acc >= 1) { e.acc--; const a = R() * 6.283, rr = Math.sqrt(R()) * e.r; emit(hot, e.x + Math.cos(a) * rr, e.y, e.z + Math.sin(a) * rr, (R() - 0.5) * 0.35, 0.4 + R() * 1.2, (R() - 0.5) * 0.35, 1.6 + R() * 2.8, 1, 0.42 + R() * 0.3, 0.08, -0.12, 0.35); }
          if (R() < dt * 0.3 * (e.rate || 9) / 9) for (let k = 0; k < 16; k++) emit(hot, e.x + (R() - 0.5) * e.r, e.y + 0.05, e.z + (R() - 0.5) * e.r, (R() - 0.5) * 2.4, 1.8 + R() * 2.6, (R() - 0.5) * 2.4, 0.5 + R() * 0.7, 1, 0.85, 0.45, 9.8, 0.1); // (a pop: a spatter of bright drops)
        } else if (e.kind === 'sparks') { // bursts off a furnace's slag door, arcing out onto the floor
          if (e.t > e.next) { e.next = e.t + 1.2 + R() * 4; e.on = 0.2 + R() * 0.5; }
          if (e.on > 0) { e.on -= dt; e.acc += dt * 150; const n = Math.floor(e.acc); e.acc -= n; spray(e, n, 4.5, 2.4, 2.5, 1.1, true); }
        } else if (e.kind === 'jet') { // a hot saw's spray, while it cuts
          if (e.t > e.next) { e.next = e.t + 2.5 + R() * 5; e.on = 1 + R() * 1.6; }
          if (e.on > 0) { e.on -= dt; e.acc += dt * 140; const n = Math.floor(e.acc); e.acc -= n; spray(e, n, 7, 1.2, 0.8, 0.6, false); }
        } else { // smoke (dim, warm: lit by what's under it) or steam (pale), rising and spreading
          const steam = e.kind === 'steam';
          e.acc += dt * (e.rate || 2.2);
          while (e.acc >= 1) { e.acc--; const v = steam ? 0.16 : 0.06; emit(haze, e.x + (R() - 0.5) * (e.r || 0.4), e.y, e.z + (R() - 0.5) * (e.r || 0.4), (R() - 0.5) * 0.25, 0.35 + R() * 0.5, (R() - 0.5) * 0.25, 3 + R() * 3.5, v * (steam ? 0.95 : 1.25), v * (steam ? 1 : 0.85), v * (steam ? 1.05 : 0.6), -0.04, 0.15); }
        }
      }
      for (const P of [hot, haze]) {
        const { pos, vel, life, max, col, base, grav, drag } = P;
        for (let i = 0; i < P.n; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt;
          if (life[i] <= 0) { pos[i * 3 + 1] = -100; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
          const k = 1 - drag[i] * dt;
          vel[i * 3] *= k; vel[i * 3 + 2] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt;
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.5; vel[i * 3 + 2] *= 0.5; } // (sparks skitter on the floor)
          const u = life[i] / max[i];
          if (P.soft) { const f = Math.sin(Math.PI * u); col[i * 3] = base[i * 3] * f; col[i * 3 + 1] = base[i * 3 + 1] * f; col[i * 3 + 2] = base[i * 3 + 2] * f; }
          else { const f = Math.min(1, u * 3); col[i * 3] = base[i * 3] * f; col[i * 3 + 1] = base[i * 3 + 1] * f * u; col[i * 3 + 2] = base[i * 3 + 2] * f * u * u; } // (cooling: yellow to red to nothing)
        }
        P.geo.attributes.position.needsUpdate = true; P.geo.attributes.color.needsUpdate = true;
      }
    };
    let last = 0;
    hot.pts.onBeforeRender = () => { // (once a frame, however many views draw it)
      const now = performance.now();
      if (last && now - last < 4) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now; step(dt);
    };
  },
  // A zipline's trolley as it hangs off the cable: the yellow trolley on it, a strap down to the handle ZIP_BAR under the
  // cable, a short bar across it for one hand (along x: turned across the cable by whoever hangs it). Its origin is the cable. One waits at each
  // line's start (js/leveldesc.ts crest: a zipkit hook); a rider takes one across (js/rig.ts, js/player.ts zipArms), hanging by the bar, their feet
  // ZIP_HANG under the cable.
  _zipMats: undefined as { steel: THREE.MeshStandardMaterial; yel: THREE.MeshStandardMaterial } | undefined,
  zipKit() {
    const T = THREE, M = this._zipMats || (this._zipMats = { steel: new T.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.5, metalness: 0.6 }), yel: new T.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.5 }) });
    const g = new T.Group(), B = G.Level.ZIP_BAR;
    const tro = new T.Mesh(new T.BoxGeometry(0.12, 0.16, 0.28), M.yel); tro.position.y = -0.13; g.add(tro);
    const strap = new T.Mesh(new T.BoxGeometry(0.03, B - 0.2, 0.03), M.steel); strap.position.y = -(0.2 + B) / 2; g.add(strap);
    const bar = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.2, 6), M.steel); bar.rotation.z = Math.PI / 2; bar.position.y = -B; g.add(bar); // (the handle: one hand's width)
    const wheel = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.05, 12), M.steel); wheel.rotation.z = Math.PI / 2; wheel.position.y = 0.01; g.add(wheel); // (the trolley's wheels, fore and aft, on the cable)
    wheel.position.z = 0.09; const w2 = wheel.clone(); w2.position.z = -0.09; g.add(w2);
    return g;
  },
  mergeStatic(root: THREE.Object3D, map: LvMap, CH = 24) { const it = this.mergeSteps(root, map, CH); let r = it.next(); while (!r.done) r = it.next(); return r.value; },
  *mergeSteps(root: THREE.Object3D, map: LvMap, CH = 24): Generator<void, number, void> {
    const T = THREE, keep = new Set();
    for (const m of [map, ...(map.floors || [])]) {
      for (const o of m.doorMeshes || []) keep.add(o);
      for (const o of m.winMeshes || []) if (o) keep.add(o);
      if (m.caseView) keep.add(m.caseView.g);
      if (m.aboxView) keep.add(m.aboxView.g);
      if (m.sboxView) keep.add(m.sboxView.g);
      for (const c of m.cabViews || []) keep.add(c.g);
    }
    const plain = (mt: Record<string, any>) => (mt.isMeshStandardMaterial || mt.isMeshBasicMaterial || mt.isMeshLambertMaterial || mt.isMeshPhongMaterial) && !mt.transparent
      && (!mt.hasOwnProperty('onBeforeCompile'));
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), M = new T.Matrix4(), c = new T.Vector3(), bins = new Map(), took: LvObj[] = [];
    const ids = new Map(), idOf = (mt: THREE.Material) => { if (!ids.has(mt)) ids.set(mt, ids.size); return ids.get(mt); }; // (by the material itself, not its uuid)
    const cand: LvObj[] = [];
    const walk = (o: LvObj) => {
      if (keep.has(o) || !o.visible) return;
      for (const ch of [...o.children]) walk(ch);
      cand.push(o);
    };
    walk(root as LvObj);
    for (let ci = 0; ci < cand.length; ci++) {
      const o = cand[ci]; if ((ci & 15) === 15) yield;
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || o.renderOrder || o.morphTargetInfluences) continue;
      const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!g.attributes.position || !mats.every(plain) || Object.values(g.attributes).some((a) => !(a.array instanceof Float32Array))) continue;
      M.multiplyMatrices(inv, o.matrixWorld);
      if (M.determinant() <= 0) continue; // (mirrored: its faces would turn inside out)
      if (!g.boundingSphere) g.computeBoundingSphere();
      c.copy(g.boundingSphere.center).applyMatrix4(M);
      const names = Object.keys(g.attributes).sort().join(','), cell = Math.floor(c.x / CH) + ',' + Math.floor(c.y / 8) + ',' + Math.floor(c.z / CH);
      const ng = g.index ? g.toNonIndexed() : g.clone();
      ng.applyMatrix4(M);
      const parts = Array.isArray(o.material) ? (g.groups.length ? g.groups : [{ start: 0, count: Infinity, materialIndex: 0 }]) : [{ start: 0, count: Infinity, materialIndex: 0 }];
      for (const p of parts) {
        const mt = mats[p.materialIndex] || mats[0], key = idOf(mt) + '|' + o.layers.mask + '|' + names + '|' + cell;
        let b = bins.get(key);
        if (!b) bins.set(key, (b = { mt, mask: o.layers.mask, names, list: [] }));
        b.list.push({ g: ng, start: p.start, count: Math.min(p.count, ng.attributes.position.count - p.start), o });
      }
      took.push(o);
    }
    const merged = new Set<any>();
    for (const b of bins.values()) {
      if (b.list.length < 2) continue; // (alone in its stretch: nothing to save)
      yield;
      const out = new T.BufferGeometry(), first = b.list[0].g;
      let n = 0; for (const e of b.list) n += e.count;
      for (const name of b.names.split(',')) {
        const sz = first.attributes[name].itemSize, arr = new Float32Array(n * sz);
        let off = 0;
        for (const e of b.list) { const a = e.g.attributes[name]; arr.set(a.array.subarray(e.start * sz, (e.start + e.count) * sz), off * sz); off += e.count; }
        out.setAttribute(name, new T.BufferAttribute(arr, sz, first.attributes[name].normalized));
      }
      out.computeBoundingSphere();
      const m = new T.Mesh(out, b.mt);
      m.layers.mask = b.mask; m.matrixAutoUpdate = false;
      root.add(m);
      for (const e of b.list) merged.add(e.o);
    }
    // what went into them: out of the scene (and its geometry thrown away, unless something left still uses it)
    const used = new Set();
    for (const o of took) if (merged.has(o)) o.removeFromParent();
    root.traverse((o: LvObj) => { if (o.geometry) used.add(o.geometry); });
    for (const o of merged) if (!used.has(o.geometry)) o.geometry.dispose();
    for (const b of bins.values()) for (const e of b.list) e.g.dispose();
    return merged.size;
  },
  // The hangar's fixtures drawn as BatchedMeshes (js/hangar.ts batch), one a material, each piece an instance with its own
  // matrix, each kind of geometry in it once, the pieces culled one by one in every view: every plain, opaque mesh under root but what's in
  // keep (and under it), binned by its material (the material itself, so a material changed later still changes all of
  // them), its layers, its attributes, whether it casts a shadow and is culled. A material only one mesh has is left as it
  // is (nothing to save).
  batchStatic(root: THREE.Object3D, keep: Set<THREE.Object3D>) {
    const T = THREE;
    const plain = (mt: Record<string, any>) => (mt.isMeshStandardMaterial || mt.isMeshBasicMaterial || mt.isMeshLambertMaterial || mt.isMeshPhongMaterial) && !mt.transparent
      && (!mt.hasOwnProperty('onBeforeCompile'));
    root.updateMatrixWorld(true);
    interface BEntry { g: THREE.BufferGeometry; o: LvObj; M: THREE.Matrix4 }
    interface Bin { mt: THREE.Material; mask: number; cast: boolean; culled: boolean; keepMat: boolean; multi: boolean; list: BEntry[] }
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), bins = new Map<string, Bin>(), took: LvObj[] = [];
    const ids = new Map<unknown, number>(), idOf = (mt: unknown) => { if (!ids.has(mt)) ids.set(mt, ids.size); return ids.get(mt); }; // (by the material itself, not its uuid)
    // a mesh of several materials (a stair's step: tread and risers): each material's part a geometry of its own, made once
    // for each geometry and part
    const parts = new Map<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>(), made: THREE.BufferGeometry[] = [];
    const partOf = (g: THREE.BufferGeometry, p: { start: number; count: number }) => {
      let by = parts.get(g); if (!by) parts.set(g, (by = new Map()));
      let s = by.get(p.start);
      if (!s) {
        s = new T.BufferGeometry();
        if (g.index) { for (const [n, a] of Object.entries(g.attributes)) s.setAttribute(n, a); s.setIndex(new T.BufferAttribute((g.index.array as Uint32Array).slice(p.start, Math.min(g.index.count, p.start + p.count)), 1)); }
        else { const end = Math.min(g.attributes.position.count, p.start + p.count); for (const [n, a] of Object.entries(g.attributes)) { const sz = a.itemSize; s.setAttribute(n, new T.BufferAttribute((a.array as Float32Array).slice(p.start * sz, end * sz), sz, a.normalized)); } }
        by.set(p.start, s); made.push(s);
      }
      return s;
    };
    const walk = (o: LvObj) => {
      if (keep.has(o) || !o.visible) return;
      for (const ch of [...o.children]) walk(ch);
      if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isSkinnedMesh || o.children.length || o.renderOrder || o.morphTargetInfluences || o.hasOwnProperty('onBeforeRender')) return;
      const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!g.attributes.position || !mats.every(plain) || Object.values(g.attributes).some((a: any) => !(a.array instanceof Float32Array) || a.isInterleavedBufferAttribute)) return;
      const M = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      if (M.determinant() <= 0) return; // (mirrored: its faces would turn inside out, and an instance can't turn them back)
      const names = Object.keys(g.attributes).sort().map((n) => n + ':' + g.attributes[n].itemSize + (g.attributes[n].normalized ? 'n' : '')).join(',');
      const multi = Array.isArray(o.material) && g.groups.length > 0, ps = multi ? g.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
      for (const p of ps) {
        const mt = mats[p.materialIndex!] || mats[0], pg = multi ? partOf(g, p) : g;
        const key = idOf(mt) + '|' + o.layers.mask + '|' + names + '|' + (pg.index ? 'i' : 'n') + '|' + (o.castShadow ? 1 : 0) + (o.frustumCulled ? 1 : 0);
        let b = bins.get(key);
        if (!b) bins.set(key, (b = { mt, mask: o.layers.mask, cast: o.castShadow, culled: o.frustumCulled, keepMat: false, multi: false, list: [] }));
        b.list.push({ g: pg, o, M });
        if (multi) b.multi = true; // (built however few: the mesh's other parts go into theirs)
        if (o.userData.keepMat) b.keepMat = true;
      }
      took.push(o);
    };
    walk(root as LvObj);
    const merged = new Set<LvObj>(), failed = new Set<LvObj>(), inst: [THREE.BatchedMesh, number, LvObj][] = [];
    for (const b of bins.values()) {
      if (b.list.length < 2 && !b.multi) continue; // (the only one with its material: nothing to save)
      const geos = new Map<THREE.BufferGeometry, number>();
      let nv = 0, ni = 0;
      for (const e of b.list) if (!geos.has(e.g)) { geos.set(e.g, -1); nv += e.g.attributes.position.count; ni += e.g.index ? e.g.index.count : 0; }
      const bm = new T.BatchedMesh(b.list.length, nv, ni, b.mt);
      for (const e of b.list) {
        try {
          let gid = geos.get(e.g)!;
          if (gid < 0) { gid = bm.addGeometry(e.g); geos.set(e.g, gid); }
          const id = bm.addInstance(gid); bm.setMatrixAt(id, e.M);
          inst.push([bm, id, e.o]); merged.add(e.o);
        } catch (err) { failed.add(e.o); console.warn('batchStatic', err); }
      }
      bm.sortObjects = false; // (opaque, in any order, as the baked meshes were: not sorted again in every view)
      bm.perObjectFrustumCulled = bm.frustumCulled = b.culled;
      bm.castShadow = b.cast; bm.layers.mask = b.mask; bm.matrixAutoUpdate = false; bm.name = 'batch';
      if (b.keepMat) bm.userData.keepMat = true; // (its material shared, not thrown away with the level: js/render.ts clearLevel)
      bm.computeBoundingBox(); bm.computeBoundingSphere();
      root.add(bm);
    }
    // a mesh that couldn't all go in stays as it is, and out of the batches it went into
    for (const [bm, id, o] of inst) if (failed.has(o)) bm.deleteInstance(id);
    for (const o of failed) merged.delete(o);
    // what went in: out of the scene (and its geometry thrown away, unless something left still uses it)
    for (const o of took) if (merged.has(o)) o.removeFromParent();
    const used = new Set();
    root.traverse((o: LvObj) => { if (o.geometry) used.add(o.geometry); });
    for (const o of merged) if (!used.has(o.geometry)) o.geometry.dispose();
    for (const g of made) g.dispose();
    return merged.size;
  },
};
G.LevelView = G_LevelView;
interface GameModules { LevelView: typeof G_LevelView; }
