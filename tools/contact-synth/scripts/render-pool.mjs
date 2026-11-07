// Renders many scenes at once on worker threads, and encodes many clips at once with ffmpeg: the banks
// (game-bank.mjs, footstep-bank.mjs) render hundreds of independent clips, each a few hundred ms of work.
//   const pool = renderPool(n); const mixes = await pool.render(scenes); await pool.close();
//   await encodeAll([{ data, sr, path }], n);
// A scene is plain data (its bodies, contacts and timings), so it goes to a worker as it is; the mix comes back as a
// Float32Array (transferred, not copied). n: how many at once (default: the cores less one, at most 16).
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { execFile } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, cpus } from 'node:os';
import { renderScene, encodeWav } from '../dist/index.js';

export const defaultJobs = () => Math.max(1, Math.min(16, cpus().length - 1));
/** -j N (or --jobs N) from the command line, else the default */
export function jobsArg(argv = process.argv) {
  const i = argv.findIndex((a) => a === '-j' || a === '--jobs');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : defaultJobs();
}

if (!isMainThread && parentPort) {
  parentPort.on('message', ({ id, scene, sr, opts }) => {
    try {
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

/** each clip written as Ogg Vorbis (via a WAV in the temp folder), n ffmpegs at a time */
export async function encodeAll(clips, n = defaultJobs(), quality = 5) {
  let next = 0;
  const one = async () => {
    for (let i; (i = next++) < clips.length;) {
      const c = clips[i], tmp = join(tmpdir(), `bank-${process.pid}-${i}.wav`);
      writeFileSync(tmp, Buffer.from(encodeWav(c.data, c.sr)));
      await new Promise((res, rej) => execFile('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-c:a', 'libvorbis', '-q:a', String(quality), c.path], (e) => (e ? rej(e) : res())));
      // (BANK_WAV_DIR: keep each clip's uncompressed WAV there too, as <its path below the bank>.wav: for comparing encodings)
      if (process.env.BANK_WAV_DIR) { const rel = c.path.split(String.fromCharCode(92)).join('/').split('/').slice(-2).join('/').replace(/\.ogg$/, '.wav'), dst = join(process.env.BANK_WAV_DIR, rel); mkdirSync(dirname(dst), { recursive: true }); renameSync(tmp, dst); }
      else rmSync(tmp, { force: true });
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, clips.length) }, one));
}
