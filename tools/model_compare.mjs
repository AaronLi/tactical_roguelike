// Comparing a gun assembled from the packs with the recipe's own (tools/check_models_assembly.mjs, tools/check_model_cases.mjs), and the golden fingerprint of a gun.
import crypto from 'crypto';
import { meshesOf } from './model_sweep.mjs';
import { cleanInfo } from './model_parts.mjs';
import { matchTriangles } from './model_diff.mjs';

const R4 = (x) => Math.round(x * 1e4);
const unitsOf = (ms) => { const o = {}; for (const m of ms) { const t = m.tag.split('@')[0]; (o[t] = o[t] || []).push(m); } return o; };

/** An order-independent hash of a slot's triangles: every triangle's world position to 0.1 mm and its material. */
export function triHash(ms) {
  const parts = [];
  for (const m of ms) for (let i = 0; i < m.v.length; i += 9) { const c = [0, 1, 2].map((k) => [R4(m.v[i + k * 3]), R4(m.v[i + k * 3 + 1]), R4(m.v[i + k * 3 + 2])]); let r = 0; for (let k = 1; k < 3; k++) if (c[k].join() < c[r].join()) r = k; parts.push(m.mat + '|' + [c[r], c[(r + 1) % 3], c[(r + 2) % 3]].join(';')); } // (a triangle's corners may start anywhere: the compressed file reorders them, winding kept)
  parts.sort(); return crypto.createHash('md5').update(parts.join(';')).digest('hex');
}

/** The recipe's and the packs' comparer for one loaded game: { compare(def, asm, proc), procedural(def), fingerprint(asm) }. */
export function makeComparer(G, Models, TOL = 5e-5) {
  const M = G.Models, GM = G.GunModels;
  /** The recipe's own model (G.Models.displayBaked is what display() asks first: turned off for the reference). */
  const procedural = (def) => { const f = M.displayBaked; M.displayBaked = () => null; try { return GM.display(def); } finally { M.displayBaked = f; } };

  /** Compares an assembled gun with the recipe's: { kind: 'exact' | 'tol' | 'wrong', dev, diffs: [{ kind: 'info' | 'slot' | 'tri' | 'anim' | 'pivot' | 'bounds', what, detail }] }. Lists EVERY difference. */
  function compare(def, asm, proc) {
    const diffs = [], D = (kind, what, detail) => diffs.push({ kind, what, detail });
    const a = meshesOf(asm.group, asm.info), p = meshesOf(proc.group, proc.info);
    const ia = Models.infoLeaves(cleanInfo(Object.fromEntries(Object.entries(asm.info).filter(([k]) => k !== 'mounts')))), ip = Models.infoLeaves(cleanInfo(proc.info));
    for (const k of new Set([...Object.keys(ia), ...Object.keys(ip)])) { const x = ia[k], y = ip[k]; if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 1e-6 : JSON.stringify(x) === JSON.stringify(y))) D('info', k, `assembled ${JSON.stringify(x)}, recipe ${JSON.stringify(y)}`); }
    // the geometry's cached bounds (frustum culling and the gunsmith's framing use them) must belong to the vertices it has now
    let stale = null;
    asm.group.traverse((o) => { if (!stale && o.isMesh && o.geometry.boundingBox) { const b = o.geometry.boundingBox.clone(); o.geometry.boundingBox = null; o.geometry.computeBoundingBox(); if (b.min.distanceTo(o.geometry.boundingBox.min) > 1e-5 || b.max.distanceTo(o.geometry.boundingBox.max) > 1e-5) stale = o.name; } });
    if (stale) D('bounds', stale, 'mesh ' + stale + ' has stale cached bounds');
    // animated parts: the same keys, the same pivots
    const ka = Object.keys(asm.info.anim).sort(), kp = Object.keys(proc.info.anim).filter((k) => proc.info.anim[k] && proc.info.anim[k].isObject3D).sort();
    if (ka.join() !== kp.join()) D('anim', 'parts', `animated parts: assembled ${ka}, recipe ${kp}`);
    asm.group.updateMatrixWorld(true); proc.group.updateMatrixWorld(true);
    for (const k of ka) {
      const x = asm.info.anim[k], y = proc.info.anim[k]; if (!y) continue; if (x.name !== 'part_' + k) { D('anim', k, `node ${x.name} for part ${k}`); continue; }
      const dx = x.getWorldPosition(new x.position.constructor()), dy = y.getWorldPosition(new y.position.constructor());
      if (dx.distanceTo(dy) > 1e-5) D('pivot', 'part_' + k, `pivot differs by ${(dx.distanceTo(dy) * 1000).toFixed(2)} mm`);
    }
    const ua = unitsOf(a), up = unitsOf(p); let dev = 0, exact = true;
    for (const t of new Set([...Object.keys(ua), ...Object.keys(up)])) {
      if (!ua[t]) { D('slot', t, `slot ${t} is missing from the assembled gun`); continue; }
      if (!up[t]) { D('slot', t, `slot ${t} is in the assembled gun and not in the recipe's`); continue; }
      const na = ua[t].reduce((s, m) => s + m.v.length / 9, 0), np = up[t].reduce((s, m) => s + m.v.length / 9, 0);
      if (triHash(ua[t]) === triHash(up[t])) continue;
      exact = false;
      const d = matchTriangles(ua[t], up[t], TOL);
      if (!(d <= TOL)) D('tri', t, `slot ${t}: the triangles are not the recipe's (${na} assembled, ${np} recipe; within ${TOL * 1000} mm)`); else if (d > dev) dev = d;
    }
    if (diffs.length) return { kind: 'wrong', diffs };
    return exact ? { kind: 'exact', dev: 0, diffs } : { kind: 'tol', dev, diffs };
  }

  /**
   * The golden fingerprint of an assembled gun: per slot { tris, hash, box (min then max, mm to 0.1), area (cm2) } and the info leaves (numbers to 0.01 mm / 5 decimals).
   * It says what the gun IS, whatever made it, so a gun authored in Blender with no recipe is checked against the fingerprints approved before.
   */
  function fingerprint(asm) {
    const slots = {}, us = unitsOf(meshesOf(asm.group, asm.info));
    for (const t of Object.keys(us).sort()) {
      let tris = 0, area = 0; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const m of us[t]) for (let i = 0; i < m.v.length; i += 9) {
        tris++;
        for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) { const x = m.v[i + k * 3 + d]; if (x < lo[d]) lo[d] = x; if (x > hi[d]) hi[d] = x; }
        const ax = m.v[i + 3] - m.v[i], ay = m.v[i + 4] - m.v[i + 1], az = m.v[i + 5] - m.v[i + 2], bx = m.v[i + 6] - m.v[i], by = m.v[i + 7] - m.v[i + 1], bz = m.v[i + 8] - m.v[i + 2];
        area += 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      }
      const mm = (x) => Math.round(x * 1e4) / 10;
      slots[t] = { tris, hash: triHash(us[t]).slice(0, 12), box: [...lo, ...hi].map(mm), area: Math.round(area * 1e4 * 100) / 100 };
    }
    const leaves = Models.infoLeaves(cleanInfo(Object.fromEntries(Object.entries(asm.info).filter(([k]) => k !== 'mounts'))));
    const info = {}; for (const k of Object.keys(leaves).sort()) { const v = leaves[k]; info[k] = typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v; }
    return { slots, info };
  }
  return { compare, procedural, fingerprint };
}

