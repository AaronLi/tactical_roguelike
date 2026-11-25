// Pose parity for js/rig.ts: the same rigs, driven through the same script of poses, give the same bodies. Run before a change to
// record, after it to compare:
//
//   node tools/space_shot.mjs "mute&play&nofoes" tools/rig_parity_steps.mjs --port 8151 --gpu            (RIG_PARITY=compare by default)
//   RIG_PARITY=record node tools/space_shot.mjs "mute&play&nofoes" tools/rig_parity_steps.mjs --port 8151 --gpu
//
// Each scenario (below: standing, walking, crouched, aiming, leaning, a reload, hands up, zip-tied, the radio, blinded,
// weakened, down, dead, a shield, a throw, recoil, a hit, a player prone on a bipod, ...) is a fresh rig of a fixed seed, its gun
// loaded first, updated at 1/60 s a frame for FRAMES frames with Math.random seeded and performance.now a clock of its own. Every
// SAMPLE-th frame two pictures of every object under the rig's root are kept (in the order three walks them):
//   drawn: its world matrix after root.updateMatrixWorld(true), what the renderer will use. These must match.
//   left:  its world matrix as update left it (nothing refreshed after). Code outside the rig reads some of these straight after
//          an update (the muzzle, the hands, the head, hitboxes): any that differ are listed by name, each to be checked for
//          a reader that needs it fresh.
// And the hitboxes (rig.hitboxes()) and the skinned pieces' cull spheres (cullSphere) as update left them. Recorded to reports/rig-parity/<scenario>.bin (not kept in git).
import fs from 'fs';
import path from 'path';

const FRAMES = 90, SAMPLE = 3, DIR = path.resolve('reports/rig-parity'), MODE = process.env.RIG_PARITY || 'compare', ONLY = process.env.RIG_ONLY || '';

