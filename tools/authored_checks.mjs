// AUTHORED MODEL CHECKS: the geometric rules every gun modelled in Blender (models/<id>/<id>.glb + model.json) must pass, beyond the contract's structure
// (js/glb.ts validateAuthored) and the platform's spec (tools/bake_authored.mjs checkAuthored, which calls this, so `npm run check:models` and the bake both
// run them). Each rule is something that went wrong on a modelled gun (the Mk18 first) and is measured on the model's own triangles:
//
//   a. irons      the gun's own iron sights can be used: from the aiming eye the front post is seen through the rear sight with room round it
//   b. magcheck   the magazine carries the magazine check (the top round's two meshes, and witness holes on both faces or rounds through a clear body)
//   c. topround   the top round sits in the magazine's open top, not buried in its body
//   d. handguard  the factory handguard leaves a muzzle device its 15 mm and is no longer than the longest handguard the gun takes (spec hgMax)
//   e. magwell    the magazine stays inside the receiver's magazine well
//   f. furniture  (a warning) the factory stock, grip, handguard and muzzle each have an authored part that replaces their catalogue entry
//
// readForChecks(buf, id, cfg) reads a .glb into the plain model the rules work on, { id, cfg, info, anchors, meshes, parts } with every mesh's vertices in
// the gun's frame written [forward, up, right] metres (the contract's anchor frame), so the tests build the same thing out of boxes (tools/check_models.test.mjs).
// authoredChecks(model, ctx) runs the rules and returns { errors, warnings }; ctx is what only the loaded game knows (factoryCtx(G, id) makes it).
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { parseGlb, readAccessor, mul, local } from './bake_authored.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PARTS_DIR = path.join(ROOT, 'models/parts');
const jsonExtra = (ex, k) => { if (ex[k] !== undefined) return ex[k]; if (typeof ex[k + '_json'] === 'string') return JSON.parse(ex[k + '_json']); return undefined; };
const mm = (v) => (v * 1000).toFixed(1), deg = (r) => (r * 180 / Math.PI).toFixed(2);

// The numbers the rules use (metres, radians). Each is the margin the rule's comment explains.
export const LIMITS = {
  apertureDeg: 2.35,     // the rear aperture's radius as seen from the eye, about 2.4 degrees (the Mk18's 3.2 mm 76 mm from the eye is 2.41; the margin is the ring's
                         // facets and the measuring): smaller and the front post is lost in a pinhole (the Mk18's first irons were about 1 degree)
  postDeg: 1.2,          // the front post's width as seen from the eye: wider and it hides what it is aimed at
  notchClear: 1.5,       // a notch's half-width over the front blade's half-width: a bar of light each side of the blade
  coneDeg: 0.6,          // the cone round the sight line that must be clear up to the front sight (what the eye sees just round the post's tip)
  relief: [0.06, 0.09],  // eye relief for aperture irons on a long gun (a warning outside it: the eye is not where a shooter puts it)
  topRoundBuried: 0.003, // how far below the magazine body's top the top round's crown may be
  lip: 0.0005,           // the crown at or above the feed lips' top, to this
  muzzleRoom: 0.015,     // what the factory handguard leaves in front of it to mount_muzzle (js/parts.ts hgRoom keeps 15 mm for a muzzle device's thread)
  hgTol: 0.0005,         // the factory handguard's length over hgMax allowed (rounding)
  well: 0.0005,          // how far a magazine vertex may stand outside the well's inner wall
};
export const IRON_KINDS = ['irons', 'notch', 'bead', 'qbzirons']; // (the optic kinds that are a gun's own iron sights; riser / augscope / none are not)

