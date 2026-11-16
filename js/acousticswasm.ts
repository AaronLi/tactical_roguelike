'use strict';
// The acoustic ray tracer's hot loop in WebAssembly (wasm/acoustics/src/lib.rs, built to assets/wasm/acoustics.wasm: docs/wasm.md).
// A leaf: it knows nothing of the level; js/acoustics.ts flattens a floor into a SceneSpec, this copies it into the module's memory
// once (a Scene), and makes a trace of it (a few rays at a time: Trace.rays(n)). The JavaScript tracer in js/acoustics.ts stays: the
// fallback (before the module has loaded, in the node tools, where it's switched off, if it can't be instantiated) and the reference
// (tools/acoustics_wasm.test.mjs makes both from the same seed and compares them).
//
// Nothing starts it but the page: js/main.ts calls AcWasm.start() (the game's folder is found from this file's own URL, dist/js/ in
// development and in the release bundle alike, so ../../assets/wasm/acoustics.wasm). ambience.html, the workers and the node tools
// never do, and keep the JavaScript path. `?acjs` on the page's URL (or AcWasm.off = true) keeps it there too.

export interface SceneSpec {
  w: number; h: number; f: number; ts: number; fy: number; buildingTop: number;
  /** per tile: bit 0 a drop in the floor, bit 1 a window */
  flags: Uint8Array;
  /** per tile: its zone, -1 none */
  zoneAt: Int32Array;
  /** per tile: the index of the door whose cell it is, -1 none */
  doorAt: Int32Array;
  /** the zone table: 10 columns of nz (ZCOL) */
  zones: Float64Array; nz: number; nd: number;
}
/** the columns of SceneSpec.zones, each nz long, in this order */
export const ZCOL = ['out', 'height', 'ac', 'af', 'acL', 'afL', 'aw', 'awL', 'loss', 'lossL'] as const;
export interface WasmTrace {
  /** sends the next n rays (doors: 1 for each door a ray passes, now); true once they've all gone */
  rays(n: number, doors: ArrayLike<number>): boolean;
  /** the histograms and the early arrivals so far, copied out; the trace's memory is freed */
  take(): { hist: Float64Array; histL: Float64Array; early: [number, number][] };
  free(): void;
}
export interface WasmScene {
  trace(x0: number, y0: number, z0: number, zi: number, R2: number, outWallA: number, outWallAL: number, seed: number): WasmTrace;
}
interface Exports {
  memory: WebAssembly.Memory;
  scene_new(cells: number, nz: number, nd: number, w: number, h: number, f: number, ts: number, fy: number, bt: number): number;
  scene_ptr(s: number, which: number): number;
  scene_free(s: number): void;
  trace_new(s: number, x0: number, y0: number, z0: number, zi: number, r2: number, owa: number, owal: number, seed: number): number;
  trace_free(t: number): void;
  trace_hist(t: number, low: number): number;
  trace_bins(t: number): number;
  trace_early(t: number): number;
  trace_early_len(t: number): number;
  trace_rays(t: number, n: number): number;
}

