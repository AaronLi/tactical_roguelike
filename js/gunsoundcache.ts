'use strict';
// The rendered gun reports, kept between visits (IndexedDB), so a level's guns that were rendered once are not rendered again: a
// report takes 0.5-0.9 s of a thread to synthesise and a few hundred KB to keep. js/gunaudio.ts reads it before it renders a key
// and writes what it rendered. Everything here is best effort: no IndexedDB (a node tool, a private window, blocked storage), an
// error, a quota refusal or a slow open and the cache is simply off for the session and the sounds are rendered as before.
//
// What a stored report is good for: its key (the sound key), the VERSION (SYNTH_REV, the synth's own functions' text: a change to
// js/gunshot-synth.ts makes every stored report stale) and the key's own parameters hash (what the synth and the placement are
// told for that key, and the trim: a change to a gun's data or to GunAudio's constants is stale for that key). A stale one is
// deleted when it is met. It's bounded: MAX_ENTRIES reports, the least recently used going first.
export interface CachedDry { sr: number; ch: Float32Array[] }

// The hash of js/gunshot-synth.ts this cache was made for. tools/gunsounds.test.mjs (npm run test:acoustics, in CI) fails when the file's changed
// and this isn't: node tools/gunsounds.test.mjs --rev prints the new one. (Not the only guard: GunAudio.cacheVersion adds the text of the synth's
// own entry points, so a change that missed this is still caught if it was in them.)
export const SYNTH_REV = '91463ab8b264';

interface Rec { k: string; v: string; p: string; sr: number; ch: Float32Array[] }
interface Use { k: string; v: string; t: number }