// ---- reading ----
/** A .glb read for the rules: every mesh's name, slot, part chain, chk and vertices/triangles in [forward, up, right] metres; the part_ nodes' extras. */
export function readForChecks(buf, id, cfg = {}) {
  const g = parseGlb(buf), j = g.json, roots = (j.scenes[j.scene || 0] || {}).nodes || [], rn = j.nodes[roots[0]], rx = rn.extras || {};
  const meshes = [], parts = {}, I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const walk = (ni, parentW, chain) => {
    const n = j.nodes[ni], W = mul(parentW, local(n)), ex = n.extras || {};
    if ((n.name || '').startsWith('part_')) { const key = ex.part || n.name.slice(5); chain = chain.concat(key); parts[key] = { extras: ex, parent: chain.length > 1 ? chain[chain.length - 2] : null }; }
    if (n.mesh != null) for (const prim of j.meshes[n.mesh].primitives) {
      const P = readAccessor(g, prim.attributes.POSITION), cnt = P.length / 3, pos = new Float64Array(cnt * 3);
      for (let i = 0; i < cnt; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], q = [0, 1, 2].map((a) => W[a] * x + W[4 + a] * y + W[8 + a] * z + W[12 + a]);
        pos[i * 3] = -q[2]; pos[i * 3 + 1] = q[1]; pos[i * 3 + 2] = q[0]; // ([forward, up, right] = [-z, y, x])
      }
      const idx = prim.indices != null ? Array.from(readAccessor(g, prim.indices)) : Array.from({ length: cnt }, (_, i) => i);
      meshes.push({ name: n.name, slot: ex.slot || 'base', chain: chain.slice(), chk: ex.chk || null, pos, idx });
    }
    for (const c of n.children || []) walk(c, W, chain);
  };
  for (const c of rn.children || []) walk(c, mul(I, local(rn)), []);
  return { id, cfg, info: jsonExtra(rx, 'info') || {}, anchors: jsonExtra(rx, 'anchors') || {}, meshes, parts };
}
/** A box mesh for the tests (and anything else that wants one): [f0, u0, r0] to [f1, u1, r1], 12 outward-wound triangles. */
export function boxMesh(name, slot, lo, hi, extra = {}) {
  const pos = [], idx = [];
  for (let i = 0; i < 8; i++) pos.push(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]);
  for (const q of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  return { name, slot, chain: [], chk: null, ...extra, pos: Float64Array.from(pos), idx };
}
export function boxOf(ms) { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const m of ms) for (let i = 0; i < m.pos.length; i += 3) for (let c = 0; c < 3; c++) { b[c] = Math.min(b[c], m.pos[i + c]); b[3 + c] = Math.max(b[3 + c], m.pos[i + c]); } return b; }