/** mulberry32: what the module's random numbers are (one 32-bit draw, over 2^32: in [0, 1)); the tests give the JavaScript tracer this, with the seed the module has */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const AcWasm = (() => {
  let X: Exports | null = null, failed = '';
  let loading: Promise<boolean> | null = null;
  const sceneGone = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry<number>((p) => { try { X && X.scene_free(p); } catch { /* the module's gone */ } }) : null;
  const traceGone = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry<number>((p) => { try { X && X.trace_free(p); } catch { /* the module's gone */ } }) : null;

  function make(x: Exports) { X = x; failed = ''; return true; }
  const A = {
    /** true: the JavaScript tracer, whatever else (a URL flag, or a comparison made by hand) */
    off: false,
    /** the module's there and not switched off */
    get ready() { return !!X && !A.off; },
    /** why it isn't there, when it failed */
    get error() { return failed; },
    /** instantiates the module from its bytes (or a Response, or a promise of one): true when it's usable */
    async load(src: BufferSource | Response | Promise<Response>): Promise<boolean> {
      try {
        const r = typeof (src as Promise<Response>).then === 'function' ? await (src as Promise<Response>) : src;
        let inst: WebAssembly.Instance;
        if (typeof Response !== 'undefined' && r instanceof Response) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          inst = typeof WebAssembly.instantiateStreaming === 'function' && /wasm/.test(r.headers.get('content-type') || '')
            ? (await WebAssembly.instantiateStreaming(r)).instance : (await WebAssembly.instantiate(await r.arrayBuffer())).instance;
        } else inst = (await WebAssembly.instantiate(r as BufferSource)).instance;
        return make(inst.exports as unknown as Exports);
      } catch (e) { failed = String((e as Error)?.message || e); X = null; return false; }
    },
    /** fetches and instantiates it, without anything waiting for it (the page's start: js/main.ts); the JavaScript tracer works till it's there */
    start(url?: string): Promise<boolean> {
      if (loading) return loading;
      try {
        if (typeof location !== 'undefined' && /[?&]acjs\b/.test(location.search || '')) A.off = true;
        if (typeof fetch !== 'function' || typeof WebAssembly !== 'object') { failed = 'no WebAssembly or fetch'; return (loading = Promise.resolve(false)); }
        const u = url || new URL('../../assets/wasm/acoustics.wasm', import.meta.url).href;
        loading = A.load(fetch(u)).then((ok) => { if (!ok) console.warn('acoustics.wasm: not used (' + failed + '): the JavaScript tracer it is'); return ok; });
      } catch (e) { failed = String((e as Error)?.message || e); loading = Promise.resolve(false); }
      return loading;
    },
    /** gives up the module (a trap in it): the JavaScript tracer from now on */
    fail(why: string) { failed = why; X = null; },
    /** copies a floor into the module's memory */
    scene(s: SceneSpec): WasmScene {
      const x = X!, sp = x.scene_new(s.flags.length, s.nz, s.nd, s.w, s.h, s.f, s.ts, s.fy, s.buildingTop);
      const put = <T extends Uint8Array | Int32Array | Float64Array>(k: number, a: T) => { new (a.constructor as { new (b: ArrayBuffer, o: number, n: number): T })(x.memory.buffer, x.scene_ptr(sp, k), a.length).set(a as never); };
      put(0, s.flags); put(1, s.zoneAt); put(2, s.doorAt); put(3, s.zones);
      const doorsPtr = x.scene_ptr(sp, 4), nd = s.nd, self = {};
      sceneGone && sceneGone.register(self, sp);
      return {
        trace(x0, y0, z0, zi, R2, owa, owal, seed): WasmTrace {
          void self; // (the scene lives as long as a trace of it)
          const tp = x.trace_new(sp, x0, y0, z0, zi, R2, owa, owal, seed >>> 0), tok = {};
          traceGone && traceGone.register(tok, tp, tok);
          let freed = false;
          const free = () => { if (!freed) { freed = true; traceGone && traceGone.unregister(tok); x.trace_free(tp); } };
          return {
            rays(n, doors) {
              const dv = new Uint8Array(x.memory.buffer, doorsPtr, nd);
              for (let i = 0; i < nd; i++) dv[i] = doors[i] ? 1 : 0;
              return x.trace_rays(tp, n) !== 0;
            },
            take() {
              const nb = x.trace_bins(tp), buf = x.memory.buffer;
              const hist = new Float64Array(buf, x.trace_hist(tp, 0), nb).slice(), histL = new Float64Array(buf, x.trace_hist(tp, 1), nb).slice();
              const ne = x.trace_early_len(tp), ev = ne ? new Float64Array(buf, x.trace_early(tp), ne * 2) : null, early: [number, number][] = [];
              for (let i = 0; i < ne; i++) early.push([ev![2 * i], ev![2 * i + 1]]);
              free();
              return { hist, histL, early };
            },
            free,
          };
        },
      };
    },
  };
  return A;
})();
