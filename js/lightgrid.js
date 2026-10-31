'use strict';
// The light grid: every lamp in the level lights its surroundings, at a fixed cost however many there are.
//
// A real THREE.PointLight costs every lit pixel a pass over it (three.js shades forward, with no culling per light),
// and changing how many there are recompiles every shader. Measured on the festival (115 lamps): 12 lights put 40%
// on a frame, 48 lights 160%, 96 lights 320% (and a 12 s recompile, in software). So only a dozen ever were real,
// handed to the lamps nearest you: the rest stayed dark (the far end of a corridor), and as you moved lamps
// switched on and off as they joined and left the dozen (the festival's flicker).
//
// Instead, when a level is built, each lamp's light is worked out over the floor of the level, tile by tile (the
// fine grid, 2/3 m), stopped by walls (a line from the lamp to the tile through no wall), falling off as a point
// light's does (three.js' own: (1 - d / distance) ^ decay). Each tile keeps the light reaching it (RGB) and where it
// comes from on average (a direction, shorter the more it comes from all round). That goes in two textures (one
// layer per floor, stacked), and every lit material reads them: one texture lookup per pixel, however many lamps.
//   - A surface takes the light at its own spot on the floor plan (a wall: just off its face, on the side it faces,
//     so a room's light doesn't reach through the wall to the next), from the layer of the floor it's on, and turns
//     it by how squarely it faces where the light comes from (half-Lambert: a floor under a lamp gets it all, a wall
//     beside it half or so).
//   - Walls hold no light: each tile also stores 1 if it's open, 0 if it's wall, the light premultiplied by it, so
//     the texture's own filtering averages only the open tiles round a spot (the shader divides by the filtered
//     weight). A thin wall's two sides never mix.
//   - It's on only while the level itself is drawn (G.R.render): the gunsmith's and the icons' renderers share the
//     materials, and don't want the level's lamps.
// Dynamic lights (muzzle flashes, weapon lights, explosions) are still real lights.
G.LightGrid = (() => {
  const T = THREE;
  const blank = new T.DataTexture(new Uint16Array(4), 1, 1, T.RGBAFormat, T.HalfFloatType); blank.needsUpdate = true;
  // the uniforms every patched material shares (one object: changing a value changes it everywhere)
  const U = {
    lgLight: { value: blank }, lgDir: { value: blank },
    lgGrid: { value: new T.Vector4(0, 0, 1, 0) }, // x0, z0 (the map's corner, metres), cell size, on (0/1)
    lgSize: { value: new T.Vector4(1, 1, 1, 0) }, // W, H (cells), floors, where the lowest floor's layer starts (y)
    lgFloorH: { value: 4.3 },
    lgPaint: { value: blank }, // (residents' wall colours, a cell of the floor plan each: js/homes.js paint)
  };
  let built = false;
  // bounce: how much of what a surface reflects comes back into the room (on top of its colour: the theme's walls',
  // floor's and ceiling's, js below); bounces: how many times it goes round; sky: the night sky's (the theme's fill)
  // through what's open to it, a window, a doorway; fill: what's left of the flat fill everywhere (js/render.js)
  const opts = { bounce: 1.75, bounces: 2, sky: 1, fill: 0.25 };

  // every lit material reads the grid (added to its shader as three.js compiles it)
  const VS_HEAD = 'varying vec3 vLgP;\nvarying vec3 vLgN;\n';
  const VS_BODY = `
    { vec4 lgp = vec4(transformed, 1.0); vec3 lgn = objectNormal;
      #ifdef USE_INSTANCING
      lgp = instanceMatrix * lgp; lgn = mat3(instanceMatrix) * lgn;
      #endif
      lgp = modelMatrix * lgp; vLgP = lgp.xyz; vLgN = normalize(mat3(modelMatrix) * lgn); }`;
  const FS_HEAD = `varying vec3 vLgP;\nvarying vec3 vLgN;\nuniform sampler2D lgLight;\nuniform sampler2D lgDir;\nuniform vec4 lgGrid;\nuniform vec4 lgSize;\nuniform float lgFloorH;\nuniform sampler2D lgPaint;\n`;
  // A wall's colour by the room it faces (a material with LG_PAINT: only a level with a resident's room). A wall cell is one
  // box with a room on each side, so the box can't be tinted: each face takes it from the floor plan, just off the face on
  // its own side, as it does the light, so the room next door keeps its own, and so do a wall's faces once they've been
  // shot (js/damage.js: the same material). Stored as a share of the theme's wall colour, halved to fit a byte; a: 0 not
  // painted, 0.5 painted, 1 papered (a faint stripe up the wall).
  const FS_PAINT = `
    #include <color_fragment>
    #ifdef LG_PAINT
    if (lgGrid.w > 0.5) {
      vec3 lpn = normalize(vLgN);
      if (abs(lpn.y) < 0.5) {
        float lpf = clamp(floor((vLgP.y - lgSize.w) / lgFloorH), 0.0, lgSize.z - 1.0);
        vec2 lpc = (vLgP.xz + lpn.xz * 0.3 - lgGrid.xy) / lgGrid.z;
        lpc.y = clamp(lpc.y, 0.5, lgSize.y - 0.5) + lpf * lgSize.y;
        vec4 lpp = texture2D(lgPaint, vec2(lpc.x / lgSize.x, lpc.y / (lgSize.y * lgSize.z)));
        if (lpp.a > 0.25) {
          diffuseColor.rgb *= lpp.rgb * 2.0;
          if (lpp.a > 0.75) diffuseColor.rgb *= 1.0 - 0.07 * step(0.5, fract((abs(lpn.x) > 0.5 ? vLgP.z : vLgP.x) / 0.36));
        }
      }
    }
    #endif`;
  const FS_BODY = `
    if (lgGrid.w > 0.5) {
      vec3 lgn = normalize(vLgN);
      float lgf = clamp(floor((vLgP.y - lgSize.w) / lgFloorH), 0.0, lgSize.z - 1.0); // (which floor's layer)
      vec2 lgc = (vLgP.xz + lgn.xz * 0.3 - lgGrid.xy) / lgGrid.z; // (in cells; a wall's face samples just off it, its own side)
      lgc.y = clamp(lgc.y, 0.5, lgSize.y - 0.5) + lgf * lgSize.y;
      vec2 lguv = vec2(lgc.x / lgSize.x, lgc.y / (lgSize.y * lgSize.z));
      vec4 lgL = texture2D(lgLight, lguv), lgD = texture2D(lgDir, lguv);
      if (lgL.a > 0.02) {
        vec3 lgdir = lgD.rgb / lgL.a;
        float lgturn = clamp(0.5 + 0.5 * dot(lgn, lgdir), 0.0, 1.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * (lgL.rgb / lgL.a) * lgturn;
      }
    }
    #include <lights_fragment_end>`;
  function patch(shader) {
    if (!shader.fragmentShader.includes('#include <lights_fragment_end>') || !shader.vertexShader.includes('#include <worldpos_vertex>')) return;
    Object.assign(shader.uniforms, U);
    shader.vertexShader = VS_HEAD + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + VS_BODY);
    shader.fragmentShader = FS_HEAD + shader.fragmentShader.replace('#include <color_fragment>', FS_PAINT).replace('#include <lights_fragment_end>', FS_BODY);
  }
  for (const C of [T.MeshStandardMaterial, T.MeshLambertMaterial, T.MeshPhongMaterial]) C.prototype.onBeforeCompile = patch;
  // and anything can be shaded from a weapon light (js/render.js), not only what's been told to
  Object.defineProperty(T.Mesh.prototype, 'receiveShadow', { get: () => true, set() {} });

  // ---- building it
  // (A lamp's colour is a tint of white, picked by eye: taken as written, not decoded from sRGB as a surface's is. Decoded,
  // a warm white's blue drops by a third and the room goes amber: js/util.js.)
  // The doors. Everything's worked out with every opaque door shut (a glass one lets the light through either way),
  // and each door keeps a layer of its own: what reaches past it once it's open, and its own doorway, lit. As a door
  // swings, its layer's blended in by how far open it is: only the tiles it reaches change (on the CPU, the texture
  // sent again), and the shader's the same single lookup. (A line through two shut doors stays dark: a room two
  // doors away lights up only through what each door alone lets by.)
  //   sums per tile: light (RGB), where it comes from weighted by how bright (xyz), how bright (1), open (1)
  const K = 8;
  let G0 = null; // { W, H, NF, N, cur (sums, K a tile), hl, hd (half floats sent), tl, td (textures), layers: [door id] -> { at, v } , k: [door id] -> how far open it counts }
  function build(map) {
    const L = G.Level, TS = L.TS, floors = map.floors || [map], NF = floors.length, W = map.W, H = map.H, N = W * H;
    const col = new T.Color(), DECAY = 1.6, t0 = performance.now();
    const cur = new Float32Array(N * NF * K), doors = map.doors || [], layers = doors.map(() => null), shutAt = [], winAt = [];
    // the sky: the theme's fill (as js/render.js had it everywhere), on what's open to it (not the hangar's: its
    // daylight stays the flat fill)
    const th = map.theme || {}, skyI = th.hub ? 0 : (th.hemiI || 0.26) ** 2 * opts.sky, skyHex = th.hemi || th.light || 0xffffff;
    const shutOf = (d) => d.kind !== 'stair'; // (a glass one: the light goes through it)
    floors.forEach((fm, f) => {
      const t = fm.t, fy = fm.fy || 0, base = f * N;
      const doorAt = new Map(); // (this floor's shut doorway cells)
      for (const d of doors) if ((d.fl || 0) === f && shutOf(d)) for (const c of d.cells || [d.i]) doorAt.set(c, d);
      shutAt[f] = doorAt;
      // its windows' cells: glass, the light goes through (they're wall to everything else)
      const win = new Set(); winAt[f] = win;
      for (const w of map.windows || []) if ((w.fl || 0) === f) for (const c of w.cells) win.add(c);
      for (let i = 0; i < N; i++) if (t[i] !== 1 && !doorAt.has(i)) cur[(base + i) * K + 7] = 1; // (open: a doorway's open only with its door)
      const lamps = (map.lamps || []).filter((l) => (map.floors ? (l.fl || 0) === f : true));
      const into = (d, gi, a, dx, dy, dz, lum) => {
        let o;
        if (d) { const ly = layers[d.id] || (layers[d.id] = new Map()); o = ly.get(gi); if (!o) { o = new Float32Array(K); ly.set(gi, o); } } else o = cur.subarray(gi * K, gi * K + K);
        o[0] += col.r * a; o[1] += col.g * a; o[2] += col.b * a; o[3] += dx * lum; o[4] += dy * lum; o[5] += dz * lum; o[6] += lum;
      };
      for (const l of lamps) {
        col.setHex(l.color, T.LinearSRGBColorSpace); const k = l.i, ly = l.y - fy, r = l.d;
        const x0 = Math.max(0, Math.floor((l.x - r) / TS)), x1 = Math.min(W - 1, Math.floor((l.x + r) / TS));
        const z0 = Math.max(0, Math.floor((l.z - r) / TS)), z1 = Math.min(H - 1, Math.floor((l.z + r) / TS));
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const i = z * W + x;
          if (t[i] === 1) continue;
          const cx = (x + 0.5) * TS, cz = (z + 0.5) * TS, dx = l.x - cx, dy = ly - 1.0, dz = l.z - cz, d = Math.hypot(dx, dy, dz);
          if (d >= r) continue;
          // a line from the lamp to the tile: through no wall (it may start in one: a lantern on a wall), and through
          // at most one shut door (then it's that door's light). A doorway itself is lit by its own door's opening.
          const own = doorAt.get(i), flat = Math.hypot(dx, dz), steps = Math.ceil(flat / (TS * 0.4));
          let blocked = false, via = own || null;
          for (let s = 1; s < steps && !blocked; s++) {
            const u = s / steps, along = flat * (1 - u);
            if (along < 0.35) continue;
            const j = Math.floor((cz + dz * u) / TS) * W + Math.floor((cx + dx * u) / TS);
            if (j === i) continue;
            if (t[j] === 1 && !win.has(j)) { blocked = true; break; }
            const dd = doorAt.get(j);
            if (dd && dd !== via) { if (via) blocked = true; else via = dd; }
          }
          if (blocked) continue;
          const a = Math.pow(1 - d / r, DECAY) * k;
          into(via, base + i, a, dx / d, dy / d, dz / d, a * (col.r + col.g + col.b) / 3);
        }
      }
      // the sky: straight down on whatever's open to it; through an outside window (the city's glow), onto the room's
      // side of it, from the window
      if (skyI > 0) {
        col.setHex(skyHex, T.LinearSRGBColorSpace); const lum = (col.r + col.g + col.b) / 3;
        if (fm.out) for (let i = 0; i < N; i++) if (fm.out[i] && t[i] !== 1 && !doorAt.has(i)) into(null, base + i, skyI, 0, 1, 0, skyI * lum);
        for (const w of map.windows || []) if ((w.fl || 0) === f && w.ext) for (const c of w.cells) {
          const r = c - w.nx - w.nz * W;
          if (r >= 0 && r < N && t[r] !== 1) into(null, base + r, skyI * 0.6, w.nx * 0.8, 0.6, w.nz * 0.8, skyI * 0.6 * lum);
        }
      }
      // a doorway's open weight comes with its door
      for (const [c, d] of doorAt) { const ly = layers[d.id] || (layers[d.id] = new Map()); let o = ly.get(base + c); if (!o) { o = new Float32Array(K); ly.set(base + c, o); } o[7] = 1; }
    });
    // ---- the light that bounces: off the floor, the walls, the ceiling, back into the room. The light is spread over
    // the open floor round it, stopped by walls and shut doors as the light was (through glass: a window's cells pass
    // it on, though nothing's lit in them) (a few dozen passes of each open tile taking the average of itself and its
    // open neighbours: a blur that stays in the room), turned the colour of the room (RHO: the theme's floor, walls and
    // ceiling, what each reflects), BOUNCE of that added back, and that spread and added again (BOUNCES: each goes
    // further, round corners, down a corridor). It comes mostly up off the floor (UP: so the ceiling, which no lamp
    // hanging from it lights, gets the most of it, the walls half, the floor least).
    //   A door's layer is what it changes, open: everything round it (the base's light and its own) bounced with its
    // doorway open, less the base's bounced with it shut (a dark room next to a lit one gets the lit one's glow through
    // the door, the street's sky comes in; the lit room loses a little out of it).
    //   Open to the sky, most of it goes up and away (OUTB of it stays).
    const BOUNCE = opts.bounce, NB = opts.bounces, PASSES = 28, UP = 0.6, REACH = PASSES * NB, OUTB = 0.3;
    // (what the room reflects: its colour, half as strong as the paint's (a beige corridor doesn't go yellow), and how
    // much, the square root of the paint's (its textures darken it, and the furniture in it's lighter than a foundry's
    // floor): a pale room's about 0.45 a bounce, at most 0.5, a dark one's 0.3)
    const RHO = (() => {
      const c = new T.Color(), out = [0, 0, 0];
      for (const [hex, k] of [[th.floor, 0.45], [th.wall, 0.4], [th.ceil, 0.15]]) { c.set(hex || '#808080'); out[0] += c.r * k; out[1] += c.g * k; out[2] += c.b * k; }
      const m = (out[0] + out[1] + out[2]) / 3 || 1, mag = Math.min(0.5, Math.sqrt(m * 0.25) * BOUNCE);
      return out.map((v) => mag * (0.5 + 0.5 * v / m));
    })();
    // open: 1 a tile the light spreads over, a bw x bh box of them
    const spread = (src, open, bw, bh) => { // src: RGB+lum a tile (4), over the box (left as it is)
      let a = Float32Array.from(src), b = new Float32Array(a.length);
      for (let pass = 0; pass < PASSES; pass++) {
        for (let z = 0, i = 0; z < bh; z++) for (let x = 0; x < bw; x++, i++) {
          const o = i * 4;
          if (!open[i]) { b[o] = b[o + 1] = b[o + 2] = b[o + 3] = 0; continue; }
          let n = 1, r = a[o], g = a[o + 1], bl = a[o + 2], l = a[o + 3];
          if (x > 0 && open[i - 1]) { const q = o - 4; r += a[q]; g += a[q + 1]; bl += a[q + 2]; l += a[q + 3]; n++; }
          if (x < bw - 1 && open[i + 1]) { const q = o + 4; r += a[q]; g += a[q + 1]; bl += a[q + 2]; l += a[q + 3]; n++; }
          if (z > 0 && open[i - bw]) { const q = o - bw * 4; r += a[q]; g += a[q + 1]; bl += a[q + 2]; l += a[q + 3]; n++; }
          if (z < bh - 1 && open[i + bw]) { const q = o + bw * 4; r += a[q]; g += a[q + 1]; bl += a[q + 2]; l += a[q + 3]; n++; }
          const k = 1 / n; b[o] = r * k; b[o + 1] = g * k; b[o + 2] = bl * k; b[o + 3] = l * k;
        }
        [a, b] = [b, a];
      }
      return a;
    };
    const bounced = (src, open, bw, bh) => {
      const acc = new Float32Array(src.length);
      let s = src;
      for (let n = 0; n < NB; n++) {
        s = spread(s, open, bw, bh);
        for (let q = 0; q < s.length; q += 4) { s[q] *= RHO[0]; s[q + 1] *= RHO[1]; s[q + 2] *= RHO[2]; s[q + 3] = (s[q] + s[q + 1] + s[q + 2]) / 3; acc[q] += s[q]; acc[q + 1] += s[q + 1]; acc[q + 2] += s[q + 2]; acc[q + 3] += s[q + 3]; }
      }
      return acc;
    };
    floors.forEach((fm, f) => {
      const base = f * N, doorAt = shutAt[f], win = winAt[f], out0 = fm.out;
      // (takes light: open floor; passes it on, the doors shut: that, or glass)
      const lit = new Uint8Array(N), shut = new Uint8Array(N);
      for (let i = 0; i < N; i++) { lit[i] = cur[(base + i) * K + 7] > 0.5 ? 1 : 0; shut[i] = lit[i] || win.has(i) ? 1 : 0; }
      const keep = (i) => (out0 && out0[i] ? OUTB : 1);
      // the base: everything with the doors shut
      const src = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) { const o = (base + i) * K; src[i * 4] = cur[o]; src[i * 4 + 1] = cur[o + 1]; src[i * 4 + 2] = cur[o + 2]; src[i * 4 + 3] = cur[o + 6]; }
      const out = bounced(src, shut, W, H);
      // each door's (worked out before the base's bounce goes in: from the light as it came off the lamps and the sky)
      doors.forEach((d) => {
        const ly = layers[d.id];
        if (!ly || (d.fl || 0) !== f) return;
        let x0 = W, z0 = H, x1 = 0, z1 = 0;
        for (const gi of ly.keys()) { const i = gi - base, x = i % W, z = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
        x0 = Math.max(0, x0 - REACH); z0 = Math.max(0, z0 - REACH); x1 = Math.min(W - 1, x1 + REACH); z1 = Math.min(H - 1, z1 + REACH);
        const bw = x1 - x0 + 1, bh = z1 - z0 + 1, sb = new Float32Array(bw * bh * 4), ms = new Uint8Array(bw * bh);
        for (let z = z0, j = 0; z <= z1; z++) for (let x = x0; x <= x1; x++, j++) { const q = j * 4, i = z * W + x, p = i * 4; sb[q] = src[p]; sb[q + 1] = src[p + 1]; sb[q + 2] = src[p + 2]; sb[q + 3] = src[p + 3]; ms[j] = shut[i]; }
        const so = Float32Array.from(sb), mo = Uint8Array.from(ms);
        for (const [gi, o] of ly) { const i = gi - base, q = ((((i / W) | 0) - z0) * bw + (i % W) - x0) * 4; so[q] += o[0]; so[q + 1] += o[1]; so[q + 2] += o[2]; so[q + 3] += o[6]; }
        for (const c of d.cells || [d.i]) { const x = c % W, z = (c / W) | 0; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) mo[(z - z0) * bw + x - x0] = 1; }
        const rOpen = bounced(so, mo, bw, bh), rShut = bounced(sb, ms, bw, bh);
        for (let z = z0, j = 0; z <= z1; z++) for (let x = x0; x <= x1; x++, j++) {
          const q = j * 4, i = z * W + x;
          if (!(lit[i] || (mo[j] && !ms[j] && !win.has(i)))) continue;
          const k = keep(i), dl = (rOpen[q + 3] - rShut[q + 3]) * k;
          if (Math.abs(dl) < 1e-5) continue;
          const gi = base + i; let o = ly.get(gi); if (!o) { o = new Float32Array(K); ly.set(gi, o); }
          o[0] += (rOpen[q] - rShut[q]) * k; o[1] += (rOpen[q + 1] - rShut[q + 1]) * k; o[2] += (rOpen[q + 2] - rShut[q + 2]) * k; o[4] -= dl * UP; o[6] += dl;
        }
      });
      for (let i = 0; i < N; i++) { const o = (base + i) * K, k = keep(i); if (!lit[i]) continue; cur[o] += out[i * 4] * k; cur[o + 1] += out[i * 4 + 1] * k; cur[o + 2] += out[i * 4 + 2] * k; cur[o + 4] -= out[i * 4 + 3] * UP * k; cur[o + 6] += out[i * 4 + 3] * k; }
    });
    dispose();
    const tex = (data) => {
      const tx = new T.DataTexture(data, W, H * NF, T.RGBAFormat, T.HalfFloatType);
      tx.magFilter = tx.minFilter = T.LinearFilter; tx.wrapS = tx.wrapT = T.ClampToEdgeWrapping; tx.generateMipmaps = false; tx.needsUpdate = true;
      return tx;
    };
    const hl = new Uint16Array(N * NF * 4), hd = new Uint16Array(N * NF * 4);
    G0 = { W, H, NF, N, cur, hl, hd, tl: tex(hl), td: tex(hd), dirty: new Set(),
      layers: layers.map((ly) => { if (!ly) return null; const at = Int32Array.from(ly.keys()), v = new Float32Array(at.length * K); let n = 0; for (const o of ly.values()) v.set(o, K * n++); return { at, v }; }),
      k: new Float32Array(doors.length) };
    for (let gi = 0; gi < N * NF; gi++) write(gi);
    doors.forEach((d, i) => setDoor(i, d.open ? 1 : 0));
    flush();
    U.lgLight.value = G0.tl; U.lgDir.value = G0.td;
    U.lgPaint.value = G.Homes.paint(map) || blank;
    U.lgGrid.value.set(0, 0, TS, 0);
    // a floor's layer: from just under its floor (the slab's edge round a drop) to just over its ceiling. (Not
    // higher: the top of a room's walls and its ceiling took the light of the floor above, and flickered with it.)
    U.lgSize.value.set(W, H, NF, (floors[0].fy || 0) - (L.FLOOR_H - L.WALL_H) + 0.02);
    U.lgFloorH.value = L.FLOOR_H;
    built = true;
    map.lightGridMs = Math.round(performance.now() - t0);
    map.lightLayers = G0.layers.filter(Boolean).length;
  }
  // a tile's sums, to what the textures hold: the light and its direction, premultiplied by how open the tile is
  // (so the texture's filtering averages only open tiles: the shader divides by it)
  const h = T.DataUtils.toHalfFloat;
  function write(gi) {
    const c = G0.cur, o = gi * K, w = Math.max(0, Math.min(1, c[o + 7])), s = c[o + 6] > 1e-6 ? w / c[o + 6] : 0, q = gi * 4;
    G0.hl[q] = h(Math.max(0, c[o]) * w); G0.hl[q + 1] = h(Math.max(0, c[o + 1]) * w); G0.hl[q + 2] = h(Math.max(0, c[o + 2]) * w); G0.hl[q + 3] = h(w); // (a door's layer can take light away: never below none)
    G0.hd[q] = h(c[o + 3] * s); G0.hd[q + 1] = h(c[o + 4] * s); G0.hd[q + 2] = h(c[o + 5] * s); G0.hd[q + 3] = h(w);
  }
  // how far a door's open (0 shut .. 1): its layer goes in by as much (G.Game.updateDoors, each frame)
  function setDoor(id, k) {
    const ly = G0 && G0.layers[id];
    if (!ly) return;
    const dk = k - G0.k[id];
    if (Math.abs(dk) < 0.004 && !((k === 0 || k === 1) && dk)) return;
    G0.k[id] = k;
    const c = G0.cur, v = ly.v;
    for (let n = 0; n < ly.at.length; n++) { const o = ly.at[n] * K; for (let e = 0; e < K; e++) c[o + e] += dk * v[n * K + e]; G0.dirty.add(ly.at[n]); }
  }
  // what changed this frame, to the textures
  function flush() {
    if (!G0 || !G0.dirty.size) return;
    for (const gi of G0.dirty) write(gi);
    G0.dirty.clear();
    G0.tl.needsUpdate = G0.td.needsUpdate = true;
  }
  function dispose() {
    for (const k of ['lgLight', 'lgDir', 'lgPaint']) if (U[k].value !== blank) { U[k].value.dispose(); U[k].value = blank; }
    G0 = null; built = false;
  }
  // on while the level's drawn (G.R.render), off for anything else drawn with the same materials
  const on = (v) => { U.lgGrid.value.w = v && built ? 1 : 0; };
  return { build, dispose, on, setDoor: (id, k) => { if (built) setDoor(id, k); }, flush, U, opts, get built() { return built; }, get layers() { return G0 && G0.layers; } };
})();
