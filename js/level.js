'use strict';
// Procedural level generation, collision, raycasting and path flow-fields.
// The map is a tile grid (TS metres per tile, after refinement: see TS/CTS/K below). 0 = floor, 1 = wall, 2 = furniture you can take cover behind,
// 3 = door, 4 = other furniture (garden fences are furniture too). map.out marks tiles open to the sky. Furniture collision boxes live in map.props (see js/furniture.js).
G.Level = {
  // The grid: levels are laid out on 2 m cells (CTS), then refined 3x (K) to 0.67 m cells (TS) so walls between
  // spaces are a single 0.67 m cell thick instead of a whole 2 m tile. Everything that plays on the map
  // (collision, rays, paths, AI, rendering) works on the fine grid.
  TS: 2 / 3,
  CTS: 2,
  K: 3,
  CASE_CHANCE: 1, // share of levels with a weapon case (every one)
  CAB_CHANCE: 0.35, // share of levels with a first aid cabinet on a wall (and of those, CAB_TWO with a second)
  CAB_TWO: 0.2,
  WALL_H: 4,
  CRATE_H: 1.1,
  CRATE_HX: 0.8,
  DOOR_H: 2.3,

  // th: the environment (index into G.THEMES) picked on the route map; by default they come round in turn
  generate(seed, level, th) {
    const U = G.U, r = U.rng(seed);
    const theme = G.THEMES[th != null && G.THEMES[th] ? th : (level - 1) % G.THEMES.length];
    // the layout: an apartment block, a warehouse, two houses back to back with their gardens between, or a
    // building of rooms and corridors. Every one starts outside it (or, for the apartments, on the stairs).
    const lay = theme.layout === 'apartments' ? this.layApartments(r, level) : theme.layout === 'warehouse' ? this.layWarehouse(r, level)
      : theme.layout === 'houses' ? this.layHouses(r, level) : theme.layout === 'festival' ? this.layFestival(r, level) : this.approach(this.layRooms(r, level), r, theme);
    // a building of several floors: each one planned as a storey, then stacked (stack: the stairs between them)
    if (lay.floors) return this.stack(lay.floors.map((fl) => this.plan(fl, r, seed, level, theme)), lay);
    const map = this.plan(lay, r, seed, level, theme);
    G.World.fromTileMap(map); // the level as 3D solids (js/world.js): what every ray, sight line and step is asked of
    return map;
  },
  // The hangar between levels (js/hangar.js): the whole map is the same as any level's (the same walls, floor,
  // lights, collision and rays), with nothing in it but what G.Hangar puts there.
  generateHub(seed, level) {
    const r = G.U.rng(seed), lay = this.layHangar(r, level);
    const map = this.plan(lay, r, seed, level, G.HANGAR_THEME);
    map.case = null; map.cabinets = []; map.enemySpots = []; map.hub = true;
    G.World.fromTileMap(map);
    G.Hangar.decorate(map);
    return map;
  },
  // One storey, from its layout: doors, furniture, the fine grid and everything placed on it
  plan(lay, r, seed, level, theme) {
    const { W, H, t, rooms } = lay;

    // Doors (tile value 3). `axis` is the direction you walk through the door. The rooms layout puts single and
    // double doors on the ring just outside each room where a corridor arrives; the others say where theirs go.
    const doors = [], doorAt = new Map();
    const isWall = (x, z) => x < 0 || z < 0 || x >= W || z >= H || t[z * W + x] === 1;
    const addDoor = (x, z, axis, open, mirror, kind) => {
      const i = z * W + x;
      t[i] = 3;
      const d = { id: doors.length, i, tx: x, tz: z, x: (x + 0.5) * this.CTS, z: (z + 0.5) * this.CTS, axis, open: !!open, mirror: !!mirror, kind: kind || null };
      doors.push(d); doorAt.set(i, d);
    };
    if (lay.ringDoors) rooms.forEach((rm) => {
      const ring = [];
      for (let x = rm.x; x < rm.x + rm.w; x++) { ring.push([x, rm.z - 1, 'z']); ring.push([x, rm.z + rm.h, 'z']); }
      for (let z = rm.z; z < rm.z + rm.h; z++) { ring.push([rm.x - 1, z, 'x']); ring.push([rm.x + rm.w, z, 'x']); }
      for (const [x, z, axis] of ring) {
        if (x <= 0 || z <= 0 || x >= W - 1 || z >= H - 1 || t[z * W + x] !== 0) continue;
        const near = axis === 'z' ? [t[(z - 1) * W + x], t[(z + 1) * W + x]] : [t[z * W + x - 1], t[z * W + x + 1]];
        if (near.includes(3)) continue; // no doors back to back
        // (ax, az) steps along the room edge, across the opening
        const ax = axis === 'z' ? 1 : 0, az = axis === 'z' ? 0 : 1;
        const single = isWall(x - ax, z - az) && isWall(x + ax, z + az);
        const double = !single && isWall(x - ax, z - az) && t[(z + az) * W + x + ax] === 0 && isWall(x + 2 * ax, z + 2 * az);
        if (!(single || double) || r() > 0.8) continue;
        const open = r() < 0.2;
        addDoor(x, z, axis, open, false);
        if (double) addDoor(x + ax, z + az, axis, open, true); // second leaf of a double door, hinged on the far side
      }
    });
    for (const [x, z, axis, open, mirror, kind] of lay.doors || []) if (t[z * W + x] !== 3) addDoor(x, z, axis, open, mirror, kind);
    // The coarse plan. out: tiles open to the sky (gardens); fences: garden fence tiles [x, z, axis].
    const c = { W, H, t, rooms, seed, level, doors, doorAt, out: lay.out || new Uint8Array(W * H), fences: lay.fences || [], TS: this.CTS, theme };
    const spawnRoom = lay.spawn || rooms[0];
    const distFromSpawn = this.flow(c, [[spawnRoom.cx, spawnRoom.cz]]);
    const seeds = [[spawnRoom.cx, spawnRoom.cz]].concat(lay.entries || []); // (upstairs: the stair heads too, so a loft's upper floor counts)
    let exitRoom = rooms[1] || rooms[0], far = -1;
    rooms.forEach((rm) => { const d = distFromSpawn[rm.cz * W + rm.cx]; if (rm !== spawnRoom && d > far) { far = d; exitRoom = rm; } });

    // Furniture, planned on the coarse grid, only where it keeps the map fully connected
    const countReach = () => {
      const f = this.flow(c, seeds);
      let n = 0; for (let i = 0; i < f.length; i++) if (f[i] >= 0) n++;
      return n;
    };
    let reach = countReach();
    const tryBlock = (x, z, v) => {
      const i = z * W + x;
      if (t[i] !== 0) return false;
      t[i] = v;
      const nr = countReach();
      if (nr !== reach - 1) { t[i] = 0; return false; }
      reach = nr; return true;
    };
    G.Furniture.plan(c, r, spawnRoom, exitRoom, tryBlock);

    // then the fine grid, and everything that's placed on it
    const map = this.refine(c);
    map.entries = (lay.entries || []).map(([x, z]) => [x * this.K + 1, z * this.K + 1]); // (upstairs: where a loft's own stair comes up, on the fine grid: spawn spots count from there too)
    map.units = lay.units || 0; // apartments: how many (rooms carry .unit)
    map.underground = !!lay.underground; // (a basement: no windows)
    // roller doors (rolled up): [x from, x to, z of the wall] in metres
    map.rollers = (lay.rollers || []).map(([x0, z, w]) => [x0 * this.CTS, (x0 + w) * this.CTS, (z + 0.5) * this.CTS]);
    map.fest = c.fest || null; map.civSpots = c.civSpots || null; // (a festival: its light strings, where civilians hide)
    map.spawnRoom = map.rooms[rooms.indexOf(spawnRoom)];
    map.exitRoom = map.rooms[rooms.indexOf(exitRoom)];
    return this.finish(map, r);
  },

  // Coarse plan -> fine grid (K x K cells per tile).
  //  - A wall tile between two open spaces thins to its middle line of cells; the cells either side become
  //    part of the spaces. Walls with solid mass behind them (the outside of the building) keep their bulk.
  //  - A door becomes a 2-cell (1.33 m) opening in the middle line, the third cell wall; the two leaves of a
  //    double door sit side by side (2.67 m).
  //  - A garden fence becomes a line of 1-cell fence panels down the middle of its tile.
  //  - Rooms grow into the cells their thinned walls gave up. Furniture against a wall slides out to the
  //    wall's new face, and each piece blocks the fine cells it covers.
  refine(c) {
    const K = this.K, cs = this.TS, W = c.W * K, H = c.H * K;
    const t = new Uint8Array(W * H).fill(1), out = new Uint8Array(W * H);
    const cv = (x, z) => (x < 0 || z < 0 || x >= c.W || z >= c.H ? 1 : c.t[z * c.W + x]);
    const cout = (x, z) => x >= 0 && z >= 0 && x < c.W && z < c.H && !!c.out[z * c.W + x];
    const solid = (x, z) => { const v = cv(x, z); return v === 1 || v === 3; };
    const fenceC = new Map(c.fences.map(([x, z, axis]) => [z * c.W + x, axis])), fenceAx = new Map();
    // A thin wall separates two spaces (open on both sides along one axis). A wall where thin walls meet (a T or
    // a corner) is thinned with them. Thinning keeps the wall's centre line and its arms toward the walls it
    // joins; the rest of the tile opens up to the spaces around it. Walls with solid mass behind them (the
    // outside of the building, the rock around a corridor) keep their bulk.
    const open = (x, z) => !solid(x, z);
    const thinWall = (x, z) => cv(x, z) === 1 && ((open(x - 1, z) && open(x + 1, z)) || (open(x, z - 1) && open(x, z + 1)));
    for (let z = 0; z < c.H; z++) for (let x = 0; x < c.W; x++) {
      const v = cv(x, z), ci = z * c.W + x;
      const thinned = v === 1 && (thinWall(x, z) || [thinWall(x - 1, z), thinWall(x + 1, z), thinWall(x, z - 1), thinWall(x, z + 1)].filter(Boolean).length >= 2);
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
        const fi = (z * K + j) * W + x * K + i;
        // the coarse neighbour a side cell faces (a thinned cell takes its garden-ness)
        const face = i === 0 ? [x - 1, z] : i === K - 1 ? [x + 1, z] : j === 0 ? [x, z - 1] : j === K - 1 ? [x, z + 1] : [x, z];
        if (fenceC.has(ci)) { const ax = fenceC.get(ci), line = ax === 'x' ? j === 1 : i === 1; t[fi] = line ? 4 : 0; out[fi] = 1; if (line) fenceAx.set(fi, ax); continue; }
        if (v === 1) {
          if (!thinned || (i === 1 && j === 1)) continue;
          // an arm toward a neighbouring wall stays; any other cell opens if it faces open space
          const di = i - 1, dj = j - 1;
          if ((dj === 0 && solid(x + di, z)) || (di === 0 && solid(x, z + dj))) continue;
          const faces = [[x + di, z], [x, z + dj], [x + di, z + dj]].filter(([a, b]) => (a !== x || b !== z) && open(a, b));
          if (!faces.length) continue;
          // (facing nothing but open air, upstairs outside a house: open air too, not a ledge to stand on)
          t[fi] = faces.every(([a, b]) => cv(a, b) === 5) ? 5 : 0; out[fi] = faces.some(([a, b]) => cout(a, b)) ? 1 : 0;
          continue;
        }
        if (v === 3) {
          const d = c.doorAt.get(ci), along = d.axis === 'z' ? i : j, across = d.axis === 'z' ? j : i;
          if (across !== 1) { t[fi] = 0; out[fi] = cout(...(d.axis === 'z' ? [x, z + (j ? 1 : -1)] : [x + (i ? 1 : -1), z])) ? 1 : 0; continue; }
          t[fi] = (d.mirror ? along <= 1 : along >= 1) ? 3 : 1;
          continue;
        }
        if (v === 5) { t[fi] = 5; out[fi] = c.out[ci] ? 1 : 0; continue; } // a drop: no floor (the floor below shows through), or upstairs, the open air outside
        if (v === 6) { t[fi] = 7; continue; } // a flight of stairs (its steps are solids: G.Level.stack)
        t[fi] = 0; out[fi] = c.out[ci] ? 1 : 0; // floor (furniture is laid on it below)
      }
    }
    // fence lines run through to the fence tiles beside them (no gap where a side fence meets the middle one)
    for (const [ci] of fenceC) {
      const x = ci % c.W, z = (ci / c.W) | 0;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (x + dx >= c.W || z + dz >= c.H || !fenceC.has((z + dz) * c.W + x + dx)) continue;
        for (let s = 1; s < K; s++) { const fi = (z * K + 1 + dz * s) * W + x * K + 1 + dx * s; t[fi] = 4; out[fi] = 1; if (!fenceAx.has(fi)) fenceAx.set(fi, dx ? 'x' : 'z'); }
      }
    }
    // doors: one record for both cells of each opening
    const doors = [], doorAt = new Map();
    for (const d0 of c.doors) {
      const ax = d0.tx * K, az = d0.tz * K, cells = (d0.mirror ? [0, 1] : [1, 2]).map((a) => (d0.axis === 'z' ? [ax + a, az + 1] : [ax + 1, az + a]));
      const ids = cells.map(([x, z]) => z * W + x);
      const d = { id: doors.length, i: ids[0], cells: ids, tx: cells[0][0], tz: cells[0][1], axis: d0.axis, open: d0.open, mirror: d0.mirror, kind: d0.kind, w: 2 * cs,
        x: ((cells[0][0] + cells[1][0] + 1) / 2) * cs, z: ((cells[0][1] + cells[1][1] + 1) / 2) * cs };
      doors.push(d); ids.forEach((i) => doorAt.set(i, d));
    }
    // rooms: the coarse rectangle, grown into any side the thinned walls opened up
    const rooms = c.rooms.map((rm) => {
      const x0 = rm.x * K, z0 = rm.z * K, x1 = (rm.x + rm.w) * K - 1, z1 = (rm.z + rm.h) * K - 1;
      const col = (x) => { for (let z = z0; z <= z1; z++) if (t[z * W + x] !== 0) return false; return true; };
      const row = (z) => { for (let x = x0; x <= x1; x++) if (t[z * W + x] !== 0) return false; return true; };
      const nx0 = col(x0 - 1) ? x0 - 1 : x0, nx1 = col(x1 + 1) ? x1 + 1 : x1, nz0 = row(z0 - 1) ? z0 - 1 : z0, nz1 = row(z1 + 1) ? z1 + 1 : z1;
      const q = Object.assign({}, rm, { x: nx0, z: nz0, w: nx1 - nx0 + 1, h: nz1 - nz0 + 1, cx: (nx0 + nx1) >> 1, cz: (nz0 + nz1) >> 1 });
      // its centre on floor you can stand on (not on a flight of stairs, say): the nearest such cell in it
      if (t[q.cz * W + q.cx] !== 0) {
        let best = null, bd = 1e9;
        for (let z = q.z; z < q.z + q.h; z++) for (let x = q.x; x < q.x + q.w; x++) { const d = Math.abs(x - q.cx) + Math.abs(z - q.cz); if (t[z * W + x] === 0 && d < bd) { bd = d; best = [x, z]; } }
        if (best) [q.cx, q.cz] = best;
      }
      return q;
    });
    // furniture: slid out to its wall's new face, then laid on the cells it covers
    const R = G.Furniture.R, wb = G.Furniture.worldBoxes, props = new Map(), propList = [];
    const hang = (i, p) => { const q = props.get(i); props.set(i, q ? { name: q.name, boxes: q.boxes.concat(p.boxes).sort((a, b) => b.h - a.h) } : p); };
    for (const [ci, p0] of c.props) {
      if (fenceC.has(ci)) continue;
      const cx = ci % c.W, cz = (ci / c.W) | 0;
      let x = p0.x, z = p0.z;
      for (const [dx, dz] of p0.wd || []) {
        const fx = dx > 0 ? cx * K + K : dx < 0 ? cx * K - 1 : cx * K + 1, fz = dz > 0 ? cz * K + K : dz < 0 ? cz * K - 1 : cz * K + 1;
        if (t[fz * W + fx] === 0) { x += dx * cs; z += dz * cs; }
      }
      const p = Object.assign({}, p0, { x, z, boxes: wb(R[p0.name], x, z, p0.q, p0.v) });
      propList.push(p);
      const blocks = c.t[ci] === 2 || c.t[ci] === 4;
      let any = false;
      for (const b of p.boxes) {
        for (let fz = Math.floor((b.cz - b.hz) / cs); fz <= Math.floor((b.cz + b.hz) / cs); fz++) for (let fx = Math.floor((b.cx - b.hx) / cs); fx <= Math.floor((b.cx + b.hx) / cs); fx++) {
          if (fx < 0 || fz < 0 || fx >= W || fz >= H) continue;
          const i = fz * W + fx;
          if (t[i] !== 0 && !(blocks && (t[i] === 2 || t[i] === 4))) continue;
          hang(i, p); any = true;
          // a cell whose middle it covers is blocked (a small thing in a corner leaves the floor walkable)
          if (blocks && Math.abs((fx + 0.5) * cs - b.cx) <= b.hx + 0.05 && Math.abs((fz + 0.5) * cs - b.cz) <= b.hz + 0.05) t[i] = c.t[ci];
        }
      }
      if (!any) hang(Math.floor(z / cs) * W + Math.floor(x / cs), p);
    }
    // garden fence panels
    for (let i = 0; i < W * H; i++) {
      if (t[i] !== 4 || props.has(i)) continue;
      const x = i % W, z = (i / W) | 0;
      const name = c.theme.fence || 'fence'; // (a festival's site fencing)
      const p = { name, q: fenceAx.get(i) === 'z' ? 1 : 0, x: (x + 0.5) * cs, z: (z + 0.5) * cs, v: ((x * 7 + z * 13) % 17) / 17 };
      p.boxes = wb(R[name], p.x, p.z, p.q, p.v);
      props.set(i, p); propList.push(p);
    }
    return { W, H, t, out, rooms, seed: c.seed, level: c.level, doors, doorAt, props, propList, theme: c.theme };
  },

  // Everything placed on the fine grid: cover spots, hiding spots, where suspects start, the weapon case, the
  // lights, spawn and extraction.
  finish(map, r) {
    const U = G.U, { W, H, t, rooms, spawnRoom, exitRoom } = map, TS = this.TS, K = this.K;
    // Cover spots: floor cells beside furniture you can hide behind, tight against its side
    map.cover = [];
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      if (t[z * W + x] !== 0) continue;
      const tcx = (x + 0.5) * TS, tcz = (z + 0.5) * TS;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (t[(z + oz) * W + x + ox] !== 2) continue;
        const b = this.boxesAt(map, x + ox, z + oz)[0];
        if (!b || b.h < 0.85) continue;
        // stand half a metre off the face nearest this cell, level with its centre
        const sx = ox ? b.cx - ox * (b.hx + 0.5) : tcx, sz = oz ? b.cz - oz * (b.hz + 0.5) : tcz;
        if (ox ? Math.abs(tcz - b.cz) > b.hz + 0.1 : Math.abs(tcx - b.cx) > b.hx + 0.1) continue;
        if (Math.abs(sx - tcx) > 0.8 || Math.abs(sz - tcz) > 0.8) continue;
        if (map.cover.some((q) => Math.abs(q.x - sx) < 0.5 && Math.abs(q.z - sz) < 0.5)) continue;
        map.cover.push({ x: sx, z: sz, cx: b.cx, cz: b.cz });
      }
    }
    // spots by a wall edge to lean out from (every third cell is plenty)
    map.wallSpots = [];
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      if (t[z * W + x] !== 0 || (x + z) % 2) continue;
      if (t[z * W + x - 1] === 1 || t[z * W + x + 1] === 1 || t[(z - 1) * W + x] === 1 || t[(z + 1) * W + x] === 1) map.wallSpots.push({ x: (x + 0.5) * TS, z: (z + 0.5) * TS });
    }
    // Enemy candidate spots: floor cells in rooms away from the spawn
    const dist2 = this.flow(map, [[spawnRoom.cx, spawnRoom.cz]].concat(map.entries || [])); // (a loft's upper floor is reached by its own stair: from its head too)
    map.enemySpots = [];
    rooms.forEach((rm) => {
      if (rm === spawnRoom || rm.type === 'road' || rm.type === 'lawn') return; // (not out on the street among the patrol cars)
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        const i = z * W + x;
        if (t[i] === 0 && !map.props.has(i) && dist2[i] > 5 * K) map.enemySpots.push([x, z]);
      }
    });
    // The weapon case: only some levels have one (CASE_CHANCE, from the level seed so everyone agrees), on the
    // floor along a wall in a room away from the spawn: two clear cells side by side against the wall
    map.case = null;
    const hasCase = r() < this.CASE_CHANCE;
    const clear = (x, z) => t[z * W + x] === 0 && !map.props.has(z * W + x);
    if (hasCase) for (const rm of U.shuffle(r, rooms.filter((q) => q !== spawnRoom))) {
      const spots = [];
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        let nearDoor = false;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (t[(z + dz) * W + x + dx] === 3) nearDoor = true;
        if (nearDoor) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ax = dz ? 1 : 0, az = dx ? 1 : 0; // along the wall
          if (clear(x, z) && clear(x + ax, z + az) && t[(z + dz) * W + x + dx] === 1 && t[(z + az + dz) * W + x + ax + dx] === 1) spots.push([x, z, dx, dz, ax, az]);
        }
      }
      if (!spots.length) continue;
      const [x, z, dx, dz, ax, az] = U.pick(r, spots);
      // long side along the wall, latches and handle facing the room, hinge at the back
      map.case = { x: (x + 0.5 + ax * 0.5) * TS + dx * (TS / 2 - 0.22), z: (z + 0.5 + az * 0.5) * TS + dz * (TS / 2 - 0.22), yaw: Math.atan2(-dx, -dz) };
      break;
    }
    // First aid cabinets: rare, screwed to a wall at chest height in a room (not right by a door, not over
    // furniture). Their own random stream from the seed, so the rest of the level doesn't change with them.
    map.cabinets = [];
    {
      const rc = U.rng((map.seed ^ 0x5eed0cab) >>> 0);
      const want = rc() < this.CAB_CHANCE ? (rc() < this.CAB_TWO ? 2 : 1) : 0;
      const used = new Set();
      for (const rm of U.shuffle(rc, rooms.slice())) {
        if (map.cabinets.length >= want) break;
        if (used.has(rm)) continue;
        const spots = [];
        for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
          if (!clear(x, z) || (map.out && map.out[z * W + x])) continue; // indoors only
          let nearDoor = false;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (t[(z + dz) * W + x + dx] === 3) nearDoor = true;
          if (nearDoor) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (t[(z + dz) * W + x + dx] === 1) spots.push([x, z, dx, dz]);
        }
        if (!spots.length) continue;
        const [x, z, dx, dz] = U.pick(rc, spots);
        used.add(rm);
        // the back against the wall's face, the door facing the room
        map.cabinets.push({ x: (x + 0.5) * TS + dx * (TS / 2 - 0.075), z: (z + 0.5) * TS + dz * (TS / 2 - 0.075), yaw: Math.atan2(-dx, -dz) });
      }
    }
    // Ceiling lamps: one per room, a grid of them over a warehouse floor, none in the open; porch lanterns over
    // doors that open onto a garden
    map.lights = [];
    for (const rm of rooms) {
      if (rm.out) continue;
      if (rm.type === 'corridor') { for (let x = rm.x + 2; x < rm.x + rm.w; x += 7) map.lights.push({ x: (x + 0.5) * TS, z: (rm.cz + 0.5) * TS }); continue; } // down a hallway
      if (rm.type === 'hangar') { // a lamp every 8 m by 6 m down the hall
        for (let z = rm.z + 3; z < rm.z + rm.h; z += 9) for (let x = rm.x + 6; x < rm.x + rm.w - 2; x += 12) map.lights.push({ x: (x + 0.5) * TS, z: (z + 0.5) * TS });
      } else if (rm.type === 'hall' || rm.type === 'dock') {
        for (let z = rm.z + 3; z < rm.z + rm.h; z += 9) for (let x = rm.x + 6; x < rm.x + rm.w - 2; x += 18) map.lights.push({ x: (x + 0.5) * TS, z: (z + 0.5) * TS });
      } else map.lights.push({ x: (rm.cx + 0.5) * TS, z: (rm.cz + 0.5) * TS });
    }
    for (const d of map.doors) {
      if (d.axis !== 'z' || (d.mirror && map.doors.some((o) => o !== d && !o.mirror && Math.abs(o.x - d.x) < 1.5 && Math.abs(o.z - d.z) < 0.1))) continue;
      const below = map.out[(d.tz + 1) * W + d.tx], above = map.out[(d.tz - 1) * W + d.tx];
      if (below === above) continue;
      const dir = below ? 1 : -1, pair = map.doors.find((o) => o !== d && o.mirror && Math.abs(o.x - d.x) < 1.5 && Math.abs(o.z - d.z) < 0.1);
      map.lights.push({ x: pair ? (d.x + pair.x) / 2 : d.x, z: d.z + dir * (TS / 2 + 0.06), y: 2.55, porch: dir });
    }
    // a festival: real lights along the strings (a warm pool every few metres) and coloured ones over the stage
    if (map.fest) {
      for (const s of map.fest.strings) {
        const len = Math.hypot(s.b[0] - s.a[0], s.b[2] - s.a[2]), n = Math.max(1, Math.round(len / 9));
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          map.lights.push({ kind: 'string', x: s.a[0] + (s.b[0] - s.a[0]) * u, z: s.a[2] + (s.b[2] - s.a[2]) * u, y: s.a[1] + (s.b[1] - s.a[1]) * u - 0.6, color: s.kind === 'lantern' ? 0xffa868 : 0xffd29a, i: 1.25, d: 16 });
        }
      }
      for (const [x, z] of map.fest.lamps) map.lights.push({ kind: 'string', x, z, y: 5.6, color: 0xffcf98, i: 1.7, d: 24 }); // street lamps
      const st = map.fest.stage;
      if (st) [0xff3fa0, 0x40c0ff, 0xffb040].forEach((color, i) => map.lights.push({ kind: 'string', x: st.x0 + (st.x1 - st.x0) * (0.2 + i * 0.3), z: st.z1 - 0.6, y: 5.5, color, i: 2.2, d: 22 }));
    }
    // the lamps nearest where you come in first (only the first dozen are real lights)
    { const sx = (spawnRoom.cx + 0.5) * TS, sz = (spawnRoom.cz + 0.5) * TS; map.lights.sort((a, b) => Math.hypot(a.x - sx, a.z - sz) - Math.hypot(b.x - sx, b.z - sz)); }
    // An open door's leaf stands out into the room beside its hinge; it hides whoever's behind it and stops
    // rounds (like the closed door), though you can walk past it. Which cells it stands in, per door.
    map.leafAt = new Map();
    for (const d of map.doors) {
      d.leaf = this.leafBox(d);
      const b = d.leaf;
      for (let z = Math.floor((b.cz - b.hz) / TS); z <= Math.floor((b.cz + b.hz) / TS); z++) for (let x = Math.floor((b.cx - b.hx) / TS); x <= Math.floor((b.cx + b.hx) / TS); x++) {
        const i = z * W + x;
        if (!map.leafAt.has(i)) map.leafAt.set(i, []);
        map.leafAt.get(i).push(d);
      }
    }
    map.unitAt = null;
    if (map.units) {
      map.unitAt = new Int8Array(W * H).fill(-1);
      for (const rm of rooms) if (rm.unit != null) for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) map.unitAt[z * W + x] = rm.unit;
      // the doorways and thinned walls between an apartment's rooms are the apartment's too (not the hallway's)
      for (const rm of rooms) if (rm.unit == null) for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) map.unitAt[z * W + x] = -2;
      for (let pass = 0; pass < 2; pass++) for (let i = W; i < W * (H - 1); i++) {
        if (map.unitAt[i] !== -1 || t[i] === 1) continue;
        for (const j of [i - 1, i + 1, i - W, i + W]) if (map.unitAt[j] >= 0) { map.unitAt[i] = map.unitAt[j]; break; }
      }
      for (let i = 0; i < W * H; i++) if (map.unitAt[i] === -2) map.unitAt[i] = -1;
    }
    this.placeWindows(map);
    map.spawn = { x: (spawnRoom.cx + 0.5) * TS, z: (spawnRoom.cz + 0.5) * TS };
    map.extract = { x: (exitRoom.cx + 0.5) * TS, z: (exitRoom.cz + 0.5) * TS, r: 3 };
    return map;
  },
  // the real lights go to the lamps nearest p (a few times a second; now if `now`)
  LIGHTS: 12,
  // focus: where you're aiming, when you are (outdoors at night a third of the lights go to the lamps nearest it,
  // so what you look at down a scope at the far end of the field is lit)
  updateLights(map, p, now, focus) {
    if (!map || !map.lightPool || !map.lightPool.length || !p) return;
    if (!now && (map.lightT = (map.lightT || 0) - 1) > 0) return;
    map.lightT = 12; // frames
    // (a building of several floors: the lamps on your own floor first, by a long way. The lights cast no shadows,
    // so a lamp downstairs would light the walls and furniture upstairs through the floor; only when there
    // aren't enough on yours, or you're right by a drop, do the nearest from another floor get one.)
    const qf = (q) => (map.floors ? this.floorAt(map, q.x, (q.y || 0) - 1.5, q.z) : 0);
    const by = (q) => { const f = qf(q); return map.lamps.map((l) => [l, (l.x - q.x) * (l.x - q.x) + (l.z - q.z) * (l.z - q.z) + (map.floors && (l.fl || 0) !== f ? 900 : 0)]).sort((a, b) => a[1] - b[1]); };
    let near = by(p);
    if (focus && map.theme.layout === 'festival' && Math.hypot(focus.x - p.x, focus.z - p.z) > 20) {
      const n = map.lightPool.length, mine = near.slice(0, n - Math.floor(n / 3)), set = new Set(mine.map((e) => e[0]));
      near = mine.concat(by(focus).filter((e) => !set.has(e[0])).slice(0, Math.floor(n / 3)));
    }
    map.lightPool.forEach((pl, k) => {
      const e = near[k];
      if (!e) { pl.intensity = 0; return; }
      const l = e[0];
      pl.position.set(l.x, l.y, l.z); pl.color.setHex(l.color); pl.intensity = l.i; pl.distance = l.d;
    });
  },
  // ---------------------------------------------------------------- windows
  // Real windows: a wall opening two cells wide with a sill (to 0.95 m), a lintel (from 2.25 m) and a pane of
  // glass between. You can't climb through (to movement and paths it's still wall), but you can see through,
  // shoot through (the glass breaks), and suspects can see you through it, less well until it's broken.
  //   thru: in a wall between indoors and outdoors (a house onto its garden or the street, a warehouse onto its
  //     dock, a building onto its lot): there's real ground on the far side.
  //   ext: in the outer wall of the building, looking out at the city (the view in the glass, js/furniture.js
  //     outsideMaterial; high up in an apartment block). Rounds through it stop in the wall behind.
  // From the level's own random stream, so every peer has the same windows. map.windows[id], map.winAt: cell -> ray boxes.
  SILL: 0.95, TOP: 2.25,
  placeWindows(map) {
    const { W, H, t, out, rooms } = map, TS = this.TS, K = this.K, U = G.U, rw = U.rng((map.seed ^ 0x51d0b0) >>> 0);
    map.windows = []; map.winAt = new Map();
    if (map.theme.entry === 'vault' || map.theme.hub || map.underground) return; // a bunker has none, nor does the hangar, nor a basement
    const used = new Set(), floor = (i) => t[i] === 0 || t[i] === 2 || t[i] === 4 || (t[i] === 5 && out[i]); // (upstairs, the open air outside a house counts)
    const nearDoor = (x, z) => { for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (t[(z + dz) * W + x + dx] === 3) return true; return false; };
    const tall = (i) => { const p = map.props && map.props.get(i); return !!(p && p.boxes[0] && p.boxes[0].h > 1.0); };
    const inside = (x, z) => x > 0 && z > 0 && x < W - 1 && z < H - 1;
    const add = (cells, nx, nz, ext) => {
      const [a, b] = cells.map((i) => [i % W, (i / W) | 0]);
      const mx = ((a[0] + b[0]) / 2 + 0.5) * TS, mz = ((a[1] + b[1]) / 2 + 0.5) * TS, near = (o) => o && Math.hypot(o.x - mx, o.z - mz) < 1.6;
      if (near(map.case) || (map.cabinets || []).some(near)) return; // (not through the wall a cabinet or the weapon case is against)
      const id = map.windows.length;
      // the opening's middle, on the wall's centre line (thru) or the room-side cell's middle (ext)
      const w = { id, cells, nx, nz, ext, broken: false, x: ((a[0] + b[0]) / 2 + 0.5) * TS, z: ((a[1] + b[1]) / 2 + 0.5) * TS, len: 2 * TS };
      map.windows.push(w);
      for (const i of cells) {
        used.add(i);
        const cx = ((i % W) + 0.5) * TS, cz = (((i / W) | 0) + 0.5) * TS, h = TS / 2, along = nx ? { hx: 0.02, hz: h } : { hx: h, hz: 0.02 };
        const full = { cx, cz, hx: h, hz: h };
        const boxes = [Object.assign({ y0: 0, h: this.SILL }, full), Object.assign({ y0: this.TOP, h: this.WALL_H }, full)];
        const glass = Object.assign({ cx, cz, y0: this.SILL, h: this.TOP, glass: id }, along);
        // an outside window: what's past the glass is the view (the wall behind): rounds stop there, unseen
        const back = ext ? Object.assign({ cx: cx + nx * (h - 0.01), cz: cz + nz * (h - 0.01), y0: this.SILL, h: this.TOP, view: true }, nx ? { hx: 0.01, hz: h } : { hx: h, hz: 0.01 }) : null;
        map.winAt.set(i, { win: w, open: back ? boxes.concat([back]) : boxes, shut: (back ? boxes.concat([back]) : boxes).concat([glass]) });
      }
    };
    // a wall cell with floor either side along one axis (a thin wall), indoors on one side and outdoors on the other
    const thruAt = (x, z) => {
      const i = z * W + x;
      if (t[i] !== 1 || used.has(i) || !inside(x, z)) return null;
      for (const [nx, nz] of [[1, 0], [0, 1]]) {
        const a = i - nx - nz * W, b = i + nx + nz * W;
        if (!floor(a) || !floor(b) || !!out[a] === !!out[b]) continue;
        const s = out[b] ? 1 : -1; // pointing outdoors
        return [nx * s, nz * s, out[b] ? a : b];
      }
      return null;
    };
    for (let z = 2; z < H - 2; z++) for (let x = 2; x < W - 2; x++) {
      const c = thruAt(x, z);
      if (!c) continue;
      const [nx, nz, roomSide] = c, ax = nz ? 1 : 0, az = nx ? 1 : 0, c2 = thruAt(x + ax, z + az);
      if (!c2 || c2[0] !== nx || c2[1] !== nz || nearDoor(x, z) || nearDoor(x + ax, z + az)) continue;
      if (tall(roomSide) || tall(c2[2]) || used.has((z - az) * W + x - ax) || used.has((z - 2 * az) * W + x - 2 * ax)) continue;
      if (rw() < 0.45) add([z * W + x, (z + az) * W + x + ax], nx, nz, false);
    }
    // the building's outer walls: a wall face of a room, with solid wall from there to the edge of the map (and
    // not too thick); a couple to a room
    const solidOut = (x, z, dx, dz) => { let n = 0; for (let cx = x, cz = z; cx >= 0 && cz >= 0 && cx < W && cz < H; cx += dx, cz += dz) { if (t[cz * W + cx] !== 1 || ++n > 4 * K) return false; } return true; };
    for (const rm of rooms) {
      if (rm.out) continue;
      let n = 0;
      for (let z = rm.z; z < rm.z + rm.h && n < 2; z++) for (let x = rm.x; x < rm.x + rm.w && n < 2; x++) {
        if (!floor(z * W + x) || out[z * W + x]) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const wx = x + dx, wz = z + dz, ax = dz ? 1 : 0, az = dx ? 1 : 0, w2 = (wz + az) * W + wx + ax;
          if (!solidOut(wx, wz, dx, dz) || !solidOut(wx + ax, wz + az, dx, dz) || used.has(wz * W + wx) || used.has(w2) || !floor((z + az) * W + x + ax) || out[(z + az) * W + x + ax]) continue;
          if (nearDoor(wx, wz) || nearDoor(wx + ax, wz + az) || tall(z * W + x) || tall((z + az) * W + x + ax) || used.has((wz - az) * W + wx - ax) || used.has((wz + 2 * az) * W + wx + 2 * ax)) continue;
          if (rw() > 0.12) continue;
          add([wz * W + wx, w2], dx, dz, true); n++;
          break;
        }
      }
    }
  },
  // the box an open door's leaf fills (it swings from its hinge jamb: +x for doors you walk through along x,
  // -z for the others; see the door meshes in buildMesh)
  leafBox(d) {
    const half = (d.w || this.TS) / 2, len = (d.w || this.TS) - 0.05, m = d.mirror ? -1 : 1;
    return d.axis === 'x'
      ? { cx: d.x + 0.02 + len / 2, cz: d.z - half * m, hx: len / 2, hz: 0.035, y0: 0, h: this.DOOR_H }
      : { cx: d.x - half * m, cz: d.z - 0.02 - len / 2, hx: 0.035, hz: len / 2, y0: 0, h: this.DOOR_H };
  },
  // what a ray meets in a tile: its solid boxes, and any open door leaf standing in it
  // (shelving gives its posts, shelves and loads instead of its footprint: you see and shoot through the gaps)
  rayBoxesAt(map, tx, tz) {
    const wa = map.winAt && map.winAt.get(tz * map.W + tx);
    if (wa) return wa.win.broken ? wa.open : wa.shut;
    let bs = this.boxesAt(map, tx, tz);
    if (bs._ray || bs.some((b) => b.ray)) bs =bs._ray || (bs._ray = bs.flatMap((b) => b.ray || [b]));
    const ds = map.leafAt && map.leafAt.get(tz * map.W + tx);
    if (!ds) return bs;
    let out = bs;
    for (const d of ds) if (d.open) out = (out === bs ? bs.slice() : out).concat([d.leaf]);
    return out;
  },

  // ----------------------------------------------------------------- layouts
  // A music festival at night, on the edge of a town, about 120 x 108 m, all of it open to the sky.
  //  - The festival (the east): the stage at the far end with rows of seats in front of it (long sight lines over
  //    them), then the food court (rows of food and merchandise stalls facing each other across lanes), lights
  //    strung over everything, a toilet block on one side (two washrooms, cubicles behind their own doors), picnic
  //    tables behind it, and its gate, ticket booths either side.
  //  - The town square (the west), behind the festival's fence with a side gate through: shops down the west side
  //    and along the north (cafes, stores, bars, each with a door onto the square), a fountain in the middle.
  //  - The car park along the south, where you come in: rows of parked cars, the festival's gate under its arch
  //    and the street into the square opening off it.
  // (What goes where: G.Furniture.plan's festival(); the lights, sky and stage rig: buildFestival.)
  layFestival(r, level) {
    const U = G.U, W = 58 + Math.min(level, 4) * 2, H = 54, TX = 17, PZ = H - 12; // the town west of TX; the car park south of PZ
    const t = new Uint8Array(W * H).fill(1), out = new Uint8Array(W * H).fill(1), rooms = [], doors = [], fences = [];
    const fill = (x0, z0, w, h) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = 0; };
    const solid = (x0, z0, x1, z1) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { t[z * W + x] = 1; out[z * W + x] = 0; } }; // a building's footprint
    const fence = (x, z, axis) => { t[z * W + x] = 4; fences.push([x, z, axis]); };
    fill(1, 1, W - 2, H - 2);
    // the town's buildings: a row of shops down the west edge and along the north of the square
    solid(0, 0, 5, PZ - 1); solid(6, 0, TX - 1, 5);
    const shop = (x, z, door) => { fill(x, z, 4, 4); rooms.push(this._room(x, z, 4, 4, { type: U.pick(r, ['cafe', 'store', 'store', 'bar']) })); doors.push(door); };
    for (let z = 6; z + 3 <= PZ - 3; z += 5) shop(1, z, [5, z + 1 + (r() < 0.5 ? 0 : 1), 'x', false, false]); // (below the north row: the corner's solid)
    for (let x = 7; x + 3 <= TX - 2; x += 5) shop(x, 1, [x + 1 + (r() < 0.5 ? 0 : 1), 5, 'z', false, false]);
    // fencing round the site (not where a building is the edge), between the festival and the square (a side gate
    // half way down), and along the car park (the festival's gate, and the street into the square)
    for (let x = 0; x < W; x++) for (const z of [0, H - 1]) if (out[z * W + x]) fence(x, z, 'x');
    for (let z = 1; z < H - 1; z++) for (const x of [0, W - 1]) if (out[z * W + x]) fence(x, z, 'z');
    const gz = PZ >> 1;
    for (let z = 1; z < PZ; z++) if (Math.abs(z - gz) > 1) fence(TX, z, 'z');
    const fx = (TX + 1 + W - 2) >> 1;
    for (let x = 1; x < W - 1; x++) if (!(x >= fx - 2 && x <= fx + 1) && !(x >= 8 && x <= 10)) fence(x, PZ, 'x');
    // the toilet block, against the festival's east fence: a washroom each side of a dividing wall, two cubicles off each
    const x0 = TX + 1, x1 = W - 2, fw = x1 - x0 + 1, bx0 = x1 - 6, bx1 = x1, bz0 = 16, bz1 = 26;
    for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) { t[z * W + x] = 1; out[z * W + x] = 0; }
    fill(bx0 + 1, bz0 + 1, 3, 4); fill(bx0 + 1, bz0 + 6, 3, 4);
    const cubX = bx1 - 1;
    for (const z of [bz0 + 1, bz0 + 3, bz0 + 6, bz0 + 8]) { t[z * W + cubX] = 0; doors.push([cubX - 1, z, 'x', false, false]); rooms.push(this._room(cubX, z, 1, 1, { type: 'cubicle' })); }
    doors.push([bx0, bz0 + 2, 'x', false, false], [bx0, bz0 + 7, 'x', false, false]);
    rooms.push(this._room(bx0 + 1, bz0 + 1, 3, 4, { type: 'washroom' }), this._room(bx0 + 1, bz0 + 6, 3, 4, { type: 'washroom' }));
    // the open ground (the stage first: the seats string their lights from it)
    const cxF = (x0 + x1) >> 1;
    const stage = this._room(cxF - 7, 1, 14, 4, { type: 'stage', out: true });
    const seating = this._room(x0, 5, fw, 10, { type: 'seating', out: true });
    const court = this._room(x0, 16, bx0 - x0, PZ - 21, { type: 'court', out: true });
    const picnic = this._room(bx0, bz1 + 1, x1 - bx0 + 1, PZ - 6 - bz1, { type: 'picnic', out: true });
    const gate = this._room(x0, PZ - 5, fw, 5, { type: 'gate', out: true });
    const plaza = this._room(6, 6, TX - 6, PZ - 6, { type: 'plaza', out: true });
    const lot = this._room(1, PZ + 1, W - 2, H - PZ - 2, { type: 'parking', out: true });
    const aisle = this._room(1, PZ + 4, W - 2, 2, { type: 'aisle', out: true }); // (the lane between the rows of cars: where you come in)
    rooms.unshift(stage, seating, court, picnic, gate, plaza, lot, aisle);
    return { W, H, t, rooms, doors, out, fences, spawn: aisle };
  },
  // Each returns { W, H, t, rooms, doors?, ringDoors?, out?, fences?, spawn? } on the coarse grid. t starts as all wall
  // (1); rooms are carved to floor (0).
  _room(x, z, w, h, o) { return Object.assign({ x, z, w, h, cx: x + (w >> 1), cz: z + (h >> 1) }, o || {}); },

  // Rooms joined by corridors (apartments, bunkers, labs...).
  layRooms(r, level) {
    const U = G.U;
    // compact: ~38 m across on level 1, never more than 60 m
    const W = Math.min(18 + level, 30), H = W;
    const t = new Uint8Array(W * H).fill(1);
    const rooms = [];
    const want = 5 + Math.min(level, 6);
    for (let a = 0; a < 600 && rooms.length < want; a++) {
      const w = U.ri(r, 3, 6), h = U.ri(r, 3, 6); // 6-12 m rooms
      const x = U.ri(r, 1, W - w - 2), z = U.ri(r, 1, H - h - 2);
      // rooms may share a single wall, so neighbours connect straight through a doorway
      if (rooms.some((o) => x < o.x + o.w + 1 && x + w + 1 > o.x && z < o.z + o.h + 1 && z + h + 1 > o.z)) continue;
      rooms.push(this._room(x, z, w, h));
    }
    const set = (x, z, v) => { if (x > 0 && z > 0 && x < W - 1 && z < H - 1) t[z * W + x] = v; };
    rooms.forEach((rm) => { for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) set(x, z, 0); });
    const corridor = (a, b) => {
      const wide = r() < 0.2 ? 2 : 1;
      const horizFirst = r() < 0.5;
      const carveH = (x0, x1, z) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let k = 0; k < wide; k++) set(x, z + k, 0); };
      const carveV = (z0, z1, x) => { for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let k = 0; k < wide; k++) set(x + k, z, 0); };
      if (horizFirst) { carveH(a.cx, b.cx, a.cz); carveV(a.cz, b.cz, b.cx); }
      else { carveV(a.cz, b.cz, a.cx); carveH(a.cx, b.cx, b.cz); }
    };
    for (let i = 1; i < rooms.length; i++) {
      let best = 0, bd = 1e9;
      for (let j = 0; j < i; j++) {
        const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cz - rooms[j].cz);
        if (d < bd) { bd = d; best = j; }
      }
      corridor(rooms[i], rooms[best]);
    }
    // extra loops give flanking routes
    const extra = Math.max(1, Math.floor(rooms.length / 3));
    for (let k = 0; k < extra; k++) corridor(U.pick(r, rooms), U.pick(r, rooms));
    return { W, H, t, rooms, ringDoors: true };
  },

  // Outside the building: a lot along its front (open to the sky, fenced), and the way in, a corridor from the
  // nearest room out to a double door in the front wall (a vault door into a bunker).
  approach(lay, r, theme) {
    const D = 4, { W, H } = lay, H2 = H + D, t = new Uint8Array(W * H2).fill(1), out = new Uint8Array(W * H2), fences = [], doors = lay.doors ? lay.doors.slice() : [];
    t.set(lay.t);
    for (let z = H; z < H2; z++) for (let x = 0; x < W; x++) out[z * W + x] = 1;
    for (let z = H; z < H2 - 1; z++) for (let x = 1; x < W - 1; x++) t[z * W + x] = 0;
    for (let x = 0; x < W; x++) { t[(H2 - 1) * W + x] = 4; fences.push([x, H2 - 1, 'x']); }
    for (let z = H; z < H2 - 1; z++) for (const x of [0, W - 1]) { t[z * W + x] = 4; fences.push([x, z, 'z']); }
    const lot = this._room(1, H, W - 2, D - 1, { type: 'lot', out: true });
    // the room nearest the front, and a two-wide corridor from it to the front wall
    const rm = lay.rooms.reduce((a, b) => (b.z + b.h > a.z + a.h ? b : a));
    const x0 = G.U.clamp(rm.cx, 2, W - 4);
    for (let z = rm.z + rm.h; z < H - 1; z++) for (const x of [x0, x0 + 1]) t[z * W + x] = 0;
    doors.push([x0, H - 1, 'z', false, false, theme.entry || null], [x0 + 1, H - 1, 'z', false, true, theme.entry || null]);
    return Object.assign({}, lay, { H: H2, t, out, fences, doors, rooms: lay.rooms.concat([lot]), spawn: lot });
  },

  // A home split into rooms (the houses' splitter): a door between every room and the next until they're all
  // reached, now and then another. c: { r, t, W, ids, rooms, doors }. Returns its rooms.
  _house(c, x0, z0, w, h) {
    const U = G.U, { r, t, W, ids, rooms, doors } = c;
    const fill = (x1, z1, w1, h1) => { for (let z = z1; z < z1 + h1; z++) for (let x = x1; x < x1 + w1; x++) t[z * W + x] = 0; };
    const leaves = [], lo = c.lo || 3; // the smallest room, in tiles
    const split = (x, z, w, h, depth) => {
      const canV = w >= 2 * lo + 1, canH = h >= 2 * lo + 1;
      if ((!canV && !canH) || depth > 3 || (depth >= 2 && r() < 0.3)) { leaves.push([x, z, w, h]); return; }
      const vert = canV && (!canH || (w >= h ? r() < 0.8 : r() < 0.2));
      if (vert) { const s = U.ri(r, lo, w - lo - 1); split(x, z, s, h, depth + 1); split(x + s + 1, z, w - s - 1, h, depth + 1); }
      else { const s = U.ri(r, lo, h - lo - 1); split(x, z, w, s, depth + 1); split(x, z + s + 1, w, h - s - 1, depth + 1); }
    };
    split(x0, z0, w, h, 0);
    const base = rooms.length;
    leaves.forEach(([x, z, w, h], i) => {
      fill(x, z, w, h);
      for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) ids[zz * W + xx] = base + i;
      rooms.push(this._room(x, z, w, h));
    });
    // a door through the wall between rooms until every room is reached, then a couple more for loops
    const cands = [];
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
      if (t[z * W + x] !== 1) continue;
      const a = ids[z * W + x - 1], b = ids[z * W + x + 1], c = ids[(z - 1) * W + x], d = ids[(z + 1) * W + x];
      if (a >= 0 && b >= 0 && a !== b && t[(z - 1) * W + x] === 1 && t[(z + 1) * W + x] === 1) cands.push([x, z, 'x', a, b]);
      if (c >= 0 && d >= 0 && c !== d && t[z * W + x - 1] === 1 && t[z * W + x + 1] === 1) cands.push([x, z, 'z', c, d]);
    }
    U.shuffle(r, cands);
    const parent = new Map(), find = (i) => { while (parent.has(i) && parent.get(i) !== i) i = parent.get(i); return i; };
    const near = (c) => doors.some((d) => Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) < 3);
    for (const c of cands) { const a = find(c[3]), b = find(c[4]); if (a === b || near(c)) continue; parent.set(a, b); doors.push([c[0], c[1], c[2], r() < 0.3]); }
    for (const c of cands) if (r() < 0.05 && !near(c)) doors.push([c[0], c[1], c[2], r() < 0.3]);
    return rooms.slice(base);
  },

  // An apartment block of two floors. On each, a hallway runs the length of the block with apartments either side,
  // each its own home (a few rooms, one front door onto the hallway), and a stairwell at each end of it: the
  // flight up its outer side, a walkway down its inner side from the foot of the stairs to the hall door. You
  // come in at the foot of the west stairs. A third or so of the ground-floor homes are lofts: the living room
  // goes up two floors with a stair up its wall, to an open upper floor over the rest of the home (railed where
  // it looks down into the living room). Upstairs are single-floor apartments and the lofts' upper floors. Each
  // apartment has to be cleared. Tile values on the plan: 5 a drop (no floor), 6 a flight of stairs.
  layApartments(r, level) {
    const U = G.U, per = 2 + Math.min(level >> 1, 2); // apartments each side of the hallway
    const ud = U.ri(r, 5, 6), ud2 = U.ri(r, 5, 6);
    const W = 8 + per * 8, hz = ud + 2, H = hz + 2 + ud2 + 1, xa0 = 4, xa1 = W - 5; // (the homes between the stairwells)
    // the homes along each side, the same on both floors (a loft's upper floor sits over it)
    const homes = [];
    for (const [z0, h, wallZ] of [[1, ud, hz - 1], [hz + 2, ud2, hz + 1]]) {
      for (let x = xa0; x <= xa1 - 2;) {
        let w = U.ri(r, 5, 7);
        if (xa1 - (x + w) < 5) w = xa1 - x + 1;
        homes.push({ x, w, z0, h, wallZ, loft: r() < 0.35 });
        x += w + 1;
      }
    }
    if (!homes.some((u) => u.loft)) U.pick(r, homes).loft = true;
    const floors = [], stairs = [];
    let unit = 0;
    for (let f = 0; f < 2; f++) {
      const t = new Uint8Array(W * H).fill(1), rooms = [], doors = [], ids = new Int16Array(W * H).fill(-1), entries = [];
      const fill = (x0, z0, w, h, v = 0) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = v; };
      // the stairwells: [outer lane, inner lane, the way the flight climbs (z), the hall door's x]
      for (const [xo, xi, up, dx] of [[1, 2, -1, 3], [W - 2, W - 3, 1, W - 4]]) {
        const x0 = Math.min(xo, xi);
        fill(x0, hz - 2, 2, 5);
        rooms.push(this._room(x0, hz - 2, 2, 5, { type: 'landing', stairs: true }));
        doors.push([dx, hz, 'x', false, false, 'stair']); // (a stairwell door: glass, a push bar one side, a pull handle the other)
        if (f === 0) { fill(xo, hz - 1, 1, 3, 6); stairs.push({ f: 0, x0: xo, z0: hz - 1, x1: xo, z1: hz + 1, axis: 'z', up }); }
        else { fill(xo, hz - 1, 1, 3, 5); entries.push([xo, up < 0 ? hz - 2 : hz + 2]); } // (over the flight: the drop; where you come up)
      }
      // the hallway between them
      fill(xa0, hz, xa1 - xa0 + 1, 1);
      rooms.push(this._room(xa0, hz, xa1 - xa0 + 1, 1, { type: 'corridor' }));
      for (const u of homes) {
        if (f === 0 || !u.loft) {
          const mine = this._house({ r, t, W, ids, rooms, doors, lo: 2 }, u.x, u.z0, u.w, u.h), id = unit++;
          if (f === 0) u.unit = id;
          mine.forEach((q) => { q.unit = id; });
          // the front door, from the hallway into a room along it
          const front = mine.filter((q) => (u.wallZ < u.z0 ? q.z === u.z0 : q.z + q.h === u.wallZ) && q.w >= 2);
          const fr = front.length ? U.pick(r, front) : mine[0];
          doors.push([U.ri(r, fr.x, fr.x + fr.w - 1), u.wallZ, 'z', false, false]);
          if (f === 0 && u.loft && !this._loftStairs(r, u, mine, t, W, doors, stairs)) u.loft = false; // (no room for a stair: a flat after all)
        } else {
          // a loft's upper floor: the drop over its living room, and a room over the rest of the home
          fill(u.x, u.z0, u.w, u.h);
          const [vx, vz, vw, vh] = u.drop;
          fill(vx, vz, vw, vh, 5);
          const pieces = [[u.x, u.z0, u.w, vz - u.z0], [u.x, vz + vh, u.w, u.z0 + u.h - vz - vh], [u.x, vz, vx - u.x, vh], [vx + vw, vz, u.x + u.w - vx - vw, vh]];
          for (const [x, z, w, h] of pieces) if (w > 0 && h > 0) rooms.push(this._room(x, z, w, h, { type: U.pick(r, ['bedroom', 'bedroom', 'office']), unit: u.unit, loft: true }));
          entries.push(u.head);
        }
      }
      floors.push({ W, H, t, rooms, doors, spawn: rooms[0], entries: f ? entries : null, units: 0 });
    }
    for (const fl of floors) fl.units = unit;
    return { floors, stairs, units: unit };
  },
  // A loft's stair: up the wall of one of its rooms (which becomes the double-height living room), its foot in the
  // room and its head over the wall at the room's end, onto the upper floor. Not against a doorway, and the head
  // over the home's own walls (not the hallway's or a neighbour's). Returns whether there was a room for one.
  _loftStairs(r, u, mine, t, W, doors, stairs) {
    const isDoor = (x, z) => doors.some((d) => d[0] === x && d[1] === z), wall = (x, z) => t[z * W + x] === 1 && !isDoor(x, z);
    const inHome = (x, z) => x >= u.x && x < u.x + u.w && z >= u.z0 && z < u.z0 + u.h;
    const cands = [];
    for (const q of mine) {
      // along z: up the west or east wall, climbing north or south; along x: up the north or south wall
      if (q.h >= 4 && q.w >= 2) for (const lx of [q.x, q.x + q.w - 1]) for (const up of [-1, 1]) {
        const side = lx === q.x ? -1 : 1, z0 = up < 0 ? q.z : q.z + q.h - 3, hz = up < 0 ? q.z - 1 : q.z + q.h;
        let ok = inHome(lx, hz) && wall(lx, hz);
        for (let z = z0; z < z0 + 3 && ok; z++) ok = wall(lx + side, z);
        if (ok) cands.push({ q, x0: lx, z0, x1: lx, z1: z0 + 2, axis: 'z', up, head: [lx, hz] });
      }
      if (q.w >= 4 && q.h >= 2) for (const lz of [q.z, q.z + q.h - 1]) for (const up of [-1, 1]) {
        const side = lz === q.z ? -1 : 1, x0 = up < 0 ? q.x : q.x + q.w - 3, hx = up < 0 ? q.x - 1 : q.x + q.w;
        let ok = inHome(hx, lz) && wall(hx, lz);
        for (let x = x0; x < x0 + 3 && ok; x++) ok = wall(x, lz + side);
        if (ok) cands.push({ q, x0, z0: lz, x1: x0 + 2, z1: lz, axis: 'x', up, head: [hx, lz] });
      }
    }
    if (!cands.length) return false;
    const c = cands[Math.floor(r() * cands.length)];
    for (let z = c.z0; z <= c.z1; z++) for (let x = c.x0; x <= c.x1; x++) t[z * W + x] = 6;
    c.q.type = 'living'; c.q.loft = true;
    stairs.push({ f: 0, x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, axis: c.axis, up: c.up });
    u.drop = [c.q.x, c.q.z, c.q.w, c.q.h]; u.head = c.head;
    return true;
  },
  // ---------------------------------------------------------------- floors stacked
  FLOOR_H: 4.3, // one floor to the next: a room's height and the slab between
  // Storeys planned one by one (plan), into one level: each at its height (fy), the solids of all of them in one
  // world, the stairs' steps between them, railings round every drop. The level is floor 0's map, with
  // everything that's counted across floors (doors, windows, rooms, spots) gathered from all of them (and ids
  // numbered through); map.floors holds each floor's own.
  // lay.base: which floor is at ground level (0 unless there's a basement under it: floors below it are below ground).
  stack(fms, lay) {
    const FH = this.FLOOR_H, TS = this.TS, CTS = this.CTS, base = lay.base || 0;
    fms.forEach((m, f) => { m.fl = f; m.fy = (f - base) * FH; m.skirt = f ? FH - this.WALL_H : 0; });
    fms.forEach((m, f) => { const up = fms[f + 1]; m.voidAbove = up ? up.t.map((v) => (v === 5 ? 1 : 0)) : null; m.above = up || null; });
    const map = Object.assign({}, fms[base]); // (the level's own map is the ground floor's: the spawn, the outdoors)
    map.floors = fms; map.NF = fms.length; map.base = base;
    map.minY = -base * FH; // (the lowest floor: a basement's is below the ground)
    map.doors = []; map.windows = []; map.rooms = []; map.cover = []; map.wallSpots = []; map.enemySpots = [];
    fms.forEach((m, f) => {
      if (f !== base) { m.case = null; m.cabinets = []; } // (the weapon case and first aid cabinets: on the ground floor)
      for (const d of m.doors) { d.id = map.doors.length; d.fl = f; d.fy = m.fy; map.doors.push(d); }
      for (const w of m.windows) { w.id = map.windows.length; w.fl = f; w.fy = m.fy; map.windows.push(w); }
      for (const rm of m.rooms) { rm.fl = f; map.rooms.push(rm); }
      for (const c of m.cover) map.cover.push(Object.assign(c, { y: m.fy, fl: f }));
      for (const w of m.wallSpots) map.wallSpots.push(Object.assign(w, { y: m.fy, fl: f }));
      for (const sp of m.enemySpots) map.enemySpots.push([sp[0], sp[1], f]);
    });
    // a glass door's pane, counted with the windows (shot through and shot out the same way: G.Views.breakGlass,
    // G.Server.breakGlass); its mesh is the door's leaf
    for (const d of map.doors) if (d.kind === 'stair') { d.pane = { id: map.windows.length, door: d, x: d.x, z: d.z, fy: d.fy, fl: d.fl, broken: false, cells: [], len: d.w || TS }; map.windows.push(d.pane); }
    // the stairs, in metres: their footprint, the floor at their foot, which way they climb
    map.stairs = lay.stairs.map((st) => ({ f: st.f, y0: fms[st.f].fy, rise: FH, axis: st.axis, up: st.up, x0: st.x0 * CTS, x1: (st.x1 + 1) * CTS, z0: st.z0 * CTS, z1: (st.z1 + 1) * CTS }));
    // railings round every drop, but not across the head of a flight (where you step off it)
    const head = (st, ex, ez, dx, dz) => (st.axis === 'z'
      ? dz === -st.up && Math.abs(ez - (st.up < 0 ? st.z0 : st.z1)) < 0.01 && ex > st.x0 && ex < st.x1
      : dx === -st.up && Math.abs(ex - (st.up < 0 ? st.x0 : st.x1)) < 0.01 && ez > st.z0 && ez < st.z1);
    map.rails = [];
    fms.forEach((m, f) => {
      if (!f) return;
      const { W, H, t } = m;
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const v = t[z * W + x];
        if (v === 1 || v === 5) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H || t[nz * W + nx] !== 5) continue;
          const ex = (x + 0.5 + dx * 0.5) * TS, ez = (z + 0.5 + dz * 0.5) * TS;
          if (map.stairs.some((st) => st.f === f - 1 && head(st, ex, ez, dx, dz))) continue;
          map.rails.push({ f, y: m.fy, x0: dx ? ex - 0.03 : x * TS, x1: dx ? ex + 0.03 : (x + 1) * TS, z0: dz ? ez - 0.03 : z * TS, z1: dz ? ez + 0.03 : (z + 1) * TS });
        }
      }
    });
    // each railing's glass is a pane like a window's (shot through and shot out, for everyone: map.windows)
    for (const r of map.rails) {
      const alongX = r.x1 - r.x0 > r.z1 - r.z0;
      r.pane = { id: map.windows.length, rail: r, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, fy: r.y, fl: r.f, broken: false, cells: [], len: alongX ? r.x1 - r.x0 : r.z1 - r.z0, nz: alongX ? 1 : 0, nx: alongX ? 0 : 1 };
      map.windows.push(r.pane);
    }
    // one world for all of it
    const w = G.World.create();
    fms.forEach((m, f) => G.World.fromTileMap(m, { world: w, y: m.fy, skirt: m.skirt, voidAbove: m.voidAbove, ground: f === 0 && base === 0 })); // (over a basement, the ground floor has its stair holes)
    for (const st of map.stairs) G.World.stairs(w, st);
    // a railing stops you walking off the drop (glass or not); only its steel handrail stops a round: under it, the
    // glass is a pane (its solids: G.World.windowSolids), shot through and out
    for (const rl of map.rails) {
      G.World.add(w, G.World.box(rl.x0, rl.y, rl.z0, rl.x1, rl.y + this.RAIL_H, rl.z1, { kind: 'rail', ray: false }));
      G.World.add(w, G.World.box(rl.x0, rl.y + this.RAIL_H - 0.05, rl.z0, rl.x1, rl.y + this.RAIL_H, rl.z1, { kind: 'rail', move: false }));
      rl.pane.solids = []; G.World.windowSolids(w, map, rl.pane);
    }
    map.world = w; fms.forEach((m) => { m.world = w; });
    return map;
  },
  RAIL_H: 1.0,
  // which floor someone at (x, y, z) is on: the one whose floor they're standing nearest above (on a flight of
  // stairs, the floor at its foot)
  floorAt(map, x, y, z) {
    if (!map.floors) return 0;
    for (const st of map.stairs) if (x > st.x0 && x < st.x1 && z > st.z0 && z < st.z1 && y < st.y0 + st.rise + 0.3 && y > st.y0 - 0.5) return st.f; // (on its top tread too: the floor above has a drop there)
    return G.U.clamp(Math.floor((y + 0.6) / this.FLOOR_H) + (map.base || 0), 0, map.NF - 1);
  },
  floorMap(map, f) { return map.floors ? map.floors[f] : map; },
  // a flow source for something at (x, y, z): its cell, and (in a building of several floors) its floor
  src(map, x, y, z) { return [Math.floor(x / this.TS), Math.floor(z / this.TS), this.floorAt(map, x, y || 0, z)]; },

  // A warehouse: a row of offices along the back wall, then the warehouse floor (rows of pallet racks with
  // aisles between and cross-aisles through them), open at the front onto the loading dock where you come in.
  layWarehouse(r, level) {
    const U = G.U, W = 26 + Math.min(level, 4), H = 22 + Math.min(level, 3);
    const t = new Uint8Array(W * H).fill(1), rooms = [], doors = [];
    const fill = (x0, z0, w, h) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = 0; };
    // offices, 4 tiles deep, side by side with a wall between each
    const od = 4, offices = [];
    for (let x = 1; x < W - 2;) {
      let w = U.ri(r, 4, 6);
      if (W - 1 - (x + w + 1) < 4) w = W - 1 - x;
      fill(x, 1, w, od);
      offices.push(this._room(x, 1, w, od, { type: x === 1 ? 'breakroom' : U.pick(r, ['office', 'office', 'storage']) }));
      doors.push([x + U.ri(r, 1, w - 2), od + 1, 'z', r() < 0.3]); // into the warehouse
      if (x > 1 && r() < 0.5) doors.push([x - 1, U.ri(r, 2, od - 1), 'x', r() < 0.3]); // through to the next office
      x += w + 1;
    }
    // the floor inside, then the front wall, then the loading dock outside (where you come in): two roller doors
    // (rolled up: wide openings) and a door between them
    const hz = od + 2, dockH = 4, hallH = H - 2 - hz - dockH, fz = hz + hallH, out = new Uint8Array(W * H), fences = [];
    fill(1, hz, W - 2, hallH);
    fill(1, fz + 1, W - 2, dockH);
    for (let z = fz + 1; z < H; z++) for (let x = 0; x < W; x++) out[z * W + x] = 1;
    const rollers = [U.ri(r, 3, (W >> 1) - 4), U.ri(r, (W >> 1) + 2, W - 6)];
    for (const x0 of rollers) for (let x = x0; x < x0 + 3; x++) t[fz * W + x] = 0;
    doors.push([(rollers[0] + rollers[1] + 3) >> 1, fz, 'z', false, false]);
    for (let x = 0; x < W; x++) { t[(H - 1) * W + x] = 4; fences.push([x, H - 1, 'x']); }
    for (let z = fz + 1; z < H - 1; z++) for (const x of [0, W - 1]) { t[z * W + x] = 4; fences.push([x, z, 'z']); }
    const dock = this._room(1, fz + 1, W - 2, dockH, { type: 'dock', out: true });
    const hall = this._room(1, hz, W - 2, hallH, { type: 'hall' });
    rooms.push(dock, hall, ...offices);
    return { W, H, t, rooms, doors, out, fences, spawn: dock, rollers: rollers.map((x0) => [x0, fz, 3]) };
  },

  // The hangar: one big hall (the workshop, the store and the warehouse side by side in it), a wide opening in its
  // front wall, and the helipad out in front of that, open to the sky and fenced. 52 x 42 m.
  // Behind its north wall (a garage door in it) is the shooting range, in the first G.HANGAR_ROWS rows: a yard to stand in
  // at the firing line, an IPSC course on the left, a pistol range (16 m) and a rifle range (300 m), walled between and open
  // to the sky, a backstop at the far end of each.
  layHangar() {
    const R = G.HANGAR_ROWS, W = 26, H = 21 + R, hallH = 12, hz = R + 1, fz = hz + hallH, padH = 6, ox = 9, ow = 8;
    const t = new Uint8Array(W * H).fill(1), out = new Uint8Array(W * H), fences = [];
    const fill = (x0, z0, w, h) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) t[z * W + x] = 0; };
    fill(1, hz, W - 2, hallH);
    fill(1, fz + 1, W - 2, padH);
    for (let x = ox; x < ox + ow; x++) t[fz * W + x] = 0; // (the opening)
    for (let z = fz + 1; z < H; z++) for (let x = 0; x < W; x++) out[z * W + x] = 1;
    for (let x = 0; x < W; x++) { t[(H - 1) * W + x] = 4; fences.push([x, H - 1, 'x']); }
    for (let z = fz + 1; z < H - 1; z++) for (const x of [0, W - 1]) { t[z * W + x] = 4; fences.push([x, z, 'z']); }
    // the range: the yard (3 rows, x 1..17), the IPSC course on the left (x 1..5, 14 rows up: js/course.js), the pistol
    // lanes (x 7..11, 8 rows up), the rifle lanes (x 13..17, to the top)
    const yz = R - 3, laneZ = 1, rifH = yz - laneZ, pisH = 8, crsH = 14;
    fill(1, yz, 17, 3); fill(1, yz - crsH, 5, crsH); fill(7, yz - pisH, 5, pisH); fill(13, laneZ, 5, rifH);
    for (let z = yz - crsH; z < R; z++) for (let x = 1; x < 12; x++) out[z * W + x] = 1;
    for (let z = yz; z < R; z++) for (let x = 12; x < 18; x++) out[z * W + x] = 1;
    for (let z = laneZ; z < yz; z++) for (let x = 13; x < 18; x++) out[z * W + x] = 1;
    for (let x = 2; x < 5; x++) t[R * W + x] = 0; // (the garage door: a wide opening in the hall's north wall, the shutter rolled up)
    const pad = this._room(1, fz + 1, W - 2, padH, { type: 'pad', out: true }), hall = this._room(1, hz, W - 2, hallH, { type: 'hangar' });
    const yard = this._room(1, yz, 17, 3, { type: 'range', out: true }), crs = this._room(1, yz - crsH, 5, crsH, { type: 'range', out: true }), pis = this._room(7, yz - pisH, 5, pisH, { type: 'range', out: true }), rif = this._room(13, laneZ, 5, rifH, { type: 'range', out: true });
    return { W, H, t, rooms: [pad, hall, yard, crs, pis, rif], doors: [], out, fences, spawn: pad, rollers: [[ox, fz, ow], [2, R, 3]] };
  },

  // The suburbs: two detached family homes side by side on a street, the houses of interest, each with a basement, a
  // ground floor and an upstairs. Coarse tiles (2 m), north (low z) to south:
  //   the street, four tiles wide (a road with its pavements), running the whole width. You start at its west end,
  //     behind the roadblock: two patrol cars staggered across the road (a gap to walk through), with the neighbour's
  //     house on the corner between you and the houses' windows. More patrol cars at the kerb in front of the houses
  //     and across the far end.
  //   front lawns, then the houses (18-22 m across, 12-14 m deep), a narrow alley between them and a path down the
  //     east side, and the back gardens behind, joined by a gap in the fence between them.
  // Inside each house a stair hall runs front to back down its west side (two tiles wide): the front door opens into
  // it, the flight down to the basement goes down one lane of it and the flight up the other, and a door from the hall
  // into the rooms on every floor. The rooms beside it are split up for each floor on its own (living rooms, kitchen
  // and dining room on the ground floor, bedrooms and a study upstairs, storage and a den in the basement).
  // Floors: 0 the basement, 1 the ground floor (base), 2 upstairs. Upstairs, everything outside the houses is open
  // air (tile 5, open to the sky): nothing to stand on, no ceiling, and a roof over the top.
  layHouses(r, level) {
    const U = G.U, S = 4, SP = 12; // the street, S tiles deep; its west end, SP tiles, before the houses
    const grow = Math.min(level >> 1, 2);
    const hwA = U.ri(r, 9, 10) + (grow >> 1), hwB = U.ri(r, 9, 10) + (grow >> 1), hh = U.ri(r, 6, 7), yd = U.ri(r, 5, 6);
    const zF = S + 3, z0 = zF + 1, zb = z0 + hh, H = zb + yd + 2; // the front wall row, the first row inside, the back wall row
    const xA = SP + 2, xl = xA + hwA + 1, xB = xl + 2, xE = xB + hwB + 1, W = xE + 2; // house A's first column, the alley, house B's, the east path
    const houses = [{ x: xA, w: hwA }, { x: xB, w: hwB }];
    const mk = (v) => ({ t: new Uint8Array(W * H).fill(v), out: new Uint8Array(W * H), rooms: [], doors: [], fences: [], ids: new Int16Array(W * H).fill(-1) });
    const B = mk(1), Gf = mk(1), Up = mk(5);
    Up.out.fill(1);
    const fill = (F, x0, zz, w, h, v = 0) => { for (let z = zz; z < zz + h; z++) for (let x = x0; x < x0 + w; x++) F.t[z * W + x] = v; };
    const setOut = (F, x0, zz, w, h, v) => { for (let z = zz; z < zz + h; z++) for (let x = x0; x < x0 + w; x++) F.out[z * W + x] = v; };
    const fence = (x, z, axis) => { Gf.t[z * W + x] = 4; Gf.out[z * W + x] = 1; Gf.fences.push([x, z, axis]); };
    // ---- the ground floor's outdoors
    fill(Gf, 1, 1, W - 2, S); setOut(Gf, 0, 0, W, S + 1, 1); // the street
    fill(Gf, SP + 1, S + 1, W - SP - 2, zF - S - 1); setOut(Gf, SP, S + 1, W - SP, zF - S - 1, 1); // front lawns
    fill(Gf, xl, zF, 1, zb - zF + 1); setOut(Gf, xl, zF, 1, zb - zF + 1, 1); // the alley
    fill(Gf, xE, zF, 1, zb - zF + 1); setOut(Gf, xE, zF, 1, zb - zF + 1, 1); // the east path
    fill(Gf, SP + 1, zb + 1, W - SP - 2, yd); setOut(Gf, SP, zb + 1, W - SP, yd + 1, 1); // the back gardens
    // the neighbour on the corner: a front garden behind a fence, their house (not to be entered) behind it
    fill(Gf, 1, S + 1, SP - 1, 2); setOut(Gf, 0, S + 1, SP, 2, 1);
    for (let x = 1; x < SP; x++) fence(x, S + 1, 'x');
    for (let x = 0; x < W; x++) { fence(x, 0, 'x'); fence(x, H - 1, 'x'); }
    for (let z = 1; z <= S; z++) { fence(0, z, 'z'); fence(W - 1, z, 'z'); }
    for (let z = S + 1; z < H - 1; z++) { fence(SP, z, 'z'); fence(W - 1, z, 'z'); } // (the neighbour's side, and the east edge)
    for (let z = zb + 2; z <= zb + yd; z++) if (z !== zb + 3) fence(xl, z, 'z'); // between the gardens, a gap near the house
    // ---- the houses, floor by floor
    const stairs = [], entries = { 0: [], 2: [] }, HOME = { 0: ['storage', 'living', 'storage', 'office'], 1: null, 2: ['bedroom', 'bedroom', 'office', 'bedroom', 'bedroom'] };
    for (const hs of houses) {
      const a = hs.x, bL = hs.x + 1, wc = hs.x + 2, rx = hs.x + 3, rw = hs.w - 3, sz = z0 + 2; // the hall's two lanes, its wall, the rooms beside it; the stairs' first row
      for (const [f, F] of [[0, B], [1, Gf], [2, Up]]) {
        fill(F, hs.x - 1, zF, hs.w + 2, hh + 2, 1); setOut(F, hs.x - 1, zF, hs.w + 2, hh + 2, 0); // the shell
        fill(F, a, z0, 2, hh); // the stair hall
        const hall = this._room(a, z0, 2, hh, { type: 'landing', stairs: true });
        F.rooms.push(hall);
        // the stairs: up from the basement (lane a, climbing north into the hall), up from the ground floor (lane b,
        // climbing south to the landing upstairs); a drop over each flight on the floor above
        if (f === 0) { fill(F, a, sz, 1, 3, 6); stairs.push({ f: 0, x0: a, z0: sz, x1: a, z1: sz + 2, axis: 'z', up: -1 }); }
        if (f === 1) { fill(F, a, sz, 1, 3, 5); fill(F, bL, sz, 1, 3, 6); stairs.push({ f: 1, x0: bL, z0: sz, x1: bL, z1: sz + 2, axis: 'z', up: 1 }); }
        if (f === 2) { fill(F, bL, sz, 1, 3, 5); entries[2].push([bL, sz + 3]); }
        if (f === 0) entries[0].push([a, sz + 3]);
        // the rooms beside the hall, this floor's own split
        const mine = this._house({ r, t: F.t, W, ids: F.ids, rooms: F.rooms, doors: F.doors }, rx, z0, rw, hh);
        mine.forEach((q, i) => { if (HOME[f]) q.type = HOME[f][i % HOME[f].length]; q.house = houses.indexOf(hs); });
        // a door from the hall into each room along its wall (not opposite a flight or the drop beside it)
        let n = 0;
        for (const q of mine) {
          if (q.x !== rx) continue;
          const rows = []; for (let z = q.z; z < q.z + q.h; z++) if (f === 0 || z < sz || z > sz + 2) rows.push(z);
          if (!rows.length || (n && r() < 0.35)) continue;
          F.doors.push([wc, U.pick(r, rows), 'x', r() < 0.3]); n++;
        }
        if (!n) F.doors.push([wc, f === 0 ? sz + 3 : z0, 'x', false]); // (always one)
        if (f === 1) {
          F.doors.push([U.ri(r, a, bL), zF, 'z', false, false]); // the front door, into the hall
          const back = mine.filter((q) => q.z + q.h === zb && q.w >= 2), bq = back.length ? U.pick(r, back) : null; // the back door, from a room into the garden
          if (bq) { const x = bq.x + U.ri(r, 0, bq.w - 1); F.doors.push([x, zb, 'z', false, false]); if (x + 1 < bq.x + bq.w && bq.w >= 3 && r() < 0.5) F.doors.push([x + 1, zb, 'z', false, true]); }
          else F.doors.push([bL, zb, 'z', false, false]);
          F.doors.push([hs.x + hs.w, z0 + hh - 1, 'x', false]); // a side door, out of its east wall onto the alley (A) or the path (B)
        }
      }
    }
    // ---- the outdoor rooms; the street, its patrol cars
    const curb = S; // (the row along the lawns)
    const spawn = this._room(1, 1, SP - 3, S, { type: 'road', out: true });
    const road = this._room(SP - 2, 1, W - SP + 1, S, { type: 'road', out: true, cars: [
      [SP - 1, 1, false], [SP + 1, 3, false], // the roadblock: staggered across the road
      [xA + 1, curb, true], [xB + hwB - 4, curb, true], // at the kerb in front of the houses
      [W - 3, 1, false], [W - 3, 3, false], // across the far end
    ] });
    const lawnA = this._room(SP + 1, S + 1, xl - SP - 1, zF - S - 1, { type: 'lawn', out: true }), lawnB = this._room(xl, S + 1, W - xl - 1, zF - S - 1, { type: 'lawn', out: true });
    const alley = this._room(xl, zF, 1, zb - zF + 1, { type: 'alley', out: true }), path = this._room(xE, zF, 1, zb - zF + 1, { type: 'alley', out: true });
    const yardA = this._room(SP + 1, zb + 1, xl - SP - 1, yd, { type: 'yard', out: true }), yardB = this._room(xl + 1, zb + 1, W - xl - 2, yd, { type: 'yard', out: true });
    const nbr = this._room(1, S + 2, SP - 1, 1, { type: 'lawn', out: true });
    Gf.rooms.push(yardA, yardB, alley, path, lawnA, lawnB, nbr, road, spawn);
    const floor = (F, f) => ({ W, H, t: F.t, out: F.out, rooms: F.rooms, doors: F.doors, fences: F.fences, spawn: f === 1 ? spawn : F.rooms[0], entries: f === 1 ? null : entries[f], underground: f === 0 });
    return { floors: [floor(B, 0), floor(Gf, 1), floor(Up, 2)], stairs, base: 1 };
  },

  tile(map, tx, tz) {
    if (tx < 0 || tz < 0 || tx >= map.W || tz >= map.H) return 1;
    return map.t[tz * map.W + tx];
  },
  // Axis-aligned box for a solid tile (null for floor)
  boxAt(map, tx, tz) {
    const v = this.tile(map, tx, tz);
    if (v === 0) return null;
    const cx = (tx + 0.5) * this.TS, cz = (tz + 0.5) * this.TS;
    if (v === 2 || v === 4) {
      const p = map.props && map.props.get(tz * map.W + tx);
      if (p) return p.boxes[0];
      return v === 2 ? { cx, cz, hx: this.CRATE_HX, hz: this.CRATE_HX, y0: 0, h: this.CRATE_H } : { cx, cz, hx: this.TS / 2, hz: this.TS / 2, y0: 0, h: this.WALL_H };
    }
    if (v === 3) {
      const d = map.doorAt.get(tz * map.W + tx);
      if (d && d.open) return { cx, cz, hx: this.TS / 2, hz: this.TS / 2, y0: this.DOOR_H, h: this.WALL_H };
      const thin = d && d.axis === 'x';
      return { cx, cz, hx: thin ? 0.07 : this.TS / 2, hz: thin ? this.TS / 2 : 0.07, y0: 0, h: this.WALL_H, door: d };
    }
    return { cx, cz, hx: this.TS / 2, hz: this.TS / 2, y0: 0, h: this.WALL_H };
  },

  // Every solid box in a tile: walls and doors are one box, furniture can be several (a desk and its chair),
  // and small things in corners (plants, lamps) sit on floor tiles.
  boxesAt(map, tx, tz) {
    if (tx >= 0 && tz >= 0 && tx < map.W && tz < map.H && map.props) {
      const p = map.props.get(tz * map.W + tx);
      if (p) return p.boxes;
    }
    const b = this.boxAt(map, tx, tz);
    return b ? [b] : this.NONE;
  },
  NONE: [],
  // Returns {t, n:[nx,ny,nz]} — distance along the (unit) direction to the first solid surface
  // opts.glass: go through glass (listing the panes crossed, nearest first, in .glass) instead of stopping at it.
  // A hit on the view behind an outside window comes back with .view (no mark to leave there).
  raycast(map, ox, oy, oz, dx, dy, dz, maxD, opts) {
    if (map.world) return G.World.raycast(map.world, ox, oy, oz, dx, dy, dz, maxD, opts);
    const pass = !!(opts && opts.glass), crossed = pass ? [] : null;
    const TS = this.TS;
    let limit = maxD, ln = null;
    if (dy < -1e-6) { const tf = -oy / dy; if (tf < limit) { limit = tf; ln = [0, 1, 0]; } }
    else if (dy > 1e-6) {
      const tc = (this.WALL_H - oy) / dy;
      if (tc < limit) {
        // a garden has no ceiling
        const cx = Math.floor((ox + dx * tc) / TS), cz = Math.floor((oz + dz * tc) / TS);
        const open = map.out && cx >= 0 && cz >= 0 && cx < map.W && cz < map.H && map.out[cz * map.W + cx];
        if (!open) { limit = tc; ln = [0, -1, 0]; }
      }
    }
    let tx = Math.floor(ox / TS), tz = Math.floor(oz / TS);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? Math.abs(TS / dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? Math.abs(TS / dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? (dx > 0 ? (tx + 1) * TS - ox : ox - tx * TS) / Math.abs(dx) : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? (dz > 0 ? (tz + 1) * TS - oz : oz - tz * TS) / Math.abs(dz) : Infinity;
    let t = 0;
    for (let guard = 0; guard < 400 && t <= limit; guard++) {
      const bs = this.rayBoxesAt(map, tx, tz);
      if (bs.length) {
        let best = null; // boxes never leave their tile, so the nearest hit in this tile is the nearest overall
        for (const b of bs) {
          const hit = this._slab(ox, oy, oz, dx, dy, dz, b);
          if (!hit || hit.t > limit) continue;
          if (b.glass != null && pass) { if (!crossed.some((c) => c[0] === b.glass)) crossed.push([b.glass, hit.t]); continue; }
          if (!best || hit.t < best.t) { best = hit; best.view = !!b.view; best.pane = b.glass != null ? b.glass : undefined; }
        }
        if (best) { if (pass) best.glass = crossed.filter((c) => c[1] < best.t).sort((a, c) => a[1] - c[1]); return best; }
      }
      if (tmx < tmz) { t = tmx; tmx += tdx; tx += sx; } else { t = tmz; tmz += tdz; tz += sz; }
    }
    return { t: limit, n: ln, glass: pass ? crossed.sort((a, c) => a[1] - c[1]) : undefined };
  },
  // how well a sees b: 0 (blocked), 1 (clear), or seen through glass that's still whole (GLASS_SEE)
  GLASS_SEE: 0.4,
  see(map, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return 1;
    const h = this.raycast(map, ax, ay, az, dx / d, dy / d, dz / d, d, { glass: true });
    if (h.t < d - 0.05) return 0;
    return h.glass && h.glass.length ? this.GLASS_SEE : 1;
  },
  _slab(ox, oy, oz, dx, dy, dz, b) {
    let tmin = -Infinity, tmax = Infinity, n = null;
    const axes = [[ox, dx, b.cx - b.hx, b.cx + b.hx, 0], [oy, dy, b.y0, b.h, 1], [oz, dz, b.cz - b.hz, b.cz + b.hz, 2]];
    for (const [o, d, lo, hi, ax] of axes) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[ax] = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    return { t: Math.max(0, tmin), n: n || [0, 1, 0] };
  },
  los(map, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.raycast(map, ax, ay, az, dx / d, dy / d, dz / d, d).t >= d - 0.05;
  },

  // Circle-vs-tile collision. Boxes the entity is standing on top of (y >= box height) are ignored.
  // step: how high a thing can be and still be stepped up onto, not walked into (a stair's step is 0.2)
  // smooth: someone walking (stairs are slopes for them: G.World.rampAt)
  resolve(map, p, r, y = 0, step = 0.02, smooth = false) {
    if (map.world) { const q = { x: p.x, y, z: p.z }; G.World.resolve(map.world, q, r, 1.9, step, smooth); p.x = q.x; p.z = q.z; return; }
    const TS = this.TS;
    for (let iter = 0; iter < 2; iter++) {
      const x0 = Math.floor((p.x - r) / TS), x1 = Math.floor((p.x + r) / TS);
      const z0 = Math.floor((p.z - r) / TS), z1 = Math.floor((p.z + r) / TS);
      for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
        for (const b of this.boxesAt(map, tx, tz)) {
        if (y >= b.h - 0.02 || b.y0 > 1.9) continue; // stood on top of it, or walking under a door lintel
        const qx = G.U.clamp(p.x, b.cx - b.hx, b.cx + b.hx), qz = G.U.clamp(p.z, b.cz - b.hz, b.cz + b.hz);
        let ddx = p.x - qx, ddz = p.z - qz;
        const d = Math.hypot(ddx, ddz);
        if (d >= r) continue;
        if (d > 1e-5) { p.x += (ddx / d) * (r - d); p.z += (ddz / d) * (r - d); }
        else {
          // centre inside the box: push out along the shallowest axis
          const px = b.hx - Math.abs(p.x - b.cx), pz = b.hz - Math.abs(p.z - b.cz);
          if (px < pz) p.x += Math.sign(p.x - b.cx || 1) * (px + r); else p.z += Math.sign(p.z - b.cz || 1) * (pz + r);
        }
        }
      }
    }
  },
  groundAt(map, x, z, r, y, step = 0.05, smooth = false) {
    if (map.world) { const g = G.World.groundAt(map.world, x, z, r, y, step, smooth); return Number.isFinite(g) ? g : 0; }
    const TS = this.TS;
    let g = 0;
    const x0 = Math.floor((x - r) / TS), x1 = Math.floor((x + r) / TS);
    const z0 = Math.floor((z - r) / TS), z1 = Math.floor((z + r) / TS);
    for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
      for (const b of this.boxesAt(map, tx, tz)) {
        if (b.h >= this.WALL_H) continue;
        if (Math.abs(x - b.cx) < b.hx + r * 0.6 && Math.abs(z - b.cz) < b.hz + r * 0.6 && y >= b.h - 0.05) g = Math.max(g, b.h);
      }
    }
    return g;
  },

  // ---------------------------------------------------------------- getting about a building of several floors
  // Every floor's walkable cells are nodes (node = floor * W * H + cell). A flight of stairs' cells join each other
  // only along the flight, and the rest of their floor only across its foot; the cells at its head join the cells
  // just past it on the floor above. map.nav, built once: for each node, the flight it's part of (-1: none).
  nav(map) {
    if (map.navG) return map.navG;
    const { W, H } = map, WH = W * H, NF = map.NF, TS = this.TS;
    const stairOf = new Int16Array(NF * WH).fill(-1), links = new Map(), foot = new Set();
    const link = (a, b) => { for (const [p, q] of [[a, b], [b, a]]) { if (!links.has(p)) links.set(p, []); links.get(p).push(q); } };
    map.stairs.forEach((st, k) => {
      const base = st.f * WH, up = (st.f + 1) * WH;
      const cx0 = Math.round(st.x0 / TS), cx1 = Math.round(st.x1 / TS) - 1, cz0 = Math.round(st.z0 / TS), cz1 = Math.round(st.z1 / TS) - 1;
      for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) stairOf[base + z * W + x] = k;
      // the head row and the cells past it upstairs; the foot row and the cells before it downstairs
      const along = st.axis === 'z', hi = st.up < 0 ? (along ? cz0 : cx0) : (along ? cz1 : cx1), lo = st.up < 0 ? (along ? cz1 : cx1) : (along ? cz0 : cx0), d = st.up < 0 ? -1 : 1;
      for (let a = along ? cx0 : cz0; a <= (along ? cx1 : cz1); a++) {
        const cell = (u) => (along ? u * W + a : a * W + u);
        link(base + cell(hi), up + cell(hi + d));
        foot.add(base + cell(lo - d) + ',' + (base + cell(lo)));
      }
    });
    return (map.navG = { WH, NF, stairOf, links, foot });
  },
  // can you walk straight from node a to its neighbour b (both on one floor)? Off a flight only along it; onto it
  // only at its foot
  navStep(g, a, b, W) {
    const sa = g.stairOf[a], sb = g.stairOf[b];
    if (sa < 0 && sb < 0) return true;
    if (sa >= 0 && sb >= 0) return sa === sb;
    return g.foot.has(sa >= 0 ? b + ',' + a : a + ',' + b);
  },
  // the node someone at (x, y, z) stands on
  navNode(map, x, y, z) {
    const tx = Math.floor(x / this.TS), tz = Math.floor(z / this.TS);
    if (tx < 0 || tz < 0 || tx >= map.W || tz >= map.H) return -1;
    return this.floorAt(map, x, y, z) * map.W * map.H + tz * map.W + tx;
  },
  // BFS distance field (in tiles) from source tiles over walkable floor; -1 = unreachable. A building of several
  // floors: sources [x, z, floor], and the field covers every floor (up and down the stairs).
  flow(map, sources) {
    if (map.floors) return this.flow3(map, sources);
    const { W, H, t } = map;
    const dist = new Int16Array(W * H).fill(-1);
    const q = new Int32Array(W * H);
    let qh = 0, qt = 0;
    for (const [x, z] of sources) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const i = z * W + x;
      if (!(t[i] === 0 || t[i] === 3) || dist[i] >= 0) continue;
      dist[i] = 0; q[qt++] = i;
    }
    const ok = (j) => (t[j] === 0 || t[j] === 3) && dist[j] < 0;
    while (qh < qt) {
      const i = q[qh++], x = i % W, z = (i / W) | 0, d = dist[i] + 1;
      if (x > 0 && ok(i - 1)) { dist[i - 1] = d; q[qt++] = i - 1; }
      if (x < W - 1 && ok(i + 1)) { dist[i + 1] = d; q[qt++] = i + 1; }
      if (z > 0 && ok(i - W)) { dist[i - W] = d; q[qt++] = i - W; }
      if (z < H - 1 && ok(i + W)) { dist[i + W] = d; q[qt++] = i + W; }
    }
    return dist;
  },
  flow3(map, sources) {
    const g = this.nav(map), { W, H } = map, WH = g.WH, dist = new Int16Array(g.NF * WH).fill(-1), q = new Int32Array(g.NF * WH);
    const walk = (n) => { const v = map.floors[(n / WH) | 0].t[n % WH]; return v === 0 || v === 3 || v === 7; };
    let qh = 0, qt = 0;
    for (const [x, z, f] of sources) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const n = (f || 0) * WH + z * W + x;
      if (!walk(n) || dist[n] >= 0) continue;
      dist[n] = 0; q[qt++] = n;
    }
    while (qh < qt) {
      const n = q[qh++], i = n % WH, x = i % W, z = (i / W) | 0, d = dist[n] + 1;
      const go = (m) => { if (dist[m] < 0 && walk(m) && this.navStep(g, n, m, W)) { dist[m] = d; q[qt++] = m; } };
      if (x > 0) go(n - 1);
      if (x < W - 1) go(n + 1);
      if (z > 0) go(n - W);
      if (z < H - 1) go(n + W);
      const up = g.links.get(n);
      if (up) for (const m of up) if (dist[m] < 0 && walk(m)) { dist[m] = d; q[qt++] = m; }
    }
    return dist;
  },
  // a building's next waypoint: downhill (or, away, uphill) on the field from where someone stands, on their floor
  // or up or down a flight
  flowStep3(map, dist, x, z, y, away) {
    const g = this.nav(map), W = map.W, WH = g.WH, n = this.navNode(map, x, y, z);
    if (n < 0 || dist[n] < 0) return null;
    let best = null, bd = dist[n];
    const i = n % WH, tx = i % W, tz = (i / W) | 0, base = n - i;
    const take = (m, score) => { if (dist[m] < 0) return; if (away ? score > bd : score < bd) { bd = score; best = m; } };
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oz) continue;
      if (away && ox && oz) continue;
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= map.H) continue;
      const m = base + nz * W + nx;
      if (ox && oz) { // no diagonal corner-cutting (or through door frames, or on or off a flight)
        const fl = map.floors[(n / WH) | 0].t;
        if (fl[tz * W + nx] !== 0 || fl[nz * W + tx] !== 0 || g.stairOf[n] >= 0 || g.stairOf[m] >= 0) continue;
      } else if (!this.navStep(g, n, m, W)) continue;
      take(m, dist[m] + (ox && oz ? 0.4 : 0));
    }
    for (const m of g.links.get(n) || []) take(m, dist[m]);
    if (best == null) return null;
    const j = best % WH, f = (best / WH) | 0;
    return { x: ((j % W) + 0.5) * this.TS, z: (((j / W) | 0) + 0.5) * this.TS, y: map.floors[f].fy, fl: f };
  },
  // Next waypoint (world coords) that walks downhill on the flow field from (x, z) (y: their height, in a building
  // of several floors)
  flowStep(map, dist, x, z, y = 0) {
    if (map.floors) return this.flowStep3(map, dist, x, z, y, false);
    const TS = this.TS, W = map.W;
    const tx = Math.floor(x / TS), tz = Math.floor(z / TS);
    const here = dist[tz * W + tx];
    if (here < 0) return null;
    let best = null, bd = here;
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oz) continue;
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= map.H) continue;
      const nd = dist[nz * W + nx];
      if (nd < 0) continue;
      if (ox && oz && (map.t[tz * W + nx] !== 0 || map.t[nz * W + tx] !== 0)) continue; // no diagonal corner-cutting (or through door frames)
      const score = nd + (ox && oz ? 0.4 : 0);
      if (score < bd) { bd = score; best = [nx, nz]; }
    }
    if (!best) return null;
    return { x: (best[0] + 0.5) * TS, z: (best[1] + 0.5) * TS };
  },

  flowAway(map, dist, x, z, y = 0) {
    if (map.floors) return this.flowStep3(map, dist, x, z, y, true);
    const TS = this.TS, W = map.W;
    const tx = Math.floor(x / TS), tz = Math.floor(z / TS);
    const here = dist[tz * W + tx];
    if (here < 0) return null;
    let best = null, bd = here;
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + ox, nz = tz + oz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= map.H) continue;
      const nd = dist[nz * W + nx];
      if (nd > bd) { bd = nd; best = [nx, nz]; }
    }
    return best ? { x: (best[0] + 0.5) * TS, z: (best[1] + 0.5) * TS } : null;
  },
  doorNear(map, x, z, r = 1.8, y = 0) {
    let best = null, bd = r;
    for (const d of map.doors) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd && Math.abs((d.fy || 0) - y) < 2) { bd = dd; best = d; } } // (a door on this floor)
    return best;
  },

  // ----------------------------------------------------------------- meshes
  _tex(kind, base) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
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
  // breaks), and for an outside window the view behind the glass
  buildWindows(map, root, wallMat) {
    const TS = this.TS, h = TS / 2;
    map.winMeshes = [];
    // roller doors, rolled up: the wall over the opening, the shutter's drum under it and a guide down each side
    const steel = new THREE.MeshStandardMaterial({ color: 0x5d6368, roughness: 0.5, metalness: 0.6 });
    for (const [x0, x1, z] of map.rollers || []) {
      const w = x1 - x0, cx = (x0 + x1) / 2, top = 3.0;
      const lin = new THREE.Mesh(new THREE.BoxGeometry(w, this.WALL_H - top, TS), wallMat); lin.position.set(cx, (top + this.WALL_H) / 2, z); lin.layers.enable(1); root.add(lin);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, w, 16), steel); drum.rotation.z = Math.PI / 2; drum.position.set(cx, top - 0.2, z); root.add(drum);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.1), steel); lip.position.set(cx, top - 0.44, z); root.add(lip); // the shutter's bottom bar
      for (const x of [x0 + 0.05, x1 - 0.05]) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.1, top, 0.16), steel); g.position.set(x, top / 2, z); root.add(g); }
    }
    if (!map.windows || !map.windows.length) return;
    const frameMat = new THREE.MeshStandardMaterial({ color: map.theme.home >= 1 ? 0xe8e4da : 0x3a3e42, roughness: 0.6 });
    // tinted, a little reflective, seen from both sides: it has to read as glass, not a hole
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x7e98a8, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.55, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 });
    const view = map.windows.some((w) => w.ext) ? G.Furniture.outsideMaterial(G.U.rng((map.seed ^ 0x77) >>> 0), map.theme.layout === 'apartments' ? 18 : 0) : null;
    const opening = this.TOP - this.SILL;
    for (const w of map.windows) {
      const along = w.nx ? 'z' : 'x', ry = Math.atan2(-w.nx, -w.nz);
      const g = new THREE.Group(); g.position.set(w.x, 0, w.z); g.rotation.y = ry; // local: x along the wall, z out of it (toward -n... see below)
      // wall below and above (the full depth of the cell)
      const SK = map.skirt || 0, below = new THREE.Mesh(new THREE.BoxGeometry(w.len, this.SILL + SK, TS), wallMat); below.position.y = (this.SILL - SK) / 2; g.add(below);
      const above = new THREE.Mesh(new THREE.BoxGeometry(w.len, this.WALL_H - this.TOP, TS), wallMat); above.position.y = (this.TOP + this.WALL_H) / 2; g.add(above);
      for (const m of [below, above]) m.layers.enable(1);
      // the frame: sill, head, jambs and a mullion
      const fr = (bw, bh, bd, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), frameMat); m.position.set(x, y, 0); g.add(m); };
      fr(w.len, 0.05, 0.1, 0, this.SILL + 0.025); fr(w.len, 0.05, 0.08, 0, this.TOP - 0.025);
      for (const x of [-1, 1]) fr(0.05, opening, 0.08, x * (w.len / 2 - 0.025), (this.SILL + this.TOP) / 2);
      fr(0.04, opening, 0.05, 0, (this.SILL + this.TOP) / 2);
      // the pane
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w.len - 0.08, opening - 0.08), glassMat); pane.position.y = (this.SILL + this.TOP) / 2; g.add(pane);
      pane.material.side = THREE.DoubleSide; pane.renderOrder = 2;
      map.winMeshes[w.id] = pane;
      // outside: the view, at the back of the opening (n points out of the building: the group's -z)
      if (w.ext && view) {
        const v = new THREE.Mesh(new THREE.PlaneGeometry(w.len, opening), view); v.position.set(0, (this.SILL + this.TOP) / 2, -(h - 0.01)); g.add(v);
      }
      if (w.broken) pane.visible = false;
      root.add(g);
    }
  },
  // ---------------------------------------------------------------- a festival's dressing
  // The lawn, the night sky (stars and a moon), the strings of lights on their poles (bulbs, or paper lanterns
  // over the food court, each with a soft glow; the real lights along them are in map.lights), the stage's
  // truss with coloured lamps throwing beams, its backdrop, and the arch over the gate.
  buildFestival(map, root) {
    const T = THREE, f = map.fest, TS = this.TS, rnd = G.U.rng((map.seed ^ 0xfe57) >>> 0), Wm = map.W * TS, Hm = map.H * TS;
    const tx = G.Furniture.textures(rnd);
    // the lawn (worn in the lanes), paving at the gate
    const grass = tx.grass(); grass.repeat.set(map.W / 3, map.H / 3);
    const lawn = new T.Mesh(new T.PlaneGeometry(Wm, Hm), new T.MeshStandardMaterial({ map: grass, roughness: 1 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(Wm / 2, 0.003, Hm / 2); lawn.layers.enable(1); root.add(lawn);
    // the toilet block's floor, wall to wall (over the lawn, under each room's own tiles: the doorways too)
    const inside = map.rooms.filter((rm) => rm.type === 'washroom' || rm.type === 'cubicle');
    if (inside.length) {
      const x0 = Math.min(...inside.map((rm) => rm.x)) - 1, x1 = Math.max(...inside.map((rm) => rm.x + rm.w)) + 1, z0 = Math.min(...inside.map((rm) => rm.z)) - 1, z1 = Math.max(...inside.map((rm) => rm.z + rm.h)) + 1;
      const ft = tx.tile('#c8ccc8', '#7a7e7a'); ft.repeat.set(x1 - x0, z1 - z0);
      const fl = new T.Mesh(new T.PlaneGeometry((x1 - x0) * TS, (z1 - z0) * TS), new T.MeshStandardMaterial({ map: ft, roughness: 0.5 }));
      fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2 * TS, 0.0035, (z0 + z1) / 2 * TS); fl.layers.enable(1); root.add(fl);
    }
    if (f.gate) {
      const g = f.gate, pave = tx.tile('#4e4b46', '#34322e'); pave.repeat.set((g.x1 - g.x0) / 1.5, (g.z1 - g.z0) / 1.5);
      const p = new T.Mesh(new T.PlaneGeometry(g.x1 - g.x0, g.z1 - g.z0), new T.MeshStandardMaterial({ map: pave, roughness: 0.9 }));
      p.rotation.x = -Math.PI / 2; p.position.set((g.x0 + g.x1) / 2, 0.005, (g.z0 + g.z1) / 2); p.layers.enable(1); root.add(p);
    }
    // the town square's paving, the car park's asphalt with its bays painted on
    const slab = (r, tex, rep, y) => { tex.repeat.set((r.x1 - r.x0) / rep, (r.z1 - r.z0) / rep); const m = new T.Mesh(new T.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), new T.MeshStandardMaterial({ map: tex, roughness: 0.9 })); m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2); m.layers.enable(1); root.add(m); };
    if (f.plaza) slab({ x0: f.plaza.x0 - TS, x1: f.plaza.x1, z0: f.plaza.z0 - TS, z1: f.plaza.z1 + TS * 2 }, tx.tile('#6a645a', '#4a463e'), 1.2, 0.005);
    if (f.lot) {
      slab({ x0: f.lot.x0 - TS, x1: f.lot.x1 + TS, z0: f.lot.z0 - TS / 2, z1: f.lot.z1 + TS }, tx.carpet('#26282a'), 2, 0.005);
      const paint = new T.MeshBasicMaterial({ color: 0xb8b4a8 }), geos = [];
      for (const [bx0, bx1, bz0, bz1] of f.bays) {
        for (let x = bx0; x <= bx1 + 0.01; x += TS * this.K) { const g = new T.PlaneGeometry(0.1, bz1 - bz0 - 0.4); g.rotateX(-Math.PI / 2); g.translate(x, 0.008, (bz0 + bz1) / 2); geos.push(g); }
      }
      for (const g of geos) root.add(new T.Mesh(g, paint));
    }
    // street lamps: a tall post and a lantern head (their light is in map.lights)
    const postMat = new T.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.5, metalness: 0.5 }), headMat = new T.MeshBasicMaterial({ color: 0xffe2b8 });
    const postGeo = new T.CylinderGeometry(0.07, 0.1, 6, 8), headGeo = new T.BoxGeometry(0.34, 0.42, 0.34), globeGeo = new T.SphereGeometry(0.15, 10, 8);
    for (const [x, z] of f.lamps) {
      const p = new T.Mesh(postGeo, postMat); p.position.set(x, 3, z); root.add(p);
      const hd = new T.Mesh(headGeo, postMat); hd.position.set(x, 6.15, z); root.add(hd);
      const gl = new T.Mesh(globeGeo, headMat); gl.position.set(x, 5.92, z); root.add(gl);
    }
    // a lit sign over each shop's door onto the square
    {
      const SIGN = { cafe: ['CAFE', '#ffd890'], store: ['STORE', '#a8e0ff'], bar: ['BAR', '#ff8ad0'] };
      const roomAt = (fx, fz) => map.rooms.find((rm) => fx >= rm.x && fx < rm.x + rm.w && fz >= rm.z && fz < rm.z + rm.h && SIGN[rm.type]);
      for (const d of map.doors) {
        const ax = d.axis === 'x' ? 1 : 0, az = 1 - ax, cx = Math.floor(d.x / TS), cz = Math.floor(d.z / TS);
        let rm = null, s = 0;
        for (const k of [-2, 2]) { const q = roomAt(cx + ax * k, cz + az * k); if (q) { rm = q; s = -Math.sign(k); } }
        if (!rm) continue;
        const [txt, col] = SIGN[rm.type], c = document.createElement('canvas'); c.width = 256; c.height = 64;
        const g = c.getContext('2d'); g.fillStyle = '#16141a'; g.fillRect(0, 0, 256, 64); g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = col; g.shadowBlur = 16; g.fillStyle = col; g.fillText(txt, 128, 34);
        const sign = new T.Mesh(new T.PlaneGeometry(1.6, 0.4), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c) }));
        sign.position.set(d.x + ax * s * (TS / 2 + 0.03), this.DOOR_H + 0.45, d.z + az * s * (TS / 2 + 0.03)); sign.rotation.y = Math.atan2(ax * s, az * s); root.add(sign);
      }
    }
    // the sky: stars on a dome far off (no fog on them), a moon
    {
      const n = 1600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, e = Math.asin(0.08 + rnd() * 0.92), R = 145; // (inside the camera's far plane from anywhere on the field)
        pos.set([Wm / 2 + Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Hm / 2 + Math.sin(a) * Math.cos(e) * R], i * 3);
        const b = 0.35 + rnd() * 0.65, warm = rnd();
        col.set([b * (warm < 0.2 ? 1 : 0.85), b * 0.9, b * (warm > 0.8 ? 1 : 0.85)], i * 3);
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
      root.add(new T.Points(g, new T.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));
      const moon = new T.Mesh(new T.CircleGeometry(9, 32), new T.MeshBasicMaterial({ color: 0xe8ecf4, fog: false }));
      moon.position.set(Wm / 2 - 70, 120, -90); moon.lookAt(Wm / 2, 0, Hm / 2); moon.scale.setScalar(0.5); root.add(moon);
    }
    // a soft round glow for every bulb and lantern
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new T.CanvasTexture(c);
    })();
    // the strings: a pole under each end that has one, the wire sagging between, bulbs (or lanterns) along it
    const BULB = [0xfff0c8, 0xfff0c8, 0xfff0c8, 0xffb347, 0xff5a4a, 0x6aff7a, 0x5ab0ff, 0xff7ad8], LANTERN = [0xff4030, 0xff9a30, 0xffd84a, 0xff6ab0, 0x4ae0d0, 0xff4030];
    const poles = new Map(), wirePts = [], bulbs = [], lanterns = [];
    const poleMat = new T.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.6, metalness: 0.4 });
    for (const s of f.strings) {
      for (const [p, has] of [[s.a, s.pa], [s.b, s.pb]]) if (has) poles.set(p[0].toFixed(1) + ',' + p[2].toFixed(1), p);
      const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]), sag = G.U.clamp(len * 0.07, 0.25, 1.3);
      const at = (u) => new T.Vector3(s.a[0] + (s.b[0] - s.a[0]) * u, s.a[1] + (s.b[1] - s.a[1]) * u - sag * 4 * u * (1 - u), s.a[2] + (s.b[2] - s.a[2]) * u);
      for (let i = 0; i < 16; i++) { wirePts.push(at(i / 16), at((i + 1) / 16)); }
      const lan = s.kind === 'lantern', step = lan ? 1.3 : 0.55, n = Math.max(2, Math.floor(len / step));
      for (let i = 1; i < n; i++) {
        const p = at(i / n);
        if (lan) { p.y -= 0.22; lanterns.push([p, LANTERN[Math.floor(rnd() * LANTERN.length)]]); }
        else bulbs.push([p.add(new T.Vector3(0, -0.05, 0)), BULB[Math.floor(rnd() * BULB.length)]]);
      }
    }
    const poleGeo = new T.CylinderGeometry(0.06, 0.08, 1, 8);
    for (const p of poles.values()) {
      const m = new T.Mesh(poleGeo, poleMat); m.scale.y = p[1] + 0.3; m.position.set(p[0], (p[1] + 0.3) / 2, p[2]); root.add(m);
      const foot = new T.Mesh(new T.CylinderGeometry(0.25, 0.3, 0.12, 10), poleMat); foot.position.set(p[0], 0.06, p[2]); root.add(foot);
    }
    if (wirePts.length) root.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(wirePts), new T.LineBasicMaterial({ color: 0x0a0a0a })));
    const lights = (list, geo, size) => {
      if (!list.length) return;
      const im = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ color: 0xffffff }), list.length), m4 = new T.Matrix4(), c = new T.Color();
      const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
      list.forEach(([p, hex], i) => { m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m4); im.setColorAt(i, c.setHex(hex)); pos.set([p.x, p.y, p.z], i * 3); col.set([c.r * 0.9, c.g * 0.9, c.b * 0.9], i * 3); });
      root.add(im);
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
      root.add(new T.Points(g, new T.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    };
    lights(bulbs, new T.SphereGeometry(0.06, 8, 6), 0.75);
    const lg = new T.SphereGeometry(0.19, 12, 8); lg.scale(1, 1.25, 1);
    lights(lanterns, lg, 1.9);
    // the stage: a truss over it on four towers, coloured lamps on the front beam throwing beams down over the
    // stage and the front rows, a backdrop with the festival's name lit up
    const st = f.stage;
    if (st) {
      const geos = [], add = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { geo.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(rx, ry, rz))); geo.translate(x, y, z); geos.push(geo.index ? geo.toNonIndexed() : geo); };
      const H = 7.2, x0 = st.x0 + 0.4, x1 = st.x1 - 0.4, zF = st.z1 - 0.5, zB = st.z0 + 0.5;
      const chord = (ax, ay, az, bx, by, bz) => { const d = new T.Vector3(bx - ax, by - ay, bz - az), l = d.length(), g = new T.CylinderGeometry(0.025, 0.025, l, 6); g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()))); g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); geos.push(g.toNonIndexed()); };
      const truss = (a, b) => { // a box truss 0.3 m square from a to b, with zig-zag bracing
        const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = d.length(); d.normalize();
        const u = Math.abs(d.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0), s1 = new T.Vector3().crossVectors(d, u).normalize().multiplyScalar(0.15), s2 = new T.Vector3().crossVectors(d, s1).normalize().multiplyScalar(0.15);
        const corners = [s1.clone().add(s2), s1.clone().sub(s2), s1.clone().negate().sub(s2), s1.clone().negate().add(s2)];
        for (const c of corners) chord(a[0] + c.x, a[1] + c.y, a[2] + c.z, b[0] + c.x, b[1] + c.y, b[2] + c.z);
        const n = Math.max(2, Math.round(l / 0.45));
        for (let i = 0; i < n; i++) for (let k = 0; k < 4; k += 2) {
          const c1 = corners[k], c2 = corners[(k + 1) % 4], p = (i / n) * l, q = ((i + 1) / n) * l;
          chord(a[0] + d.x * p + c1.x, a[1] + d.y * p + c1.y, a[2] + d.z * p + c1.z, a[0] + d.x * q + c2.x, a[1] + d.y * q + c2.y, a[2] + d.z * q + c2.z);
        }
      };
      for (const x of [x0, x1]) for (const z of [zF, zB]) truss([x, 0, z], [x, H, z]);
      truss([x0, H, zF], [x1, H, zF]); truss([x0, H, zB], [x1, H, zB]);
      for (const x of [x0, x1]) truss([x, H, zB], [x, H, zF]);
      let n = 0; for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
      const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(pos, 3)); bg.setAttribute('normal', new T.BufferAttribute(nor, 3));
      root.add(new T.Mesh(bg, new T.MeshStandardMaterial({ color: 0xb0b4b8, roughness: 0.4, metalness: 0.8 })));
      // the lamps and their beams
      const COLS = [0xff3fa0, 0x40c0ff, 0xffb040, 0x8a50ff, 0x40ff90, 0xff5040];
      const can = new T.CylinderGeometry(0.13, 0.11, 0.3, 10);
      for (let i = 0; i < 8; i++) {
        const x = x0 + 0.6 + (i / 7) * (x1 - x0 - 1.2), color = COLS[i % COLS.length];
        const target = new T.Vector3(x + (rnd() - 0.5) * 6, 0, st.z1 + 1 + rnd() * 8), from = new T.Vector3(x, H - 0.35, zF), d = target.clone().sub(from), l = d.length();
        const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, -1, 0), d.clone().normalize());
        const lamp = new T.Mesh(can, new T.MeshBasicMaterial({ color })); lamp.position.copy(from); lamp.quaternion.copy(q); root.add(lamp);
        const beam = new T.Mesh(new T.ConeGeometry(1.4, l, 16, 1, true), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
        beam.geometry.translate(0, -l / 2, 0); beam.position.copy(from); beam.quaternion.copy(q); root.add(beam);
      }
      // the backdrop
      const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 384);
      gr.addColorStop(0, '#120a2a'); gr.addColorStop(1, '#3a0f3a'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 384);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,${120 + rnd() * 120},${150 + rnd() * 100},${0.15 + rnd() * 0.3})`; g.beginPath(); g.arc(rnd() * 1024, rnd() * 384, 4 + rnd() * 30, 0, 7); g.fill(); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 110px sans-serif';
      g.shadowColor = '#ff4fd0'; g.shadowBlur = 30; g.fillStyle = '#ffe6fa'; g.fillText('SUMMER LIGHTS', 512, 160);
      g.font = 'bold 54px sans-serif'; g.shadowColor = '#40d0ff'; g.fillStyle = '#d8f6ff'; g.fillText('MUSIC  •  FOOD  •  ART', 512, 280);
      const bt = new T.CanvasTexture(c);
      const back = new T.Mesh(new T.PlaneGeometry(x1 - x0 - 0.6, 5.2), new T.MeshBasicMaterial({ map: bt, color: 0xcccccc }));
      back.position.set((x0 + x1) / 2, 1.2 + 2.7, zB - 0.05); root.add(back);
      // an LED strip along the stage's front edge
      const lip = new T.Mesh(new T.BoxGeometry(st.x1 - st.x0 - 2.8, 0.04, 0.04), new T.MeshBasicMaterial({ color: 0x40c0ff }));
      lip.position.set((st.x0 + st.x1) / 2, 1.18, st.z1 + 0.01); root.add(lip);
    }
    // the arch over the gate (you came in under it), on the fence behind the spawn
    if (f.gate) {
      const g = f.gate, cx = (g.x0 + g.x1) / 2, z = g.z1 + TS / 2, pm = new T.MeshStandardMaterial({ color: 0x3a2a4a, roughness: 0.6 });
      for (const s of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(0.7, 5.2, 0.7), pm); p.position.set(cx + s * 3.4, 2.6, z); root.add(p); }
      const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
      const g2 = c.getContext('2d'); g2.fillStyle = '#2a1238'; g2.fillRect(0, 0, 1024, 160);
      g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.font = 'bold 96px sans-serif'; g2.shadowColor = '#ffb040'; g2.shadowBlur = 24; g2.fillStyle = '#fff2d8'; g2.fillText('WELCOME', 512, 84);
      const sign = new T.Mesh(new T.BoxGeometry(7.5, 1.2, 0.2), [pm, pm, pm, pm, new T.MeshBasicMaterial({ map: new T.CanvasTexture(c) }), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c) })]);
      sign.position.set(cx, 4.7, z); sign.rotation.y = Math.PI; root.add(sign);
    }
  },
  // A building of several floors (stack): each floor's meshes built as a storey's, raised to its height, and what
  // the level shares gathered from them: the door leaves and window panes (numbered through), the lamps, one
  // pool of real lights, the stairs' steps and the railings.
  buildStack(map) {
    const root = new THREE.Group(), th = map.theme;
    map.doorMeshes = []; map.winMeshes = []; map.lamps = [];
    for (const m of map.floors) {
      const g = this.buildMesh(m, { pool: false });
      g.position.y = m.fy;
      root.add(g);
      map.doorMeshes.push(...m.doorMeshes);
      (m.winMeshes || []).forEach((p, i) => { if (p) map.winMeshes[i] = p; });
      for (const l of m.lamps) map.lamps.push(Object.assign({}, l, { y: l.y + m.fy, fl: m.fl }));
    }
    map.caseView = map.floors[map.base || 0].caseView; map.cabViews = map.floors[map.base || 0].cabViews;
    for (const d of map.doors) if (d.pane) map.winMeshes[d.pane.id] = map.doorMeshes[d.id].userData.leaf; // (a glass door's pane: its leaf)
    // the stairs: each step a block (stone treads, painted risers), and a stringer down the open side
    const tread = new THREE.MeshStandardMaterial({ color: 0x8a847a, roughness: 0.8 }), riser = new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.9 });
    for (const st of map.stairs) for (const s of st.steps || []) {
      const w = s.max[0] - s.min[0], h = s.max[1] - s.min[1], d = s.max[2] - s.min[2];
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [riser, riser, tread, riser, riser, riser]);
      m.position.set((s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2);
      m.layers.enable(1);
      root.add(m);
    }
    // railings: a steel top rail on posts over a glass panel
    const steel = new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: 0.4, metalness: 0.7 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9ab0bc, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.4, depthWrite: false, side: THREE.DoubleSide });
    for (const r of map.rails) {
      const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, H = this.RAIL_H;
      const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02), steel); top.position.set(cx, r.y + H - 0.025, cz); root.add(top);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, H, 0.04), steel); post.position.set(r.x0 + (w > d ? 0.02 : w / 2), r.y + H / 2, r.z0 + (w > d ? d / 2 : 0.02)); root.add(post);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w - 0.04, 0.01), H - 0.12, Math.max(d - 0.04, 0.01)), glass); pane.position.set(cx, r.y + H / 2 + 0.02, cz); pane.renderOrder = 2; root.add(pane);
      if (r.pane) map.winMeshes[r.pane.id] = pane; // (hidden when it's shot out: js/views.js breakGlass)
    }
    map.lightPool = [];
    G.LightGrid.build(map); // every lamp, on every floor: js/lightgrid.js
    return root;
  },
  buildMesh(map, opts) {
    if (map.floors) return this.buildStack(map);
    const TS = this.TS, th = map.theme, root = new THREE.Group(), pool = !opts || opts.pool !== false;
    const { W, H, t } = map, SK = map.skirt || 0, va = map.voidAbove;
    // floor + ceiling (upstairs, the floor only where there is one: not over a drop)
    const ftex = this._tex('floor', th.floor); ftex.repeat.set(W / this.K, H / this.K);
    const fmat = new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.92 });
    if (!t.includes(5)) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * TS, H * TS), fmat);
      floor.rotation.x = -Math.PI / 2; floor.position.set((W * TS) / 2, 0, (H * TS) / 2);
      floor.layers.enable(1); // layer 1: what hides the evidence glow (walls, floors, doors)
      root.add(floor);
    } else {
      const cells = [];
      for (let i = 0; i < W * H; i++) if (t[i] !== 5) cells.push(i);
      const fg = new THREE.PlaneGeometry(TS, TS); fg.rotateX(-Math.PI / 2);
      const fl = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ map: this._tex('floor', th.floor), roughness: 0.92 }), cells.length), fm4 = new THREE.Matrix4();
      fl.material.map.repeat.set(1 / this.K, 1 / this.K);
      cells.forEach((i, n) => { fm4.makeTranslation(((i % W) + 0.5) * TS, 0, (Math.floor(i / W) + 0.5) * TS); fl.setMatrixAt(n, fm4); });
      fl.layers.enable(1);
      root.add(fl);
      // the slab's edge round a drop
      const slab = new THREE.MeshStandardMaterial({ color: 0xbdb6aa, roughness: 0.9 });
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        if (t[z * W + x] === 5 || t[z * W + x] === 1) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (t[(z + dz) * W + x + dx] !== 5) continue;
          const e = new THREE.Mesh(new THREE.BoxGeometry(dx ? 0.02 : TS, SK, dz ? 0.02 : TS), slab);
          e.position.set((x + 0.5 + dx * 0.5) * TS - dx * 0.01, -SK / 2, (z + 0.5 + dz * 0.5) * TS - dz * 0.01); root.add(e);
        }
      }
    }
    // ceiling over everything indoors (gardens are open to the night sky; nor under a drop in the floor above)
    const ctex = this._tex('floor', th.ceil); ctex.repeat.set(0.5, 0.5);
    const roofed = [];
    for (let i = 0; i < W * H; i++) if (!map.out[i] && !(va && va[i])) roofed.push(i);
    const ceilGeo = new THREE.PlaneGeometry(TS, TS); ceilGeo.rotateX(Math.PI / 2);
    const ceil = new THREE.InstancedMesh(ceilGeo, new THREE.MeshStandardMaterial({ map: ctex, roughness: 1 }), roofed.length);
    const cm = new THREE.Matrix4();
    // (a centimetre under the tops of the walls: the walls of the floor above stand on them, and their undersides,
    // level with the ceiling, fought it for the pixels)
    roofed.forEach((i, n) => { cm.makeTranslation(((i % W) + 0.5) * TS, this.WALL_H - 0.01, (Math.floor(i / W) + 0.5) * TS); ceil.setMatrixAt(n, cm); });
    ceil.layers.enable(1);
    root.add(ceil);

    // walls: only tiles that border floor are visible
    const walls = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const v = t[z * W + x];
      if (v === 1 && map.winAt && map.winAt.has(z * W + x)) continue; // a window: built below
      if (v === 1) {
        let vis = false;
        for (let oz = -1; oz <= 1 && !vis; oz++) for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox, nz = z + oz;
          if (nx >= 0 && nz >= 0 && nx < W && nz < H && t[nz * W + nx] !== 1) { vis = true; break; }
        }
        if (vis) walls.push([x, z]);
      }
    }
    const wtex = this._tex(th.home >= 1 ? 'plaster' : 'wall', th.wall); wtex.repeat.set(1, 2);
    const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(TS, this.WALL_H + SK, TS), new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.85 }), walls.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    walls.forEach(([x, z], i) => {
      m4.makeTranslation((x + 0.5) * TS, (this.WALL_H - SK) / 2, (z + 0.5) * TS);
      wm.setMatrixAt(i, m4);
      const s = 0.85 + Math.random() * 0.2; col.setRGB(s, s, s); wm.setColorAt(i, col);
    });
    wm.layers.enable(1);
    root.add(wm);

    // Houses seen from the garden: a pitched roof with eaves along every wall that faces it, and lit windows
    // behind drawn curtains (just the look: the wall is still solid).
    if (map.out.some((v) => v)) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a2f2c, roughness: 0.9 }), fascia = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.7 });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.6 });
      const lit = [0xffcf8a, 0xffe2b0, 0xf2c070, 0x9ab8d8].map((c) => new THREE.MeshBasicMaterial({ color: c }));
      const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.2, metalness: 0.3 });
      const rnd = G.U.rng((map.seed ^ 0x700f) >>> 0);
      const seg = new THREE.Group();
      // A home's roof: over each part of the house with the sky above it on this floor (the whole top storey, or
      // a lower part nothing's built on), a gable roof: its ridge along the long side, the two slopes down to
      // eaves past the walls, a gable at each end, fascia boards along the eaves.
      if (th.home >= 1) {
        const up = map.above, sky = new Uint8Array(W * H), seen = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) sky[i] = !map.out[i] && t[i] !== 5 && (!up || up.out[i]) ? 1 : 0; // (a hole in the floor above is its stairwell, not sky)
        const gableMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }), O = 0.35, PITCH = 0.55;
        for (let i0 = 0; i0 < W * H; i0++) {
          if (!sky[i0] || seen[i0]) continue;
          let x0 = W, z0 = H, x1 = 0, z1 = 0, n = 0;
          const stack = [i0]; seen[i0] = 1;
          while (stack.length) {
            const i = stack.pop(), x = i % W, z = (i / W) | 0; n++;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
            for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && Math.abs((j % W) - x) <= 1 && sky[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
          }
          if (n < 12) continue; // (a stray cell: a porch post, a chimney stub)
          const X0 = x0 * TS - O, X1 = (x1 + 1) * TS + O, Z0 = z0 * TS - O, Z1 = (z1 + 1) * TS + O, Y = this.WALL_H;
          const alongX = X1 - X0 >= Z1 - Z0, len = alongX ? X1 - X0 : Z1 - Z0, span = alongX ? Z1 - Z0 : X1 - X0, half = span / 2;
          const rise = Math.min(2.4, half * Math.tan(PITCH)), slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
          const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
          for (const s of [-1, 1]) { // the two slopes
            const r = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.12, alongX ? 0.12 : slope + 0.08, alongX ? slope + 0.08 : len), roofMat);
            const off = half / 2;
            r.position.set(alongX ? cx : cx + s * off, Y + rise / 2 + 0.06, alongX ? cz + s * off : cz);
            if (alongX) { r.rotation.x = s * ang; r.geometry = new THREE.BoxGeometry(len, 0.12, slope + 0.08); } else { r.rotation.z = -s * ang; r.geometry = new THREE.BoxGeometry(slope + 0.08, 0.12, len); }
            seg.add(r);
            const f = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.06, 0.22, alongX ? 0.06 : len), fascia); // (the fascia along the eaves)
            f.position.set(alongX ? cx : cx + s * (half - 0.02), Y - 0.04, alongX ? cz + s * (half - 0.02) : cz); seg.add(f);
          }
          for (const e of [-1, 1]) { // the gables, flush with the end walls
            const sh = new THREE.Shape(); sh.moveTo(-half + O, 0); sh.lineTo(half - O, 0); sh.lineTo(0, rise * (half - O) / half); sh.closePath();
            const g = new THREE.Mesh(new THREE.ShapeGeometry(sh), gableMat); g.material.side = THREE.DoubleSide;
            const ex = alongX ? cx + e * (len / 2 - O) : cx, ez = alongX ? cz : cz + e * (len / 2 - O);
            g.position.set(ex, Y, ez); g.rotation.y = alongX ? Math.PI / 2 : 0; seg.add(g);
          }
        }
      }
      root.add(seg);
    }
    G.Furniture.build(map, root, this._tex('crate', th.crate));
    this.buildWindows(map, root, wm.material);

    // ceiling lamps (emissive panels) + a limited number of real point lights
    const lampGeo = new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    lampGeo.scale(1, 0.45, 1); lampGeo.rotateX(Math.PI);
    const lampMat = new THREE.MeshBasicMaterial({ color: th.light });
    const porchMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), porchBox = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 });
    // every lamp's fitting, and where its light comes from: the light grid lights the level from them all
    // (js/lightgrid.js; a building of several floors builds it once, from every floor's lamps: buildStack)
    map.lamps = [];
    map.lights.forEach((l) => {
      if (l.kind === 'string') { map.lamps.push({ x: l.x, y: l.y, z: l.z, color: l.color, i: l.i, d: l.d }); return; } // (its bulbs: buildFestival)
      if (l.porch) { // a lantern on the wall over a back door
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.14), porchBox); box.position.set(l.x, l.y, l.z + l.porch * 0.07); root.add(box);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.18, 0.1), porchMat); glow.position.set(l.x, l.y, l.z + l.porch * 0.1); root.add(glow);
        map.lamps.push({ x: l.x, y: l.y - 0.1, z: l.z + l.porch * 0.5, color: 0xffd59a, i: 0.9, d: 11 });
        return;
      }
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(l.x, this.WALL_H, l.z);
      root.add(lamp);
      map.lamps.push({ x: l.x, y: this.WALL_H - 0.4, z: l.z, color: th.light, i: 0.85, d: 14 });
    });
    map.lightPool = [];
    if (pool) G.LightGrid.build(map);

    // doors: a lintel over the frame and a leaf on a hinge (rotation animated by G.Game.updateDoors)
    const metal = th.name === 'Bunker' || th.name === 'Research Lab' || th.name === 'Cold Storage';
    const leafMat = new THREE.MeshStandardMaterial({ color: metal ? 0x5d666e : 0x6e4a2c, roughness: metal ? 0.5 : 0.75, metalness: metal ? 0.5 : 0 });
    const lintelMat = new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.85 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xb8a060, roughness: 0.3, metalness: 0.9 });
    const vaultMat = new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.35, metalness: 0.85 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.45, metalness: 0.7 }), barMat = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.9 });
    const doorGlass = new THREE.MeshStandardMaterial({ color: 0x8fa8b4, transparent: true, opacity: 0.3, roughness: 0.08, metalness: 0.5, depthWrite: false, side: THREE.DoubleSide });
    map.doorMeshes = map.doors.map((d) => {
      const dw = d.w || TS, half = dw / 2, leafL = dw - 0.05;
      const lintel = new THREE.Mesh(d.axis === 'x' ? new THREE.BoxGeometry(TS, this.WALL_H - this.DOOR_H, dw) : new THREE.BoxGeometry(dw, this.WALL_H - this.DOOR_H, TS), lintelMat);
      lintel.position.set(d.x, (this.WALL_H + this.DOOR_H) / 2, d.z);
      lintel.layers.enable(1);
      root.add(lintel);
      const pivot = new THREE.Group();
      const vault = d.kind === 'vault';
      const glassDoor = d.kind === 'stair', LH = this.DOOR_H - 0.04;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafL, LH, vault ? 0.2 : 0.05), vault ? vaultMat : glassDoor ? doorGlass : leafMat);
      if (glassDoor) {
        // a stairwell door: a glass leaf in a steel frame. It swings away from the side with the push bar (the bar
        // across the middle), toward the side with the pull handle (upright, by the latch edge).
        const push = d.mirror ? -1 : 1, part = (w, h, dd, x, y, z, mat = steelMat) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat); p.position.set(x, y, z); pivot.add(p); return p; };
        for (const x of [0.02 + 0.04, leafL + 0.02 - 0.04]) part(0.08, LH, 0.06, x, LH / 2); // stiles
        part(leafL, 0.08, 0.06, leafL / 2 + 0.02, LH - 0.04); part(leafL, 0.22, 0.06, leafL / 2 + 0.02, 0.11); // top rail, kick plate
        // the push bar: a bar across the middle on two brackets, its end by the latch
        const bz = push * 0.075;
        part(leafL - 0.3, 0.05, 0.035, leafL / 2 + 0.06, 1.0, bz, barMat);
        for (const x of [0.22, leafL - 0.08]) part(0.05, 0.07, 0.05, x, 1.0, push * 0.05, steelMat);
        // the pull handle on the other face: an upright bar on two stand-offs
        part(0.03, 0.42, 0.03, leafL - 0.1, 1.05, -push * 0.085, barMat);
        for (const y of [0.88, 1.22]) part(0.025, 0.025, 0.06, leafL - 0.1, y, -push * 0.055, barMat);
      }
      if (vault) { // the locking wheel and bolts on the outside face, rivets round the edge
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 20), knobMat);
        wheel.position.set(leafL * (d.mirror ? 0.3 : 0.7), 1.2, 0.13); pivot.add(wheel);
        for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.03), knobMat); sp.position.copy(wheel.position); sp.rotation.z = k * Math.PI / 3; pivot.add(sp); }
        for (const y of [0.3, 1.2, 2.0]) { const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.06), knobMat); bolt.position.set(d.mirror ? 0.06 : leafL - 0.06, y, 0.12); pivot.add(bolt); }
      }
      leaf.position.set(leafL / 2 + 0.02, (this.DOOR_H - 0.04) / 2, 0);
      leaf.layers.enable(1);
      pivot.add(leaf);
      pivot.userData.leaf = leaf; // (bullet holes and blood on it go with it: G.R.onDoor)
      if (!glassDoor) for (const side of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), knobMat); k.position.set(leafL - 0.08, 1.0, side * 0.045); pivot.add(k); }
      // hinge on one jamb; the second leaf of a double door hinges on the opposite jamb and swings the other way
      const m = d.mirror ? -1 : 1;
      if (d.axis === 'x') { pivot.position.set(d.x, 0, d.z - half * m); pivot.rotation.y = -Math.PI / 2 * m; }
      else { pivot.position.set(d.x - half * m, 0, d.z); if (d.mirror) pivot.rotation.y = Math.PI; }
      pivot.userData = { base: pivot.rotation.y, ang: d.open ? 1 : 0, sign: m, leaf };
      pivot.rotation.y = pivot.userData.base + (d.open ? Math.PI / 2 * 0.95 * m : 0);
      root.add(pivot);
      return pivot;
    });

    if (map.fest) this.buildFestival(map, root);
    // (no extraction zone: the squad votes to leave once order's restored)

    // the weapon case: a hard-shell long-gun case lying along the wall. The lid is hinged at the back (on the
    // wall side); the weapon lies in the foam. What's in it and whether it's open: G.Views.syncCase.
    if (map.case) {
      const M = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
      const shell = M(0x2b3026, 0.65), steel = M(0x9aa0a6, 0.3, 0.8), foam = M(0x1c1d20, 1), box = (w, h, d, m, x, y, z, parent) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
      const g = new THREE.Group(), Lc = 1.35, D = 0.4, H0 = 0.075, H1 = 0.055;
      // bottom half: floor, walls, foam
      box(Lc, 0.012, D, shell, 0, 0.006, 0, g);
      for (const s of [-1, 1]) { box(Lc, H0, 0.014, shell, 0, H0 / 2, s * (D / 2 - 0.007), g); box(0.014, H0, D, shell, s * (Lc / 2 - 0.007), H0 / 2, 0, g); }
      box(Lc - 0.028, 0.02, D - 0.028, foam, 0, 0.022, 0, g);
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) box(0.03, H0 + 0.002, 0.01, shell, -0.55 + i * 0.22, H0 / 2, s * (D / 2 + 0.004), g);
      for (const x of [-0.42, 0.42]) box(0.06, 0.04, 0.012, steel, x, H0 - 0.006, D / 2 + 0.008, g);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12, Math.PI), M(0x111111, 0.8));
      handle.rotation.set(Math.PI / 2, 0, Math.PI); handle.position.set(0, 0.045, D / 2 + 0.012); g.add(handle);
      // the lid, built closed around its hinge line
      const lid = new THREE.Group();
      lid.position.set(0, H0, -D / 2);
      g.add(lid);
      box(Lc, 0.012, D, shell, 0, H1 - 0.006, D / 2, lid);
      for (const s of [-1, 1]) { box(Lc, H1, 0.014, shell, 0, H1 / 2, D / 2 + s * (D / 2 - 0.007), lid); box(0.014, H1, D, shell, s * (Lc / 2 - 0.007), H1 / 2, D / 2, lid); }
      box(Lc - 0.028, 0.018, D - 0.028, foam, 0, H1 - 0.021, D / 2, lid);
      for (let i = 0; i < 6; i++) box(0.03, 0.006, D + 0.004, shell, -0.55 + i * 0.22, H1 + 0.002, D / 2, lid);
      for (const x of [-0.5, 0.5]) box(0.05, 0.012, 0.016, steel, x, 0.004, -0.004, lid); // hinges
      box(0.18, 0.002, 0.08, new THREE.MeshBasicMaterial({ color: 0xffb02e }), -0.3, H1 + 0.006, D / 2, lid);
      const holder = new THREE.Group();
      holder.position.y = 0.032;
      g.add(holder);
      g.position.set(map.case.x, 0, map.case.z); g.rotation.y = map.case.yaw;
      root.add(g);
      map.caseView = { g, lid, holder, open: 0, code: null, synced: false };
    }
    // first aid cabinets: a white steel box on the wall with a red cross on its door (hinged on the left),
    // two shelves inside with whatever's left in it. Contents and door: G.Views.syncCabs.
    map.cabViews = (map.cabinets || []).map((c) => {
      const M = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
      const white = M(0xe9e7e2, 0.45, 0.3), inner = M(0xd6d3cc, 0.8), red = new THREE.MeshBasicMaterial({ color: 0xc0201a });
      const box = (w, h, d, m, x, y, z, parent) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
      const g = new THREE.Group(), Wd = 0.44, Hh = 0.52, D = 0.15, Y = 1.32;
      box(Wd, Hh, 0.012, inner, 0, Y, -D / 2 + 0.006, g); // back
      for (const s of [-1, 1]) { box(0.014, Hh, D, white, s * (Wd / 2 - 0.007), Y, 0, g); box(Wd, 0.014, D, white, 0, Y + s * (Hh / 2 - 0.007), 0, g); }
      box(Wd - 0.03, 0.01, D - 0.02, inner, 0, Y, 0, g); // the shelf
      const door = new THREE.Group();
      door.position.set(-Wd / 2, Y, D / 2);
      g.add(door);
      box(Wd, Hh, 0.016, white, Wd / 2, 0, 0.008, door);
      box(0.2, 0.06, 0.004, red, Wd / 2, 0.02, 0.018, door); box(0.06, 0.2, 0.004, red, Wd / 2, 0.02, 0.018, door);
      box(0.012, 0.08, 0.02, M(0x8a8f94, 0.3, 0.8), Wd - 0.04, -0.05, 0.026, door); // the handle
      // up to six things on the two shelves
      const slots = [];
      for (let i = 0; i < 6; i++) {
        const m = box(0.09, 0.1, 0.08, M(0xffffff, 0.8), -0.14 + (i % 3) * 0.14, Y + (i < 3 ? -0.2 : 0.06), -0.01, g);
        m.visible = false; slots.push(m);
      }
      g.position.set(c.x, 0, c.z); g.rotation.y = c.yaw;
      root.add(g);
      return { g, door, slots, open: 0, key: null };
    });
    return root;
  },
};
