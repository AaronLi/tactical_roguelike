// The baked models, bundled (docs/models.md "Bundles"). The baker (tools/bundle_models.mjs, the last step of `npm run bake:models`) packs the
// ~2,500 small files of assets/models into a few container files in assets/models/bundles/; the game fetches a WHOLE bundle once, keeps it in
// memory and slices the files out of it, so a level or the gunsmith is a handful of requests instead of hundreds. There is no fallback to the
// loose files: a path that belongs to a bundle comes from it or fails.
//
//   G.Bundles.bundleOf(path)        which bundle holds a path (null: not bundled, e.g. guns/*.glb): '_boot' | '_shared' | '<platform id>'
//   G.Bundles.getFile(path)         Promise<ArrayBuffer>: the file's bytes (fetches and caches the bundle first)
//   G.Bundles.getJson(path)         Promise<any | null>: the file parsed (null if its bundle or the file is missing)
//   G.Bundles.prefetchBundle(name)  Promise<boolean>: start/await fetching a bundle (a scheduler's unit of work)
//   G.Bundles.platformBundle(id)    the bundle with a platform's packs (its index is in '_boot'); sharedBundle / bootBundle
//   G.Bundles.loaded(name)          is it in memory;  G.Bundles.stats() what was fetched
//
// Returning visitors: bundles/manifest.json ({ v, bundles: { name: content hash } }, fetched with no-cache at boot) says which bundles changed; the others come
// from a local store (IndexedDB) with no request, the changed ones are fetched as `<name>.rtb?h=<hash>` and replace the stored copy.
//
// The container ("RTB1"): the bytes `RTB1`, u32le tocLength, the table of contents as UTF-8 JSON `{ "files": [[path, offset, length], ...] }`, zero padding to a
// multiple of 4, then the files back to back (offsets count from the start of that data, paths are relative to assets/models/, sorted). The file on disk is that
// container gzipped (the web server cannot be trusted to compress an unknown type): the reader recognises gzip by its magic bytes and also takes it raw.

