'use strict';
import { LightGrid } from './lightgrid.js';
// Levels got ready ahead (js/prepworker.ts): a level that's coming (a ship of the zone's the squad's ship is drawing near to:
// js/space.ts) is asked for by its figures, worked on in another thread while the game goes on, and what was worked out is
// taken when it's wanted, so the frame it's put up has little left to do. Nothing depends on it: a level that wasn't asked
// for, or isn't ready, is worked out on the spot as before.
//   Prep.want(seed, level, th, night, gen)   start on it (once)
//   Prep.map(seed, level, th, night, gen)    the level laid out there (js/level.ts generate, as it would be here: a level
//                                              has nothing in it of anything outside it, so it comes over whole), if it's
//                                              come; asked for if it isn't on its way. null meanwhile; false if there's no
//                                              other thread, so it's to be laid out here
//   Prep.take(seed, level, th, night, gen)   its light grid's sums (map.lgPre), if they've come, else null
export const Prep = (() => {
  let w: Worker | null = null, dead = false;
  const got = new Map<string, any>(), maps = new Map<string, LvMap>(), flying = new Set<string>(), bad = new Set<string>();
  const keyOf = (seed: number, level: number, th: number | undefined, night: boolean, gen: any) => JSON.stringify([seed, level, th, !!night, gen ? Object.keys(gen).sort().map((k) => [k, gen[k] == null ? null : gen[k]]) : null]);
  const cap = (m: Map<string, unknown>, n: number) => { while (m.size > n) m.delete(m.keys().next().value!); };
  function worker() {
    if (w || dead) return w;
    try {
      w = new Worker('dist/js/prepworker.js', { type: 'module' });
      w.onmessage = (e) => {
        const m = e.data; if (!m || m.t !== 'prep') return;
        if (m.err) { bad.add(m.key); console.warn('prep', m.err); }
        if (m.d || m.err) flying.delete(m.key); // (the level comes first, then its light: it's on its way till that has)
        if (m.d) { got.set(m.key, m.d); cap(got, 8); }
        if (m.map) { maps.set(m.key, m.map); cap(maps, 8); }
      };
      w.onerror = () => { dead = true; w = null; flying.clear(); };
    } catch (e) { dead = true; w = null; }
    return w;
  }
  function ask(key: string, seed: number, level: number, th: number | undefined, night: boolean, gen: any) {
    const ww = worker(); if (!ww || flying.has(key)) return;
    flying.add(key);
    ww.postMessage({ t: 'prep', key, seed, level, th, night: !!night, gen, opts: Object.assign({}, LightGrid.opts) });
  }
  function want(seed: number, level: number, th: number | undefined, night: boolean, gen: any) {
    const key = keyOf(seed, level, th, night, gen); if (got.has(key) || maps.has(key)) return;
    ask(key, seed, level, th, night, gen);
  }
  function map(seed: number, level: number, th: number | undefined, night: boolean, gen: any): LvMap | null | false {
    if (!worker()) return false;
    const key = keyOf(seed, level, th, night, gen), m = maps.get(key);
    if (bad.has(key)) return false; // (it failed there: here, then)
    if (m) { maps.delete(key); return m; }
    ask(key, seed, level, th, night, gen);
    return null;
  }
  function take(seed: number, level: number, th: number | undefined, night: boolean, gen: any) {
    const key = keyOf(seed, level, th, night, gen), d = got.get(key) || null;
    got.delete(key);
    return d;
  }
  return { want, map, take, keyOf, boot: () => { worker(); } };
})();
