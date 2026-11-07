// The baked models, bundled (docs/models.md "Bundles"). The baker (tools/bundle_models.mjs, the last step of `npm run bake:models`) packs the
// ~2,500 small files of assets/models into ONE container file, assets/models/bundles/models.rtb (~3.3 MB gzipped); the game fetches it once at boot
// (the very first thing the page does: this is the first script in index.html), keeps it in memory and slices the files out of it, so there are no
// model requests after that and nothing waits on a fetch later. Nothing is parsed at boot: a glTF is parsed when a model is first shown (js/glb.ts).
// There is no fallback to the loose files: a path that belongs to the bundle comes from it or fails.
//
//   G.Bundles.start()               Promise<boolean>: begin (or retry) the download; true once the bundle is in memory (it retries by itself first, then gives false)
//   G.Bundles.state()               { phase: 'idle'|'loading'|'ready'|'failed', loaded, total, from: 'store'|'net'|null }   (bytes, for a progress line)
//   G.Bundles.onChange(fn)          fn(state) on every progress step and phase change
//   G.Bundles.getFile(path)         Promise<ArrayBuffer>: the file's bytes (waits for the bundle; starts it if nothing has)
//   G.Bundles.getJson(path)         Promise<any | null>: the file parsed (null if the bundle or the file is missing)
//   G.Bundles.bundleOf(path)        'models' if the path is in the bundle, null if not (guns/*.glb, the bake reports)
//
// Returning visitors: bundles/manifest.json ({ v: 3, hash, size }, fetched with no-cache at boot, ~100 bytes) says which bundle is current; the one hash is
// compared with the stored copy (IndexedDB), which is used with no request if it matches and is of this format (FORMAT: 3 since the packs' positions are int16); otherwise models.rtb?h=<hash> is fetched and replaces it.
//
// The container ("RTB1"): the bytes `RTB1`, u32le tocLength, the table of contents as UTF-8 JSON `{ "files": [[path, offset, length], ...] }`, zero padding to a
// multiple of 4, then the files back to back (offsets count from the start of that data, paths are relative to assets/models/, sorted). The file on disk is that
// container gzipped (the web server cannot be trusted to compress an unknown type): it is unpacked with DecompressionStream (off the main thread); a raw one is read as it is.

(globalThis as any).G = (globalThis as any).G || {}; // (the page, the export worker, the tools: on the page this file runs before util.js)