// ---- rays ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** The meshes made ready for ray casts: their triangles flat and their bounds. */
function scene(meshes) {
  return meshes.map((m) => {
    const t = new Float64Array(m.idx.length * 3);
    for (let k = 0; k < m.idx.length; k++) for (let c = 0; c < 3; c++) t[k * 3 + c] = m.pos[m.idx[k] * 3 + c];
    return { m, t, b: boxOf([m]) };
  });
}
function slab(o, d, b, tmax) { let t0 = 0, t1 = tmax; for (let c = 0; c < 3; c++) { if (Math.abs(d[c]) < 1e-12) { if (o[c] < b[c] - 1e-9 || o[c] > b[3 + c] + 1e-9) return false; continue; } let a = (b[c] - 1e-9 - o[c]) / d[c], z = (b[3 + c] + 1e-9 - o[c]) / d[c]; if (a > z) [a, z] = [z, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, z); if (t0 > t1) return false; } return true; }
/** Every crossing of the ray o + t d (d a unit vector, 0 < t < tmax) with the scene's triangles, nearest first: [{ t, m }]. */
function hits(S, o, d, tmax = 10) {
  const out = [];
  for (const s of S) {
    if (!slab(o, d, s.b, tmax)) continue;
    const T = s.t;
    for (let k = 0; k < T.length; k += 9) {
      const a = [T[k], T[k + 1], T[k + 2]], e1 = [T[k + 3] - a[0], T[k + 4] - a[1], T[k + 5] - a[2]], e2 = [T[k + 6] - a[0], T[k + 7] - a[1], T[k + 8] - a[2]];
      const p = cross(d, e2), det = dot(e1, p); if (Math.abs(det) < 1e-14) continue;
      const q0 = sub(o, a), u = dot(q0, p) / det; if (u < -1e-9 || u > 1 + 1e-9) continue;
      const q = cross(q0, e1), v = dot(d, q) / det; if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const t = dot(e2, q) / det; if (t > 1e-7 && t < tmax) out.push({ t, m: s.m });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}
const first = (S, o, d, tmax) => hits(S, o, d, tmax)[0] || null;
// a direction off the axis `ax` (a unit vector) by angle th, turned az about it (az 0: toward +right, PI/2: up)
function offAxis(ax, th, az) {
  const up0 = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], side = norm(cross(ax, up0)), up = norm(cross(side, ax)); // (side is +right for an axis along +forward)
  const s = Math.sin(th), c = Math.cos(th), r = [side[0] * Math.cos(az) + up[0] * Math.sin(az), side[1] * Math.cos(az) + up[1] * Math.sin(az), side[2] * Math.cos(az) + up[2] * Math.sin(az)];
  return norm([ax[0] * c + r[0] * s, ax[1] * c + r[1] * s, ax[2] * c + r[2] * s]);
}

// ---- a. iron sights ----
/**
 * The gun's own iron sights from the aiming eye E = [fSight - relief, sy, 0] (info): the sight line runs forward from E level with the bore.
 *  - The front post (or blade, bead, fin): the furthest-forward place where a ray straight down at right = 0 meets a surface within -1.5..+0.6 mm of sy: its tip.
 *    Its width is measured 1 mm under the tip from inside it (rays out to either side), as an angle from E.
 *  - The line E -> just under the tip must reach the post (nothing else crosses it), and a cone of LIMITS.coneDeg round E -> tip (beside and over the tip)
 *    must be clear from 30 mm past the rear sight to the front sight's assembly (25 mm behind the post).
 *  - The rear sight: rays from E fanned out round the line (16 directions, each out to the first angle that is stopped, 8 degrees at most): what stops them
 *    within the nearer 70 % of the sight radius (a pistol's notch is over half way at arm's length) is the rear sight. If it closes over the top it is an
 *    APERTURE: its radius (the mean of the 16) must be at least LIMITS.apertureDeg. If it is open on top it is a NOTCH: the clear angle to either side must be
 *    LIMITS.notchClear times the post's half-width at least. Nothing in the rear part: a bead or front-only sight (only the post and the line are checked).
 * The irons are found by geometry, not by mesh names: a front sight on the barrel slot (the pistols') or on the base counts the same as slot optic meshes.
 * A gun whose sights are meshless (the Tempest: its irons are the catalogue's sight on its rail) is not looked through.
 */
export function checkIrons(M, E, W) {
  const kinds = ((M.cfg && M.cfg.sights && M.cfg.sights.builtin) || []).filter((k) => IRON_KINDS.includes(k));
  if (!kinds.length) return null;
  if (M.cfg.sights.meshless) return { meshless: true }; // (sights.meshless: the gun's irons are the catalogue's sight on its rail, drawn by the recipe, not the model's: nothing here to look through)
  const { sy, fSight, relief } = M.info; if (![sy, fSight, relief].every((x) => typeof x === 'number')) return null;
  const pistol = M.info.pistol === true, S = scene(M.meshes), all = boxOf(M.meshes), eye = [fSight - relief, sy, 0], at = `models/${M.id}: the iron sights (sights.builtin ${kinds.join(', ')}; eye at forward ${mm(eye[0])} mm, sy ${mm(sy)} mm)`;
  const out = { eye };
  // the front post's tip: scan forward from the eye, rays straight down at right = 0
  const lo = sy - 0.0015, hi = sy + 0.0006, top = Math.max(all[4], sy) + 0.01, step = 0.00025;
  let runEnd = null, runStart = null, tip = -Infinity;
  for (let f = all[3]; f > eye[0] + 0.01; f -= step) {
    const hs = hits(S, [f, top, 0], [0, -1, 0], top - lo + 1e-4).map((h) => top - h.t).filter((y) => y >= lo && y <= hi);
    if (hs.length) { if (runEnd == null) runEnd = f; runStart = f; tip = Math.max(tip, ...hs); } else if (runEnd != null) break;
  }
  if (runEnd == null) { E(`${at}: no front sight found: nothing on the bore plane (right = 0) reaches the sight line (sy ${mm(sy)} mm, -1.5 to +0.6 mm) ahead of the eye. The front post's tip is at sy`); return out; }
  const fc = (runStart + runEnd) / 2, P = [fc, tip, 0], dP = Math.hypot(...sub(P, eye));
  // its width, 1 mm under the tip, from inside it
  const wy = tip - 0.001, wR = first(S, [fc, wy, 0], [0, 0, 1], 0.05), wL = first(S, [fc, wy, 0], [0, 0, -1], 0.05);
  const width = wR && wL ? wR.t + wL.t : null;
  out.post = { f: fc, tip, dist: dP, width };
  if (width == null) W(`${at}: the front post at forward ${mm(fc)} mm has no width 1 mm under its tip (an open mesh?): its size is not checked`);
  else if (Math.atan(width / dP) > LIMITS.postDeg * Math.PI / 180 + 1e-9) E(`${at}: the front post at forward ${mm(fc)} mm is ${mm(width)} mm wide, ${deg(Math.atan(width / dP))} degrees from the eye ${mm(dP)} mm behind it: at most ${LIMITS.postDeg} (a post that wide hides the target)`);
  // the line to the tip: the first thing it meets is the post (from its rear face on)
  const P0 = [fc, tip - 0.0003, 0], d0 = norm(sub(P0, eye)), l0 = Math.hypot(...sub(P0, eye)), h0 = first(S, eye, d0, l0 + 0.01);
  const lineHit = h0 && eye[0] + d0[0] * h0.t < runStart - 0.001 ? h0 : null;
  if (lineHit) E(`${at}: the sight line from the eye to the front post's tip (forward ${mm(fc)} mm) is crossed by ${lineHit.m.name} ${mm(lineHit.t)} mm from the eye (forward ${mm(eye[0] + d0[0] * lineHit.t)} mm): the post cannot be seen`);
  // the rear sight: how far round the line rays stay clear, in 16 directions (stopped by something in the rear part of the sight radius)
  const dT = norm(sub(P, eye)), front = dP - 0.025, rearMax = dP * 0.7, MAXA = 8 * Math.PI / 180, STEP = 0.1 * Math.PI / 180;
  const clear = (az) => { // the first angle out from the line where a ray is stopped, and what stops it (rays from the line out: the inside of a ring stops them first)
    const blocked = (th) => first(S, eye, offAxis(dT, th, az), rearMax);
    let a = 0, b = null; for (let th = STEP / 2; th <= MAXA; th += STEP) { if (blocked(th)) { b = th; break; } a = th; }
    if (b == null) return { th: MAXA, open: true };
    for (let i = 0; i < 12; i++) { const c = (a + b) / 2; if (blocked(c)) b = c; else a = c; }
    const h = blocked(b); return { th: a, open: false, by: h.m.name, at: h.t };
  };
  const dirs = Array.from({ length: 16 }, (_, k) => ({ az: k * Math.PI / 8, ...clear(k * Math.PI / 8) }));
  const up = dirs[4], sides = [dirs[0], dirs[8]], rearEnd = dirs.some((x) => !x.open) ? Math.max(...dirs.filter((x) => !x.open).map((x) => x.at)) + 0.03 : 0;
  // the cone round the tip, past the rear sight: clear up to the front sight
  if (!lineHit) for (let k = 0; k <= 6; k++) { // (beside and over the tip: under it is the post, on whatever it stands on)
    const d = offAxis(dT, LIMITS.coneDeg * Math.PI / 180, k * Math.PI / 6), h = hits(S, eye, d, front).find((x) => x.t > rearEnd);
    if (h) { E(`${at}: ${h.m.name} crosses the sight picture ${LIMITS.coneDeg} degrees round the front post's tip, ${mm(h.t)} mm from the eye (forward ${mm(eye[0] + d[0] * h.t)} mm): between the rear sight and the front sight nothing may be there`); break; }
  }
  if (dirs.every((x) => x.open)) { out.rear = { kind: 'none' }; return out; } // (a bead / a front sight only: the post and the line are what there is)
  if (!up.open) {
    // its radius: the mean of the 16 directions (a ring modelled as a polygon is narrower across its flats than at its corners), and its narrowest
    const minD = dirs.reduce((x, y) => (y.th < x.th ? y : x)), th = dirs.reduce((s, x) => s + x.th, 0) / dirs.length, dist = minD.at * Math.cos(minD.th);
    out.rear = { kind: 'aperture', deg: th * 180 / Math.PI, min: minD.th * 180 / Math.PI, dist, by: minD.by };
    if (th < LIMITS.apertureDeg * Math.PI / 180 - 1e-9) E(`${at}: the rear aperture (${minD.by}, ${mm(dist)} mm ahead of the eye) is ${deg(th)} degrees in radius from the eye (about ${mm(Math.tan(th) * dist)} mm; ${deg(minD.th)} at its narrowest): at least ${LIMITS.apertureDeg} (the front post must be seen through it with room round it)`);
    if (!pistol && (relief < LIMITS.relief[0] || relief > LIMITS.relief[1])) W(`${at}: info.relief ${relief} m is outside ${LIMITS.relief[0]}-${LIMITS.relief[1]} m, where an eye sits behind an aperture rear sight`);
  } else {
    const half = width != null ? Math.atan(width / 2 / dP) : 0, s = Math.min(...sides.map((x) => x.th));
    out.rear = { kind: 'notch', deg: s * 180 / Math.PI };
    if (width != null && s < half * LIMITS.notchClear) E(`${at}: the rear notch is ${deg(s)} degrees to its sides from the eye, the front post ${deg(half)} degrees to its sides: the notch must be at least ${LIMITS.notchClear} times as wide, for light either side of the post`);
  }
  return out;
}

// ---- b, c. the magazine check and the top round ----
/** The magazine's meshes (everything under part_mag) and what they are: the chk meshes, the thin feed lips, the other rounds and the body. */
function magParts(M) {
  const ms = M.meshes.filter((m) => m.chain.includes('mag'));
  if (!ms.length) return null;
  const tops = ms.filter((m) => m.chk && m.chk.role === 'top'), plain = ms.filter((m) => !m.chk), box = boxOf(ms), width = box[5] - box[2];
  const tb = tops.length ? boxOf(tops) : null;
  // feed lips: thin along the magazine's width (rails down its sides), in the top 15 mm; other rounds: no wider or taller than the top round, its stack below it
  const lips = plain.filter((m) => { const b = boxOf([m]); return b[5] - b[2] < width * 0.35 && b[4] > box[4] - 0.015 && b[4] - b[1] < 0.015; });
  const rounds = tb ? plain.filter((m) => { const b = boxOf([m]); return !lips.includes(m) && b[5] - b[2] <= tb[5] - tb[2] + 0.001 && b[4] - b[1] <= tb[4] - tb[1] + 0.001 && b[4] <= tb[4] + 1e-6; }) : [];
  const body = plain.filter((m) => !lips.includes(m) && !rounds.includes(m));
  return { ms, tops, lips, rounds, body };
}
/** b: part_mag's extras.check.w, the top round's chk meshes i 0 and 1, and witness holes on both faces or clear-body rounds (a box magazine; a drum, a belt or a barrel block shows none). */
export function checkMagCheck(M, E, kind) {
  const mp = magParts(M), at = `models/${M.id}: the magazine (part_mag)`;
  if (!mp) return;
  if (kind === 'block' || kind === 'drum' || kind === 'belt') return; // (the contract: "a model without them, such as a drum, simply shows none")
  const ck = ((M.parts.mag || {}).extras || {}).check, chk = mp.ms.filter((m) => m.chk);
  if (!ck || !(typeof ck.w === 'number' && ck.w > 0)) E(`${at}: no extras.check.w: the magazine check (hold R) needs the magazine's width in metres on part_mag (docs/models.md "Magazine check")`);
  for (const i of [0, 1]) if (!mp.tops.some((m) => m.chk.i === i)) E(`${at}: no mesh with extras.chk { role: "top", i: ${i} } (the top round's ${i ? 'tip' : 'case'}): the magazine check colours them for the load`);
  const holes = chk.filter((m) => m.chk.role === 'hole'), rounds = chk.filter((m) => m.chk.role === 'round');
  if (!holes.length && !rounds.length) { E(`${at}: no witness holes (chk role "hole") and no clear-body rounds (chk role "round"): a box magazine shows its count by one or the other`); return; }
  const byI = new Map(); for (const h of holes) { const k = h.chk.i; if (!byI.has(k)) byI.set(k, []); byI.get(k).push(h); }
  for (const [i, hs] of [...byI].sort((x, y) => x[0] - y[0])) {
    for (const side of [1, -1]) { const n = hs.filter((h) => h.chk.side === side).length; if (n !== 1) E(`${at}: witness hole i ${i} has ${n} meshes on side ${side} (${side === 1 ? 'the back face' : 'the front face'}): one on each face, each its own mesh`); }
    const ts = [...new Set(hs.map((h) => h.chk.t))]; if (ts.length > 1) E(`${at}: witness hole i ${i} reads t ${ts.join(' and ')} on its two faces: the same t on both`);
  }
}
/** c: the top round's crown (the top of its chk "top" meshes) within LIMITS.topRoundBuried of the body's top and at or above the feed lips' top. */
export function checkTopRound(M, E) {
  const mp = magParts(M); if (!mp || !mp.tops.length || !mp.body.length) return;
  const crown = boxOf(mp.tops)[4], bodyTop = boxOf(mp.body)[4], at = `models/${M.id}: the top round (chk "top": ${mp.tops.map((m) => m.name).join(', ')})`;
  if (crown < bodyTop - LIMITS.topRoundBuried) E(`${at}: its crown is at ${mm(crown)} mm up, ${mm(bodyTop - crown)} mm under the magazine body's top (${mm(bodyTop)} mm, ${mp.body.map((m) => m.name).join(', ')}): it is buried in the body; it sits in the open top, at most ${mm(LIMITS.topRoundBuried)} mm under`);
  if (mp.lips.length) { const lip = boxOf(mp.lips)[4]; if (crown < lip - LIMITS.lip) E(`${at}: its crown (${mm(crown)} mm up) is under the feed lips' top (${mm(lip)} mm, ${mp.lips.map((m) => m.name).join(', ')}): the lips hold the top round from above, it shows between them`); }
}

// ---- d. handguard room ----
/** d: the factory handguard (slot handguard meshes) ends LIMITS.muzzleRoom behind mount_muzzle, and its length is at most hgMax (when the game says it). */
export function checkHandguard(M, E, hgMax, swap = { handguard: true, muzzle: true }) {
  const hg = M.meshes.filter((m) => m.slot === 'handguard'), mz = M.anchors.mount_muzzle;
  if (!hg.length || !mz || !swap.handguard) return; // (a handguard that is the only one the gun takes, as the Tempest's, is not measured against the others' room)
  const b = boxOf(hg), at = `models/${M.id}: the factory handguard (slot handguard, forward ${mm(b[0])} to ${mm(b[3])} mm)`;
  if (swap.muzzle && b[3] > mz[0] - LIMITS.muzzleRoom + 1e-6) E(`${at}: it ends ${mm(mz[0] - b[3])} mm behind mount_muzzle (${mm(mz[0])} mm): it leaves at least ${mm(LIMITS.muzzleRoom)} mm (js/parts.ts hgRoom keeps that for a muzzle device's thread)`);
  if (hgMax != null && b[3] - b[0] > hgMax + LIMITS.hgTol) E(`${at}: it is ${mm(b[3] - b[0])} mm long, the platform's hgMax is ${mm(hgMax)} mm (mount_handguard_end - mount_handguard - 3 mm): the gun's own handguard must be one it takes`);
}

// ---- e. the magazine in its well ----
/**
 * e: no vertex of the magazine stands outside the magazine well's inner wall by more than LIMITS.well.
 * The well is found by what surrounds the magazine's axis, the vertical line at info.magAt's forward (the top and centre of the magazine in the well), right 0.
 * At each height (every mm over the magazine's), rays from the axis go out level, forward, back and to both sides, and a receiver mesh (slot base, outside
 * any part_ node) is a WALL there when every one of the four crosses it an even, non-zero number of times: the axis is in the space it encloses, a hollow
 * shell (the well). A solid the axis is inside (an odd count) is not a wall: a block that fills part of the well is hidden by the magazine and its shell.
 * Each magazine vertex at a height with walls is then checked by a level ray from the axis at its height toward it: a wall crossed before the vertex, by
 * more than LIMITS.well, puts the vertex outside the well. A model with no hollow well round magAt (a receiver modelled as one solid with the magazine
 * pushed up into it, as the FAL's and the pistols' frames) is not measured: a warning says so.
 */
export function checkMagWell(M, E, W = () => {}) {
  const mags = M.meshes.filter((m) => m.chain.includes('mag')), magAt = M.info.magAt;
  if (!mags.length || !Array.isArray(magAt)) return null;
  const rcv = M.meshes.filter((m) => m.slot === 'base' && !m.chain.length); if (!rcv.length) return null;
  const S = scene(rcv), f0 = magAt[0], DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]], mb = boxOf(mags), walls = new Map();
  for (let k = Math.ceil(mb[1] * 1000); k <= Math.floor(mb[4] * 1000); k++) {
    const o = [f0, k / 1000, 0], counts = new Map();
    DIRS.forEach((d, di) => { for (const h of hits(S, o, d, 0.3)) { const c = counts.get(h.m) || [0, 0, 0, 0]; c[di]++; counts.set(h.m, c); } });
    const ws = S.filter((x) => { const c = counts.get(x.m); return c && c.every((q) => q > 0 && q % 2 === 0); });
    if (ws.length) walls.set(k, ws);
  }
  if (!walls.size) { W(`models/${M.id}: no magazine well found round info.magAt (forward ${mm(f0)} mm): no receiver mesh encloses the magazine's axis as a hollow shell, so the magazine's fit in it is not checked`); return { walls: null, outside: 0 }; }
  let worst = null, n = 0;
  // the points checked: every vertex and points along every triangle edge 1 mm apart (a long face between two far vertices goes through a wall too)
  const pts = [];
  for (const m of mags) for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = m.idx[t + e] * 3, b = m.idx[t + (e + 1) % 3] * 3, A = [m.pos[a], m.pos[a + 1], m.pos[a + 2]], B = [m.pos[b], m.pos[b + 1], m.pos[b + 2]], k = Math.max(1, Math.ceil(Math.hypot(...sub(B, A)) / 0.001));
    for (let j = 0; j < k; j++) pts.push([A[0] + (B[0] - A[0]) * j / k, A[1] + (B[1] - A[1]) * j / k, A[2] + (B[2] - A[2]) * j / k, m.name]);
  }
  for (const v of pts) {
    const m = { name: v[3] }, ws = walls.get(Math.round(v[1] * 1000)); if (!ws) continue;
    const o = [f0, v[1], 0], d = sub(v, o), L = Math.hypot(...d); if (L < 1e-6) continue;
    const h = first(ws, o, norm(d), L); if (!h || h.t > L - LIMITS.well) continue;
    n++; if (!worst || L - h.t > worst.by) worst = { by: L - h.t, m: m.name, wall: h.m.name, v };
  }
  const ys = [...walls.keys()], names = [...new Set([...walls.values()].flat().map((x) => x.m.name))];
  if (worst) E(`models/${M.id}: the magazine pokes through the magazine well's wall (${names.join(', ')}, found from ${Math.min(...ys)} to ${Math.max(...ys)} mm up): ${n} points of it outside, the worst ${mm(worst.by)} mm through ${worst.wall} (${worst.m} at forward ${mm(worst.v[0])}, up ${mm(worst.v[1])}, right ${mm(worst.v[2])} mm); at most ${mm(LIMITS.well)} mm`);
  return { walls: [Math.min(...ys), Math.max(...ys)], names, outside: n };
}


