'use strict';
// Levels got ready ahead (js/prepworker.ts): a level that's coming (a ship of the zone's the squad's ship is drawing near to:
// js/space.ts) is asked for by its figures, worked on in another thread while the game goes on, and what was worked out is
// taken when the level's put up (js/game.ts enterLevel), so that frame has little left to do. Nothing depends on it: a level
// that wasn't asked for, or isn't ready, is worked out on the spot as before.
//   G.Prep.want(seed, level, th, night, gen)   start on it (once)
//   G.Prep.take(seed, level, th, night, gen)   what was worked out, if it's ready (the light grid's sums: map.lgPre), else null
const G_Prep = (() => {
  let w: Worker | null = null, dead = false;
  const got = new Map<string, any>(), asked = new Set<string>();
  const keyOf = (seed: number, level: number, th: number | undefined, night: boolean, gen: any) => JSON.stringify([seed, level, th, !!night, gen ? Object.keys(gen).sort().map((k) => [k, gen[k] == null ? null : gen[k]]) : null]);
  function worker() {
    if (w || dead) return w;
    try {
      w = new Worker('dist/js/prepworker.js');
      w.onmessage = (e) => { const m = e.data; if (m && m.t === 'prep' && m.d) { got.set(m.key, m.d); while (got.size > 4) got.delete(got.keys().next().value!); } };
      w.onerror = () => { dead = true; w = null; };
    } catch (e) { dead = true; w = null; }
    return w;
  }
  function want(seed: number, level: number, th: number | undefined, night: boolean, gen: any) {
    const key = keyOf(seed, level, th, night, gen); if (asked.has(key)) return;
    const ww = worker(); if (!ww) return;
    asked.add(key);
    ww.postMessage({ t: 'prep', key, seed, level, th, night: !!night, gen, opts: Object.assign({}, G.LightGrid.opts) });
  }
  function take(seed: number, level: number, th: number | undefined, night: boolean, gen: any) {
    const key = keyOf(seed, level, th, night, gen), d = got.get(key) || null;
    got.delete(key); asked.delete(key);
    return d;
  }
  return { want, take, keyOf, boot: () => { worker(); } };
})();
G.Prep = G_Prep;
interface GameModules { Prep: typeof G_Prep }
