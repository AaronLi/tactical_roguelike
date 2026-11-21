'use strict';
// A gun's ambient occlusion in WebAssembly (wasm/gunao/src/lib.rs, built to assets/wasm/gunao.wasm: docs/wasm.md): the numeric core of
// js/gunao.ts, the grid's marking, the rays (`shut`), the trace loop and the adaptive refinement with its weld. A leaf: it knows nothing of
// three.js; js/gunao.ts lays a mesh out in flat arrays (as its JavaScript does), this copies them into the module's memory, and hands back
// what comes out. The JavaScript in js/gunao.ts stays: the fallback (before the module has loaded, in the node tools, where it's never
// started, if it can't be instantiated or traps) and the reference (tools/gunao_wasm_check.mjs makes both and compares them).
//
// Nothing starts it but the page: js/main.ts calls AoWasm.start() (the game's folder from this file's own URL, as js/acousticswasm.ts does:
// ../../assets/wasm/gunao.wasm). `?aojs` on the page's URL (or AoWasm.off = true, G.GunAo.wasm.off in the console) keeps the JavaScript.

interface Exports {
  memory: WebAssembly.Memory;
  buf_new(bytes: number): number;
  buf_free(p: number, bytes: number): void;
  grid_new(nx: number, ny: number, nz: number, x0: number, y0: number, z0: number, c: number, ic: number, reach: number, rays: number, strength: number, max: number): number;
  grid_dirs(g: number): number;
  grid_occ(g: number): number;
  grid_clone(g: number): number;
  grid_free(g: number): void;
  mark(g: number, pos: number, n: number, idx: number, nIdx: number): void;
  trace(g: number, pos: number, nor: number, from: number, to: number, out: number, box: number): void;
  refine_begin(g: number, cur: number, cnt: number, w: number, po: number, no: number, m: number, edge: number, fine: number, tol: number): number;
  refine_run(j: number, n: number): number;
  refine_end(j: number, weld: number): number;
  refine_drop(j: number): void;
  ref_rows(r: number): number;
  ref_idx(r: number): number;
  ref_info(r: number, which: number): number;
  ref_free(r: number): void;
}
/** makeGrid's numbers (js/gunao.ts) */
export interface AoGridSpec { nx: number; ny: number; nz: number; x0: number; y0: number; z0: number; c: number; ic: number }
/** what of the Opts the rays need */
export interface AoRayOpts { reach: number; rays: number; strength: number; max: number }
/** what refine gives (views of the module's memory: read them in the callback, they're freed after it) */
export interface AoRefined { rows: Float32Array; idx: Uint32Array; nv: number; nt: number; changed: boolean; asks: number; traced: number }
/** a mesh's refine under way in the module: run(n) does the next n triangles (true once all are done), end() the weld and the result (read in `use`, freed after it), drop() gives it up */
export interface AoRefineJob { run(n: number): boolean; end<R>(use: (r: AoRefined) => R): R; drop(): void }
/** a mesh's vertices in the module, traced a piece at a time */
export interface AoTracer { run(from: number, to: number, out: Float32Array, box?: ArrayLike<number>): void; free(): void }