// ---- f. factory furniture as authored parts ----
/** The catalogue names every authored part replaces, by slot: models/parts/<slot>/<id>/model.json "replaces". */
export function replacedNames(dir = PARTS_DIR) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const slot of fs.readdirSync(dir)) {
    const sd = path.join(dir, slot); if (!fs.statSync(sd).isDirectory()) continue;
    for (const id of fs.readdirSync(sd)) { const f = path.join(sd, id, 'model.json'); if (!fs.existsSync(f)) continue; try { const c = JSON.parse(fs.readFileSync(f, 'utf8')); for (const n of c.replaces || []) (out[slot] = out[slot] || new Map()).set(n, slot + '/' + id); } catch (e) { /* (reported by the part's own check) */ } }
  }
  return out;
}
export const FURNITURE = ['stock', 'grip', 'handguard', 'muzzle'];
/** f: each factory stock / grip / handguard / muzzle the model holds stands in for a catalogue part: a warning for each that no authored part replaces. */
export function checkFurniture(M, W, factory, replaced) {
  if (!factory) return;
  for (const { slot, id, name, shared } of factory) {
    if (!FURNITURE.includes(slot) || shared === false || !M.meshes.some((m) => m.slot === slot)) continue;
    if (!(replaced[slot] && replaced[slot].has(name))) W(`models/${M.id}: the factory ${slot} is the catalogue's ${id} "${name}", and no models/parts/${slot}/<id>/model.json "replaces" it: on any other gun that takes it, it keeps the recipe's procedural look and does not match this model (an authored part for it is the fix)`);
  }
}

