'use strict';
// A snapshot as what changed since another (docs/space-server.md, Bandwidth): the server's ground snapshot ({t:'snap'}: js/server.ts) sent
// to each remote player against the last one that player said it has, on the fast channel, where one lost is only late, never wrong (the
// next is against what they have). Generic over JSON: the server's and the page's copies of the same base give the same result.
//   diff(base, cur): a patch, or undefined where they're the same
//     {v: value}             replaced whole (a value of another kind, or new)
//     {o: {key: patch}, x}   an object's keys changed (x: those gone)
//     {r: [rows], d, s}      a list of rows each keyed by its first element (the people: [id, ...]): each row changed, whole ({f: row})
//                            or by the elements that changed ({i: id, c: [index, value, ...]}); d the ids gone; s the order of them all,
//                            where it isn't the base's (gone ones out, new ones on the end)
//   apply(base, patch): the snapshot again, new objects wherever it changed (the base's own shared where it didn't: nothing may change them)
// It runs anywhere: the server's thread, the page, Node.
type Json = any;
const isObj = (v: Json) => !!v && typeof v === 'object' && !Array.isArray(v);
const isRows = (a: Json) => Array.isArray(a) && a.length > 0 && a.every((r) => Array.isArray(r) && r.length > 0 && (typeof r[0] === 'number' || typeof r[0] === 'string'));
function same(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a)) { if (!Array.isArray(b) || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  for (const k of ka) if (!(k in b) || !same(a[k], b[k])) return false;
  return true;
}
function diff(base: Json, cur: Json): Json | undefined {
  if (same(base, cur)) return undefined;
  if (isObj(base) && isObj(cur)) {
    const o: Record<string, Json> = {}, x: string[] = [];
    for (const k of Object.keys(cur)) { const d = k in base ? diff(base[k], cur[k]) : { v: cur[k] }; if (d !== undefined) o[k] = d; }
    for (const k of Object.keys(base)) if (!(k in cur)) x.push(k);
    return x.length ? { o, x } : { o };
  }
  if (isRows(cur) && (isRows(base) || (Array.isArray(base) && !base.length))) {
    const was = new Map<Json, Json[]>(); for (const r of base) was.set(r[0], r);
    const rows: Json[] = [], ids = cur.map((r: Json[]) => r[0]), now = new Set(ids);
    for (const r of cur) {
      const b = was.get(r[0]); if (b && same(b, r)) continue;
      if (!b || b.length !== r.length) { rows.push({ f: r }); continue; }
      const c: Json[] = []; for (let i = 1; i < r.length; i++) if (!same(b[i], r[i])) c.push(i, r[i]);
      rows.push({ i: r[0], c });
    }
    const d = base.map((r: Json[]) => r[0]).filter((id: Json) => !now.has(id));
    const kept = base.map((r: Json[]) => r[0]).filter((id: Json) => now.has(id)), fresh = ids.filter((id: Json) => !was.has(id)), implied = kept.concat(fresh);
    const out: Json = { r: rows }; if (d.length) out.d = d; if (!same(implied, ids)) out.s = ids;
    return out;
  }
  return { v: cur };
}
function apply(base: Json, p: Json): Json {
  if (p === undefined) return base;
  if ('v' in p) return p.v;
  if (p.o) {
    const out: Record<string, Json> = {}, gone = new Set(p.x || []);
    for (const k of Object.keys(base || {})) if (!gone.has(k)) out[k] = k in p.o ? apply(base[k], p.o[k]) : base[k];
    for (const k of Object.keys(p.o)) if (!(k in out)) out[k] = apply(base ? base[k] : undefined, p.o[k]);
    return out;
  }
  if (p.r) {
    const was = new Map<Json, Json[]>(); for (const r of base || []) was.set(r[0], r);
    const changed = new Map<Json, Json[]>(), fresh: Json[] = [];
    for (const q of p.r) {
      if (q.f) { changed.set(q.f[0], q.f); if (!was.has(q.f[0])) fresh.push(q.f[0]); continue; }
      const b = was.get(q.i); if (!b) continue; const r = b.slice(); for (let i = 0; i < q.c.length; i += 2) r[q.c[i]] = q.c[i + 1]; changed.set(q.i, r);
    }
    const gone = new Set(p.d || []), order: Json[] = p.s || (base || []).map((r: Json[]) => r[0]).filter((id: Json) => !gone.has(id)).concat(fresh);
    return order.map((id) => changed.get(id) || was.get(id)).filter(Boolean);
  }
  return base;
}
export const SnapDelta = { diff, apply, same };
