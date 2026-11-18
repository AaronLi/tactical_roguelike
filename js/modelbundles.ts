// The baked models, bundled (docs/models.md "Bundles"). The baker (tools/bundle_models.mjs, the last step of `npm run bake:models`) packs the
// ~6,600 small files of assets/models (the guns' pieces and their levels of detail, the props, the hangar's scene, the bodies) into ONE container file,
// assets/models/bundles/models.rtb; the game fetches it once at boot (the very first thing the page does: this is the first script in index.html) and keeps
// it AS DOWNLOADED (a Blob: on disk once the local store has it), so there are no model requests after that. Nothing is unpacked or parsed at boot: a file
// is read out of the bundle when it is first asked for, by unpacking only the chunk it is in (js/glb.ts parses a glTF when a model is first shown).
// There is no fallback to the loose files: a path that belongs to the bundle comes from it or fails.
//
//   RTBundles.Bundles.start()               Promise<boolean>: begin (or retry) the download; true once the bundle is here (it retries by itself first, then gives false)
//   RTBundles.Bundles.state()               { phase: 'idle'|'loading'|'ready'|'failed', loaded, total, from: 'store'|'net'|null }   (bytes, for a progress line)
//   RTBundles.Bundles.onChange(fn)          fn(state) on every progress step and phase change
//   RTBundles.Bundles.getFile(path)         Promise<ArrayBuffer>: the file's bytes (waits for the bundle; starts it if nothing has)
//   RTBundles.Bundles.getJson(path)         Promise<any | null>: the file parsed (null if the bundle or the file is missing)
//   RTBundles.Bundles.bundleOf(path)        'models' if the path is in the bundle, null if not (guns/*.glb, the scenes' data, the bake reports)
//   RTBundles.Bundles.has(path)             whether the path is a file of the bundle (false until the bundle is here)
//
// Returning visitors: bundles/manifest.json ({ v: 4, hash, size }, fetched with no-cache at boot, ~100 bytes) says which bundle is current; the one hash is
// compared with the stored copy (IndexedDB), which is used with no request if it matches and is of this format (FORMAT 4: the chunked container); otherwise
// models.rtb?h=<hash> is fetched and replaces it.
//
// The container ("RTB2", tools/model_bundles.mjs pack): the bytes `RTB2`, u32le headLength, the head (the table of contents, UTF-8 JSON, gzipped:
// { "chunks": [[codec, offset, length, rawLength], ...], "files": [[path, chunk, offsetInChunk, length], ...] }), zero padding to a multiple of 4, then the
// chunks back to back (offsets count from the start of that data; paths are relative to assets/models/). A CHUNK is some files end to end, compressed on its
// own (codec "gzip", or "raw" for none; another codec, zstd say, is one more entry in CODECS and a decoder), so a file is read by unpacking its chunk and
// nothing else: files that are wanted together share a chunk (a platform's pieces; its pieces' levels of detail; every platform's index), about a megabyte
// unpacked each. The file is NOT compressed as a whole (the old RTB1 was one gzip stream: all of it had to be unpacked, 86 MB, and was held for the session);
// gzip looks back 32 KB, so chunks of this size cost it nothing. An unpacked chunk is let go a few seconds after it was last read.