/** Differences between two fingerprints (golden `a`, current `b`): [{ kind, what, detail }]. Geometry within 0.15 mm on the box and 0.2 % on the area counts as the same (a rebake's quantisation); the triangle count must match. */
export function compareFingerprints(a, b) {
  const out = [];
  for (const t of new Set([...Object.keys(a.slots), ...Object.keys(b.slots)])) {
    const x = a.slots[t], y = b.slots[t];
    if (!x) { out.push({ kind: 'slot', what: t, detail: `slot ${t} is new (not in the golden)` }); continue; }
    if (!y) { out.push({ kind: 'slot', what: t, detail: `slot ${t} is gone (the golden has it)` }); continue; }
    if (x.hash === y.hash) continue;
    const boxOff = Math.max(...x.box.map((v, i) => Math.abs(v - y.box[i]))), areaRel = Math.abs(x.area - y.area) / Math.max(1e-9, x.area);
    if (x.tris !== y.tris || boxOff > 0.15 || areaRel > 2e-3) out.push({ kind: 'tri', what: t, detail: `slot ${t}: golden ${x.tris} tris, box ${x.box}, area ${x.area}; now ${y.tris} tris, box ${y.box}, area ${y.area}` });
  }
  for (const k of new Set([...Object.keys(a.info), ...Object.keys(b.info)])) {
    const x = a.info[k], y = b.info[k];
    if (!(typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 2e-5 : JSON.stringify(x) === JSON.stringify(y))) out.push({ kind: 'info', what: k, detail: `golden ${JSON.stringify(x)}, now ${JSON.stringify(y)}` });
  }
  return out;
}