export default async ({ ev, sleep, log }) => {
  await sleep(4000);
  // the scenarios, and the harness, in the page
  const ready = await ev(`(async () => {
    const R = G.R, Rig = G.Rig, T = THREE, me = G.Me, E = G.ENEMIES;
    const at = me && me.pos ? new T.Vector3(me.pos.x + 2.5, me.pos.y || 0, me.pos.z) : new T.Vector3(5, 0, 5);
    const V = (x, y, z) => new T.Vector3(x, y, z);
    const base = (f, extra) => Object.assign({ pos: at.clone(), yaw: 0, pitch: 0, crouch: false, alert: false, lean: 0, state: 'alive', rise: 3.5 }, extra || {});
    const tgt = V(at.x, (at.y || 0) + 1.4, at.z - 8);
    const S = window.__RP = [];
    const sc = (name, make, setup, params) => S.push({ name, make, setup, params });
    const enemy = (type) => () => { const d = E[type]; const r = Rig.create({ style: d.style, scale: d.scale, boss: d.boss, seed: 4242, dressed: true }); r.setGun(d.wpn); return r; };
    const player = (gun) => () => { const r = Rig.create({ style: 'tactical', color: 0x3a6ea5, animal: 'fox', callName: 'P', bare: true, seed: 977 }); r.setGun(gun); return r; };
    sc('stand', enemy('grunt'), null, (f) => base(f));
    sc('walk', enemy('grunt'), null, (f) => base(f, { pos: V(at.x + f * 0.025, at.y, at.z), yaw: f * 0.01 }));
    sc('crouch-walk', enemy('grunt'), null, (f) => base(f, { crouch: true, pos: V(at.x, at.y, at.z + f * 0.015) }));
    sc('aim', enemy('grunt'), null, (f) => base(f, { alert: true, aimAt: tgt, pitch: Math.sin(f * 0.07) * 0.3 }));
    sc('lean', enemy('grunt'), null, (f) => base(f, { alert: true, lean: Math.sin(f * 0.05), aimAt: tgt }));
    sc('reload', enemy('grunt'), null, (f) => base(f, { alert: true, reload: Math.min(0.999, f / FRAMES_) }));
    sc('magchk', enemy('heavy'), null, (f) => base(f, { magChk: Math.min(1, f / FRAMES_) }));
    sc('handsup', enemy('suspect'), (r) => r.holster(true), (f) => base(f, { pose: 'handsup' }));
    sc('cower', enemy('suspect'), (r) => r.holster(true), (f) => base(f, { pose: 'cower' }));
    sc('zipped', enemy('suspect'), (r) => { r.holster(true); r.zip(true, true); }, (f) => base(f, { pose: 'behind' }));
    sc('radio', enemy('grunt'), null, (f) => base(f, { radio: true }));
    sc('blind', enemy('grunt'), null, (f) => base(f, { blind: 1, alert: true }));
    sc('weak-aim', enemy('grunt'), null, (f) => base(f, { alert: true, aimAt: tgt, str: 0.3 }));
    sc('down', enemy('grunt'), null, (f) => base(f, { state: 'down', str: 0.2 }));
    sc('dead', enemy('grunt'), (r) => r.die(V(0, 0, 1)), (f) => base(f, { state: 'dead' }));
    sc('limp', enemy('suspect'), (r) => r.goLimp(), (f) => base(f, { state: 'down' }));
    sc('shield', enemy('heavy'), (r) => { const id = Object.keys(G.SHIELDS || {})[0]; if (id) r.setShield(id); }, (f) => base(f, { alert: true, shieldUp: true, aimAt: tgt }));
    sc('throw', enemy('heavy'), (r) => r.throwNade(1), (f) => base(f, { alert: true }));
    sc('recoil', enemy('grunt'), null, (f, r) => { if (f % 6 === 0) r.recoil(2); return base(f, { alert: true, aimAt: tgt }); });
    sc('hit', enemy('grunt'), null, (f, r) => { if (f === 10) r.hit(V(1, 0, 0.3)); return base(f, { alert: true }); });
    sc('holstered-walk', enemy('suspect'), (r) => r.holster(true), (f) => base(f, { pos: V(at.x - f * 0.02, at.y, at.z) }));
    sc('player-aim', player('m4'), null, (f) => base(f, { alert: true, aim: true, pitch: Math.sin(f * 0.05) * 0.4 }));
    sc('player-prone-bipod', player('m249'), null, (f) => base(f, { prone: true, bipod: true, aim: true }));
    sc('player-reload', player('m4'), null, (f) => base(f, { reload: Math.min(0.999, f / FRAMES_), loaded: 1 }));
    window.FRAMES_ = ${FRAMES};
    // every rig made, its gun given time to load
    const made = S.map((s) => { const r = s.make(); R.dynRoot.add(r.root); return r; });
    for (let i = 0; i < 100 && made.some((r) => !r.gun && r.gunKey !== null && !r.slung && !r.root.userData.noGun); i++) await new Promise((res) => setTimeout(res, 100));
    made.forEach((r) => { R.dynRoot.remove(r.root); r.dispose && r.dispose(); });
    return S.length;
  })()`, 60000);
  log('scenarios: ' + ready);
  fs.mkdirSync(DIR, { recursive: true });
  const names = JSON.parse(await ev(`JSON.stringify(__RP.map((s) => s.name))`));
  const report = [];
  for (const name of names) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    const out = JSON.parse(await ev(`(() => {
      const s = __RP.find((q) => q.name === ${JSON.stringify(name)}), R = G.R, T = THREE;
      // the same randomness and the same clock every run
      let seed = 0x9e3779b9 ^ ${JSON.stringify(name)}.length * 2654435761 ^ ${+(process.env.RIG_SEED_XOR || 0)}; /* (RIG_SEED_XOR: other randomness, to see the comparison catch a change) */ const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const mr = Math.random, pn = performance.now.bind(performance); let clock = 1e6;
      Math.random = rnd; performance.now = () => clock;
      try {
        const r = s.make(); R.dynRoot.add(r.root);
        if (s.setup) s.setup(r);
        const objs = []; r.root.traverse((o) => objs.push(o));
        const lab = new Map(); for (const k of ['root', 'body', 'hips', 'spine', 'chest', 'neck', 'head', 'gun', 'gunMount', 'slingMount', 'hipMount', 'shield', 'shieldMount', 'atak', 'zipKit', 'nvPivot']) if (r[k] && r[k].isObject3D) lab.set(r[k], k);
        for (const a of ['armL', 'armR']) if (r[a]) for (const k of ['sh', 'up', 'lo', 'wr']) if (r[a][k]) lab.set(r[a][k], a + '.' + k);
        for (const l of ['legL', 'legR']) if (r[l]) for (const k of ['th', 'sh']) if (r[l][k]) lab.set(r[l][k], l + '.' + k);
        const names = objs.map((o) => { const p = []; for (let q = o; q && q !== r.root.parent; q = q.parent) { const L = lab.get(q); p.push(L || ((q.name || q.type) + '#' + (q.parent ? q.parent.children.indexOf(q) : 0))); if (L) break; } return p.reverse().join('/'); }); // (each by the nearest rig part above it, e.g. armR.wr/Bone#2)
        const left = [], drawn = [], hb = [];
        for (let f = 0; f < ${FRAMES}; f++) {
          clock += 1000 / 60;
          r.update(1 / 60, s.params(f, r));
          if (f % ${SAMPLE} !== ${SAMPLE} - 1) continue;
          for (const o of objs) left.push(...o.matrixWorld.elements);
          const h = r.hitboxes ? r.hitboxes() : []; for (const b of h) { const c = b.c || b.center || b.p || b.a; if (c && c.x != null) hb.push(c.x, c.y, c.z); const e = b.b || b.end; if (e && e.x != null) hb.push(e.x, e.y, e.z); }
          for (const par of [r.body, r.head]) if (par) for (const m of par.children) if (m.isSkinnedMesh && m.userData.shared && m.boundingSphere) { hb.push(m.boundingSphere.center.x, m.boundingSphere.center.y, m.boundingSphere.center.z, m.boundingSphere.radius); break; } // (and the cull spheres: js/rig.ts cullSphere)
          r.root.updateMatrixWorld(true);
          for (const o of objs) drawn.push(...o.matrixWorld.elements);
        }
        R.dynRoot.remove(r.root); r.dispose && r.dispose();
        const b64 = (a) => { const u = new Uint8Array(new Float32Array(a).buffer); let x = ''; for (let i = 0; i < u.length; i += 8192) x += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(x); };
        return JSON.stringify({ names, n: objs.length, left: b64(left), drawn: b64(drawn), hb: b64(hb), gun: !!r.gun });
      } finally { Math.random = mr; performance.now = pn; }
    })()`, 60000));
    const f32 = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }; // (a small Buffer sits in a shared pool: its own bytes only)
    const buf = (k) => f32(out[k]);
    const cur = { names: out.names, n: out.n, left: buf('left'), drawn: buf('drawn'), hb: buf('hb') }, file = path.join(DIR, name + '.json');
    if (MODE === 'record') {
      fs.writeFileSync(file, JSON.stringify({ names: cur.names, n: cur.n, left: out.left, drawn: out.drawn, hb: out.hb }));
      report.push(`${name}: recorded (${cur.n} objects${out.gun ? ', with its gun' : ', no gun'})`);
      continue;
    }
    if (!fs.existsSync(file)) { report.push(`${name}: no recording (RIG_PARITY=record first)`); continue; }
    const g = JSON.parse(fs.readFileSync(file, 'utf8')), gb = (k) => f32(g[k]);
    const gold = { left: gb('left'), drawn: gb('drawn'), hb: gb('hb') };
    if (g.n !== cur.n || g.names.join() !== cur.names.join()) { report.push(`${name}: STRUCTURE CHANGED (${g.n} -> ${cur.n} objects)`); continue; }
    const cmp = (a, b) => { let m = 0; const per = new Float64Array(cur.n); for (let i = 0; i < Math.min(a.length, b.length); i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; const o = Math.floor(i / 16) % cur.n; if (d > per[o]) per[o] = d; } return { m, per, len: a.length === b.length }; };
    const d = cmp(cur.drawn, gold.drawn), l = cmp(cur.left, gold.left), h = cmp(cur.hb, gold.hb);
    const TOL = 1e-4, stale = [...l.per].map((v, i) => [v, i]).filter(([v]) => v > TOL).sort((a, b) => b[0] - a[0]);
    report.push(`${name}: drawn ${d.m <= TOL ? 'SAME' : 'DIFFERS'} (max ${d.m.toExponential(2)}), hitboxes ${h.m <= TOL && h.len ? 'same' : 'DIFFER (max ' + h.m.toExponential(2) + ')'}, left by update: ${stale.length ? stale.length + ' objects differ: ' + stale.slice(0, 8).map(([v, i]) => cur.names[i].split('/').slice(-2).join('/') + ' ' + v.toExponential(1)).join(', ') : 'same'}`);
  }
  for (const r of report) log(r);
};