export const AoWasm = (() => {
  let X: Exports | null = null, failed = '', loading: Promise<boolean> | null = null;
  /** memory of the module's, for the length of fn */
  function withBuf<R>(x: Exports, bytes: number, fn: (p: number) => R): R { const p = x.buf_new(bytes); try { return fn(p); } finally { x.buf_free(p, bytes); } }
  const A = {
    /** true: the JavaScript, whatever else */
    off: false,
    /** the module's there and not switched off */
    get ready() { return !!X && !A.off; },
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
        X = inst.exports as unknown as Exports; failed = ''; return true;
      } catch (e) { failed = String((e as Error)?.message || e); X = null; return false; }
    },
    /** fetches and instantiates it, nothing waiting for it (the page's start: js/main.ts); the JavaScript works till it's there */
    start(url?: string): Promise<boolean> {
      if (loading) return loading;
      try {
        if (typeof location !== 'undefined' && /[?&]aojs\b/.test(location.search || '')) A.off = true;
        if (typeof fetch !== 'function' || typeof WebAssembly !== 'object') { failed = 'no WebAssembly or fetch'; return (loading = Promise.resolve(false)); }
        const u = url || new URL('../../assets/wasm/gunao.wasm', import.meta.url).href;
        loading = A.load(fetch(u)).then((ok) => { if (!ok) console.warn('gunao.wasm: not used (' + failed + '): the JavaScript occlusion it is'); return ok; });
      } catch (e) { failed = String((e as Error)?.message || e); loading = Promise.resolve(false); }
      return loading;
    },
    /** gives up the module (a trap in it): the JavaScript from now on */
    fail(why: string) { failed = why; X = null; console.warn('gunao.wasm: given up (' + why + '): the JavaScript occlusion from now on'); },

    /** a grid in the module's memory, empty, with the rays' options and directions (dirsOf's): a handle for the calls below; gridFree when done */
    grid(s: AoGridSpec, o: AoRayOpts, dirs: number[][]): number {
      const x = X!, g = x.grid_new(s.nx, s.ny, s.nz, s.x0, s.y0, s.z0, s.c, s.ic, o.reach, o.rays, o.strength, o.max);
      const d = new Float64Array(x.memory.buffer, x.grid_dirs(g), dirs.length * 3);
      dirs.forEach((v, i) => { d[i * 3] = v[0]; d[i * 3 + 1] = v[1]; d[i * 3 + 2] = v[2]; });
      return g;
    },
    gridClone(g: number): number { return X!.grid_clone(g); },
    gridFree(g: number) { if (X) X.grid_free(g); },
    /** the grid's cells, copied out (a comparison's) */
    gridOcc(g: number, n: number): Uint8Array { return new Uint8Array(X!.memory.buffer, X!.grid_occ(g), n).slice(); },
    /** mark(): a mesh's surfaces (world positions, 3 a vertex; its index or null) into the grid */
    mark(g: number, pos: Float32Array, idx: ArrayLike<number> | null) {
      const x = X!, n = pos.length / 3, ni = idx ? idx.length : 0;
      withBuf(x, pos.length * 4 + ni * 4, (p) => {
        new Float32Array(x.memory.buffer, p, pos.length).set(pos);
        if (idx) { const iv = new Uint32Array(x.memory.buffer, p + pos.length * 4, ni); for (let i = 0; i < ni; i++) iv[i] = idx[i]; }
        x.mark(g, p, n, ni ? p + pos.length * 4 : 0, ni);
      });
    },
    /** a mesh's world positions and normals copied in, for traces of a piece of it at a time (the ship's, spread over frames) */
    tracer(g: number, pos: Float32Array, nor: Float32Array): AoTracer {
      const x = X!, n = pos.length / 3, bytes = n * 28 + 56, p = x.buf_new(bytes), po = p, no = p + n * 12, oo = p + n * 24, bo = p + Math.ceil(n * 28 / 8) * 8;
      new Float32Array(x.memory.buffer, po, n * 3).set(pos); new Float32Array(x.memory.buffer, no, n * 3).set(nor); new Float32Array(x.memory.buffer, oo, n).fill(0); // (outside a box the module leaves out alone: 0, as the JavaScript's)
      let freed = false;
      return {
        run(from, to, out, box) {
          if (box) new Float64Array(x.memory.buffer, bo, 6).set(box);
          x.trace(g, po, no, from, to, oo, box ? bo : 0);
          out.set(new Float32Array(x.memory.buffer, oo + from * 4, to - from), from);
        },
        free() { if (!freed) { freed = true; x.buf_free(p, bytes); } },
      };
    },
    /**
     * refine(), begun: `cnt` vertices of `w` floats (the attributes side by side, the occlusion last), which `fill` writes into the module's memory;
     * `m` the mesh's world matrix (16) then its normal matrix (9); welded at the end if `weld` (or if anything was split). The grid must outlive it.
     */
    refine(g: number, cnt: number, w: number, po: number, no: number, m: ArrayLike<number>, edge: number, fine: number, tol: number, weld: boolean, fill: (cur: Float32Array) => void): AoRefineJob {
      const x = X!, bytes = Math.ceil(cnt * w * 4 / 8) * 8 + 25 * 8, p = x.buf_new(bytes), mo = p + Math.ceil(cnt * w * 4 / 8) * 8;
      let j = 0, gone = false;
      const free = () => { if (!gone) { gone = true; x.buf_free(p, bytes); } };
      try {
        fill(new Float32Array(x.memory.buffer, p, cnt * w));
        new Float64Array(x.memory.buffer, mo, 25).set(m);
        j = x.refine_begin(g, p, cnt, w, po, no, mo, edge, fine, tol);
      } catch (e) { free(); throw e; }
      return {
        run(n) { return x.refine_run(j, n) !== 0; },
        end(use) {
          const r = x.refine_end(j, weld ? 1 : 0); free();
          try {
            const nv = x.ref_info(r, 0), nt = x.ref_info(r, 1), changed = x.ref_info(r, 2) !== 0, buf = x.memory.buffer;
            return use({ rows: new Float32Array(buf, x.ref_rows(r), nv * w), idx: changed || weld ? new Uint32Array(buf, x.ref_idx(r), nt) : new Uint32Array(0), nv, nt, changed, asks: x.ref_info(r, 3), traced: x.ref_info(r, 4) });
          } finally { x.ref_free(r); }
        },
        drop() { if (!gone) { x.refine_drop(j); free(); } },
      };
    },
  };
  return A;
})();
