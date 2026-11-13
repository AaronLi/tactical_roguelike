'use strict';
// What the simulation and the game on screen both work out, the same way: pure reckonings (no state, nothing drawn) that
// used to live in the files that draw (js/player.ts, js/views.ts, js/rig.ts, js/game.ts) or in the host's own file
// (js/server.ts). The host's simulation runs in a thread of its own (js/serverworker.ts, docs/threads.md) that loads none of
// those files: it finds these here, and so do they (G.Me.tbModel, G.Views.predictNade, G.Rig.cleanLook... hand on to them).
const G_Sim = {
  // ---------------------------------------------------------------- the loading veil (js/game.ts veil)
  // The wipe on (css/style.css veilIn 0.8 s, and a frame): the host waits this long after telling everyone (js/server.ts
  // overBlack) before it builds the next place, so the panel is all the way down when the work starts.
  VEIL_MS: 820,

  // ---------------------------------------------------------------- an officer's look (top, pants, eyewear, gloves)
  // what they wear if they haven't picked, and the options there are (js/rig.ts draws them)
  OFFICER_LOOK: { top: 'combat', topC: 0x3a4048, pants: 'combat', pantsC: 0x2e3238, eyes: 'shooting', gloves: 'tactical' } as Record<string, string | number>,
  LOOKS: { top: ['combat', 'longsleeve', 'tshirt', 'hoodie'], pants: ['combat', 'cargo', 'jeans'], eyes: ['none', 'glasses', 'shooting', 'goggles'], gloves: ['tactical', 'leather', 'fingerless', 'none'] } as Record<string, string[]>,
  // a look from anywhere (the network): known options and colours only
  cleanLook(l: Record<string, any>) {
    const o = Object.assign({}, this.OFFICER_LOOK);
    if (!l || typeof l !== 'object') return o;
    for (const k of Object.keys(this.LOOKS)) if (this.LOOKS[k].includes(l[k])) o[k] = l[k];
    for (const k of ['topC', 'pantsC']) if (Number.isInteger(l[k]) && l[k] >= 0 && l[k] <= 0xffffff) o[k] = l[k];
    return o;
  },

  // ---------------------------------------------------------------- the shared grids
  // A first aid cabinet is a CAB_W x CAB_H grid (medical gear only); the team locker at the quartermaster's TEAM_W x TEAM_H
  // (js/server.ts keeps both, js/game.ts shows them)
  CAB_W: 3, CAB_H: 2,
  TEAM_W: 7, TEAM_H: 5,
  // how many of each medical item a cabinet's items ([[mt, n, x, y, rot], ...]) hold
  cabCounts(items: any[][]) { const c: Record<string, number> = {}; for (const [mt, n] of items) c[mt] = (c[mt] || 0) + n; return c; },

  // ---------------------------------------------------------------- a suspect's gun, kicking
  // A shot kicks the gun off target (degrees of muzzle rise: the weapon's recoil, worse one-handed and weak). Below TWO_HAND
  // strength they can't get the other hand on the gun (js/server.ts). str: their strength (0..1); w: the weapon.
  TWO_HAND: 0.4,
  kickOf(str: number | null | undefined, w: { recoil: number }) { const s = str == null ? 1 : str; return w.recoil * 3 * (s < this.TWO_HAND ? 1.6 : 1) * (1 + 0.6 * (1 - s)); },

  // ---------------------------------------------------------------- a weapon as built
  // def is the compiled build (stats changed by its parts), see js/parts.ts. ammo: the type of round in it (a magazine holds
  // one type); a gun loaded a round at a time keeps the order in its tube (the last one in is the next one fired). (js/player.ts
  // makeWeapon adds what you carry for it.)
  makeWeapon(id: string, build?: PBuild): PWeapon {
    const def = G.Gunsmith.compile(id, build!);
    const w: any = { def, sup: def.sup, mag: def.mag, ammo: G.ballFor(G.calOf(def)), fm: (def.modes || [def.mode])[0] }; // fm: where its selector is
    if (def.barrels) w.rl = def.barrels.default; // (a gun of several barrels: the round type its block holds, js/data.ts)
    w.tube = Array(w.mag).fill(w.ammo); // every gun: its rounds in order (a magazine's own stack, when it has one in)
    w.chamber = G.chambered(def) ? w.ammo : null; // and the round in the chamber (G.chambered)
    return w;
  },

  // ---------------------------------------------------------------- the wind
  // A level's wind (docs/level-data.md "Wind"): the air out in the open moving sideways, { x, z } m/s (where it blows TO),
  // from the level's seed and the theme's mean speed (G.THEMES wind; none, no wind) at the level's clock t (s). Three
  // terms of smooth noise (each three sines, their rates and phases from the seed): the direction wanders slowly about
  // one picked from the seed (DIR radians either way, over minutes), the speed swells and eases (SPD of the mean, over a
  // minute or so), and gusts on top (GUST of the mean, over seconds). Smooth in t (no steps), the same for the same seed and t.
  // The host's simulation works it out on its clock and tells everyone ('wind': js/server.ts windTick); the screens use
  // what they're told (js/wind.ts), so nobody's clock has to agree with anybody's.
  WIND: { DIR: 1.1, DIR_T: 300, SPD: 0.3, SPD_T: 90, GUST: 0.2, GUST_T: 8, SEND: 0.5 },
  windAt(seed: number, mean: number, t: number) {
    if (!(mean > 0)) return { x: 0, z: 0 };
    const W = this.WIND, r = G.U.rng(((seed >>> 0) ^ 0x3d1e5a) >>> 0), d0 = r() * Math.PI * 2;
    // smooth noise in about [-1, 1], period about T: three sines, their rates 1, ~1.8 and ~3.2 times the slowest, each 0.4 the last's size
    const n = (T: number) => { let s = 0, a = 1, f = 1; for (let i = 0; i < 3; i++) { const w = (2 * Math.PI / T) * f * (0.8 + 0.4 * r()), ph = r() * Math.PI * 2; s += a * Math.sin(w * t + ph); a *= 0.4; f *= 1.6 + r() * 0.4; } return s / 1.56; };
    const dir = d0 + W.DIR * n(W.DIR_T), gust = n(W.GUST_T), sp = Math.max(0, mean * (1 + W.SPD * n(W.SPD_T) + W.GUST * gust));
    return { x: sp * Math.cos(dir), z: sp * Math.sin(dir) };
  },
  // whether the wind reaches (x, y, z): open to the sky there, on the floor it's on (map.out: indoors there's none, and nor
  // under a roof, a glass one too: map.glassRoofs); off the map, the open air
  windy(map: LvMap | null, x: number, y: number, z: number) {
    if (!map) return false;
    const L = G.Level, TS = L.TS, tx = Math.floor(x / TS), tz = Math.floor(z / TS);
    if (tx < 0 || tz < 0 || tx >= map.W || tz >= map.H) return true;
    const fm = L.floorMap(map, L.floorAt(map, x, y, z)), out = (fm && fm.out) || map.out;
    if (!(out && out[tz * map.W + tx])) return false;
    // under a glass roof (map.glassRoofs: [x0, z0, x1, z1, the roof's top], metres): open to the sky's light, not to its wind
    for (const g of map.glassRoofs || []) if (x > g[0] && x < g[2] && z > g[1] && z < g[3] && y < g[4]) return false;
    return true;
  },
  // The wind on a round in flight, a step on: drag works on the round's speed through the air, not over the ground, so
  // over a step where drag leaves k of its speed (k = exp(-len / drag), js/player.ts stepRound) its velocity goes
  // k v + (1 - k) w: it's carried toward the wind's. Over a flight that adds up to the lag-time rule, drift = w (t - t
  // in a vacuum), exactly, for this game's drag (speed falling off exponentially with distance: tools/wind.test.mjs).
  windStep(v: { x: number; z: number }, k: number, w: { x: number; z: number } | null | undefined) { if (w) { v.x += (1 - k) * w.x; v.z += (1 - k) * w.z; } },
  // How a suspect judges the wind (js/server.ts fire): each misjudges it their own way for the level, by JUDGE.LO to JUDGE.HI of the drift
  // (the better shot, acc: their type's, the nearer LO), over or under, and by a little more (SHOT, a normal's spread) each shot.
  // windJudge: their bias (a share of the drift, + holds off too far); windShot: what they hold off this shot, times the true drift.
  // Close in it makes no odds: the drift itself is millimetres.
  JUDGE: { LO: 0.2, HI: 0.35, SHOT: 0.06 },
  windJudge(acc: number | null | undefined, rnd = Math.random) {
    const J = this.JUDGE, k = G.U.clamp(((acc == null ? 0.4 : acc) - 0.3) / 0.45, 0, 1), m = J.HI + (J.LO - J.HI) * k;
    return (rnd() < 0.5 ? -1 : 1) * G.U.clamp(m * (0.9 + 0.2 * rnd()), J.LO, J.HI);
  },
  windShot(bias: number, rnd = Math.random) { const n = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); return Math.max(0, 1 + bias + this.JUDGE.SHOT * n); },
  // the lag time (s) of a round leaving at v0 m/s, drag metres (G.dragOf), s metres out, gravity left out: its time of flight,
  // drag / v0 (e^(s / drag) - 1), less s / v0, the time it'd take with no drag. A crosswind of w carries it w times this sideways.
  lagAt(v0: number, drag: number, s: number) { return drag > 1e8 ? 0 : (drag / v0) * Math.expm1(s / drag) - s / v0; },

  // ---------------------------------------------------------------- a round's arc
  // where a round would end up if nobody's in the way: its arc, stepped against the walls only (what the squad is told, to
  // draw it going there); wind: the level's now (windAt), carrying it out in the open (windy)
  predictEnd(p0: THREE.Vector3, v0: THREE.Vector3, drag: number, grav: number, map: LvMap, wind?: { x: number; z: number } | null) {
    const p = p0.clone(), v = v0.clone(), dt = 1 / 60, wo = wind && (wind.x || wind.z) ? wind : null;
    for (let i = 0, dist = 0; i < 240 && dist < G.ROUND_LIFE.dist; i++) {
      const p1 = p.clone().addScaledVector(v, dt); p1.y -= 0.5 * grav * dt * dt;
      const seg = p1.clone().sub(p), len = seg.length();
      if (len < 1e-4) break;
      seg.divideScalar(len);
      const h = G.Level.raycast(map, p.x, p.y, p.z, seg.x, seg.y, seg.z, len);
      if (h.t < len) return p.addScaledVector(seg, h.t);
      const k = Math.exp(-len / drag);
      v.multiplyScalar(k); v.y -= grav * dt;
      if (wo && this.windy(map, p.x, p.y, p.z)) this.windStep(v, k, wo);
      p.copy(p1); dist += len;
    }
    return p;
  },

  // ---------------------------------------------------------------- a thrown grenade's flight
  // Gravity, bounces off walls, floors and ceilings (some of its speed lost each time, a floor taking more), then
  // rolling along the floor, slowed by friction, till it stops. n: { pos, vel } (and n.onGround, set here). The
  // same steps for everyone's grenades and for the throw you're lining up (predictNade), so where the arc says it
  // ends up is where it does.
  NADE_R: 0.05, NADE_G: 14,
  nadeStep(n: VwNadeMotion, dt: number, map: LvMap | null) {
    const R = this.NADE_R, w = map && map.world, p = n.pos, v = n.vel;
    const hits = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => { if (!w) return y0 < 0; let h = false; G.World.query(w, [x0, y0, z0], [x1, y1, z1], (s) => { if ((s.move || s.ray) && !(s.nostep && !s.ray) && (!s.hull || G.World.touches(s, [x0, y0, z0], [x1, y1, z1]))) h = true; }); return h; }; // (a rock: its own shape, not the boxes that stop people)
    const side = (x: number, y: number, z: number) => hits(x - R, y - R + 0.03, z - R, x + R, y + R, z + R); // (clear of the floor it's on)
    const below = (x: number, y: number, z: number) => hits(x - R + 0.01, y - R, z - R + 0.01, x + R - 0.01, y + R - 0.02, z + R - 0.01);
    const N = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / N;
    for (let k = 0; k < N; k++) {
      v.y -= this.NADE_G * h;
      let nx = p.x + v.x * h;
      if (side(nx, p.y, p.z)) { v.x *= -0.42; v.z *= 0.85; nx = p.x; }
      let nz = p.z + v.z * h;
      if (side(nx, p.y, nz)) { v.z *= -0.42; v.x *= 0.85; nz = p.z; }
      let ny = p.y + v.y * h;
      if (v.y < 0 ? below(nx, ny, nz) : hits(nx - R, ny - R + 0.03, nz - R, nx + R, ny + R, nz + R)) {
        if (v.y < 0) { v.y = v.y < -1.6 ? -v.y * 0.32 : 0; v.x *= 0.78; v.z *= 0.78; } // (a floor: a bounce, or it settles)
        else v.y *= -0.3;
        ny = p.y;
      }
      p.set(nx, ny, nz);
      // rolling on the floor: friction slows it to a stop
      n.onGround = v.y === 0 && below(p.x, p.y - 0.02, p.z);
      if (n.onGround) { const f = Math.exp(-2.4 * h); v.x *= f; v.z *= f; if (Math.hypot(v.x, v.z) < 0.04) v.x = v.z = 0; }
    }
  },
  // Where a throw goes: its path, stepped as a grenade flies (nadeStep) for as long as the fuse burns. Returns
  // the points along it (Vector3s) and where it goes off (the last).
  predictNade(p: THREE.Vector3, v: THREE.Vector3, fuse: number, map: LvMap | null) {
    const n = { pos: p.clone(), vel: v.clone() }, pts = [n.pos.clone()], h = 1 / 60;
    for (let t = 0; t < fuse; t += h) { this.nadeStep(n, h, map); pts.push(n.pos.clone()); }
    return pts;
  },

  // ---------------------------------------------------------------- a grenade's blast
  // The burst's own push of air, close in (a frag's chips are the rest: js/player.ts fragBurst).
  BLAST: { r: 4, dmg: 90, SURFACE: 1.22 },
  // A burst lying on something hard (a floor, a table: within 15 cm of it) pushes its whole blast into the half above it: the surface
  // reflects the downward half back up, so close in it acts like about 1.8 times the charge, which carries a blast about 1.22 times as
  // far (as the cube root of the charge). In the air it's the plain BLAST.r. (The chips are the same either way: the floor stops or
  // turns the downward ones itself, js/ballistics.ts glances.)
  blastR(map: LvMap | null, p: THREE.Vector3) {
    if (!map) return this.BLAST.r;
    const g = G.Level.groundAt(map, p.x, p.z, 0.01, p.y + 0.05);
    return g != null && p.y - g < 0.15 ? this.BLAST.r * this.BLAST.SURFACE : this.BLAST.r;
  },
  // A thermobaric's burst (js/player.ts thermobaric tells what it does; this is the reckoning): the fill of the space round it
  // from where it went off, the floor it's on (js/level.ts blastFill: walls and shut doors stop it, open doorways let it
  // through), CLOUD cells of floor at most (a room of about 50 m²), fewer the more of it is open to the sky. Inside it: BURN and
  // BLAST (a share of a life each), the blast by how confined it is (conf). The space: the same fill carried on to SPACE cells
  // (the room and what's open onto it), its volume at a real room's height (ROOM_H), what the burn puts in it as pressure (E:
  // the energy that ends up as heat in the air, 0.4 of it as pressure in a diatomic gas): qs kPa, held for a long time.
  // Outside the cloud but in that space: hurt by qs past QS0, and dazed. Through a wall or a shut door: a thump, no harm:
  // dazed a little, close by. The same everywhere from where it went off (the map and its doors), so every machine draws the
  // same fireball and the F9 view shows the volume it filled.
  TB: { FUSE: 2.6, CLOUD: 110, SPACE: 900, ROOM_H: 2.7, E: 6.0e6, BURN: 0.45, BLAST: 0.9, QS0: 25, QS_K: 180, WALL_R: 3 },
  tbModel(map: LvMap, p: THREE.Vector3): PTbModel {
    const T = this.TB, L = G.Level, TS = L.TS, cellA = TS * TS;
    const fill = L.blastFill(map, p.x, p.y, p.z, T.SPACE);
    // how much of the cloud's reach is open to the sky (counted over the first CLOUD cells): the cloud thins and rises there
    let outC = 0; const fm = L.floorMap(map, fill.f), out = fm.out || map.out, nC = Math.min(fill.n, T.CLOUD);
    for (let i = 0; i < nC; i++) if (out[fill.order[i]]) outC++;
    const space = fill.n, closed = space < T.SPACE, skyAll = space ? fill.out / space : 1, outFrac = nC ? outC / nC : 1;
    // how well the space holds the burn in: open sky over it, the ways out it met (broken windows, the map's edge), and how much
    // more room past the cloud there is for it to spread into (a big hall holds it in hardly better than the open). Less held
    // in, the cloud's thinner and smaller as it lights, and burns less of its fuel.
    const held = G.U.clamp(T.CLOUD * 2.5 / Math.max(1, space), 0, 1), conf = G.U.clamp((1 - outFrac) / (1 + 0.12 * fill.vents) * (0.3 + 0.7 * held), 0.08, 1);
    const cloud = Math.max(Math.min(fill.n, 12), Math.min(fill.n, Math.round(T.CLOUD * (0.45 + 0.55 * held) * (1 - 0.6 * outFrac))));
    const V = Math.max(1, space) * cellA * T.ROOM_H, qs = closed || skyAll < 0.05 ? 0.4 * T.E / V / 1000 * (1 - skyAll) / (1 + 0.12 * fill.vents) : 0;
    const rc = cloud ? fill.d[cloud - 1] : 0; // (the cloud's edge, along the floor)
    const idx = new Int32Array(map.W * map.H).fill(-1);
    for (let i = 0; i < fill.n; i++) idx[fill.order[i]] = i;
    return { map, p: p.clone(), fill, cloud, space, closed, conf, qs, rc, idx, outFrac, areaCloud: cloud * cellA, areaSpace: space * cellA, V };
  },
  // what a thermobaric's burst does to someone at (x, y, z): burn and blast (shares of a life), daze (0..1), and where they were
  tbDose(M: PTbModel, x: number, y: number, z: number) {
    const T = this.TB, L = G.Level, map = M.map, TS = L.TS, f = L.floorAt(map, x, y, z);
    const i = G.U.clamp(Math.floor(z / TS), 0, map.H - 1) * map.W + G.U.clamp(Math.floor(x / TS), 0, map.W - 1), k = f === M.fill.f ? M.idx[i] : -1;
    if (k >= 0 && k < M.cloud) return { burn: T.BURN, blast: T.BLAST * M.conf, daze: 1, at: 'cloud', d: M.fill.d[k] };
    if (k >= 0) { // in the space it filled, past the fireball: the long push of the pressure, and the front's last of it close to the edge
      const past = M.fill.d[k] - M.rc, front = M.conf * Math.exp(-past / 1.5);
      return { burn: 0.15 * Math.exp(-past / 0.7), blast: G.U.clamp((M.qs - T.QS0) / T.QS_K, 0, 0.5) + 0.45 * front, daze: G.U.clamp(M.qs / 50 + front, 0, 1), at: 'space', d: M.fill.d[k] };
    }
    const r = Math.hypot(x - M.p.x, z - M.p.z), reach = M.rc + T.WALL_R; // (through a wall, or a floor)
    return { burn: 0, blast: 0, daze: r < reach ? 0.35 * (1 - r / reach) * (f === M.fill.f ? 1 : 0.5) : 0, at: r < reach ? 'wall' : 'none', d: r };
  },
};
G.Sim = G_Sim;
interface GameModules { Sim: typeof G_Sim; }
