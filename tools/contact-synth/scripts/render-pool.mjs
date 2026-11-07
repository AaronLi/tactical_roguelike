// Renders many scenes at once on worker threads, and encodes many clips at once as Ogg Vorbis (libvorbis compiled to WebAssembly:
// wasm-media-encoders, in the workers; no ffmpeg needed): the banks (game-bank.mjs, footstep-bank.mjs) render hundreds of independent
// clips, each a few hundred ms of work.
//   const pool = renderPool(n); const mixes = await pool.render(scenes); await pool.close();
//   await encodeAll([{ data, sr, path }], n);
// A scene is plain data (its bodies, contacts and timings), so it goes to a worker as it is; the mix comes back as a
// Float32Array (transferred, not copied). n: how many at once (default: the cores less one, at most 16).
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { cpus } from 'node:os';
import { createRequire } from 'node:module';
import { renderScene, encodeWav } from '../dist/index.js';

export const defaultJobs = () => Math.max(1, Math.min(16, cpus().length - 1));
/** -j N (or --jobs N) from the command line, else the default */
export function jobsArg(argv = process.argv) {
  const i = argv.findIndex((a) => a === '-j' || a === '--jobs');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : defaultJobs();
}

// (the encoder, from the game's node_modules: the synth's own folder has none)
const requireRoot = createRequire(new URL('../../../package.json', import.meta.url));
if (!isMainThread && parentPort) {
  let enc = null; // (a worker's encoder: made once, configured afresh for each clip)
  parentPort.on('message', async ({ id, scene, sr, opts, pcm, q }) => {
    try {
      if (pcm) { // a clip to encode
        enc = enc || await requireRoot('wasm-media-encoders').createOggEncoder();
        enc.configure({ channels: 1, sampleRate: sr, vbrQuality: q });
        const a = enc.encode([pcm]).slice(), b = enc.finalize().slice(), ogg = new Uint8Array(a.length + b.length);
        ogg.set(a); ogg.set(b, a.length);
        parentPort.postMessage({ id, ogg }, [ogg.buffer]);
        return;
      }
      const mix = renderScene(scene, sr, 1, opts).mix;
      parentPort.postMessage({ id, mix }, [mix.buffer]);
    } catch (e) { parentPort.postMessage({ id, err: String(e && e.stack || e) }); }
  });
}

export function renderPool(n = defaultJobs()) {
  if (n <= 1) return { render: async (scenes, sr = 48000, opts = { dry: true }) => scenes.map((s) => renderScene(s, sr, 1, opts).mix), close: async () => {} };
  const workers = Array.from({ length: n }, () => new Worker(new URL(import.meta.url)));
  return {
    /** every scene rendered (dry by default), in order */
    render(scenes, sr = 48000, opts = { dry: true }) {
      return new Promise((resolve, reject) => {
        const out = new Array(scenes.length);
        let next = 0, done = 0, failed = false;
        if (!scenes.length) return resolve(out);
        const feed = (w) => { if (next < scenes.length && !failed) { const id = next++; w.postMessage({ id, scene: scenes[id], sr, opts }); } };
        for (const w of workers) {
          w.removeAllListeners('message');
          w.on('message', (m) => {
            if (m.err) { failed = true; reject(new Error(`scene ${scenes[m.id].id}: ${m.err}`)); return; }
            out[m.id] = m.mix;
            if (++done === scenes.length) resolve(out); else feed(w);
          });
          feed(w);
        }
      });
    },
    close: () => Promise.all(workers.map((w) => w.terminate())),
  };
}

/** each clip written as Ogg Vorbis at VBR quality `quality`, encoded on n worker threads. BANK_WAV_DIR: each clip's uncompressed WAV
 *  kept there too, as <its path below the bank>.wav (for comparing encodings). */
export async function encodeAll(clips, n = defaultJobs(), quality = 5) {
  if (!clips.length) return;
  const workers = Array.from({ length: Math.max(1, Math.min(n, clips.length)) }, () => new Worker(new URL(import.meta.url)));
  try {
    await new Promise((resolve, reject) => {
      let next = 0, done = 0, failed = false;
      const feed = (w) => {
        if (next >= clips.length || failed) return;
        const id = next++, c = clips[id], pcm = Float32Array.from(c.data); // (a copy to send: the bank keeps its own)
        w.postMessage({ id, pcm, sr: c.sr, q: quality }, [pcm.buffer]);
      };
      for (const w of workers) {
        w.on('message', (m) => {
          if (m.err) { failed = true; reject(new Error(`encoding ${clips[m.id].path}: ${m.err}`)); return; }
          const c = clips[m.id];
          writeFileSync(c.path, m.ogg);
          if (process.env.BANK_WAV_DIR) { const rel = c.path.split(String.fromCharCode(92)).join('/').split('/').slice(-2).join('/').replace(/\.ogg$/, '.wav'), dst = join(process.env.BANK_WAV_DIR, rel); mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, Buffer.from(encodeWav(c.data, c.sr))); }
          if (++done === clips.length) resolve(); else feed(w);
        });
        w.on('error', (e) => { failed = true; reject(e); });
        feed(w);
      }
    });
  } finally { await Promise.all(workers.map((w) => w.terminate())); }
}