// ---- all of them ----
/** What only the loaded game knows for a gun: hgMax, the magazine's kind, the default build's parts by slot. */
export function factoryCtx(G, id) {
  const build = G.Gunsmith.defaultBuild(id), spec = G.Gunsmith.modelSpec({ id, build }), mag = G.Gunsmith.PARTS[build.mag];
  const t = mag && mag.model && mag.model.mag && mag.model.mag.t;
  return {
    hgMax: spec.hgMax != null ? spec.hgMax : null,
    magKind: t === 'drum' || t === 'belt' ? t : null,
    // (shared: the part's mount fits another gun too; a part only this gun takes, as the Tempest's handguard and muzzle block, is only ever drawn by this model)
    factory: Object.entries(build).filter(([, p]) => p && G.Gunsmith.PARTS[p]).map(([s, p]) => ({ slot: s.replace(/\d+$/, ''), id: p, name: G.Gunsmith.PARTS[p].name, shared: [G.Gunsmith.PARTS[p].mount, ...(G.Gunsmith.PARTS[p].alsoMounts || [])].some((mt) => G.Gunsmith.fits(mt).some((g) => g !== id)) })),
    // which of the factory handguard and muzzle the catalogue can replace: a slot whose mount offers parts beyond the default build's and the gun's own
    // (plat: id) ones. The Tempest's handguard is the only one it takes and its muzzle takes only its own blocks (no thread): neither is measured
    swap: Object.fromEntries(['handguard', 'muzzle'].map((sl) => { const s = G.Gunsmith.slotsOf(id, build).find((x) => x.slot === sl); return [sl, !!s && G.Gunsmith.compatible(s.mount).some((p) => !p.retired && p.id !== build[sl] && p.plat == null && p.slot === sl)]; })),
    hgPart: (() => { const p = G.Gunsmith.PARTS[build.handguard]; return p && p.model && p.model.hg && p.model.hg.len != null ? { id: build.handguard, len: p.model.hg.len } : null; })(),
  };
}
/** Every rule on one model. ctx: { hgMax?, magKind?, factory?, hgPart?, replaced? } (factoryCtx(G, id), replacedNames()). */
export function authoredChecks(M, ctx = {}) {
  const errors = [], warnings = [], E = (m) => errors.push(m), W = (m) => warnings.push(m);
  checkIrons(M, E, W);
  const kind = M.info.barrels ? 'block' : ctx.magKind || 'box';
  checkMagCheck(M, E, kind);
  if (kind === 'box') checkTopRound(M, E);
  checkHandguard(M, E, ctx.hgMax, ctx.swap);
  if (ctx.hgPart && ctx.hgMax != null && (!ctx.swap || ctx.swap.handguard) && ctx.hgPart.len > ctx.hgMax + 1e-6) E(`js/parts.ts: ${M.id}'s default handguard ${ctx.hgPart.id} is ${mm(ctx.hgPart.len)} mm long, over the platform's hgMax ${mm(ctx.hgMax)} mm: the default build does not fit (hgRoom)`);
  if (kind !== 'block') checkMagWell(M, E, W);
  checkFurniture(M, W, ctx.factory, ctx.replaced || replacedNames());
  return { errors, warnings };
}
/** (for debugging the rules: the crossings of a ray with some meshes) */
export const _hits = (meshes, o, d, tmax = 1) => hits(scene(meshes), o, norm(d), tmax);