const G_Bundles = (() => {
  const DIR = 'assets/models/bundles/', ROOT = 'assets/models/', EXT = '.rtb', MAGIC = 'RTB1';
  const BOOT = '_boot', SHARED = '_shared';
  const R = { base: '' }; // (where the page's folder is from here: '' on the page, '../../' in the export worker: G.Models.setRoot)

  interface Bundle { name: string; bytes: number; wire: number; files: Map<string, [number, number]>; buf: ArrayBuffer; from: 'net' | 'store' }
  const done = new Map<string, Bundle>(), pending = new Map<string, Promise<Bundle>>();

  /** `assets/models/parts/m4/index.json` or `parts/m4/index.json` -> the path inside the bundles (relative to assets/models/). */
  const rel = (path: string) => (path.startsWith(ROOT) ? path.slice(ROOT.length) : path);
  /** The bundle that holds a path: every platform's index and the props in `_boot`, the shared packs in `_shared`, a platform's own packs in its own bundle; null for what is not bundled. */
  function bundleOf(path: string): string | null {
    const p = rel(path);
    if (p.startsWith('props/')) return BOOT;
    if (!p.startsWith('parts/')) return null;
    const rest = p.slice(6), i = rest.indexOf('/');
    if (i <= 0) return null; // (parts/index.json, coverage.json...: bake reports, not bundled)
    const dir = rest.slice(0, i), file = rest.slice(i + 1);
    if (dir === SHARED) return SHARED;
    return file === 'index.json' ? BOOT : dir;
  }
  const fileOf = (name: string) => R.base + DIR + name + EXT;

  /** Container bytes (already gunzipped) -> its table of contents. Throws on a malformed one. */
  function parse(buf: ArrayBuffer): { files: Map<string, [number, number]> } {
    const u8 = new Uint8Array(buf);
    if (u8.length < 8 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== MAGIC) throw new Error('not a model bundle');
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

  // The local store (docs/models.md "Bundles"): bundles are kept in IndexedDB as downloaded (gzipped), keyed by name with the content hash from
  // bundles/manifest.json, so a returning visitor fetches only the bundles whose hash changed. Every failure (no IndexedDB, private mode, quota,
  // eviction, a corrupt record) falls back to the network without a word; a bundle that fails to parse is dropped and fetched again.
  interface Rec { hash: string; buf: ArrayBuffer }
  const DB = 'rt-model-bundles', TABLE = 'bundles', checking = typeof location !== 'undefined' && /[?&]checkModels/.test(location.search || '');
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
  function idbDo<T>(mode: 'readonly' | 'readwrite', fn: (st: any) => any): Promise<T | undefined> {
    return openDb().then((d) => new Promise<T | undefined>((res) => {
      if (!d) return res(undefined);
      try {
        const tx = d.transaction(TABLE, mode), rq = fn(tx.objectStore(TABLE));
        tx.oncomplete = () => res(rq ? rq.result : undefined); tx.onerror = tx.onabort = () => res(undefined);
      } catch { res(undefined); }
    }));
  }
  const storeGet = (name: string) => idbDo<Rec>('readonly', (st) => st.get(name));
  const storePut = (name: string, rec: Rec) => idbDo<any>('readwrite', (st) => st.put(rec, name));
  const storeDrop = (name: string) => idbDo<any>('readwrite', (st) => st.delete(name));

  /** bundles/manifest.json { v, bundles: { name: hash } }, fetched once per page with no-cache (one tiny request); null if it cannot be had (the bundles are then fetched from the network, revalidated). */
  let manifest: Promise<Record<string, string> | null> | null = null;
  function getManifest(): Promise<Record<string, string> | null> {
    return manifest || (manifest = fetch(R.base + DIR + 'manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => (m && m.v === 1 && m.bundles && typeof m.bundles === 'object' ? (m.bundles as Record<string, string>) : null), () => null)
      .then((m) => { if (m) { sweep(m); persist(); } else log('no manifest: fetching bundles from the network'); return m; }));
  }
  /** Once the manifest is known: drop stored bundles the manifest no longer lists. */
  function sweep(m: Record<string, string>) {
    idbDo<string[]>('readonly', (st) => st.getAllKeys()).then((keys) => { for (const k of keys || []) if (!(k in m)) { log('drop stale', k); storeDrop(k); } });
  }
  /** Ask the browser not to evict the store (no prompt in the browsers that have it; ignored where it does not exist), and under ?checkModels log the quota. */
  function persist() {
    try {
      const sm = (globalThis as any).navigator && (globalThis as any).navigator.storage; if (!sm) return;
      if (sm.persist) sm.persist().then(() => { /* (granted or not, nothing to do) */ }, () => {});
      if (checking && sm.estimate) sm.estimate().then((e: any) => log(`storage: ${(e.usage / 1048576).toFixed(1)} MB used of ${(e.quota / 1048576).toFixed(0)} MB`), () => {});
    } catch { /* */ }
  }

  /** Fetch (or take from the local store) a bundle once, cached for the life of the page; a failure is not cached. */
  async function load(name: string): Promise<Bundle> {
    const m = await getManifest(), hash = m ? m[name] : undefined;
    if (hash) {
      const rec = await storeGet(name);
      if (rec && rec.hash === hash && rec.buf instanceof ArrayBuffer) {
        try { const buf = await gunzip(rec.buf); log(name, 'from the local store'); return { name, bytes: buf.byteLength, wire: 0, files: parse(buf).files, buf, from: 'store' }; }
        catch (e) { log(name, 'stored copy is corrupt, dropping it', e); storeDrop(name); }
      } else if (rec) log(name, 'stored copy is for another hash');
    }
    // the hash in the URL: a new hash is a new URL, so no stale browser or CDN copy can answer for it; ordinary caching is fine
    const r = await fetch(fileOf(name) + (hash ? '?h=' + hash : ''), hash ? undefined : { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + (r as any).status);
    const raw = await r.arrayBuffer(), buf = await gunzip(raw), b: Bundle = { name, bytes: buf.byteLength, wire: raw.byteLength, files: parse(buf).files, buf, from: 'net' };
    if (hash) storePut(name, { hash, buf: raw }); // (as downloaded; replaces the old hash; failures are silent)
    log(name, 'fetched', raw.byteLength, 'B');
    return b;
  }
  function prefetch(name: string): Promise<Bundle> {
    const hit = done.get(name); if (hit) return Promise.resolve(hit);
    let p = pending.get(name);
    if (!p) pending.set(name, (p = load(name).then((b) => { done.set(name, b); return b; }).catch((e) => { pending.delete(name); throw e; })));
    return p;
  }
  function getFile(path: string): Promise<ArrayBuffer> {
    const name = bundleOf(path); if (!name) return Promise.reject(new Error('not in a bundle: ' + path));
    const p = rel(path);
    return prefetch(name).then((b) => { const e = b.files.get(p); if (!e) throw new Error(`${p} is not in bundle ${name}`); return b.buf.slice(e[0], e[1]); });
  }
  const getJson = (path: string): Promise<any> => getFile(path).then((b) => JSON.parse(new TextDecoder().decode(b)), () => null);
  const prefetchBundle = (name: string): Promise<boolean> => prefetch(name).then(() => true, (e) => { console.warn('[bundles] ' + name + ': ' + (e && e.message || e)); return false; });

  return {
    BOOT, SHARED, EXT, DIR, MAGIC, bundleOf, parse, getFile, getJson, prefetchBundle,
    bootBundle: () => BOOT, sharedBundle: () => SHARED, platformBundle: (id: string) => id,
    loaded: (name: string) => done.has(name), pending: (name: string) => pending.has(name),
    setRoot: (base: string) => { R.base = base; },
    stats: () => [...done.values()].map((b) => ({ name: b.name, files: b.files.size, bytes: b.bytes, wire: b.wire, from: b.from })),
  };
})();
G.Bundles = G_Bundles;
interface GameModules { Bundles: typeof G_Bundles }
