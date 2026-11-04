// The set of builds the model pipeline is verified over, and a geometry fingerprint of a built gun. Shared by the baker
// (tools/bake_models.mjs: coupling detection) and the tests (tools/check_models_assembly.mjs).
//
// SWEEP SET. For each platform: three base builds (the default; "loaded A" = every empty slot filled with its first part but
// no optic or magnifier; "loaded B" = the same with a red dot and a magnifier), and from each base every single swap: each slot
// set to each part that fits it, and each optional slot emptied (then pruned: a part whose slot has gone goes with it).
// ~9,200 distinct builds over the 79 platforms.

/** The "loaded" build of a platform (see the sweep set): mode 'A' no optic/magnifier, 'B' with them. */
export function loadedBuild(GS, id, mode) {
  let b = GS.defaultBuild(id);
  for (let pass = 0; pass < 3; pass++) for (const s of GS.slotsOf(id, b)) {
    if (b[s.slot]) continue;
    const k = s.slot.replace(/\d+$/, '');
    if (['mag', 'receiver', 'charging', 'loader', 'pump', 'tube', 'limbs', 'motor', 'cap'].includes(k)) continue;
    let c = GS.compatible(s.mount).filter((p) => GS.fitsSlot(s, p, id) && !p.retired && !p.variant);
    if (k === 'optic' || k === 'magnifier') { if (mode === 'A') continue; if (k === 'optic') { const r = c.find((p) => p.model && p.model.optic === 'reddot'); c = r ? [r] : c; } }
    if (c[0]) b = Object.assign({}, b, { [s.slot]: c[0].id });
  }
  if (mode === 'B') {
    for (const s of GS.slotsOf(id, b)) if (s.slot === 'optic' && GS.PARTS[b.optic] && GS.PARTS[b.optic].factory) { const r = GS.compatible(s.mount).find((p) => p.model && p.model.optic === 'reddot' && GS.fitsSlot(s, p, id)); if (r) b.optic = r.id; }
    for (const s of GS.slotsOf(id, b)) if (s.slot === 'magnifier' && !b.magnifier) { const r = GS.compatible(s.mount).find((p) => GS.fitsSlot(s, p, id)); if (r) b.magnifier = r.id; }
  }
  GS.prune(id, b); return b;
}

/** A stable text key of a build (slot=part pairs, sorted). */
export const buildKey = (b) => Object.keys(b).sort().map((s) => s + '=' + b[s]).join(',');

/** The sweep of one platform: { bases: [the three base builds], list: [{ base: index into bases, slot, part ('' = emptied; null for a base itself), build }] }, distinct builds only. */
export function sweepOf(GS, id) {
  const out = [], seen = new Set(), all = [];
  const add = (e) => { const k = buildKey(e.build); all.push(e); if (seen.has(k)) return false; seen.add(k); out.push(e); return true; };
  const bases = [GS.defaultBuild(id), loadedBuild(GS, id, 'A'), loadedBuild(GS, id, 'B')];
  bases.forEach((b, i) => add({ base: i, slot: null, part: null, build: b }));
  bases.forEach((base, i) => {
    for (const s of GS.slotsOf(id, base)) {
      const opts = GS.compatible(s.mount).filter((p) => GS.fitsSlot(s, p, id)).map((p) => p.id);
      if (!s.req) opts.push('');
      for (const pid of opts) {
        if ((base[s.slot] || '') === pid) continue;
        const nb = Object.assign({}, base); if (pid) nb[s.slot] = pid; else delete nb[s.slot];
        GS.prune(id, nb);
        add({ base: i, slot: s.slot, part: pid, build: nb });
      }
    }
  });
  return { bases, list: out, all };
}

/**
 * `n` distinct random builds of a platform that are NOT in its sweep: two or three random swaps (a part or an emptied slot) from a random base,
 * pruned. Deterministic for a seed. The baker feeds some to its coupling analysis (so interactions between two parts changed at once are learnt);
 * the test uses other seeds as a held-out check.
 */
export function randomBuilds(GS, id, bases, n, seed, exclude = new Set()) {
  let s = seed >>> 0; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const out = [], seen = new Set(exclude);
  for (let tries = 0; out.length < n && tries < n * 8; tries++) {
    const b = { ...bases[Math.floor(rnd() * bases.length)] }, k = 2 + Math.floor(rnd() * 2);
    for (let j = 0; j < k; j++) {
      const slots = GS.slotsOf(id, b); if (!slots.length) break; const sl = slots[Math.floor(rnd() * slots.length)];
      const opts = GS.compatible(sl.mount).filter((p) => GS.fitsSlot(sl, p, id)).map((p) => p.id); if (!sl.req) opts.push('');
      const pid = opts[Math.floor(rnd() * opts.length)]; if (pid) b[sl.slot] = pid; else delete b[sl.slot]; GS.prune(id, b);
    }
    const key = buildKey(b); if (seen.has(key)) continue; seen.add(key); out.push(b);
  }
  return out;
}

/** The compiled def of a build, as the gunsmith builds a model from it. */
export const defOf = (G, id, build) => ({ id, build, mag: G.WEAPONS[id].mag, code: G.Gunsmith.encode(id, build) });

/**
 * A built gun's meshes in the gun's frame: [{ tag, node ('' = directly under the root; else the part_/group_ node's key), mat, v: Float64Array of the triangles' vertices (9 per triangle) }],
 * world-space (every node transform applied), the way the game draws them.
 */
export function meshesOf(group, info) {
  group.updateMatrixWorld(true);
  const animOf = new Map(); for (const [k, v] of Object.entries(info.anim || {})) if (v && v.isObject3D) animOf.set(v, k);
  const out = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    let node = '', p = o.parent;
    while (p && p !== group) { const a = animOf.get(p); node = a ? 'part_' + a : node || 'group'; if (a) break; p = p.parent; }
    const pos = o.geometry.attributes.position, idx = o.geometry.index, e = o.matrixWorld.elements, n = idx ? idx.count : pos.count, v = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const j = idx ? idx.getX(i) : i, x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
      v[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; v[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; v[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    const m = o.material || {};
    out.push({ tag: o.userData.slot || 'base', node, mat: m.name || ('m_' + (m.color ? m.color.getHexString() : '')), v });
  });
  return out;
}