export const GunSoundCache = {
  DB: 'gunsounds', MAX_ENTRIES: 220, WAIT_MS: 2000, HOT_MS: 150, // (how long a render waits on a read of the cache before it goes ahead: WAIT_MS, and HOT_MS when a shot is waiting for it. The page's main thread can be seconds behind in a busy frame, and the answer comes by it)
  version: '' as string,    // set by GunAudio once the synth is there
  _db: undefined as Promise<IDBDatabase | null> | undefined,
  dead: false,              // gave up for this session
  hits: 0, misses: 0, stored: 0, stale: 0,
  _puts: [] as { k: string; p: string; sr: number; ch: Float32Array[] }[], _putting: false,

  available(): boolean { try { return typeof indexedDB !== 'undefined' && !!indexedDB && !this.dead; } catch (e) { return false; } },
  // (no time limit of its own: the page's main thread can be busy for seconds building a level, and an open that has to wait for it is not a failed one. What waits on
  // the cache races it against its own time, GunSoundCache.within)
  open(): Promise<IDBDatabase | null> {
    if (this._db) return this._db;
    if (!this.available()) return (this._db = Promise.resolve(null));
    this._db = new Promise<IDBDatabase | null>((resolve) => {
      const fail = () => { this.dead = true; resolve(null); };
      try {
        const rq = indexedDB.open(this.DB, 1);
        rq.onupgradeneeded = () => { const db = rq.result; db.createObjectStore('dry', { keyPath: 'k' }); db.createObjectStore('use', { keyPath: 'k' }); };
        rq.onsuccess = () => { const db = rq.result; db.onversionchange = () => { try { db.close(); } catch (e) { /* closing */ } this._db = undefined; }; resolve(db); };
        rq.onerror = rq.onblocked = fail;
      } catch (e) { fail(); }
    });
    return this._db;
  },
  // what a caller that mustn't wait forever on the cache does: its answer, or `none` after ms (the answer, if it comes later, is still handled by `late`)
  within<T>(p: Promise<T>, ms: number, none: T, late?: (v: T) => void): Promise<T> {
    return new Promise<T>((resolve) => {
      let over = false;
      const t = setTimeout(() => { over = true; resolve(none); }, ms);
      p.then((v) => { clearTimeout(t); if (over) { if (late) late(v); } else resolve(v); }, () => { clearTimeout(t); if (!over) resolve(none); });
    });
  },
  // the stored reports for these keys (a key -> its hash of parameters): the ones that are current. Reads each in one transaction and marks them used.
  async getMany(want: Map<string, string>): Promise<Map<string, CachedDry>> {
    const out = new Map<string, CachedDry>();
    if (!want.size || !this.version) return out;
    const db = await this.open();
    if (!db) return out;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(['dry', 'use'], 'readwrite'), dry = tx.objectStore('dry'), use = tx.objectStore('use'), now = Date.now(), stale: string[] = [];
        for (const [k, p] of want) {
          const rq = dry.get(k);
          rq.onsuccess = () => {
            const r = rq.result as Rec | undefined;
            if (r && r.v === this.version && r.p === p && r.ch && r.ch.length) { out.set(k, { sr: r.sr, ch: r.ch }); use.put({ k, v: this.version, t: now } as Use); }
            else if (r) { stale.push(k); this.stale++; }
          };
        }
        tx.oncomplete = () => { if (stale.length) this._drop(stale); resolve(); };
        tx.onerror = tx.onabort = () => resolve();
      });
    } catch (e) { /* the cache is best effort */ }
    this.hits += out.size; this.misses += want.size - out.size;
    return out;
  },
  // keep a rendered report (written a few at a time, off the render's way)
  put(k: string, p: string, buf: AudioBuffer) {
    if (!this.available() || !this.version) return;
    try {
      const ch: Float32Array[] = [];
      for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c).slice());
      this._puts.push({ k, p, sr: buf.sampleRate, ch });
    } catch (e) { return; }
    if (!this._putting) { this._putting = true; setTimeout(() => this._flush(), 250); }
  },
  async _flush() {
    const batch = this._puts.splice(0);
    try {
      const db = await this.open();
      if (db && batch.length) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction(['dry', 'use'], 'readwrite'), dry = tx.objectStore('dry'), use = tx.objectStore('use'), now = Date.now();
          for (const b of batch) { dry.put({ k: b.k, v: this.version, p: b.p, sr: b.sr, ch: b.ch } as Rec); use.put({ k: b.k, v: this.version, t: now } as Use); }
          tx.oncomplete = () => { this.stored += batch.length; resolve(); };
          tx.onerror = tx.onabort = () => resolve(); // (a quota refusal aborts this batch: the next is tried again)
        });
        await this._trim();
      }
    } catch (e) { /* best effort */ }
    this._putting = false;
    if (this._puts.length) { this._putting = true; setTimeout(() => this._flush(), 250); }
  },
  // the least recently used past MAX_ENTRIES go, and any report of another version
  async _trim() {
    const db = await this.open();
    if (!db) return;
    const uses = await new Promise<Use[]>((resolve) => {
      try { const rq = db.transaction('use', 'readonly').objectStore('use').getAll(); rq.onsuccess = () => resolve(rq.result as Use[]); rq.onerror = () => resolve([]); } catch (e) { resolve([]); }
    });
    const gone = uses.filter((u) => u.v !== this.version).map((u) => u.k), live = uses.filter((u) => u.v === this.version).sort((a, b) => b.t - a.t);
    for (const u of live.slice(this.MAX_ENTRIES)) gone.push(u.k);
    if (gone.length) this._drop(gone);
  },
  _drop(keys: string[]) {
    this.open().then((db) => {
      if (!db) return;
      try { const tx = db.transaction(['dry', 'use'], 'readwrite'); for (const k of keys) { tx.objectStore('dry').delete(k); tx.objectStore('use').delete(k); } } catch (e) { /* best effort */ }
    });
  },
  async clear() { const db = await this.open(); if (db) try { const tx = db.transaction(['dry', 'use'], 'readwrite'); tx.objectStore('dry').clear(); tx.objectStore('use').clear(); } catch (e) { /* best effort */ } },
  // a stored report as the AudioBuffer it was
  toBuffer(c: CachedDry): AudioBuffer {
    const buf = new AudioBuffer({ numberOfChannels: c.ch.length, length: c.ch[0].length, sampleRate: c.sr });
    c.ch.forEach((d, i) => buf.copyToChannel(d as Float32Array<ArrayBuffer>, i));
    return buf;
  },
  // a cheap 64-bit-ish hash (two FNV-1a 32s) as hex: of the parameters, and of the synth's text
  hash(s: string): string {
    let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0; }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  },
};
