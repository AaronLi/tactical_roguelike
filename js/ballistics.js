'use strict';
// Terminal ballistics: what a round does to armour and to a body, simulated, not multiplied.
//
// A round is a physical thing: its mass, diameter and length, what its core is made of (lead, mild steel, hardened
// steel, tungsten carbide), its nose (full metal jacket, hollow point, a pellet, a dart), and its speed when it gets
// there (js/player.js flies it with drag, so a round 300 m out is slower than one at the muzzle).
//
// Armour is layers of material, each so many millimetres thick: aramid (Kevlar soft armour), UHMWPE, AR500 steel,
// ceramic, polycarbonate (face shields), ABS (a bump helmet). Whether a round gets through a layer is the layer's
// ballistic limit for that round (de Marre's: the speed it takes grows with the layer's thickness^0.7 and the round's
// diameter^0.75, and falls with its mass^0.5), against the round's speed times how well its core works on that material
// (a hardened steel or tungsten core goes through hard plate that flattens lead; fabric catches soft lead pistol
// rounds and lets narrow fast steel through). Struck at an angle, a layer is thicker along the path (t / cos θ); very
// oblique on a hard face, the round glances off. A round that gets through comes out slower (v_r = √(v² - v_bl²)) and,
// through a hard plate, deformed (blunter, lighter, tumbling). One that doesn't still hits the body behind the armour
// with some of its energy (blunt trauma). Armour wears by the energy it soaks up, and a worn layer is thinner.
// Everything else a round meets is the same sum with its own numbers (js/materials.js): walls, doors, floors, furniture,
// glass. strike is one layer of anything, crossSolid a solid's whole construction, a layer at a time.
//
// The round is a state, and it changes (p: m, d, len, ang; d0, m0 what it left the gun as). What's in front of its nose
// pushes back with a pressure, half ρ v² (of the speed into the surface) plus the material's strength, and if that's
// past what the core can stand it flows (deform): it widens and shortens (volume kept), by how far past it is and by how
// much of the material it actually shoves aside, sheds mass (jacket, nose) when it's far past, a fragmenting round
// breaks, a hard core shatters on a harder face, a hollow point's nose plugs in plasterboard or wood and it won't open.
// Each thing it goes through also knocks it off line and starts it yawing (ang), more the more of its speed that took, and
// long thin rounds most of all: a wider, lighter or yawing round has more drag from there on (flightDrag), meets the next
// thing with a bigger frontal area, and enters a body already tumbling. Past about 40° off the normal, if the speed
// into the surface couldn't take it a calibre in, it glances instead (glances, ricochet): it keeps most of its speed
// along the surface and a little of the speed into it, flattened and tumbling.
// Calibrated against NIJ ratings: soft IIIA aramid stops 9 mm and .44 Magnum and not 5.56, 7.62x39, 5.7x28 or .500 S&W;
// level III steel stops M80 7.62x51 and 5.56 ball but not 5.56 or 7.62x39 armour-piercing, .338 or .50 BMG; level IV
// ceramic stops .30-06 M2 AP and tungsten 5.56.
//
// The body is the character rig's own shape (js/rig.js): each part a tapered elliptical cylinder or an ellipsoid in its
// bone's frame, the same sizes as the meshes you see (the chest 40 cm across and 25 deep, the head its cranium and
// jaw), with the organs inside them where they are in a person: brain and brainstem in the skull, the cervical spine and
// carotid arteries in the neck, the heart, lungs, aorta and thoracic spine in the chest, liver, stomach, spleen,
// kidneys, bowel, lumbar spine and abdominal aorta below, the pelvis and iliac arteries, and in each limb its long
// bone(s) and (arm and thigh) its artery. Ported from tactical_game's anatomy (src/preview3d.ts) and refitted to these
// bodies.
//
// Armour and a body are both worked out layer by layer, in the order the round meets them. A piece of armour is what it is
// as worn (js/materials.js built): the carrier's cover, the strike face, the backer, a steel plate's spall liner, the
// trauma pad, each struck in turn (the other way about, leaving through a back plate); a stopped round's back-face energy
// is damped by each layer behind the one that stopped it. A body is skin, fat and muscle (each part its own thicknesses:
// seg.wall), the ribcage in the chest (real ribs, gaps between them, the breastbone and shoulder blades), the skull as its
// outer table, diploë and inner table, the organs, and the bones as a cortical shell round cancellous bone or marrow,
// each its own density and strength (js/materials.js TISSUE), stepped at a millimetre where layers are thin.
// In tissue a round sheds speed with depth as a projectile does in a dense, slightly solid medium (Poncelet): drag,
// dv/dx = -ρ·Cd·A/(2m)·v, and the tissue's strength, σ·A of force whatever the speed, which is what stops slow rounds: its frontal area A and drag Cd set by how it's flying: nose-first, then
// (rifle rounds, past their yaw depth: 12 cm for 5.56, 26 for 7.62x39) tumbling side-on; a hollow point opens to 1.37×
// its diameter once it's going fast enough (70% of its own muzzle speed, or less); a .22's soft lead flattens to 1.3×; a rifle round tumbling above its fragmentation speed (5.56 ball at ~760 m/s) breaks, its core going on
// and a spray of fragments tearing their own short tracks. Lung is light (aerated), bone dense (and it breaks, and
// tips the round over). Along the track: the crushed volume (its permanent cavity, the area it presents times the
// distance), and the energy it gives up (its temporary cavity: tissue stretched out to a radius set by the energy per
// centimetre, which tears inelastic organs (brain, liver, spleen, kidneys) and barely bothers lung and muscle). Each
// organ the track crushes or stretches is wounded; what that does depends on the organ (js/ballistics.js EFFECT): a
// brain, brainstem or cervical spine is the end; a heart, aorta or iliac artery bleeds out in seconds; a lung collapses;
// the liver, spleen and kidneys bleed heavily; stomach and bowel are a gut wound; the spine lower down paralyses; a long
// bone breaks; a limb's artery bleeds heavily (a tourniquet stops it). The part's own damage and blood loss are the energy
// the round left in it, as a share of what a person can take (PERSON_J). Calibrated against bare ballistic gelatin (10%, the usual published tests): .22 LR
// about 33 cm, .32 ACP 45, 9 mm FMJ 65 and hollow point 35, .45 ACP FMJ 65 and hollow point 33, a 00 buck pellet 30, a
// 12 gauge slug 35, 5.56 about 35, 7.62x39 55, 7.62x51 50.
G.Ballistics = (() => {
  const T = THREE;
  // ---------------------------------------------------------------- the rounds
  // By caliber: [mass g, diameter mm, length mm, core, tissue yaw depth cm (0: stays nose-first), fragmentation speed m/s
  // (0: doesn't), pellets (0: a single bullet)]
  const CAL = {
    '5.56/45': [4.0, 5.7, 23, 'mild', 12, 760], '7.62/39': [7.9, 7.9, 26.8, 'mild', 26, 0], '7/43': [8.7, 7.0, 34, 'mild', 11, 0],
    '7.62/51': [9.5, 7.82, 28.9, 'lead', 15, 790], '9/19': [8.0, 9.0, 15.5, 'lead', 0, 0], '5.7/29': [2.0, 5.7, 21.6, 'hard', 9, 0],
    '11.43/23': [14.9, 11.43, 16.5, 'lead', 0, 0], '18.5/70': [3.5, 8.4, 8.4, 'lead', 0, 0, 9], '7.62/54': [9.6, 7.92, 30, 'mild', 15, 0],
    '12.7/99': [42, 12.95, 58, 'mild', 25, 0], '7.65/17': [4.6, 7.9, 12, 'lead', 0, 0], '12.7/33': [19.4, 12.7, 20, 'lead', 0, 0],
    '9.07/33': [10.2, 9.07, 17, 'lead', 0, 0], '12.7/41': [22.7, 12.7, 24, 'lead', 0, 0], '4.6/30': [2.0, 4.65, 20, 'hard', 8, 0],
    '5.6/39': [3.4, 5.6, 25, 'mild', 7, 0], '5.8/42': [4.15, 6.0, 24, 'mild', 10, 0], '7.62/63': [9.7, 7.82, 31, 'lead', 15, 0], '9/39': [16.2, 9.25, 38, 'lead', 20, 0],
    '11.6/53': [26, 11.6, 27, 'lead', 0, 0], '8.6/69': [16.2, 8.6, 39, 'lead', 18, 0], '7.62/25': [5.5, 7.85, 15, 'mild', 0, 0],
    '10.4/63': [4.3, 9.1, 9.1, 'lead', 0, 0, 5], '11.43/33': [16.2, 11.5, 18, 'lead', 0, 0], '10.9/33': [15.6, 10.9, 17, 'lead', 0, 0], '5.6/15': [2.6, 5.7, 11, 'lead', 0, 0],
    bolt: [25, 9, 400, 'hard', 0, 0], cell: [30, 10, 40, 'wc', 0, 0],
  };
  // what each load changes (physically): core, mass, nose, yaw, fragmentation, pellets
  function projectile(def, am) {
    const cal = G.calOf(def), c = CAL[cal] || CAL['9/19'], pistol = (G.CALIBERS[cal] || {}).group !== 'rifle';
    const p = { m: c[0] / 1000, d: c[1] / 1000, len: c[2] / 1000, core: c[3], yaw: c[4], frag: c[5], nose: 'fmj', n: c[6] || def.pellets || 1, cal, am };
    let v0 = 0; try { v0 = G.roundSpeed(def, am) || 0; } catch (e) { /* no speed */ }
    const opens = (vx) => (v0 ? Math.min(vx, v0 * 0.7) : vx); // (a hollow point opens at 70% of its own muzzle speed, at most vx)
    if (cal === '5.6/15' && am !== 'hp') p.soft = 1.3; // (bare soft lead: it flattens a couple of centimetres in)
    if (am === 'hp') { p.nose = 'hp'; p.core = 'lead'; p.frag = 0; p.vExp = opens(pistol ? 260 : 480); }
    else if (am === 'ap') { p.core = pistol ? 'hard' : 'wc'; p.m *= 0.85; p.frag = 0; p.yaw = p.yaw ? p.yaw * 1.3 : 0; }
    else if (am === 'tracer') p.m *= 0.97;
    else if (am === 'subsonic') { p.m *= 1.4; p.len *= 1.25; p.frag = 0; }
    else if (am === 'slug') { p.m = 0.028; p.d = 0.0185; p.len = 0.02; p.n = 1; p.nose = 'hp'; p.vExp = opens(300); }
    else if (am === 'birdshot') { p.m = 0.0002; p.d = 0.0033; p.len = 0.0033; p.n = Math.round((def.pellets || 9) * 2.5); }
    else if (am === 'flechette') { p.m = 0.0005; p.d = 0.002; p.len = 0.03; p.core = 'hard'; p.nose = 'dart'; }
    else if (am === 'broadhead') { p.nose = 'broad'; } // (cuts a 30 mm wound; to armour it's a steel point)
    if (p.n > 1 && am !== 'birdshot' && am !== 'flechette') p.nose = 'ball';
    if (p.n > 1) p.n = def.pellets || p.n; // (the gun's pattern: the round as fired is one pellet)
    p.d0 = p.d; p.m0 = p.m; p.ang = 0; // (as it left the gun; ang: how far it's yawed off its line, rad)
    return p;
  }
  const area = (d) => Math.PI / 4 * d * d;
  // the area it shows going forward: its nose, turning to its side as it yaws
  const presented = (p) => { const a = Math.min(Math.PI / 2, p.ang || 0); return area(p.d) * Math.cos(a) + p.d * p.len * 0.85 * Math.sin(a); };
  // how far it carries now, from how far it carried as it left the gun: the air takes it by area over mass
  const flightDrag = (p, drag) => drag * (p.m / (p.m0 || p.m)) * (area(p.d0 || p.d) / presented(p));

  // a round's state, to keep (its path, for the replays: js/highlights.js) and to put back on a fresh one
  const snap = (p) => [+p.m.toFixed(5), +p.d.toFixed(5), +p.len.toFixed(5), +(p.ang || 0).toFixed(2), p.nose, p.frag || 0, p.deformed ? 1 : 0];
  function unsnap(p, q) { if (Array.isArray(q)) { p.m = +q[0] || p.m; p.d = +q[1] || p.d; p.len = +q[2] || p.len; p.ang = +q[3] || 0; p.nose = q[4] || p.nose; p.frag = +q[5] || 0; p.deformed = !!q[6]; } return p; }
  // ---------------------------------------------------------------- armour
  // K: the de Marre constant (v_bl = K·t^0.7·d^0.75/m^0.5, t and d in mm, m in g); E: how well each core works on it;
  // blunt: the share of a stopped round's energy that reaches the body; wearJ: joules soaked per point of durability.
  const MAT = G.Materials.MAT;
  // the speed it takes to get through mm of this material (a worn layer's thinner; cosT: the cosine off its normal)
  function vLimit(p, M, mm) {
    let dEff = Math.sqrt(4 * presented(p) / Math.PI) * 1000, core = p.core;
    if (p.nose === 'hp') dEff *= M.soft ? 1.3 : 1.15; // (a blunt nose spreads its load)
    if (p.nose === 'broad') core = 'hard', dEff = 6;
    return M.K * Math.pow(mm, 0.7) * Math.pow(dEff, 0.75) / Math.sqrt(p.m * 1000) / (M.E[core] || 1);
  }
  // One layer: does the round get through, and how fast does it come out? cond (0..1): a worn layer is thinner.
  function layer(p, v, mat, mm, cond = 1, cosT = 1) {
    const M = MAT[mat], tEff = mm * (0.3 + 0.7 * G.U.clamp(cond, 0, 1)) / Math.max(0.26, cosT), vReq = vLimit(p, M, tEff), E0 = 0.5 * p.m * v * v;
    if (v <= vReq) return { through: false, v: 0, absorbed: E0, depth: Math.pow(v / vReq, 1 / 0.7) }; // (depth: the share of the way in it got)
    const vo = Math.sqrt(v * v - vReq * vReq);
    return { through: true, v: vo, absorbed: E0 - 0.5 * p.m * vo * vo };
  }
  // What the material does to the round. Y: the stress its core flows at (a lead core in a jacket, mild steel, hard steel,
  // tungsten carbide; bare lead and a hollow point's open nose give sooner); D_MAX: how wide it can end up, as a share of
  // what it left the gun as. tMm: how much of it the round goes through. The strain it takes is the log of how far past Y
  // the pressure is, times how much of the material it's had to shove aside against its own mass.
  const CORE_Y = { lead: 1.5e8, mild: 9e8, hard: 2.4e9, wc: 6e9 }, D_MAX = { lead: 2, mild: 1.35, hard: 1.08, wc: 1.02 };
  function deform(p, v, vn, M, tMm) {
    if (p.nose === 'hp' && M.clog) { p.nose = 'fmj'; p.vExp = 0; } // (its nose packed solid: it goes on as a ball round)
    if (p.nose === 'broad' || !CORE_Y[p.core]) return;
    const Y = CORE_Y[p.core] * (p.nose === 'ball' || p.soft ? 0.4 : p.nose === 'hp' ? 0.6 : 1), over = (0.5 * M.rho * vn * vn + M.sig) / Y;
    if (over <= 1) return;
    const x = 1 - Math.exp(-(M.rho * area(p.d) * tMm * 0.001 / p.m) / 0.15), d0 = p.d0 || p.d;
    const d1 = Math.min(d0 * D_MAX[p.core], p.d * Math.exp(0.45 * x * Math.log(over)));
    if (d1 > p.d) { p.len = Math.max(p.len * (p.d / d1) ** 2, d1 * 0.4); p.d = d1; }
    if (over > 5) p.m *= 1 - Math.min(0.6, 0.05 + 0.12 * Math.log(over / 5)) * x; // (jacket and nose stripped off)
    if (p.frag && v >= p.frag && over > 2 && x > 0.2) { p.m *= 0.6; p.frag = 0; p.broke = true; } // (it comes apart, as it does in flesh)
    if ((p.core === 'hard' || p.core === 'wc') && over > 1.3 && x > 0.3) p.m *= 0.7; // (a hard core shatters on a harder face)
    if (p.d > d0 * 1.06) { p.deformed = true; p.frag = 0; p.yaw = Math.min(p.yaw || 4, 4); }
  }
  // does it glance? Well off the normal, with too little speed into the surface to get a calibre in (a little of chance:
  // no two rounds or surfaces alike)
  function glances(p, v, mat, mm, cosT) {
    const M = MAT[mat];
    return !M.noRic && cosT < 0.77 && v * cosT < vLimit(p, M, Math.min(mm, p.d * 1000)) * (0.8 + 0.4 * Math.random());
  }
  // It glances: along the surface it loses mu of its speed, into it it keeps e of it, turned over and flattened on the way.
  // along, off: its way out, as shares of along the surface and away from it.
  function ricochet(p, v, mat, cosT) {
    const M = MAT[mat], E0 = 0.5 * p.m * v * v, vn = v * cosT, vt = v * Math.sqrt(Math.max(0, 1 - cosT * cosT));
    deform(p, v, vn, M, p.d * 1500);
    const t = vt * (1 - M.mu * (0.7 + 0.6 * Math.random())), n = vn * M.e * (0.6 + 0.8 * Math.random()), vo = Math.hypot(t, n);
    p.ang = Math.min(Math.PI / 2, (p.ang || 0) + 0.5 + Math.random() * 0.8);
    return { through: false, ric: true, v: vo, along: t / vo, off: n / vo, absorbed: Math.max(0, E0 - 0.5 * p.m * vo * vo) };
  }
  // One layer of anything, physically: it glances (if it's the first thing met, and first: true), or the round's changed by
  // it (deform) and gets through or doesn't. Through: dev, how far it's thrown off line at random (rad); bend, how far it
  // turns toward the surface's normal (a hard core bites in and turns in; a soft one's flattened nose steers it away).
  function strike(p, v, mat, mm, cond = 1, cosT = 1, first = false) {
    if (first && glances(p, v, mat, mm, cosT)) return ricochet(p, v, mat, cosT);
    const M = MAT[mat], E0 = 0.5 * p.m * v * v;
    const q = layer(p, v, mat, mm, cond, cosT); // (K's fitted to real rounds, flattening as they go: what it does to this one shows on what's next)
    deform(p, v, v * cosT, M, mm / Math.max(0.26, cosT));
    if (!q.through) { q.absorbed = E0; return q; }
    const loss = 1 - q.v / v, thin = p.len / p.d, soft = p.core === 'lead' || p.deformed, sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    q.absorbed = Math.max(0, E0 - 0.5 * p.m * q.v * q.v);
    q.dev = (0.004 + 0.3 * loss) * (soft ? 1.4 : 1);
    q.bend = 0.3 * sinT * loss * (soft ? -0.5 : 1);
    if (thin > 1.3) p.ang = Math.min(Math.PI / 2, (p.ang || 0) + (0.01 + 0.6 * loss) * Math.min(2, (thin / 3) ** 2) * (0.5 + Math.random()));
    return q;
  }
  // A stack of layers, outside in: what's left of the round (ric: it glanced off the first).
  function stack(p, v, layers, cond, cosT, log) {
    let absorbed = 0, blunt = 0, first = true;
    for (let i = 0; i < layers.length; i++) {
      const [mat, mm] = layers[i], M = MAT[mat], v0 = v, q = strike(p, v, mat, mm, cond, cosT, first);
      if (first && !M.noRic) first = false; // (it's the first thing that can turn it that can: not a nylon cover)
      absorbed += q.absorbed;
      if (log) log.push({ m: M.name, v: Math.round(v0), k: mat, mm, o: Math.round(q.v) || 0, s: q.depth, d: p.d, l: p.len, g: p.m, a: p.ang || 0, gl: !!q.ric, rest: q.through ? null : layers.slice(i + 1) });
      if (q.ric) return { through: false, v: 0, absorbed, blunt: 0, glance: true, ric: q, stoppedBy: mat };
      if (!q.through) {
        blunt = q.absorbed * M.blunt; // (the back face bulges: what's behind it takes some of that)
        for (let j = i + 1; j < layers.length; j++) blunt *= MAT[layers[j][0]].damp == null ? 0.9 : MAT[layers[j][0]].damp;
        return { through: false, v: 0, absorbed, blunt, glance: false, stoppedBy: mat };
      }
      v = q.v;
    }
    return { through: true, v, absorbed, blunt: 0 };
  }
  // ---------------------------------------------------------------- a solid in the world
  // A round (p, at v) meets solid h.solid at h.t along o + u t (js/world.js raycast), and goes through what it's built of
  // (js/materials.js of): the skin of the near face, the core or void, a stud if it's there, the far face's skin. Returns
  // { v (0: stopped in it), ric (it glanced: along, off), t (where the round left it, or stopped), n, nOut (the far
  // face's normal), dev, bend, absorbed (joules left in it), fx }.
  const VOID_MAX = 0.9; // (thicker than that, a "void" wall's a mass of building, not a partition)
  function crossSolid(map, p, v, h, o, u) {
    const sp = G.World.span(map.world, h.solid, o, u), a = o.clone().addScaledVector(u, h.t), q = o.clone().addScaledVector(u, sp.t), path = Math.max(0, sp.t - h.t);
    const c = G.Materials.of(map, h.solid, a, q), inside = h.t <= 1e-6, cosT = inside ? 1 : Math.max(0.03, Math.abs(u.x * h.n[0] + u.y * h.n[1] + u.z * h.n[2]));
    const skinM = c.skin.reduce((n, l) => n + l[1], 0) / 1000 / cosT, seq = c.skin.map(([m, mm]) => [m, mm, cosT]), inner = path - skinM * (c.one ? 1 : 2);
    if (!c.one) {
      if (inner > 0 && c.core) seq.push([c.core, inner * 1000 * c.fill, 1]);
      else if (inner * cosT > VOID_MAX) seq.push(['concrete', (inner * cosT - VOID_MAX) * 1000, 1]);
      if (c.stud && inner > 0) { const coord = Math.abs(h.n[0]) > 0.5 ? (a.z + q.z) / 2 : (a.x + q.x) / 2, st = c.stud; if ((coord % st.every + st.every) % st.every < st.w) seq.push([st.mat, st.mm, 1]); }
      for (let i = c.skin.length - 1; i >= 0; i--) seq.push([c.skin[i][0], c.skin[i][1], cosT]);
    }
    if (!seq.length) seq.push([c.core || 'concrete', 1, cosT]); // (met right at its far edge)
    const total = seq.reduce((n, l) => n + l[1], 0); let done = 0; // (how far in it got, for what it left: js/damage.js)
    const out = { v: 0, t: h.t, n: h.n, nOut: sp.n, dev: 0, bend: 0, absorbed: 0, depth: 0, fx: MAT[seq[0][0]].fx, fxOut: MAT[seq[seq.length - 1][0]].fx, name: MAT[seq[0][0]].name, nameOut: MAT[seq[seq.length - 1][0]].name, mat: seq[0][0], matOut: seq[seq.length - 1][0] };
    for (let i = 0; i < seq.length; i++) {
      const [m, mm, cs] = seq[i], r = i === 0 && !inside && glances(p, v, m, mm, cosT) ? ricochet(p, v, m, cosT) : strike(p, v, m, mm, 1, cs);
      out.absorbed += r.absorbed;
      if (r.ric) return Object.assign(out, { ric: true, v: r.v, along: r.along, off: r.off });
      if (!r.through) { out.depth = G.U.clamp(path * (done + mm * (r.depth || 0.5)) / total, 0.012, path); return out; }
      done += mm;
      v = r.v; out.dev = Math.hypot(out.dev, r.dev); out.bend += r.bend;
    }
    out.v = v; out.t = sp.t;
    return out;
  }
  // the way out of it: off the surface (ric), or on through, turned and thrown off line. Returns the new unit direction.
  function deflect(u, r, n) {
    const d = u.clone();
    if (r.ric) {
      const nv = new T.Vector3(n[0], n[1], n[2]); if (nv.dot(u) > 0) nv.negate();
      d.addScaledVector(nv, -nv.dot(u)).normalize().multiplyScalar(r.along).addScaledVector(nv, r.off);
    } else if (n) d.addScaledVector(new T.Vector3(n[0], n[1], n[2]), Math.sign(u.x * n[0] + u.y * n[1] + u.z * n[2] || 1) * r.bend);
    const a = r.ric ? 0.04 : r.dev || 0;
    return d.add(new T.Vector3(gauss() * a, gauss() * a, gauss() * a)).normalize();
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(Math.PI * 2 * Math.random()) * 0.7;
  // a mark for everyone to draw: where, the surface's normal, what it looks like, and e(ntry), x (exit) or r(icochet)
  // (and, after them, what js/scars.js needs to damage it the same on every screen: the way it was going, its energy, what it hit, whether it stopped, its width)
  const mark = (at, n, fx, k, o = {}) => [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2), n ? n[0] : 0, n ? n[1] : 1, n ? n[2] : 0, fx, k, ...(o.dir ? [o.dir.x, o.dir.y, o.dir.z].map((x) => +x.toFixed(2)) : [0, 0, 0]), Math.round(o.J || 0), o.m == null ? null : o.m, o.stop ? 1 : 0, +(o.cal || 8).toFixed(1), o.cut ? +o.cut.toFixed(3) : 0];

  // Where armour is on a body: each piece's protection is a list of { at, layers: [[material, mm], ...] }, at one of
  //   'plate' (front and back of the chest, a SAPI-sized 25 x 32 cm plate), 'side' (the flanks under the arms),
  //   'torso' (soft armour: chest and abdomen all round, except high under the arms), 'groin', 'shoulder' (the upper
  //   arm's top half), 'thigh' (the front of the upper thigh), 'helmet' (the skull above the brim: piece.cut 'high' or
  //   'full'), 'face' (the face below the brim: piece.lower for a mandible guard, just the jaw).
  // covers(at, seg, q): does that kind of protection cover segment seg at its local point q?
  function covers(at, piece, seg, q) {
    const id = seg.id;
    if (at === 'plate') return id === 'chest' && Math.abs(q.x) <= 0.125 && q.y >= -0.005 && q.y <= 0.3 && Math.abs(q.z) > 0.04;
    if (at === 'side') return id === 'chest' && Math.abs(q.x) > seg.rx(q.y) * 0.72 && q.y >= 0.06 && q.y <= 0.22;
    if (at === 'torso') return (id === 'chest' && !(q.y > 0.18 && Math.abs(q.x) > seg.rx(q.y) * 0.8)) || id === 'abdomen';
    if (at === 'groin') return id === 'pelvis' && q.z < 0;
    if (at === 'shoulder') return id === 'uarm' && q.y > -0.13;
    if (at === 'thigh') return id === 'thigh' && q.y > -0.22 && q.z < 0.01;
    if (at === 'helmet') return (id === 'cranium') && q.y >= brim(piece.cut, q);
    if (at === 'face') return (id === 'jaw' || (id === 'cranium' && q.y < brim('high', q) && q.z < -0.03)) && (!piece.lower || q.y < 0.1);
    return false;
  }
  // a helmet's lower edge round the head (head frame): over the brows at the front, high over the ears (a high cut) or
  // down over them (full cut), the nape at the back
  function brim(cut, q) {
    const a = Math.atan2(q.x, -(q.z)); // 0 front, ±π back
    const [f, s, b] = cut === 'full' ? [0.16, 0.115, 0.07] : [0.162, 0.15, 0.095];
    const k = Math.abs(a) / Math.PI; // 0 front .. 1 back
    return k < 0.5 ? f + (s - f) * (k / 0.5) : s + (b - s) * ((k - 0.5) / 0.5);
  }

  // ---------------------------------------------------------------- the body, as the rigs are built
  // Segments in their bones' frames (x right, y up the bone, z back; rig units, metres at scale 1). 'cyl': a tapered
  // elliptical cylinder from y0 to y1, half-widths rx0..rx1 (across) and rz0..rz1 (front to back); 'ell': an ellipsoid.
  const lerp = (a, b, t) => a + (b - a) * t;
  const cyl = (id, bone, part, y0, y1, rx0, rx1, kz, o = {}) => Object.assign({ id, bone, part, kind: 'cyl', y0, y1, rx0, rx1, kz, rx(y) { return lerp(rx0, rx1, G.U.clamp((y - y0) / (y1 - y0), 0, 1)); }, rz(y) { return this.rx(y) * kz; } }, o);
  const ell = (id, bone, part, c, r, o = {}) => Object.assign({ id, bone, part, kind: 'ell', c, r, rx: () => r[0] }, o);
  // organs: { id, shape: ['ell', c, r] | ['cap', a, b, r], tissue (density kg/m³), stretch (how badly the temporary
  // cavity tears it), hp (cm³ of crush, or its equivalent, to destroy it), bone (it breaks and tips the round) }
  const E_ = (c, r) => ['ell', c, r], C_ = (a, b, r) => ['cap', a, b, r];
  const ORG = {
    brain: { label: 'Brain', tissue: 1040, stretch: 3, hp: 4 }, brainstem: { label: 'Brainstem', tissue: 1040, stretch: 3, hp: 0.4 },
    spineC: { label: 'Cervical spine', tissue: 1900, bone: true, hp: 0.5 }, carotid: { label: 'Carotid artery', tissue: 1060, stretch: 0.5, hp: 0.25 },
    trachea: { label: 'Airway', tissue: 600, stretch: 0.2, hp: 0.6 },
    heart: { label: 'Heart', tissue: 1060, stretch: 0.6, hp: 6 }, lungL: { label: 'Left lung', tissue: 400, stretch: 0.1, hp: 30 }, lungR: { label: 'Right lung', tissue: 400, stretch: 0.1, hp: 30 },
    aorta: { label: 'Aorta', tissue: 1060, stretch: 0.6, hp: 0.5 }, spineT: { label: 'Spine', tissue: 1900, bone: true, hp: 0.6 },
    liver: { label: 'Liver', tissue: 1060, stretch: 1, hp: 25 }, stomach: { label: 'Stomach', tissue: 1040, stretch: 0.2, hp: 10 },
    spleen: { label: 'Spleen', tissue: 1060, stretch: 1, hp: 4 }, kidney: { label: 'Kidney', tissue: 1060, stretch: 0.8, hp: 4 },
    bowel: { label: 'Bowel', tissue: 1040, stretch: 0.15, hp: 20 }, iliac: { label: 'Iliac artery', tissue: 1060, stretch: 0.5, hp: 0.3 },
    pelvis: { label: 'Pelvis', tissue: 1900, bone: true, hp: 1.5 }, skull: { label: 'Skull', tissue: 1900, bone: true, hp: 99 },
    humerus: { label: 'Humerus', tissue: 1900, bone: true, hp: 1 }, forearm: { label: 'Forearm bones', tissue: 1900, bone: true, hp: 0.8 }, brachial: { label: 'Brachial artery', tissue: 1060, stretch: 0.5, hp: 0.2 },
    femur: { label: 'Femur', tissue: 1900, bone: true, hp: 1.2 }, femoral: { label: 'Femoral artery', tissue: 1060, stretch: 0.5, hp: 0.3 }, tibia: { label: 'Tibia', tissue: 1900, bone: true, hp: 1 },
  };
  // The organs there are two of: one a side, each its own (a left kidney, a right femur): what's done to one isn't done
  // to the other, for anyone (an officer's body by its parts, js/medical.js; a suspect's record, js/server.js injure).
  // L: the body's left (-x in the torso's frames; the left limbs' bones).
  const PAIRED = ['carotid', 'kidney', 'iliac', 'pelvis', 'humerus', 'forearm', 'brachial', 'femur', 'femoral', 'tibia'];
  for (const id of PAIRED) { const o = ORG[id]; delete ORG[id]; for (const [S, w] of [['L', 'Left'], ['R', 'Right']]) ORG[id + S] = Object.assign({}, o, { label: `${w} ${o.label[0].toLowerCase()}${o.label.slice(1)}`, pair: id }); }
  // the materials of the organs (TISSUE), and of the bones, their cortical shell's thickness (m) and what's inside it
  for (const [id, O] of Object.entries(ORG)) {
    const k = O.pair || id;
    O.mat = { brain: 'brain', brainstem: 'brain', heart: 'heart', lungL: 'lung', lungR: 'lung', liver: 'liver', trachea: 'airway', carotid: 'vessel', aorta: 'vessel', iliac: 'vessel', brachial: 'vessel', femoral: 'vessel' }[k] || 'viscera';
    const b = { spineC: [0.002, 'cancellous'], spineT: [0.0025, 'cancellous'], pelvis: [0.0025, 'cancellous'], skull: [0.002, 'diploe'], humerus: [0.004, 'marrow'], forearm: [0.003, 'marrow'], femur: [0.006, 'marrow'], tibia: [0.005, 'marrow'] }[k];
    if (b) [O.cortex, O.core] = b;
  }
  // a segment's layers from the skin in ([tissue, mm]), and what fills the rest
  const WALL = {
    cranium: [[['skin', 2], ['fat', 4], ['cortical', 2], ['diploe', 3], ['cortical', 2]], 'brain'], jaw: [[['skin', 2], ['muscle', 8], ['cortical', 3]], 'muscle'], neck: [[['skin', 2], ['fat', 3]], 'muscle'],
    chest: [[['skin', 2], ['fat', 8], ['muscle', 16], ['rib', 12]], 'viscera'], abdomen: [[['skin', 2], ['fat', 18], ['muscle', 12]], 'viscera'], pelvis: [[['skin', 2], ['fat', 18], ['muscle', 25]], 'viscera'],
    uarm: [[['skin', 2], ['fat', 4]], 'muscle'], farm: [[['skin', 2], ['fat', 3]], 'muscle'], thigh: [[['skin', 2], ['fat', 8]], 'muscle'], shin: [[['skin', 2], ['fat', 3]], 'muscle'],
  };
  function segs() {
    if (segs.list) return segs.list;
    const L = [];
    // the head: the cranium (skull shell 7 mm) and the jaw under it, as js/rig.js shapes them
    L.push(ell('cranium', 'head', 'head', [0, 0.13, 0], [0.092, 0.106, 0.1], { shell: 0.007, organs: [['brain', E_([0, 0.145, 0.005], [0.074, 0.074, 0.084])], ['brainstem', C_([0, 0.075, 0.025], [0, 0.115, 0.02], 0.015)]] }));
    L.push(ell('jaw', 'head', 'head', [0, 0.065, -0.018], [0.075, 0.071, 0.079], { organs: [['brainstem', C_([0, 0.075, 0.025], [0, 0.115, 0.02], 0.015)]] }));
    L.push(cyl('neck', 'neck', 'head', -0.03, 0.07, 0.056, 0.048, 1, { organs: [['spineC', C_([0, -0.03, 0.02], [0, 0.07, 0.015], 0.014)], ['carotidL', C_([-0.022, -0.03, -0.012], [-0.022, 0.07, -0.012], 0.006)],
      ['carotidR', C_([0.022, -0.03, -0.012], [0.022, 0.07, -0.012], 0.006)], ['trachea', C_([0, -0.03, -0.026], [0, 0.07, -0.024], 0.01)]] }));
    L.push(cyl('chest', 'chest', 'thorax', -0.025, 0.305, 0.152, 0.2, 0.62, { organs: [['heart', E_([-0.02, 0.12, -0.03], [0.05, 0.06, 0.045])], ['lungL', E_([-0.08, 0.15, 0.005], [0.065, 0.12, 0.072])],
      ['lungR', E_([0.08, 0.15, 0.005], [0.07, 0.12, 0.072])], ['aorta', C_([-0.01, 0.21, -0.005], [-0.015, -0.03, 0.045], 0.013)], ['spineT', C_([0, -0.025, 0.085], [0, 0.3, 0.08], 0.018)],
      ['liver', E_([0.07, 0.0, -0.01], [0.08, 0.05, 0.07])]] }));
    L.push(cyl('abdomen', 'spine', 'stomach', 0.015, 0.185, 0.152, 0.145, 0.7, { organs: [['liver', E_([0.065, 0.16, -0.01], [0.085, 0.05, 0.075])], ['stomach', E_([-0.06, 0.14, -0.035], [0.055, 0.045, 0.045])],
      ['spleen', E_([-0.1, 0.15, 0.035], [0.03, 0.045, 0.03])], ['kidneyL', E_([-0.055, 0.1, 0.06], [0.028, 0.045, 0.022])], ['kidneyR', E_([0.055, 0.09, 0.06], [0.028, 0.045, 0.022])],
      ['bowel', E_([0, 0.05, -0.025], [0.12, 0.05, 0.065])], ['spineT', C_([0, 0.015, 0.075], [0, 0.185, 0.078], 0.02)], ['aorta', C_([-0.012, 0.015, 0.045], [-0.012, 0.185, 0.045], 0.011)]] }));
    L.push(cyl('pelvis', 'hips', 'stomach', -0.1, 0.1, 0.14, 0.155, 0.7, { organs: [['bowel', E_([0, 0.02, -0.03], [0.11, 0.05, 0.06])], ['bowel', E_([0, -0.06, -0.05], [0.04, 0.035, 0.035])],
      ['pelvisL', E_([-0.1, 0, 0.02], [0.04, 0.08, 0.06])], ['pelvisR', E_([0.1, 0, 0.02], [0.04, 0.08, 0.06])], ['iliacL', C_([-0.01, 0.1, 0.04], [-0.09, -0.09, -0.02], 0.008)], ['iliacR', C_([0.01, 0.1, 0.04], [0.09, -0.09, -0.02], 0.008)]] }));
    for (const s of [-1, 1]) {
      const S = s < 0 ? 'L' : 'R', arm = 'arm' + S, leg = 'leg' + S;
      L.push(cyl('uarm', 'up' + S, arm, -0.29, 0, 0.047, 0.056, 1, { side: S, organs: [['humerus' + S, C_([0, -0.01, 0], [0, -0.28, 0], 0.013)], ['brachial' + S, C_([-s * 0.024, -0.03, -0.008], [-s * 0.024, -0.27, -0.008], 0.004)]] }));
      L.push(cyl('farm', 'lo' + S, arm, -0.27, 0, 0.036, 0.046, 1, { side: S, organs: [['forearm' + S, C_([0.012, -0.01, 0], [0.012, -0.26, 0], 0.008)], ['forearm' + S, C_([-0.012, -0.01, 0], [-0.012, -0.26, 0], 0.007)]] }));
      L.push(cyl('thigh', 'th' + S, leg, -0.44, 0, 0.064, 0.088, 1, { side: S, organs: [['femur' + S, C_([0, -0.02, 0.005], [0, -0.42, 0.005], 0.016)], ['femoral' + S, C_([-s * 0.03, -0.03, -0.035], [-s * 0.02, -0.3, -0.02], 0.006)]] }));
      L.push(cyl('shin', 'sh' + S, leg, -0.44, 0, 0.046, 0.061, 1, { side: S, organs: [['tibia' + S, C_([0, -0.02, -0.02], [0, -0.4, -0.02], 0.013)], ['tibia' + S, C_([s * 0.025, -0.03, 0.005], [s * 0.025, -0.4, 0.005], 0.006)]] }));
    }
    for (const sg of L) {
      sg.bb = bbox(sg); for (const o of sg.organs || []) o.push(shapeBox(o[1]));
      [sg.wall, sg.fill] = WALL[sg.id]; sg.wallT = sg.wall.reduce((a, l) => a + l[1], 0) / 1000;
    }
    return (segs.list = L);
  }
  // the local bounding box of a segment, and of an organ's shape (inflated later by the temporary cavity's reach)
  function bbox(s) {
    if (s.kind === 'ell') return [s.c[0] - s.r[0], s.c[1] - s.r[1], s.c[2] - s.r[2], s.c[0] + s.r[0], s.c[1] + s.r[1], s.c[2] + s.r[2]];
    const r = Math.max(s.rx0, s.rx1), rz = r * s.kz;
    return [-r, s.y0, -rz, r, s.y1, rz];
  }
  function shapeBox(sh) {
    if (sh[0] === 'ell') return [sh[1][0] - sh[2][0], sh[1][1] - sh[2][1], sh[1][2] - sh[2][2], sh[1][0] + sh[2][0], sh[1][1] + sh[2][1], sh[1][2] + sh[2][2]];
    const [, a, b, r] = sh; return [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r];
  }
  // is local point q inside segment s? (and how far in, as a fraction: 0 at the surface)
  function inSeg(s, q) {
    if (s.kind === 'ell') { const dx = (q.x - s.c[0]) / s.r[0], dy = (q.y - s.c[1]) / s.r[1], dz = (q.z - s.c[2]) / s.r[2], k = dx * dx + dy * dy + dz * dz; return k <= 1 ? 1 - Math.sqrt(k) : -1; }
    if (q.y < s.y0 || q.y > s.y1) return -1;
    const rx = s.rx(q.y), rz = rx * s.kz, k = (q.x / rx) ** 2 + (q.z / rz) ** 2;
    return k <= 1 ? 1 - Math.sqrt(k) : -1;
  }
  // how far under the skin q is (m), along the way out from the middle (k: inSeg's)
  function under(s, q, k) {
    if (s.kind === 'ell') { const rho = 1 - k; return rho > 1e-3 ? k * Math.hypot(q.x - s.c[0], q.y - s.c[1], q.z - s.c[2]) / rho : 1; }
    const rho = 1 - k; return rho > 1e-3 ? k * Math.hypot(q.x, q.z) / rho : 1;
  }
  // the layer of the wall of that part at dep under the skin (a key of js/materials.js TISSUE), or null: past it. In the chest
  // the ribs are bands round it (one about every 3 cm, each 1.5 cm wide), muscle between; the breastbone's down the front,
  // the shoulder blades over the back.
  function wallAt(s, q, dep) {
    if (dep >= s.wallT) return null;
    let d = 0;
    for (const [mat, mm] of s.wall) {
      d += mm / 1000;
      if (dep >= d) continue;
      if (mat !== 'rib') {
        if (s.id === 'chest' && mat === 'muscle' && q.z > 0.04 && q.y > 0.15 && Math.abs(q.x) > 0.05 && Math.abs(q.x) < 0.14 && dep > d - 0.006) return 'cortical'; // (a shoulder blade)
        return mat;
      }
      if (q.z < 0 && Math.abs(q.x) < 0.03) return 'rib'; // (the breastbone)
      return ((q.y % 0.032) + 0.032) % 0.032 < 0.015 ? 'rib' : 'muscle';
    }
    return null;
  }
  // the surface normal at (or near) local point q
  function normal(s, q, out) {
    if (s.kind === 'ell') return out.set((q.x - s.c[0]) / (s.r[0] * s.r[0]), (q.y - s.c[1]) / (s.r[1] * s.r[1]), (q.z - s.c[2]) / (s.r[2] * s.r[2])).normalize();
    const rx = s.rx(q.y), rz = rx * s.kz;
    return out.set(q.x / (rx * rx), 0, q.z / (rz * rz)).normalize();
  }
  // distance-ish from q to an organ's shape (<= 0 inside; else roughly the gap in metres)
  function orgDist(sh, q) {
    if (sh[0] === 'ell') {
      const [, c, r] = sh, dx = (q.x - c[0]) / r[0], dy = (q.y - c[1]) / r[1], dz = (q.z - c[2]) / r[2], k = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return (k - 1) * Math.min(r[0], r[1], r[2]);
    }
    const [, a, b, r] = sh, bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], px = q.x - a[0], py = q.y - a[1], pz = q.z - a[2];
    const t = G.U.clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
    return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - r;
  }
  // the bones a rig's segments hang from (js/rig.js)
  function boneOf(rig, name) {
    if (name.startsWith('up') || name.startsWith('lo')) return (name.endsWith('L') ? rig.armL : rig.armR)[name.slice(0, 2)];
    if (name.startsWith('th') || name.startsWith('sh')) return (name.endsWith('L') ? rig.legL : rig.legR)[name.slice(0, 2)];
    return rig[name];
  }

  // ---------------------------------------------------------------- a round through a body
  const CAV_C = 1.5e6, V_STOP = 45, STEP = 0.004, FINE = 0.001; // (STEP: through soft tissue; FINE: through thin layers and bone)
  // The temporary cavity tears what can't stretch that far: tissue gives about CAV_TEAR (2.5 cm) of it, and inside what's
  // left (a cavity of radius r: within r - CAV_TEAR of the track) an organ that doesn't stretch well (stretch >= TEAR_S:
  // brain, brainstem, heart, liver, spleen, kidneys, the big arteries) is torn apart. Lung, bowel, stomach and muscle
  // stretch and come back. So it takes a rifle-class round, about 100 J deposited per cm (600 m/s and up, or a
  // magnum): a handgun's cavity (2-3 cm) tears nothing, a 5.56's (5 cm) about 3 cm round its track, a 7.62x51's (8 cm)
  // 6 cm.
  const CAV_TEAR = 0.025, TEAR_S = 0.5;
  // tissue strength (Pa, at soft tissue's density: scaled by density, so lung resists less and bone more), and drag:
  // nose-first round-nosed, a pellet (a sphere), tumbling side-on, opened (a hollow point, flattened lead)
  const CD = { fmj: 0.66, ball: 0.75, yaw: 0.62, open: 0.66 }, EXPAND = 1.37;
  // one step of a tissue: the speed after it, through drag then the tissue's strength (0 when that stops it)
  const slow = (v, m, A, Cd, M, ds) => { const v1 = v * Math.exp(-M.rho * Cd * A / (2 * m) * ds), e = 0.5 * m * v1 * v1 - M.sig * A * ds; return e > 0 ? Math.sqrt(2 * e / m) : 0; };
  const _o = new T.Vector3(), _u = new T.Vector3(), _q = new T.Vector3(), _w = new T.Vector3(), _n = new T.Vector3(), _ud = new T.Vector3();
  // armour pieces on that body: [{ piece (its def), cond (0..1), wear(J) (to record what it soaked) }]
  // Returns { hits: [ { part, side, seg, E, crush, organs: { id: dmg }, blunt, armour: [...] } ], exitV, stopped, entryT }
  // o, u: the round's world origin and unit direction; v: its speed (m/s) arriving; tMax: how far to look.
  // trace (an array, optional): filled with the track, a step at a time inside the body ({ t: metres along the ray, rP:
  // the crushed channel's radius, rT: the temporary cavity's, v, yawed, expanded }), and trace.frags with each fragment's
  // track ({ t: where it broke off, dir, len: how far through them, v0: its speed there, v: what it left them at (0: it stopped
  // in them), m, sp: a splinter of bone }): for showing it (js/highlights.js, the x-ray breakdown; js/shotlog.js, F9's record).
  function through(rig, o, u, v, p0, armour, tMax = 3, trace = null) {
    const S = segs(), mats = [];
    rig.root.updateMatrixWorld(true);
    // each segment's frame, the ray in it, and the stretch of the ray it can be in (its box)
    let tLo = Infinity, tHi = -Infinity;
    for (const s of S) {
      const bone = boneOf(rig, s.bone);
      if (!bone) continue;
      const inv = new T.Matrix4().copy(bone.matrixWorld).invert(), lo = _o.copy(o).applyMatrix4(inv), ld = _ud.copy(u).transformDirection(inv), sc = new T.Vector3().setFromMatrixScale(bone.matrixWorld).x || 1;
      const b = s.bb; let t0 = 0, t1 = tMax / sc, ok = true;
      for (let a = 0; a < 3; a++) {
        const oo = a === 0 ? lo.x : a === 1 ? lo.y : lo.z, dd = a === 0 ? ld.x : a === 1 ? ld.y : ld.z;
        if (Math.abs(dd) < 1e-9) { if (oo < b[a] || oo > b[a + 3]) { ok = false; break; } continue; }
        let q0 = (b[a] - oo) / dd, q1 = (b[a + 3] - oo) / dd; if (q0 > q1) { const z = q0; q0 = q1; q1 = z; }
        t0 = Math.max(t0, q0); t1 = Math.min(t1, q1); if (t0 > t1) { ok = false; break; }
      }
      if (!ok) continue;
      mats.push({ s, inv, sc, bone, t0: t0 * sc, t1: t1 * sc }); // (world metres along the ray: a uniform scale)
      tLo = Math.min(tLo, t0 * sc); tHi = Math.max(tHi, t1 * sc);
    }
    if (!mats.length) return null;
    const p = Object.assign({}, p0), hits = new Map(), res = { hits: [], exitV: v, stopped: false, entryT: null, glance: false, exitT: 0, dev: 0, ric: null };
    const v0 = v;
    let prev = null, prevQ = null, depth = 0, yawed = (p.ang || 0) > 0.6, expanded = false, t = tLo; // (yawed: it arrives tumbling, from whatever it's been through)
    const hitOf = (s) => { let h = hits.get(s); if (!h) { h = { part: s.part, side: s.side || null, seg: s.id, E: 0, crush: 0, organs: {}, blunt: 0, armour: [] }; hits.set(s, h); res.hits.push(h); } return h; };
    const frags = [];
    // it glanced off them, off armour or the curve of the skull: it goes on from here (res.ric: its way out, in the world)
    const glanced = (m, q, r) => {
      res.stopped = true; res.glance = true; res.exitV = 0;
      res.ric = Object.assign({}, r, { n: normal(m.s, q, new T.Vector3()).transformDirection(m.bone.matrixWorld).toArray(), t });
    };
    const armourAt = (m, q, entering) => {
      // the layers that cover this point, outside in (plates, then the soft armour behind them)
      const out = [];
      for (const a of armour || []) for (const pr of a.def.prot || []) if (covers(pr.at, a.def, m.s, q)) out.push({ a, pr, L: entering ? G.Materials.built(pr) : G.Materials.built(pr).reverse() });
      out.sort((x, y) => (x.pr.at === 'torso' ? 1 : 0) - (y.pr.at === 'torso' ? 1 : 0)); // (soft backers last)
      if (!entering) out.reverse();
      return out;
    };
    const armourPass = (m, q, entering) => {
      const cov = armourAt(m, q, entering);
      if (!cov.length) return true;
      _ud.copy(u).transformDirection(m.inv);
      const cosT = Math.abs(normal(m.s, q, _n).dot(_ud));
      const h = hitOf(m.s);
      for (const { a, pr, L } of cov) {
        const at0 = res.log.length, r = stack(p, v, L, a.cond, cosT, res.log);
        for (let i = at0; i < res.log.length; i++) Object.assign(res.log[i], { pc: a.def.name, cos: cosT, cond: a.cond });
        if (!r.through) { const q = res.log[res.log.length - 1], later = cov.slice(cov.findIndex((x) => x.a === a && x.pr === pr) + 1); for (const x of later) q.rest = q.rest.concat(x.L); } // (and what was behind it, untouched)
        a.wear = (a.wear || 0) + r.absorbed;
        h.armour.push({ piece: a, through: r.through, glance: r.glance, absorbed: r.absorbed, at: pr.at, fp: pr.at === 'face' && rig.head ? (({ x, y }) => [+x.toFixed(3), +y.toFixed(3)])(rig.head.worldToLocal(o.clone().addScaledVector(u, t))) : null }); // (fp: where on a face shield, in the head's frame: js/hud.js maskHit)
        if (r.ric) { glanced(m, q, r.ric); h.blunt += r.absorbed * MAT[r.stoppedBy].blunt; return false; } // (off the plate and away)
        if (!r.through) { h.blunt += r.blunt; res.stopped = true; res.glance = r.glance; res.exitV = 0; return false; }
        v = r.v;
        if (p.deformed && p.yaw) yawed = depth >= 0; // (tumbling out of a hard plate)
      }
      return true;
    };
    // how it presents now: frontal area and drag (nose-first, tumbling, opened)
    const shape = () => [p.nose === 'broad' ? area(0.03) : yawed ? p.d * p.len * 0.85 : area(p.d) * (p.nose === 'dart' ? 0.6 : 1),
      yawed ? CD.yaw : expanded || p.flat ? CD.open : p.nose === 'ball' ? CD.ball : CD.fmj];
    const log = res.log = [], note = (name) => { if (!log.length || log[log.length - 1].m !== name) log.push({ m: name, v: Math.round(v), t }); }; // (what it went through, and how fast it was going into each: the F9 readout)
    // which segment is this point in (the deepest, where two meet)?
    const locate = (tt) => {
      _w.copy(o).addScaledVector(u, tt);
      let c = null, q = null, b = -1;
      for (const m of mats) {
        if (tt < m.t0 - STEP || tt > m.t1 + STEP) continue;
        _q.copy(_w).applyMatrix4(m.inv);
        const k = inSeg(m.s, _q);
        if (k >= 0 && k > b) { b = k; c = m; q = _q.clone(); }
      }
      return { c, q, b };
    };
    let ds = STEP, inBone = false;
    for (let guard = 0; guard < 6000 && t <= tHi && v > V_STOP; guard++) {
      let { c: cur, q: cq, b: best } = locate(t);
      if (cur && !prev) { // into the body (or back into it) from outside: back to the skin itself, then armour on the way in
        if (guard) { let lo = t - ds, hi = t; for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (locate(mid).c) hi = mid; else lo = mid; } t = hi; ({ c: cur, q: cq, b: best } = locate(t)); }
        if (res.entryT == null) res.entryT = t;
        if (!armourPass(cur, cq, true)) break;
        if (cur.s.shell) { // (the skull's curve: a round coming in shallow skids round it, under the scalp, and off)
          _ud.copy(u).transformDirection(cur.inv);
          const cs = Math.abs(normal(cur.s, cq, _n).dot(_ud));
          if (glances(p, v, 'bone', cur.s.shell * 1000, cs)) { const rr = ricochet(p, v, 'bone', cs); hitOf(cur.s).E += rr.absorbed; hitOf(cur.s).crush += 0.5; glanced(cur, cq, rr); break; }
        }
      } else if (!cur && prev) { // out of it: armour on the way out (the back plate)
        if (!armourPass(prev, prevQ, false)) break;
      }
      ds = STEP;
      if (cur) {
        const s = cur.s, h = hitOf(s);
        // what it's going through here: the layer of the wall it's in, an organ or a bone, or what fills the part
        const dep = under(s, cq, best), wl = wallAt(s, cq, dep);
        let key = wl || s.fill, inOrg = null;
        if (wl !== 'skin') for (const [oid, sh, bb] of s.organs || []) {
          if (cq.x < bb[0] || cq.x > bb[3] || cq.y < bb[1] || cq.y > bb[4] || cq.z < bb[2] || cq.z > bb[5]) continue;
          const dist = orgDist(sh, cq);
          if (dist > 0) continue;
          inOrg = inOrg || oid;
          const O = ORG[oid]; key = O.bone ? (-dist < O.cortex ? 'cortical' : O.core) : O.mat;
        }
        if (s.shell && (wl === 'cortical' || wl === 'diploe')) inOrg = inOrg || 'skull';
        const M = G.Materials.TISSUE[key], bone = !!M.bone, hard = bone || wl === 'skin';
        if (wl || bone) ds = FINE;
        note(M.name);
        // how it's flying: nose first, tumbling side-on, or opened up
        depth += ds * 100;
        if (p.nose === 'hp' && !expanded && !p.deformed && v >= (p.vExp || 300) && depth > 0.8) { expanded = true; p.d *= EXPAND; p.yaw = 0; }
        if (p.soft && !p.flat && !p.deformed && depth > 2) { p.flat = true; p.d *= p.soft; }
        if (!yawed && !expanded && p.yaw && depth >= p.yaw) yawed = true;
        if (bone && !yawed && !expanded && p.nose === 'fmj' && p.yaw) yawed = true; // (bone tips it over)
        if (bone && !inBone) { // into a bone: it does to the round what any hard thing does, and it shatters (splinters flying on along the track)
          deform(p, v, v, MAT.bone, 8);
          if (v > 250) for (let i = 0; i < 3; i++) frags.push({ t, v: v * 0.45, m: 0.0003, dir: jitter(u, 0.5), sp: 1 });
        }
        inBone = bone;
        // fragmenting: tumbling above its threshold, the core sheds 40% of itself as six fragments
        if (yawed && p.frag && v >= p.frag && !p.split) {
          p.split = true; const mf = p.m * 0.4 / 6; p.m *= 0.6;
          for (let i = 0; i < 6; i++) frags.push({ t, v, m: mf, dir: jitter(u, 0.18) });
        }
        const [A, Cd] = shape(), v1 = slow(v, p.m, A, Cd, M, ds), dE = 0.5 * p.m * (v * v - v1 * v1);
        const crush = A * ds * 1e6 * (p.nose === 'broad' ? 1.5 : 1); // cm³
        h.E += dE; h.crush += crush;
        if (bone && v1 > 0) res.dev = Math.hypot(res.dev, (1 - v1 / v) * 0.7); // (a bone throws it off line by what it took)
        // the temporary cavity: its reach, and the organs it stretches (and those the track crushes). Skin and bone give up their
        // energy tearing and breaking, not throwing tissue outward: it's the flesh it's moving through that makes the cavity
        const dC = hard ? 0.5 * p.m * (v * v - slow(v, p.m, A, Cd, G.Materials.TISSUE.muscle, ds) ** 2) : dE, rT = Math.sqrt(dC / ds / (Math.PI * CAV_C));
        for (const [oid, sh, bb] of s.organs || []) {
          if (cq.x < bb[0] - rT || cq.x > bb[3] + rT || cq.y < bb[1] - rT || cq.y > bb[4] + rT || cq.z < bb[2] - rT || cq.z > bb[5] + rT) continue;
          const dist = orgDist(sh, cq), O = ORG[oid];
          if (dist <= 0) { h.organs[oid] = (h.organs[oid] || 0) + crush + dC * (O.stretch || 0) * 0.01; (h.pierced || (h.pierced = {}))[oid] = 1; }
          else if (dist < rT && O.stretch) {
            h.organs[oid] = (h.organs[oid] || 0) + dC * O.stretch * 0.01 * (1 - dist / rT);
            if (O.stretch >= TEAR_S && dist < rT - CAV_TEAR) (h.torn || (h.torn = {}))[oid] = 1;
          }
        }
        if (inOrg === 'skull') h.organs.skull = (h.organs.skull || 0) + crush;
        if (trace) trace.push({ t, rP: Math.sqrt(A / Math.PI), rT, v: v1, yawed, expanded, bone: s.bone }); // (bone: the one the segment it's in hangs from)
        v = v1;
        if (v <= V_STOP) { h.E += 0.5 * p.m * v * v; v = 0; } // (the last of it, left where it stopped)
      }
      prev = cur; prevQ = cq; t += ds;
    }
    // the fragments: each tears its own short track from where it broke off (the same sums, a small jagged chip)
    for (const f of frags) { const q = fragment(mats, o, u, f, hitOf); if (trace) (trace.frags = trace.frags || []).push({ t: f.t, dir: f.dir, len: q.len, v0: f.v, v: q.v, m: f.m, sp: f.sp }); }
    res.exitV = res.stopped ? 0 : v > V_STOP ? v : 0;
    res.exitT = t;
    if (res.exitV) { // (out the far side: thrown off line by what it lost in them, and it's left them turning)
      const loss = 1 - res.exitV / v0;
      res.dev = Math.hypot(res.dev, 0.01 + 0.15 * loss);
      if (yawed) p.ang = Math.max(p.ang || 0, 1.2); else if (p.len / p.d > 1.3) p.ang = Math.min(Math.PI / 2, (p.ang || 0) + 0.5 * loss);
    }
    res.p = p;
    return res;
  }
  // What a line through a body crosses (the hitbox readout, js/hud.js debugTarget): the segments, front to back, each
  // with the organs in it in the order the line reaches them. Just the shapes: no armour, no round. Returns
  // { t (metres to where it enters), path: [{ seg, part, side, t, organs: [id] }] } or null.
  function probe(rig, o, u, tMax = 3) {
    const S = segs(), mats = [];
    rig.root.updateMatrixWorld(true);
    let tLo = Infinity, tHi = -Infinity;
    for (const s of S) {
      const bone = boneOf(rig, s.bone);
      if (!bone) continue;
      const inv = new T.Matrix4().copy(bone.matrixWorld).invert(), lo = _o.copy(o).applyMatrix4(inv), ld = _ud.copy(u).transformDirection(inv), sc = new T.Vector3().setFromMatrixScale(bone.matrixWorld).x || 1;
      const b = s.bb; let t0 = 0, t1 = tMax / sc, ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        const oo = a === 0 ? lo.x : a === 1 ? lo.y : lo.z, dd = a === 0 ? ld.x : a === 1 ? ld.y : ld.z;
        if (Math.abs(dd) < 1e-9) { if (oo < b[a] || oo > b[a + 3]) ok = false; continue; }
        let q0 = (b[a] - oo) / dd, q1 = (b[a + 3] - oo) / dd; if (q0 > q1) { const z = q0; q0 = q1; q1 = z; }
        t0 = Math.max(t0, q0); t1 = Math.min(t1, q1); if (t0 > t1) ok = false;
      }
      if (!ok) continue;
      mats.push({ s, inv, t0: t0 * sc, t1: t1 * sc });
      tLo = Math.min(tLo, t0 * sc); tHi = Math.max(tHi, t1 * sc);
    }
    const path = [];
    let last = null;
    for (let t = tLo; t <= tHi; t += STEP) {
      _w.copy(o).addScaledVector(u, t);
      let cur = null, cq = null, best = -1;
      for (const m of mats) {
        if (t < m.t0 - STEP || t > m.t1 + STEP) continue;
        _q.copy(_w).applyMatrix4(m.inv);
        const k = inSeg(m.s, _q);
        if (k >= 0 && k > best) { best = k; cur = m; cq = _q.clone(); }
      }
      if (!cur) { last = null; continue; }
      if (!last || last.s !== cur.s) path.push(last = { s: cur.s, seg: cur.s.id, part: cur.s.part, side: cur.s.side || null, t, organs: [] });
      for (const [oid, sh] of cur.s.organs || []) if (!last.organs.includes(oid) && orgDist(sh, cq) <= 0) last.organs.push(oid);
    }
    for (const p of path) delete p.s;
    return path.length ? { t: path[0].t, path } : null;
  }
  function jitter(u, a) { const d = u.clone().add(new T.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a)); return d.normalize(); }
  function fragment(mats, o, u, f, hitOf) {
    const start = o.clone().addScaledVector(u, f.t);
    let v = f.v, t = 0, end = 0, inside = false;
    const A = area(0.0025), Cd = 1.2;
    for (let i = 0; i < 80 && v > V_STOP; i++, t += STEP) {
      _w.copy(start).addScaledVector(f.dir, t);
      let cur = null, cq = null;
      for (const m of mats) { _q.copy(_w).applyMatrix4(m.inv); if (inSeg(m.s, _q) >= 0) { cur = m; cq = _q.clone(); break; } }
      inside = !!cur;
      if (!cur) continue;
      end = t;
      const v1 = slow(v, f.m, A, Cd, G.Materials.TISSUE.muscle, STEP), dE = 0.5 * f.m * (v * v - v1 * v1), crush = A * STEP * 1e6, h = hitOf(cur.s);
      h.E += dE; h.crush += crush;
      for (const [oid, sh] of cur.s.organs || []) if (orgDist(sh, cq) <= 0) h.organs[oid] = (h.organs[oid] || 0) + crush + dE * (ORG[oid].stretch || 0) * 0.01;
      v = v1;
    }
    return { len: end, v: !inside && v > V_STOP ? v : 0 }; // (how far through them it went, and what it came out at, if it did)
  }

  // ---------------------------------------------------------------- what the wounds do
  // A segment's wound as effects on its part: { part, dmg (of a 100-point person), effects: [...], organs: [[id, dmg, hp]] }.
  // Effects: 'dead' (brain, brainstem, cervical spine), 'massive' (heart, aorta, iliac: bleeds out in seconds), 'out' and
  // 'cardiac' (any round through the heart wrecks it: down at once, dead a second or two later; one that only passes
  // close by, its cavity stretching it, bleeds it massively), 'heavy' (liver, spleen, kidney, a carotid, a limb's artery, a big wound in
  // muscle), 'light', 'lung' (a lung or the airway), 'gut' (stomach, bowel), 'spine' (paralysed below), 'frac'.
  const EFFECT = {
    brain: ['dead'], brainstem: ['dead'], spineC: ['dead'], heart: ['massive'], aorta: ['massive'], iliac: ['massive'],
    carotid: ['heavy'], trachea: ['lung', 'light'], lungL: ['lung', 'light'], lungR: ['lung', 'light'], liver: ['heavy'], spleen: ['heavy'], kidney: ['heavy'],
    stomach: ['gut', 'light'], bowel: ['gut', 'light'], spineT: ['spine'], pelvis: ['frac'], humerus: ['frac'], forearm: ['frac'], femur: ['frac'], tibia: ['frac'],
    brachial: ['heavy'], femoral: ['heavy'],
  };
  for (const id of PAIRED) { for (const S of ['L', 'R']) EFFECT[id + S] = EFFECT[id]; delete EFFECT[id]; }
  // What a wound costs: the energy the round left in that part (and what got through their armour as blunt trauma) as a
  // share of PERSON_J, what a person can take. Square on an unarmoured torso a .22 leaves about 165 J, a 9 mm that goes through 320, a hollow point 460, 5.56 1200, 7.62x39 1050, 7.62x51 1700, a 00 buck pellet 195. There's only so much
  // of a limb: PART_J, what a part can count for at most, the rest going into tissue already wrecked (what the track
  // did to the bone and the artery in it is the wound, whatever the energy: effects).
  const PERSON_J = 1600, DMG_PER_J = 100 / PERSON_J, PART_J = { farm: 300, uarm: 450, shin: 450, thigh: 650, neck: 800, pelvis: 1200, abdomen: 1400 };
  const WRECK = new Set(['heart', 'brainstem', 'spineC']);
  function effects(h) {
    const eff = new Set(), organs = [];
    for (const [id, d0] of Object.entries(h.organs)) {
      // (a round through the heart, the brainstem or the cervical spine wrecks it, however little of it it took; the
      // cavity tearing an organ apart, any organ: CAV_TEAR)
      const O = ORG[id], wrecked = (WRECK.has(id) && h.pierced && h.pierced[id]) || (h.torn && h.torn[id]), d = wrecked ? Math.max(d0, O.hp) : d0;
      if (id === 'skull' || d < 0.05) continue;
      organs.push([id, Math.round(d * 100) / 100, O.hp]);
      for (const e of EFFECT[id] || []) eff.add(e);
      if (id === 'heart' && (wrecked || d >= O.hp)) { eff.add('out'); eff.add('cardiac'); }
      if ((id === 'lungL' || id === 'lungR') && d >= O.hp * 0.5) eff.add('heavy');
      if ((id === 'liver' || id === 'spleen' || O.pair === 'kidney') && d >= O.hp) eff.add('massive'); // (torn apart: bleeds out in seconds)
      if (id === 'brain' && d < 0.3) { eff.delete('dead'); eff.add('out'); } // (a graze: knocked out, not killed)
    }
    if (h.crush >= 15) eff.add('heavy'); else if (h.crush >= 1.5) eff.add('light');
    const dmg = Math.min(h.E + h.blunt, PART_J[h.seg] || Infinity) * DMG_PER_J;
    return { part: h.part, side: h.side, seg: h.seg, dmg, effects: [...eff], organs, blunt: h.blunt, armour: h.armour };
  }

  // ---------------------------------------------------------------- the target's armour, as pieces
  // An officer's kit (js/gear.js): helmet and face, carrier (soft), plate, each with its condition
  function kitArmour(me) {
    const k = me.kit, out = [], add = (it, key) => { const d = it && G.Gear.defOf(it); if (d && d.prot) out.push({ def: d, cond: G.Gear.cond(it), item: it, key }); };
    if (!k) return out;
    add(k.helmet, 'helmet'); add(k.helmet && k.helmet.face, 'face'); add(k.carrier, 'carrier'); add(k.carrier && k.carrier.plate, 'plate');
    return out;
  }
  // What a round did in the armour it met and the body behind it, layer by layer, for the replays to show (js/highlights.js
  // armour cam), from through's log: r, a row a layer, in the order it met them ({ k: its material, mm, v in, o out, s: the share
  // of the way in it stopped, d, l, g, a: the round after it, pc: the piece, un: never reached } for armour, { n: its name, mm, v, o }
  // for a body); b, the joules that got to the body as blunt trauma; e, how it ended (armour: stopped before it reached them,
  // glance, in: stopped in them or the armour on their far side, out); cos, how square it struck; null if it met none.
  function armourLog(r) {
    const L = r.log, first = L && L.find((q) => q.k);
    if (!first) return null;
    const mm3 = (x) => +(x * 1000).toFixed(2), rows = [];
    L.slice(0, 20).forEach((q, i) => {
      if (!q.k) { const nx = L.slice(i + 1).find((x) => x.t != null); rows.push({ n: q.m, mm: Math.max(1, Math.round(((nx ? nx.t : r.exitT) - q.t) * 1000)), v: q.v, o: L[i + 1] ? L[i + 1].v : Math.round(r.exitV) }); return; }
      rows.push({ k: q.k, mm: q.mm, v: q.v, o: q.o, s: q.s == null ? null : +Math.min(1, q.s).toFixed(2), d: mm3(q.d), l: mm3(q.l), g: +(q.g * 1000).toFixed(2), a: +q.a.toFixed(2), pc: q.pc, gl: q.gl ? 1 : undefined });
      for (const [k, mm] of q.rest || []) rows.push({ k, mm, v: 0, o: 0, pc: q.pc, un: 1 });
    });
    return { r: rows, b: Math.round(r.hits.reduce((a, h) => a + h.blunt, 0)), e: r.ric ? 'glance' : r.exitV ? 'out' : r.stopped && L.every((q) => q.k) ? 'armour' : 'in', cos: +first.cos.toFixed(3), cond: first.cond };
  }
  // What an officer's wearing, for their state (st.ac: what they're wearing is in the world, so whoever shoots them works it
  // out against it, js/player.js roundSegment), and the same back as pieces, from that state
  const armourState = (me) => kitArmour(me).map((a) => [a.key, a.item.gid, Math.round(a.cond * 100) / 100]);
  const stateArmour = (st) => (st && st.ac || []).map(([key, gid, cond]) => ({ def: G.Gear.DEFS[gid], cond, key })).filter((a) => a.def && a.def.prot);
  // What a round did to an officer, whole, as the shooter worked it out, for them to take (js/player.js applyWounds): the
  // wounds ([part, damage, effects, organs, segment]), whether armour rang, stopped it, and the joules each piece soaked.
  function outcome(r, armour) {
    const o = { ws: [], rang: 0, stopped: r.stopped && !r.glance ? 1 : 0, wear: {} };
    for (const h of r.hits) {
      const w = effects(h);
      if (h.armour.some((q) => !q.through)) o.rang = 1;
      if (w.dmg >= 0.05 || w.effects.length) o.ws.push([w.part, Math.round(w.dmg * 100) / 100, w.effects, w.organs, w.seg]);
      for (const q of h.armour) if (q.fp) (o.fc = o.fc || []).push([q.fp[0], q.fp[1], q.glance ? 2 : q.through ? 1 : 0]);
    }
    for (const a of armour) if (a.wear) { o.wear[a.key] = Math.round(a.wear); a.wear = 0; }
    return o;
  }
  // a suspect's (js/data.js G.ARMORS; a mandible or face shield is an officer's, js/gear.js), its condition kept on the
  // view (ev.vc vest, ev.hc helmet, ev.fc face)
  function suspectArmour(ev) {
    const out = [], d = ev.def;
    const v = G.ARMORS[d.vest], h = G.ARMORS[d.helmet], f = d.face && G.Gear.DEFS[d.face];
    if (v && v.prot) out.push({ def: v, cond: ev.vc == null ? 1 : ev.vc, ev, key: 'vc' });
    if (h && h.prot) out.push({ def: h, cond: ev.hc == null ? 1 : ev.hc, ev, key: 'hc' });
    if (f && f.prot) out.push({ def: f, cond: ev.fc == null ? 1 : ev.fc, ev, key: 'fc' });
    return out;
  }
  // what the armour soaked: the wear on each piece (a point of durability per wearJ joules, by its first layer)
  function wearOut(pieces) {
    for (const a of pieces) {
      if (!a.wear) continue;
      const pr = a.def.prot && a.def.prot[0], M = MAT[pr && pr.layers[0][0]] || MAT.aramid, pts = a.wear / M.wearJ;
      if (a.item) a.item.dur = Math.max(0, a.item.dur - pts);
      else if (a.ev) a.ev[a.key] = Math.max(0, (a.ev[a.key] == null ? 1 : a.ev[a.key]) - pts / Math.max(1, a.def.dur));
      a.wear = 0;
    }
  }

  // ---------------------------------------------------------------- a reference body for hits you take
  // Rounds that hit you are worked out on your own machine, through a body posed as you are (js/rig.js: the same one
  // your teammates see), from where the shooter was to the part the host says it hit.
  let selfRig = null;
  function self() {
    const me = G.Me, g = G.Game;
    if (!selfRig) { selfRig = G.Rig.create({ style: 'tactical', bare: true, seed: 1 }); selfRig.root.visible = false; }
    const st = { pos: me.pos.clone(), yaw: me.yaw, pitch: me.pitch, crouch: !!me.crouch, alert: true, lean: me.lean || 0, state: me.down ? 'down' : 'alive', prone: !!me.prone };
    for (let i = 0; i < 8; i++) selfRig.update(0.05, st);
    selfRig.root.updateMatrixWorld(true);
    return selfRig;
  }
  // ---------------------------------------------------------------- what armour is rated for (head-on, at 10 m)
  const THREATS = [['.22 LR', '5.6/15', 'ball'], ['9 mm', '9/19', 'ball'], ['.45 ACP', '11.43/23', 'ball'], ['.44 Magnum', null, null, [15.6, 10.9, 'lead', 436]],
    ['5.7x28', '5.7/29', 'ball'], ['00 buck', '18.5/70', 'buck'], ['12 ga slug', '18.5/70', 'slug'], ['7.62x39', '7.62/39', 'ball'], ['5.56', '5.56/45', 'ball'],
    ['7.62x51', '7.62/51', 'ball'], ['5.56 AP', '5.56/45', 'ap'], ['7.62x39 AP', '7.62/39', 'ap'], ['.338 Lapua', '8.6/69', 'ball'], ['.50 BMG', '12.7/99', 'ball']];
  function refRound(cal, am, raw) {
    if (raw) { const [g, mm, core, v] = raw; return { p: { m: g / 1000, d: mm / 1000, len: 0.02, core, nose: 'fmj' }, v }; }
    const def = Object.values(G.WEAPONS).find((d) => G.calOf(d) === cal);
    if (!def) return null;
    return { p: projectile(def, am), v: G.roundSpeed(def, am, 10) || 400 };
  }
  const stopsRound = (r, layers) => { let ok = 0; for (let i = 0; i < 5; i++) ok += layerStack(Object.assign({}, r.p), r.v, layers) ? 0 : 1; return ok >= 3; }; // (no glancing head-on)
  // how hard each threat is to stop: the thickness of steel, of aramid and of polyethylene it takes, each as a share of
  // what a .50's takes, added up (not its energy: a soft lead slug carries more than a 7.62x51 and a thin vest stops it)
  let HARD = null;
  function hardness() {
    if (HARD) return HARD;
    HARD = {};
    const need = (r, mat) => { let lo = 0, hi = 160; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (stopsRound(r, [[mat, m / 2]])) hi = m; else lo = m; } return hi / 2; };
    const rs = THREATS.map(([name, cal, am, raw]) => [name, refRound(cal, am, raw)]).filter(([, r]) => r);
    const ref = rs.find(([n]) => n === '.50 BMG')[1], top = ['steel', 'aramid', 'pe'].map((mat) => need(ref, mat));
    for (const [name, r] of rs) HARD[name] = ['steel', 'aramid', 'pe'].reduce((a, mat, i) => a + need(r, mat) / top[i], 0);
    return HARD;
  }
  // the threats a set of layers stops head-on, those it doesn't, and the hardest to stop of those it does (best)
  function rating(layers) {
    const stops = [], fails = [], H = hardness();
    let best = null;
    for (const [name, cal, am, raw] of THREATS) {
      const r = refRound(cal, am, raw);
      if (!r) continue;
      if (stopsRound(r, layers)) { stops.push(name); if (!best || H[name] > H[best]) best = name; } else fails.push(name);
    }
    return { stops, fails, best };
  }
  function layerStack(p, v, layers) { for (const [mat, mm] of layers) { const r = layer(p, v, mat, mm, 1, 1); if (!r.through) return false; v = r.v; } return true; }

  // ---------------------------------------------------------------- for the shop and the gunsmith
  // a gun's round's energy (J, all its pellets) d metres out, with this load (ball by default)
  function energy(def, am, d = 10) {
    if (def.explosive || def.cls === 'BOW' && !CAL.bolt) return 0;
    const load = am || G.ballFor(G.calOf(def)), p = projectile(def, load), v = def.cls === 'RAIL' ? 2000 : G.roundSpeed(def, load, d) || 0;
    return 0.5 * p.m * v * v * (def.pellets > 1 && load !== 'slug' ? def.pellets : 1);
  }
  const CORE = { lead: 'lead core', mild: 'mild-steel core', hard: 'hardened steel core', wc: 'tungsten carbide core' };
  // what a load is, physically, in a few words (for that caliber)
  function loadNotes(def, am) {
    const p = projectile(def, am), out = [];
    out.push(p.n > 1 && am !== 'slug' ? `${p.n} × ${Math.round(p.m * 10000) / 10} g` : `${Math.round(p.m * 10000) / 10} g, ${Math.round(p.d * 10000) / 10} mm`);
    out.push(CORE[p.core] || p.core);
    if (p.nose === 'hp') out.push(`opens to ${EXPAND}× above ${Math.round(p.vExp)} m/s`);
    if (p.soft) out.push(`soft lead: flattens to ${p.soft}×`);
    if (p.frag) out.push(`fragments above ${p.frag} m/s`);
    if (p.yaw) out.push(`tumbles at ${Math.round(p.yaw)} cm`);
    const v = G.roundSpeed(def, am, 0); if (v) out.push(`${Math.round(v)} m/s`);
    return out;
  }
  // a piece of armour's main protection (what a card shows): the layers where it matters most
  function mainLayers(d, plate) {
    const pick = (at) => (d.prot || []).find((p) => p.at === at);
    if (plate && plate.prot) return plate.prot[0].layers;
    const pr = pick('plate') || pick('helmet') || pick('face') || pick('torso') || (d.prot || [])[0];
    return pr ? pr.layers : null;
  }
  const AT_NAME = { plate: 'chest plate', side: 'sides', torso: 'chest and stomach', groin: 'groin', shoulder: 'shoulders', thigh: 'thighs', helmet: 'head', face: 'face' };
  const layersText = (L) => L.map(([m, mm]) => `${mm} mm ${MAT[m].name}`).join(' + ');

  return { CAL, MAT, ORG, EFFECT, PERSON_J, energy, flightDrag, snap, unsnap, strike, crossSolid, deflect, mark, armourState, stateArmour, outcome, armourLog, loadNotes, mainLayers, AT_NAME, layersText, projectile, layer, stack, through, probe, boneOf, effects, segs, covers, brim, kitArmour, suspectArmour, wearOut, self, rating, THREATS };
})();
