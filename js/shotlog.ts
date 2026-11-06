// Breach Protocol: F9's record of the shots that hit someone (js/player.ts roundDone, and the squad's through the host), and of
// the fragments of your grenades and of suspects' grenades thrown at you (js/player.ts fragDone: one shot a grenade).
// A round's path is kept whether F9's on or not (js/player.ts newPath), so this works for a shot fired before you pressed it:
// each one that hit someone leaves, for the level (the last MAX of them), a ghost of whoever it hit as they stood when it
// struck, the whole of its trail, coloured by speed as the trails are (js/render.ts trailColour), and markers on it: its speed
// at the muzzle, where it crossed each Mach number, what it went through or off, how fast it went in, how fast it was past
// their armour, how fast it came out or where it stopped, and the track of each fragment and splinter it threw off inside them.
// A thermobaric's burst (js/player.ts tbModel) is kept too, as the volume it filled: every cell of floor its fireball reached as a glowing
// column floor to ceiling, the rest of the space its pressure filled as tiles on the floor, and what it came to (how big, how closed,
// the pressure it held, what it did to each suspect): shown whenever F9 is (keepFill).
// All of it's only for whoever you've picked out with the crosshair, who stays picked when you look away (js/hud.ts debugTarget:
// hbLast): nobody else's shows, and with nobody picked out it's the shots that hit you.
// A round's finished path (js/player.ts newPath): p the points [x, y, z, speed], ev the events [point, 'e' | 'x' | 'r', ...],
// hit the hits (each a row of numbers and sub-arrays, indexed as the readout below does).
type ShotEv = any[]; // [point, 'e' | 'x' | 'r', fx, nx, ny, nz, material name, ...]: a row of mixed numbers and strings
type ShotHit = any[]; // [point, key, speed in, [kg], dx, dy, dz, passed through, armour (ShotArmour), [depth, what] it stopped in, fragments]
interface ShotPath { p: number[][]; ev: ShotEv[]; hit: ShotHit[]; }
interface ShotRow { key: string; n: number; burst?: boolean; name: string; range: number; muzzle: number; vIn: number; J: number; frags?: string; stop?: string; post?: number; out?: number; }
interface ShotGhost extends THREE.Group { mat: THREE.Material; uses: number; }
interface ShotHolder { ghosts?: Map<string, ShotGhost>; }
interface ShotInfo { holder: ShotHolder; name: string; burst?: boolean; }
interface ShotLabel { p: THREE.Vector3; t: string; c: string; pri: number; key?: string; }
interface ShotVert { p: THREE.Vector3; v: number; }
interface ShotRec { keys: Set<string>; hits: ShotRow[]; line: THREE.Line; frags: THREE.LineSegments | null; labels: ShotLabel[]; ghosts: Map<string, ShotGhost>; nade?: THREE.Object3D; }
interface ShotArmour { e: string; b: number; r: { k: MatKey; o: number; un?: boolean }[]; }
type ShotMark = (p: THREE.Vector3, t: string, c: string, pri: number, key?: string) => void;
const G_ShotLog = (() => {
  const T = THREE, MAX = 32, MACHS = [3, 2.5, 2, 1.5, 1, 0.5], RANGE = 90, LH = 15; // (RANGE: markers further than this aren't labelled)
  let recs: ShotRec[] = [], count = new Map<string, number>(), far = new Map<string, ShotHolder>(), shown = false, cv: HTMLCanvasElement = null!, g: CanvasRenderingContext2D = null!; // (cv, g: made on the first frame)
  const css = (v: number) => '#' + G.R.trailColour(v, new T.Color()).getHexString(), mach = (v: number) => (v / G.SOUND_SPEED).toFixed(2);
  const rigOf = (key: string) => { const v = key[0] === 'e' ? G.Views.enemies.get(+key.slice(1)) : G.Views.players.get(key.slice(1)); return v && v.rig; };

  // who it hit, as they stand now: a copy of their meshes where they are this moment (the geometry's theirs: nothing of it to free).
  // (Out of your sight their body's hidden, js/views.ts: someone shot through a wall is, and still has to show.)
  function ghostOf(rig: Rig): ShotGhost {
    const grp = new T.Group() as ShotGhost, mat = new T.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.34, depthTest: false, depthWrite: false, blending: T.AdditiveBlending });
    const shownBody = rig.body.visible; rig.body.visible = true; // (the F9 view shows it: frame())
    rig.root.updateMatrixWorld(true);
    rig.root.traverseVisible((o: THREE.Object3D & Record<string, any>) => {
      if (!o.isMesh || !o.geometry || o.material.depthTest === false) return; // (their x-ray's organs, the dots of a wound track)
      const m = new T.Mesh(o.geometry, mat); m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.renderOrder = 996; m.frustumCulled = false; grp.add(m);
    });
    rig.body.visible = shownBody;
    grp.visible = false; grp.mat = mat; grp.uses = 0;
    G.R.scene.add(grp);
    return grp;
  }
  // holder: what a shot's ghosts are kept on, one for each person whatever number of its pellets hit them
  function pose(holder: ShotHolder, key: string, rig: Rig | null | undefined) {
    const m = holder.ghosts || (holder.ghosts = new Map());
    if (!m.has(key) && rig && rig.root.visible) m.set(key, ghostOf(rig));
  }
  // a shot of the squad's, told to us when it's done (js/game.ts rpath): its ghosts are as they stand as it gets here
  const remote = (k: string, sid: string | number) => { const key = k + ':' + sid; if (!far.has(key)) far.set(key, {}); return far.get(key)!; };

  // A round's finished path: its trail, its markers. Between two points in the air it's lost speed by the metre (drag: js/player.ts
  // stepRound), so its speed along that stretch is a geometric curve, and that's where it's found to have crossed a Mach
  // number. Through a solid or a body there's no such thing: the speed in and out are told instead.
  function keep(path: ShotPath | null | undefined, info: ShotInfo) {
    const r = build(path, info);
    if (!r) return;
    recs.push(r);
    while (recs.length > MAX) drop(recs.shift()!);
  }
  // A grenade's fragments (js/player.ts fragDone): the paths of every one that hit someone, kept as one shot: their trails, one
  // marker at the burst, a ghost of each person they hit, a row for each fragment in them. (info.burst: no muzzle or Mach markers)
  function keepAll(paths: ShotPath[], info: ShotInfo) {
    const built = paths.map((p) => build(p, info)).filter(Boolean) as ShotRec[];
    if (!built.length) return;
    const r = built[0];
    for (const o of built.slice(1)) {
      r.line.add(o.line); o.line.visible = true; // (shown and hidden with the first)
      for (const k of o.keys) r.keys.add(k);
      r.hits.push(...o.hits); r.labels.push(...o.labels);
      for (const [k, gh] of o.ghosts) { if (r.ghosts.has(k)) gh.uses--; else r.ghosts.set(k, gh); } // (one person's ghost, counted once)
    }
    const at = paths[0].p[0];
    r.nade = nadeGhost(at); // (the grenade where it went off; with it shown, every body it hit is shown too: frame)
    r.labels.push({ p: new T.Vector3(at[0], at[1], at[2]), t: `${info.name}: ${built.length} fragment${built.length > 1 ? 's' : ''} hit · ${r.keys.size} ${r.keys.size > 1 ? 'people' : 'person'}`, c: '#ffd9a0', pri: 4 });
    r.labels.sort((a, b) => b.pri - a.pri);
    recs.push(r);
    while (recs.length > MAX) drop(recs.shift()!);
  }
  function build(path: ShotPath | null | undefined, info: ShotInfo): ShotRec | null {
    if (!path || !path.hit.length) return null;
    const P = path.p.map((a) => ({ p: new T.Vector3(a[0], a[1], a[2]), v: a[3] })), xs = [0], A = G.SOUND_SPEED, inside = new Set<number>(), labels: ShotLabel[] = [], verts: ShotVert[] = [];
    for (let i = 1; i < P.length; i++) xs.push(xs[i - 1] + P[i].p.distanceTo(P[i - 1].p));
    for (const e of path.ev) if (e[1] === 'e') { const x = path.ev.find((q) => q[1] === 'x' && q[0] > e[0]); if (x) for (let k = e[0]; k < x[0]; k++) inside.add(k); }
    for (const h of path.hit) if (h[7]) inside.add(h[0]);
    const add = (p: THREE.Vector3, v: number) => verts.push({ p, v }), mark = (p: THREE.Vector3, t: string, c: string, pri: number, key?: string) => labels.push({ p, t, c, pri, key }); // (key: a marker of what it did to them: only with them picked out)
    if (!info.burst) mark(P[0].p, `Muzzle ${P[0].v} m/s · M${mach(P[0].v)}`, css(P[0].v), 3);
    add(P[0].p, P[0].v);
    const after = new Map<number, number>(); // (the speed it was going past their armour, by the point it went in)
    const hits = hitRows(path, P, xs, after, mark, info);
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1], len = b.p.distanceTo(a.p), air = !inside.has(i) && !(len < 0.5 && b.v < a.v * 0.9) && b.v > 0 && a.v > 0;
      if (after.has(i)) add(a.p, after.get(i)!);
      if (air) {
        const n = Math.min(16, Math.ceil(len / 2));
        for (let k = 1; k < n; k++) { const u = k / n; add(a.p.clone().lerp(b.p, u), a.v * Math.pow(b.v / a.v, u)); }
        if (!info.burst) for (const m of MACHS) {
          const th = m * A;
          if (a.v > th && b.v <= th) { const u = Math.log(th / a.v) / Math.log(b.v / a.v), p = a.p.clone().lerp(b.p, u); mark(p, `Mach ${m} · ${Math.round(xs[i] + len * u)} m`, css(th), 2); }
        }
      }
      add(b.p, b.v);
    }
    // what it went through and off
    for (const e of path.ev) {
      if (e[1] === 'x') continue;
      const q = P[e[0]], nx = path.ev.find((z) => z[1] === 'x' && z[0] > e[0]), out = e[1] === 'r' ? P[e[0] + 1] : nx ? P[nx[0]] : null;
      mark(q.p, `${e[1] === 'r' ? 'Off' : 'Into'} ${e[6] || 'it'} ${q.v}${out ? ' → ' + out.v : ''} m/s`, css(q.v), 2);
    }
    // the stretch into someone it stopped in (not one it glanced off inside them: that goes on from there)
    const end = path.hit[path.hit.length - 1];
    if (!end[7] && end[0] === P.length - 1 && end[9] && end[9][0] > 0) { const q = P[end[0]].p.clone().add(new T.Vector3(end[4], end[5], end[6]).multiplyScalar(end[9][0])); add(q, 0); mark(q, `Stopped in ${end[9][1]} · ${Math.round(end[9][0] * 100)} cm in`, css(0), 4, end[1]); }
    const pos = new Float32Array(verts.length * 3), col = new Float32Array(verts.length * 3), c = new T.Color();
    verts.forEach((q, i) => { pos.set([q.p.x, q.p.y, q.p.z], i * 3); G.R.trailColour(q.v, c); col.set([c.r, c.g, c.b], i * 3); });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const mat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false }), line = new T.Line(geo, mat);
    line.frustumCulled = false; line.renderOrder = 998; line.visible = false; G.R.scene.add(line);
    const frags = fragLines(path, mark);
    if (frags) line.add(frags);
    const ghosts = new Map<string, ShotGhost>(), m = info.holder.ghosts;
    for (const h of hits) { if (!m || !m.has(h.key)) pose(info.holder, h.key, rigOf(h.key)); const gh = info.holder.ghosts && info.holder.ghosts.get(h.key); if (gh && !ghosts.has(h.key)) { ghosts.set(h.key, gh); gh.uses++; } }
    return { keys: new Set(hits.map((h) => h.key)), hits, line, frags, labels: labels.sort((a, b) => b.pri - a.pri), ghosts };
  }
  // What it threw off inside them (js/ballistics.ts through: path.hit [10], js/player.ts pathFrags): each fragment and splinter's own
  // track from where it broke off, going from the speed it broke off at to what it was doing when it ended, a marker at
  // each break and at the end of each track.
  function fragLines(path: ShotPath, mark: ShotMark) {
    const pos: number[] = [], col: number[] = [], c = new T.Color();
    for (const h of path.hit) {
      const breaks = new Map<string, { f: number[]; n: number; deep: number }>();
      for (const f of h[10] || []) {
        pos.push(...f.slice(0, 6));
        col.push(...G.R.trailColour(f[6], c).toArray(), ...G.R.trailColour(f[7], c).toArray());
        const at = f.slice(0, 3).join() + f[9], len = Math.round(Math.hypot(f[3] - f[0], f[4] - f[1], f[5] - f[2]) * 100);
        if (!breaks.has(at)) breaks.set(at, { f, n: 0, deep: 0 });
        const b = breaks.get(at)!; b.n++; b.deep = Math.max(b.deep, len);
        mark(new T.Vector3(f[3], f[4], f[5]), `${f[9] ? 'Splinter' : 'Fragment'} ${f[8]} g · ${len} cm${f[7] ? ` · out ${f[7]} m/s` : ''}`, css(f[7]), 1, h[1]);
      }
      for (const { f, n, deep } of breaks.values()) mark(new T.Vector3(f[0], f[1], f[2]), `${f[9] ? `Bone: ${n} splinters` : `Broke up: ${n} fragments`} at ${f[6]} m/s · ${deep} cm at most`, css(f[6]), 3, h[1]);
    }
    if (!pos.length) return null;
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const line = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false }));
    line.frustumCulled = false; line.renderOrder = 998;
    return line;
  }
  // a hit's markers (in, past the armour, out) and its row in the readout
  function hitRows(path: ShotPath, P: ShotVert[], xs: number[], after: Map<number, number>, mark: ShotMark, info: ShotInfo) {
    return path.hit.map((h) => {
      const q = P[h[0]], v = h[2], key = h[1], n = (count.get(key) || 0) + 1, kg = h[3] ? h[3][0] : 0, a: ShotArmour | undefined = h[8], rows = a ? a.r.filter((r) => !r.un) : [], row: ShotRow = { key, n, burst: !!info.burst, name: info.name, range: Math.round(xs[h[0]]), muzzle: P[0].v, vIn: v, J: Math.round(0.5 * kg * v * v) };
      count.set(key, n);
      const fr: number[][] = h[10] || [], ns = fr.filter((f) => f[9]).length;
      row.frags = [fr.length > ns && `${fr.length - ns} fragments`, ns && `${ns} bone splinters`].filter(Boolean).join(', ');
      mark(q.p, `Entry ${v} m/s · M${mach(v)} · ${G.U.fmt(row.J)} J`, css(v), 5, key);
      if (a) { // (what armour was hit before the body, and what it left)
        const front = rows.slice(0, rows.findIndex((r) => !r.k) < 0 ? rows.length : rows.findIndex((r) => !r.k)), last = front[front.length - 1];
        if (a.e === 'armour') { row.stop = `${last ? G.Materials.MAT[last.k].name : 'armour'}, ${a.b} J to the body`; mark(q.p, `Stopped by ${row.stop}`, '#9fe8ff', 5, key); } else if (a.e === 'glance') { row.stop = 'glanced off their armour'; mark(q.p, 'Glanced off their armour', '#9fe8ff', 5, key); } else if (last) {
          row.post = last.o; after.set(h[0], last.o);
          mark(q.p, `Past armour ${last.o} m/s · ${Math.round((1 - (last.o * last.o) / (v * v)) * 100)}% of its energy gone`, css(last.o), 5, key);
        }
      }
      if (h[7]) { const out = P[h[0] + 1]; if (out) { row.out = out.v; mark(out.p, `Exit ${out.v} m/s · M${mach(out.v)}`, css(out.v), 5, key); } } else if (!row.stop) row.stop = h[9] ? `${h[9][1]}, ${Math.round(h[9][0] * 100)} cm in` : 'in them';
      return row;
    });
  }
  // A frag grenade's ghost where it burst: its body (a fluted egg), its fuze and lever, in the ghosts' see-through look but warm,
  // so it isn't taken for a person
  let nadeGeo: THREE.BufferGeometry[] | null = null;
  function nadeGhost(at: number[]) {
    if (!nadeGeo) {
      const body = new T.SphereGeometry(0.032, 14, 10); body.scale(1, 1.25, 1);
      const fuze = new T.CylinderGeometry(0.011, 0.013, 0.03, 10); fuze.translate(0, 0.05, 0);
      const lever = new T.BoxGeometry(0.012, 0.075, 0.006); lever.translate(0.02, 0.025, 0); lever.rotateZ(-0.12);
      nadeGeo = [body, fuze, lever];
    }
    const g = new T.Group(), mat = new T.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, blending: T.AdditiveBlending });
    for (const geo of nadeGeo) { const m = new T.Mesh(geo, mat); m.renderOrder = 997; m.frustumCulled = false; g.add(m); }
    g.position.set(at[0], at[1], at[2]); g.scale.setScalar(1.6); g.visible = false; // (a little larger than life: it has to be found)
    G.R.scene.add(g);
    return g;
  }
  // ---- picking a grenade out: its ghost in the crosshair (within 25 cm of the line, nearer than any wall or body)
  let sel: ShotRec | null = null;
  function pickNade(o: THREE.Vector3, d: THREE.Vector3, maxT: number) {
    let best: { r: ShotRec; t: number } | null = null;
    for (const r of recs) {
      if (!r.nade) continue;
      const q = r.nade.position, t = (q.x - o.x) * d.x + (q.y - o.y) * d.y + (q.z - o.z) * d.z;
      if (t < 0.2 || t > maxT) continue;
      const off = Math.hypot(o.x + d.x * t - q.x, o.y + d.y * t - q.y, o.z + d.z * t - q.z);
      if (off < 0.25 && (!best || t < best.t)) best = { r, t };
    }
    return best;
  }
  const select = (r: ShotRec | null) => { sel = r; };
  const nameOf = (key: string) => { if (key[0] === 'e') { const ev = G.Views.enemies.get(+key.slice(1)); return `${ev && ev.def && ev.def.name ? ev.def.name : 'Suspect'} #${key.slice(1)}`; } const id = key.slice(1); return id === G.Net.myId ? 'You' : ((G.Views.players.get(id) || {} as { name?: string }).name || 'Officer'); };
  // the readout for the grenade picked out: who its fragments hit, how many and how hard, and what stopped them
  function nadeHtml() {
    if (!sel) return '';
    const esc = G.U.esc, by = new Map<string, ShotRow[]>();
    for (const h of sel.hits) { if (!by.has(h.key)) by.set(h.key, []); by.get(h.key)!.push(h); }
    const at = sel.nade!.position, me = G.R.camera.position;
    const rows = [...by].map(([k, hs]) => {
      const J = hs.reduce((a, h) => a + h.J, 0), through = hs.filter((h) => h.out != null).length, armour = hs.filter((h) => h.stop && /armour|plate|Stopped by|J to the body/.test(h.stop)).length;
      return `<div class="hb-shot"><b>${esc(nameOf(k))}</b> <span class="hb-k">· ${hs[0].range} m from it</span><br>${hs.length} fragment${hs.length > 1 ? 's' : ''} · ${G.U.fmt(J)} J in all · fastest in ${Math.max(...hs.map((h) => h.vIn))} m/s${through ? ` · ${through} through` : ''}${armour ? ` <span class="warn">· ${armour} stopped by armour</span>` : ''}</div>`;
    });
    return `<h4>${esc(sel.hits[0] ? sel.hits[0].name : 'Grenade')} <small>${Math.hypot(at.x - me.x, at.z - me.z).toFixed(1)} m · picked out</small></h4><div class="hb-sec"><span class="hb-k">Fragments that hit someone: ${sel.hits.length}, ${by.size} ${by.size > 1 ? 'people' : 'person'}</span>${rows.join('')}</div><div class="hb-k">Look at someone to pick them out instead.</div>`;
  }
  function drop(r: ShotRec) {
    if (sel === r) sel = null;
    if (r.nade) { r.nade.removeFromParent(); ((r.nade.children[0] as THREE.Mesh).material as THREE.Material).dispose(); } // (its shapes are shared)
    r.line.removeFromParent();
    r.line.traverse((o: THREE.Object3D & Record<string, any>) => { if (o.geometry) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); // (its own, its fragments', a grenade's other trails)
    for (const gh of r.ghosts.values()) if (--gh.uses <= 0) { gh.removeFromParent(); gh.mat.dispose(); }
  }
  // ---- a thermobaric's fill (js/player.ts thermobaric, and the squad's: js/game.ts onBoom). log: what it did to each suspect (yours only)
  interface FillRec { g: THREE.Group; labels: ShotLabel[] }
  let fills: FillRec[] = [];
  function keepFill(M: any, log: any[] | null, name: string) {
    const L = G.Level, TS = L.TS, W = M.map.W, g = new T.Group(), gy = M.p.y - 0.25, labels: ShotLabel[] = [];
    const cells = (from: number, to: number, h: number, col: number, op: number) => {
      const n = Math.max(0, to - from); if (!n) return;
      const im = new T.InstancedMesh(new T.BoxGeometry(TS * 0.94, h, TS * 0.94), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthTest: false, depthWrite: false, blending: T.AdditiveBlending }), n), m = new T.Matrix4();
      for (let i = from; i < to; i++) { const c = M.fill.order[i]; m.makeTranslation(((c % W) + 0.5) * TS, gy + h / 2 + 0.02, (((c / W) | 0) + 0.5) * TS); im.setMatrixAt(i - from, m); }
      im.renderOrder = 995; im.frustumCulled = false; g.add(im);
    };
    cells(0, M.cloud, L.WALL_H - 0.1, 0xff7a30, 0.07); // (the fireball: floor to ceiling)
    cells(M.cloud, M.space, 0.04, 0x4aa8ff, 0.3); // (the rest of the space its pressure filled: on the floor)
    g.visible = false; G.R.scene.add(g);
    const pct = (v: number) => Math.round(v * 100) + '%';
    labels.push({ p: M.p.clone().setY(gy + 2.2), t: `${name}: fireball ${M.areaCloud.toFixed(0)} m² of floor (${(M.areaCloud * G.Me.TB.ROOM_H).toFixed(0)} m³)${M.outFrac > 0.05 ? `, ${pct(M.outFrac)} under the sky` : ''}`, c: '#ffb070', pri: 6 });
    labels.push({ p: M.p.clone().setY(gy + 1.6), t: `Space ${M.areaSpace.toFixed(0)} m²${M.closed ? ' (closed)' : ' or more (open onto the rest)'}, ${M.fill.vents} way${M.fill.vents === 1 ? '' : 's'} out · confinement ${pct(M.conf)} · ${M.qs.toFixed(0)} kPa held`, c: '#8fc8ff', pri: 6 });
    for (const q of log || []) if (q.at !== 'none' && q.p) labels.push({ p: new T.Vector3(q.p[0], q.p[1] + 1.9, q.p[2]), t: `#${q.id} ${q.at === 'cloud' ? 'in the fireball' : q.at === 'space' ? 'in its space' : 'through a wall'} · burn ${pct(q.burn)} blast ${pct(q.blast)} of a life · dazed ${pct(q.daze)}`, c: q.at === 'cloud' ? '#ff9a50' : q.at === 'space' ? '#8fc8ff' : '#c0c0c0', pri: 5 });
    fills.push({ g, labels });
    while (fills.length > 6) dropFill(fills.shift()!);
  }
  function dropFill(f: FillRec) { f.g.removeFromParent(); f.g.traverse((o: THREE.Object3D & Record<string, any>) => { if (o.geometry) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); }
  function clear() { for (const r of recs) drop(r); recs = []; sel = null; count = new Map(); far = new Map(); for (const f of fills) dropFill(f); fills = []; }
  // the shots that hit someone, oldest first (js/hud.ts debugTarget's readout)
  const of = (key: string) => recs.flatMap((r) => r.hits.filter((h) => h.key === key));
  // whose shots are shown: whoever's picked out, or you if nobody is (you can't put the crosshair on yourself)
  const focus = () => { const L = G.HUD.hbLast; return L ? (L.kind === 'e' ? 'e' + L.who.id : 'p' + L.id) : 'p' + G.Net.myId; };

  // Each frame the hitboxes are shown: what's lit, and the markers, laid out so they don't sit on each other: a dot on the trail
  // where it happened, its label beside it, or up the line from it if that's taken. (A round through two people: its trail, and
  // the ghost and markers of the one picked out.) The most important and the latest
  // shot's first: a label with nowhere to go is left out (the readout has the numbers).
  function frame() {
    const on = !!G.Rig.debug;
    if (!cv) { cv = document.getElementById('hbMarks') as HTMLCanvasElement; if (!cv) return; g = cv.getContext('2d')!; }
    if (!on || (!recs.length && !fills.length)) {
      if (shown) { for (const r of recs) { r.line.visible = false; if (r.nade) r.nade.visible = false; for (const gh of r.ghosts.values()) gh.visible = false; } for (const f of fills) f.g.visible = false; cv.classList.add('hidden'); shown = false; }
      return;
    }
    for (const f of fills) f.g.visible = true;
    if (!shown) { cv.classList.remove('hidden'); shown = true; }
    const dpr = window.devicePixelRatio || 1, W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    // a grenade picked out (its ghost in the crosshair: js/hud.ts debugTarget): its fragments' trails and everyone they hit, alone;
    // otherwise whoever's picked out and the shots that hit them. Every grenade's ghost shows either way, to be found and picked.
    if (sel && !recs.includes(sel)) sel = null;
    const fk = focus(), mine = sel ? [sel] : recs.filter((r) => r.keys.has(fk)), cam = G.R.camera, v = new T.Vector3();
    for (const r of recs) {
      const on = sel ? r === sel : r.keys.has(fk);
      r.line.visible = on;
      if (r.nade) r.nade.visible = true;
      for (const [k, gh] of r.ghosts) gh.visible = on && (k === fk || !!r.nade); // (a grenade's: everyone it hit, as they stood)
    }
    const el = document.getElementById('hbInfo'), panel = el && !el.classList.contains('hidden') ? el.getBoundingClientRect() : null, boxes = panel ? [[panel.left, panel.top, panel.right, panel.bottom]] : [];
    const free = (a: number[]) => !boxes.some((b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]);
    g.font = '600 11px ui-monospace, Consolas, monospace'; g.textBaseline = 'middle';
    const list = [...mine].reverse().flatMap((r, i) => r.labels.filter((l) => !l.key || l.key === fk || sel).map((l) => ({ l, rank: l.pri * 2 - i }))).concat([...fills].reverse().flatMap((f, i) => f.labels.map((l) => ({ l, rank: l.pri * 2 - i })))).sort((a, b) => b.rank - a.rank), seen = new Set<string>();
    for (const { l } of list) {
      v.copy(l.p).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || l.p.distanceTo(cam.position) > RANGE) continue;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H, id = l.t + '@' + Math.round(x / 6) + ',' + Math.round(y / 6);
      if (seen.has(id)) continue; // (the same thing, from the same spot: rounds fired from where you stood)
      seen.add(id);
      g.fillStyle = l.c; g.strokeStyle = '#000'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.stroke();
      const w = g.measureText(l.t).width + 10;
      let at: number[] | null = null;
      for (let k = 0; k < 14 && !at; k++) {
        const left = k >= 7, n = left ? k - 7 : k, bx = left ? x - w - 16 : x + 16, by = y - 22 - n * (LH + 3) + (n > 3 ? 2 * (n - 3) * (LH + 3) + 18 : 0), a = [bx, by, bx + w, by + LH];
        if (a[0] > 0 && a[2] < W && a[1] > 0 && a[3] < H && free(a)) at = a;
      }
      if (!at) continue;
      boxes.push(at);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(x, y); g.lineTo(at[0] < x ? at[2] : at[0], at[1] + LH / 2); g.stroke();
      g.fillStyle = 'rgba(6,8,10,0.86)'; g.fillRect(at[0], at[1], w, LH); g.fillStyle = l.c; g.fillRect(at[0], at[1], 2, LH);
      g.fillStyle = '#fff'; g.fillText(l.t, at[0] + 6, at[1] + LH / 2 + 0.5);
    }
  }
  return { pose, remote, keep, keepAll, keepFill, clear, of, focus, frame, pickNade, select, nadeHtml, get selected() { return sel; } };
})();
G.ShotLog = G_ShotLog;

interface GameModules { ShotLog: typeof G_ShotLog; }