// The same machinery serves more than one bundle (makeBundle): the models (G.Bundles, as above) and the synthesized audio
// (G.AudioBundle: assets/audio/bundles/audio.rtb, the handling and footstep banks, packed by tools/bake_audio.mjs). Each has its own
// manifest, its own copy in the local store and its own download; the audio's waits for the models' to finish (it isn't needed
// till a level, and mustn't hold up the boot).
const EXT = '.rtb', MAGIC = 'RTB1';
const R_BUNDLES = { base: '' }; // (where the page's folder is from here: '' on the page, '../../' in the export worker: G.Models.setRoot)
const KNOWN_BUNDLES = new Set<string>(); // (the store's records of any other name are stale: sweep)
interface BundleCfg { name: string; dir: string; root: string; format: number; flag: string; bundleOf: (rel: string) => boolean }
function makeBundle(cfg: BundleCfg) {
  const DIR = cfg.dir, ROOT = cfg.root, NAME = cfg.name, FORMAT = cfg.format, R = R_BUNDLES;
  KNOWN_BUNDLES.add(NAME);

  interface Bundle { bytes: number; wire: number; files: Map<string, [number, number]>; buf: ArrayBuffer; from: 'net' | 'store' }
  interface State { phase: 'idle' | 'loading' | 'ready' | 'failed'; loaded: number; total: number; from: 'net' | 'store' | null; error?: string }
  const st: State = { phase: 'idle', loaded: 0, total: 0, from: null };
  const listeners: ((s: State) => void)[] = [];
  const emit = () => { for (const f of listeners) try { f({ ...st }); } catch { /* */ } };
  let done: Bundle | null = null, running: Promise<boolean> | null = null;

  /** `assets/models/parts/m4/index.json` or `parts/m4/index.json` -> the path inside the bundle (relative to assets/models/). */
  const rel = (path: string) => (path.startsWith(ROOT) ? path.slice(ROOT.length) : path);
  /** The bundle's name if the path is in it (cfg.bundleOf), null if not. */
  function bundleOf(path: string): string | null { return cfg.bundleOf(rel(path)) ? NAME : null; }
  const fileOf = () => R.base + DIR + NAME + EXT;

  /** Container bytes (already gunzipped) -> its table of contents. Throws on a malformed one. */
  function parse(buf: ArrayBuffer): { files: Map<string, [number, number]> } {
    const u8 = new Uint8Array(buf);
    if (u8.length < 8 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== MAGIC) throw new Error('not a ' + NAME + ' bundle');
    const tocLen = new DataView(buf).getUint32(4, true), toc = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + tocLen)));
    const base = 8 + tocLen + ((4 - ((8 + tocLen) % 4)) % 4), files = new Map<string, [number, number]>();
    for (const [p, off, len] of toc.files as [string, number, number][]) {
      if (base + off + len > u8.length) throw new Error('bundle entry past the end: ' + p);
      files.set(p, [base + off, base + off + len]);
    }
    return { files };
  }
  async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
    const u8 = new Uint8Array(buf);
    if (!(u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b)) return buf; // (the server already undid it, or it was stored raw)
    const ds = new (globalThis as any).DecompressionStream('gzip');
    return new (globalThis as any).Response(new (globalThis as any).Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
  }

  // The local store (docs/models.md "Bundles"): the bundle is kept in IndexedDB as downloaded (gzipped) with the content hash from bundles/manifest.json,
  // so a returning visitor fetches nothing while it is current. Every failure (no IndexedDB, private mode, quota, eviction, a corrupt record) falls back to
  // the network without a word; a stored copy that fails to parse is dropped and fetched again.
  interface Rec { hash: string; v?: number; buf: ArrayBuffer }
  const DB = 'rt-model-bundles', TABLE = 'bundles', checking = typeof location !== 'undefined' && /[?&]checkModels/.test(location.search || '');
  const log = (...a: any[]) => { if (checking) console.log('[bundles]', ...a); };
  let dbp: Promise<any | null> | null = null;
  const openDb = (): Promise<any | null> => dbp || (dbp = new Promise((res) => {
    try {
      const idb = (globalThis as any).indexedDB; if (!idb) return res(null);
      const rq = idb.open(DB, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(TABLE); } catch { /* (the open fails below) */ } };
      rq.onsuccess = () => { const d = rq.result; d.onversionchange = () => { try { d.close(); } catch { /* */ } dbp = null; }; res(d); };
      rq.onerror = rq.onblocked = () => res(null);
    } catch { res(null); }
  }));
  /** One request on the store; resolves undefined on ANY failure. */
  function idbDo<T>(mode: 'readonly' | 'readwrite', fn: (s: any) => any): Promise<T | undefined> {
    return openDb().then((d) => new Promise<T | undefined>((res) => {
      if (!d) return res(undefined);
      try {
        const tx = d.transaction(TABLE, mode), rq = fn(tx.objectStore(TABLE));
        tx.oncomplete = () => res(rq ? rq.result : undefined); tx.onerror = tx.onabort = () => res(undefined);
      } catch { res(undefined); }
    }));
  }
  const storeGet = () => idbDo<Rec>('readonly', (s) => s.get(NAME));
  const storePut = (rec: Rec) => idbDo<any>('readwrite', (s) => s.put(rec, NAME));
  const storeDrop = () => idbDo<any>('readwrite', (s) => s.delete(NAME));
  /** Records of the old per-platform bundles (anything that is not the one bundle) are dropped. */
  function sweep() { idbDo<string[]>('readonly', (s) => s.getAllKeys()).then((keys) => { for (const k of keys || []) if (!KNOWN_BUNDLES.has(k)) { log('drop stale', k); idbDo<any>('readwrite', (s) => s.delete(k)); } }); }
  /** Ask the browser not to evict the store (no prompt in the browsers that have it; ignored where it does not exist), and under ?checkModels log the quota. */
  function persist() {
    try {
      const sm = (globalThis as any).navigator && (globalThis as any).navigator.storage; if (!sm) return;
      if (sm.persist) sm.persist().then(() => { /* (granted or not, nothing to do) */ }, () => {});
      if (checking && sm.estimate) sm.estimate().then((e: any) => log(`storage: ${(e.usage / 1048576).toFixed(1)} MB used of ${(e.quota / 1048576).toFixed(0)} MB`), () => {});
    } catch { /* */ }
  }

  /** bundles/manifest.json { v: FORMAT, hash, size }, fetched with no-cache (a ~100 byte request); null if it cannot be had (the bundle is then fetched from the network, revalidated). */
  async function getManifest(): Promise<{ hash: string; size: number } | null> {
    try {
      const r = await fetch(R.base + DIR + 'manifest.json', { cache: 'no-cache' }); if (!r.ok) return null;
      const m = await r.json();
      return m && m.v === FORMAT && typeof m.hash === 'string' && m.hash ? { hash: m.hash, size: +m.size || 0 } : null;
    } catch { return null; }
  }
  /** The bundle's bytes with progress (streamed when the browser can, in one piece when it cannot). */
  async function download(res: Response | Promise<Response>, size: number): Promise<ArrayBuffer> {
    const r = await res;
    if (!r.ok) throw new Error('HTTP ' + (r as any).status);
    const len = +(r.headers && r.headers.get && r.headers.get('content-length') || 0) || size;
    if (len) st.total = len;
    const body = (r as any).body;
    if (!body || !body.getReader) { const b = await r.arrayBuffer(); st.loaded = b.byteLength; emit(); return b; }
    const rd = body.getReader(), parts: Uint8Array[] = []; let n = 0, lastEmit = 0;
    for (;;) {
      const { done: end, value } = await rd.read(); if (end) break;
      parts.push(value); n += value.length; st.loaded = n;
      const now = Date.now(); if (now - lastEmit > 100) { lastEmit = now; emit(); }
    }
    const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    st.total = n; st.loaded = n; emit();
    return out.buffer;
  }
  /** The content hash tools/model_bundles.mjs names a bundle by: the first 16 hex digits of the sha256 of the (gzipped) file's bytes. */
  async function hashOf(buf: ArrayBuffer): Promise<string> {
    const d = new Uint8Array(await (globalThis as any).crypto.subtle.digest('SHA-256', buf)); let s = '';
    for (let i = 0; i < 8; i++) s += (d[i] < 16 ? '0' : '') + d[i].toString(16);
    return s;
  }
  // localStorage remembers which hash the store holds (it can be read synchronously, IndexedDB cannot): no memory of one means a first visit, and its download is started
  // at once (below), without waiting for the manifest or for the main thread to be free.
  const FLAG = cfg.flag;
  const flagGet = (): string | null => { try { return localStorage.getItem(FLAG); } catch { return null; } };
  const flagSet = (h: string | null) => { try { if (h) localStorage.setItem(FLAG, h); else localStorage.removeItem(FLAG); } catch { /* */ } };
  let early: Promise<Response> | null = null;
  async function loadOnce(): Promise<Bundle> {
    const m = await getManifest(), hash = m ? m.hash : '';
    if (m) st.total = m.size;
    if (hash) {
      const rec = await storeGet();
      if (rec && rec.hash === hash && rec.v === FORMAT && rec.buf instanceof ArrayBuffer) {
        try { const buf = await gunzip(rec.buf); log('from the local store'); st.loaded = st.total = rec.buf.byteLength; st.from = 'store'; return { bytes: buf.byteLength, wire: 0, files: parse(buf).files, buf, from: 'store' }; }
        catch (e) { log('stored copy is corrupt, dropping it', e); storeDrop(); flagSet(null); }
      } else if (rec) log(rec.v === FORMAT ? 'stored copy is for another hash' : 'stored copy is of another format');
    }
    // A first visit (nothing stored, as far as localStorage knows) started this fetch when the script ran, before the main thread got busy with the rest of the
    // page: take it if the manifest agrees with what came (the sha256 of the bytes), else fetch by hash. The hash in the URL means a new hash is a new URL, so no
    // stale browser or CDN copy can answer for it; ordinary caching is fine.
    let raw: ArrayBuffer | null = null;
    if (early) {
      const e = early; early = null;
      try { const b = await download(e, m ? m.size : 0); if (!hash || await hashOf(b) === hash) raw = b; else log('the early fetch is not the current bundle'); } catch (err) { log('early fetch failed', err); }
    }
    if (!raw) { st.loaded = 0; raw = await download(fetch(fileOf() + (hash ? '?h=' + hash : ''), hash ? undefined : { cache: 'no-cache' }), m ? m.size : 0); }
    const buf = await gunzip(raw);
    const b: Bundle = { bytes: buf.byteLength, wire: raw.byteLength, files: parse(buf).files, buf, from: 'net' };
    if (hash) storePut({ hash, v: FORMAT, buf: raw }).then((k) => flagSet(k ? hash : null)); // (as downloaded; replaces the old hash; failures are silent)
    st.from = 'net'; log('fetched', raw.byteLength, 'B');
    return b;
  }
  const RETRIES = 3, wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Begin the download (or join the one running). A failed attempt is tried again (3 in all, 0.5 s and 1.5 s apart); a start() after a final failure begins afresh. */
  function start(): Promise<boolean> {
    if (done) return Promise.resolve(true);
    if (running) return running;
    st.phase = 'loading'; st.loaded = 0; st.error = undefined; emit();
    return (running = (async () => {
      let err: any = null;
      for (let i = 0; i < RETRIES; i++) {
        try {
          if (i) { st.loaded = 0; emit(); await wait(i === 1 ? 500 : 1500); }
          done = await loadOnce(); st.phase = 'ready'; emit(); persist(); sweep();
          return true;
        } catch (e) { err = e; console.warn('[bundles] attempt ' + (i + 1) + ': ' + (e && (e as any).message || e)); }
      }
      st.phase = 'failed'; st.error = String(err && err.message || err); emit();
      return false;
    })().finally(() => { running = null; }));
  }
  function getFile(path: string): Promise<ArrayBuffer> {
    if (!bundleOf(path)) return Promise.reject(new Error('not in a bundle: ' + path));
    const p = rel(path);
    if (st.phase === 'failed' && !running) return Promise.reject(new Error('the ' + NAME + ' bundle did not load')); // (not retried per file: start() retries it)
    return start().then((ok) => {
      if (!ok || !done) throw new Error('the ' + NAME + ' bundle did not load');
      const e = done.files.get(p); if (!e) throw new Error(`${p} is not in the ${NAME} bundle`);
      return done.buf.slice(e[0], e[1]);
    });
  }
  const getJson = (path: string): Promise<any> => getFile(path).then((b) => JSON.parse(new TextDecoder().decode(b)), () => null);

  const api = {
    NAME, EXT, DIR, MAGIC, FORMAT, bundleOf, parse, start, getFile, getJson,
    state: (): State => ({ ...st }), onChange: (fn: (s: State) => void) => { listeners.push(fn); },
    loaded: () => !!done,
    setRoot: (base: string) => { R.base = base; }, // (shared: every bundle's)
    stats: () => (done ? [{ name: NAME, files: done.files.size, bytes: done.bytes, wire: done.wire, from: done.from }] : []),
  };
  return Object.assign(api, {
    /** begin at once, a first visit's download before the manifest's even asked (the models: the first thing the page does) */
    boot() {
      if (!flagGet()) early = fetch(fileOf(), { cache: 'no-cache' }); // (a first visit: the download begins now)
      if (early) early.catch(() => { /* (loadOnce falls back to the by-hash fetch) */ });
      start();
    },
  });
}
// The models: props/** and parts/<id>/** (not the whole-gun files nor the bake's reports: parts/index.json, coverage.json...).
// FORMAT 3: the files' format, in the manifest (v) and on the stored copy: 2 = meshopt with float32 positions, 3 = int16 positions the loader
// undoes (js/glb.ts dequantize). A copy of another format is never used.
const G_Bundles = makeBundle({
  name: 'models', dir: 'assets/models/bundles/', root: 'assets/models/', format: 3, flag: 'rt-models-stored',
  bundleOf: (p) => p.startsWith('props/') || (p.startsWith('parts/') && p.indexOf('/', 6) > 6),
});
// The synthesized audio: the guns' handling bank and the footsteps (each folder's manifest.json and its clips), Ogg Vorbis, the
// container gzipped (it halves it: every clip carries the same Vorbis setup header). FORMAT 1.
const G_AudioBundle = makeBundle({
  name: 'audio', dir: 'assets/audio/bundles/', root: 'assets/audio/', format: 1, flag: 'rt-audio-stored',
  bundleOf: (p) => p.startsWith('handling/') || p.startsWith('footsteps/'),
});
// On the page the models' download is the first thing that happens (this script is the first one in index.html, before three.js and the
// rest); the audio's once the models are in (or have given up).
if (typeof document !== 'undefined' && typeof fetch === 'function') {
  G_Bundles.boot();
  const audioNext = (s: { phase: string }) => { if ((s.phase === 'ready' || s.phase === 'failed') && G_AudioBundle.state().phase === 'idle') G_AudioBundle.boot(); };
  G_Bundles.onChange(audioNext); audioNext(G_Bundles.state());
}
G.Bundles = G_Bundles;
G.AudioBundle = G_AudioBundle;
interface GameModules { Bundles: typeof G_Bundles; AudioBundle: typeof G_AudioBundle }