// The same machinery serves more than one bundle (makeBundle): the models (RTBundles.Bundles, as above) and the synthesized audio
// (RTBundles.AudioBundle: assets/audio/bundles/audio.rtb, the handling and footstep banks, packed by tools/bake_audio.mjs). Each has its own
// manifest, its own copy in the local store and its own download; the audio's waits for the models' to finish (it isn't needed
// till a level, and mustn't hold up the boot).
const EXT = '.rtb', MAGIC = 'RTB2';
type Chunk = [codec: string, offset: number, length: number, rawLength: number];
interface Toc { chunks: Chunk[]; files: Map<string, [chunk: number, offset: number, length: number]>; base: number }
/** Where the head is: the container's first 8 bytes -> the head's bytes [from, to) and where the chunks begin. Throws on anything else. */
function bundleHead(first: Uint8Array): { from: number; to: number; base: number } {
  if (first.length < 8 || String.fromCharCode(first[0], first[1], first[2], first[3]) !== MAGIC) throw new Error('not an ' + MAGIC + ' bundle');
  const n = (first[4] | (first[5] << 8) | (first[6] << 16) | (first[7] << 24)) >>> 0;
  return { from: 8, to: 8 + n, base: 8 + n + ((4 - ((8 + n) % 4)) % 4) };
}
/** The head's JSON (unpacked) -> the table of contents, checked against the container's size. Throws on a malformed one. */
function bundleToc(head: any, base: number, size: number): Toc {
  if (!head || !Array.isArray(head.chunks) || !Array.isArray(head.files)) throw new Error('bundle head: no chunks or files');
  const chunks = head.chunks as Chunk[], files = new Map<string, [number, number, number]>();
  for (const [codec, off, len, raw] of chunks) if (typeof codec !== 'string' || !(off >= 0) || !(len >= 0) || !(raw >= 0) || base + off + len > size) throw new Error('bundle chunk past the end');
  for (const [p, c, off, len] of head.files as [string, number, number, number][]) {
    if (!chunks[c] || !(off >= 0) || !(len >= 0) || off + len > chunks[c][3]) throw new Error('bundle entry past its chunk: ' + p);
    files.set(p, [c, off, len]);
  }
  return { chunks, files, base };
}
/** How a chunk's bytes are unpacked, by its codec's name (each: the stored bytes -> the chunk). A codec the browser has no decoder for is added here with one. */
const CODECS: Record<string, (b: Blob) => Promise<ArrayBuffer>> = {
  raw: (b) => b.arrayBuffer(),
  gzip: (b) => new (globalThis as any).Response(b.stream().pipeThrough(new (globalThis as any).DecompressionStream('gzip'))).arrayBuffer(),
};
const CHUNK_KEEP_MS = 8000; // (an unpacked chunk is kept this long after it was last read: a gun's files are asked for in a burst)
const R_BUNDLES = { base: '' }; // (where the page's folder is from here: '' on the page, '../../' in the export worker: Models.setRoot)
const KNOWN_BUNDLES = new Set<string>(); // (the store's records of any other name are stale: sweep)
interface BundleCfg { name: string; dir: string; root: string; format: number; flag: string; bundleOf: (rel: string) => boolean }
function makeBundle(cfg: BundleCfg) {
  const DIR = cfg.dir, ROOT = cfg.root, NAME = cfg.name, FORMAT = cfg.format, R = R_BUNDLES;
  KNOWN_BUNDLES.add(NAME);

  interface Bundle { bytes: number; wire: number; toc: Toc; blob: Blob; from: 'net' | 'store' }
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

  /** The container's table of contents, read off the stored bytes (the first 8, then the head: nothing else is touched). Throws on a malformed one. */
  async function readToc(blob: Blob): Promise<Toc> {
    const h = bundleHead(new Uint8Array(await blob.slice(0, 8).arrayBuffer()));
    if (h.to > blob.size) throw new Error('bundle head past the end');
    const head = JSON.parse(new TextDecoder().decode(await CODECS.gzip(blob.slice(h.from, h.to))));
    return bundleToc(head, h.base, blob.size);
  }
  // the chunks unpacked just now: each is let go CHUNK_KEEP_MS after it was last read
  const open = new Map<number, { p: Promise<ArrayBuffer>; t: any }>(), read = { chunks: 0, bytes: 0, ms: 0, files: 0, busy: 0, since: 0 }; // (read: what has been unpacked so far, for stats(); ms: the time during which any chunk was being unpacked)
  function chunkOf(b: Bundle, i: number): Promise<ArrayBuffer> {
    let o = open.get(i);
    if (!o) {
      const [codec, off, len, raw] = b.toc.chunks[i], un = CODECS[codec];
      if (!read.busy++) read.since = Date.now();
      const end = () => { if (!--read.busy) read.ms += Date.now() - read.since; };
      const p = un ? un(b.blob.slice(b.toc.base + off, b.toc.base + off + len)).then((ab) => { if (ab.byteLength !== raw) throw new Error(`bundle chunk ${i} unpacked to ${ab.byteLength} B, not ${raw}`); read.chunks++; read.bytes += raw; return ab; })
        : Promise.reject(new Error('no decoder for a "' + codec + '" chunk'));
      o = { p, t: null }; open.set(i, o);
      p.then(end, () => { end(); if (open.get(i) === o) open.delete(i); }); // (a failed read is tried again at the next ask)
    }
    if (typeof setTimeout !== 'function') return o.p; // (the tools' context has no timers: what it unpacks it keeps)
    if (o.t) clearTimeout(o.t);
    const mine = o; o.t = setTimeout(() => { if (open.get(i) === mine) open.delete(i); }, CHUNK_KEEP_MS);
    if (o.t && o.t.unref) o.t.unref(); // (node: the tools' process doesn't wait on it)
    return o.p;
  }

  // The local store (docs/models.md "Bundles"): the bundle is kept in IndexedDB as downloaded (a Blob: the browser keeps it on disk, and a read takes only the bytes asked for) with the content hash from bundles/manifest.json,
  // so a returning visitor fetches nothing while it is current. Every failure (no IndexedDB, private mode, quota, eviction, a corrupt record) falls back to
  // the network without a word; a stored copy that fails to parse is dropped and fetched again.
  interface Rec { hash: string; v?: number; blob: Blob }
  const NS = (typeof location !== 'undefined' && /^\/space-experimental(\/|$)/.test(location.pathname) ? 'space_' : ''); // (the copy at d5g.ca/space-experimental: its own cache, js/util.ts NS)
  const DB = 'rt-model-bundles' + (NS ? '-' + NS.slice(0, -1) : ''), TABLE = 'bundles', checking = typeof location !== 'undefined' && /[?&]checkModels/.test(location.search || '');
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
  const FLAG = cfg.flag + (NS ? '-' + NS.slice(0, -1) : '');
  const flagGet = (): string | null => { try { return localStorage.getItem(FLAG); } catch { return null; } };
  const flagSet = (h: string | null) => { try { if (h) localStorage.setItem(FLAG, h); else localStorage.removeItem(FLAG); } catch { /* */ } };
  let early: Promise<Response> | null = null;
  async function loadOnce(): Promise<Bundle> {
    const m = await getManifest(), hash = m ? m.hash : '';
    if (m) st.total = m.size;
    if (hash) {
      const rec = await storeGet();
      if (rec && rec.hash === hash && rec.v === FORMAT && rec.blob && typeof rec.blob.slice === 'function') {
        try { const toc = await readToc(rec.blob); log('from the local store'); st.loaded = st.total = rec.blob.size; st.from = 'store'; return { bytes: toc.chunks.reduce((n, c) => n + c[3], 0), wire: 0, toc, blob: rec.blob, from: 'store' }; }
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
    const blob = new (globalThis as any).Blob([raw]) as Blob, toc = await readToc(blob);
    const b: Bundle = { bytes: toc.chunks.reduce((n, c) => n + c[3], 0), wire: raw.byteLength, toc, blob, from: 'net' };
    // (as downloaded; replaces the old hash; failures are silent. Once it is stored the bundle is read from the store's copy, which is on disk: the downloaded bytes are let go)
    if (hash) storePut({ hash, v: FORMAT, blob }).then((k) => { flagSet(k ? hash : null); if (k) storeGet().then((rec) => { if (rec && rec.hash === hash && rec.blob && rec.blob.size === blob.size && done === b) b.blob = rec.blob; }); });
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
      const b = done, e = b.toc.files.get(p); if (!e) throw new Error(`${p} is not in the ${NAME} bundle`);
      read.files++;
      return chunkOf(b, e[0]).then((ab) => ab.slice(e[1], e[1] + e[2]));
    });
  }
  const getJson = (path: string): Promise<any> => getFile(path).then((b) => JSON.parse(new TextDecoder().decode(b)), () => null);

  const api = {
    NAME, EXT, DIR, MAGIC, FORMAT, bundleOf, head: bundleHead, toc: bundleToc, codecs: CODECS, start, getFile, getJson,
    state: (): State => ({ ...st }), onChange: (fn: (s: State) => void) => { listeners.push(fn); },
    loaded: () => !!done,
    /** whether the path is a file of the bundle (false until the bundle is in) */
    has: (path: string) => !!done && done.toc.files.has(rel(path)),
    setRoot: (base: string) => { R.base = base; }, // (shared: every bundle's)
    stats: () => (done ? [{ name: NAME, files: done.toc.files.size, chunks: done.toc.chunks.length, open: open.size, read: { files: read.files, chunks: read.chunks, bytes: read.bytes, ms: Math.round(read.ms) }, bytes: done.bytes, wire: done.wire, from: done.from }] : []),
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
// The models: props/**, scenes/*.glb (the hangar: tools/bake_hangar.mjs), humans/*.glb (the bodies: tools/bake_humans.mjs), ships/*.glb (the squad's ships: tools/bake_ships.mjs) and parts/<id>/** (not the whole-gun files, the scenes'
// data (for the tools and the Bevy port) nor the bake's reports: parts/index.json, rules.json...).
// FORMAT 4: the bundle's format, in the manifest (v) and on the stored copy: 2 = meshopt with float32 positions, 3 = int16 positions the loader
// undoes (js/glb.ts dequantize), 4 = the chunked container (RTB2). A copy of another format is never used.
const G_Bundles = makeBundle({
  name: 'models', dir: 'assets/models/bundles/', root: 'assets/models/', format: 4, flag: 'rt-models-stored',
  bundleOf: (p) => p.startsWith('props/') || (p.startsWith('scenes/') && p.endsWith('.glb')) || (p.startsWith('humans/') && p.endsWith('.glb')) || (p.startsWith('ships/') && p.endsWith('.glb')) || (p.startsWith('parts/') && p.indexOf('/', 6) > 6),
});
// The synthesized audio: the guns' handling bank and the footsteps (each folder's manifest.json and its clips), Ogg Vorbis, the
// chunks gzipped (it halves them: every clip carries the same Vorbis setup header). FORMAT 2 (the chunked container; 1 was one gzip stream).
const G_AudioBundle = makeBundle({
  name: 'audio', dir: 'assets/audio/bundles/', root: 'assets/audio/', format: 2, flag: 'rt-audio-stored',
  bundleOf: (p) => p.startsWith('handling/') || p.startsWith('footsteps/'),
});
// On the page the models' download is the first thing that happens (this script is the first one in index.html, before three.js and the
// rest); the audio's once the models are in (or have given up).
if (typeof document !== 'undefined' && typeof fetch === 'function') {
  G_Bundles.boot();
  const audioNext = (s: { phase: string }) => { if ((s.phase === 'ready' || s.phase === 'failed') && G_AudioBundle.state().phase === 'idle') G_AudioBundle.boot(); };
  G_Bundles.onChange(audioNext); audioNext(G_Bundles.state());
}
// The two bundles, on a global of their own (this is a classic script on the page and nothing imports it: the files that read them
// ask js/bundlesenv.ts, which reads this; the page's own debug object G has them too: js/debugglobals.ts).
(globalThis as any).RTBundles = { Bundles: G_Bundles, AudioBundle: G_AudioBundle };
