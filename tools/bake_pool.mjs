// A pool of baker workers (tools/bake_worker.mjs): `n` worker threads, or (n = 1) the handlers in this thread. submit(job, { worker }) runs one job and resolves
// with its result (rejects with the job's error); jobs go to idle workers in the order submitted, a job with `worker` set only to that worker (which holds the
// pack scenes of a platform it analysed, for the write jobs: those run before any unpinned job). Results of jobs carry nothing about who ran them: `ran(job)`
// tells the worker index (for pinning).
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { createHandlers } from './bake_worker.mjs';

export async function makePool(n, { env, verbose = false }) {
  const slots = [], shared = [], waiting = [];
  const workerFile = fileURLToPath(new URL('./bake_worker.mjs', import.meta.url));
  if (n <= 1) {
    const h = createHandlers(env);
    slots.push({ run: (job) => h[job.type](job), busy: false, mine: [] });
  } else {
    await Promise.all(Array.from({ length: n }, (_, i) => new Promise((resolve, reject) => {
      const w = new Worker(workerFile, { workerData: { bakeWorker: true, verbose }, stdout: false, stderr: false });
      const pending = new Map(); let seq = 0;
      const slot = { busy: false, mine: [], w, run: (job) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); w.postMessage({ id, job }); }) };
      w.on('message', (m) => {
        if (m.ready) { resolve(); return; }
        const p = pending.get(m.id); pending.delete(m.id);
        if (m.ok) p.res(m.r); else p.rej(new Error(m.err));
      });
      w.on('error', (e) => { for (const p of pending.values()) p.rej(e); pending.clear(); reject(e); });
      slots[i] = slot;
    })));
  }
  const pump = () => {
    for (const s of slots) {
      if (s.busy) continue;
      const t = s.mine.length ? s.mine.shift() : shared.shift();
      if (!t) continue;
      s.busy = true; t.job.__ran = slots.indexOf(s);
      s.run(t.job).then(t.res, t.rej).finally(() => { s.busy = false; pump(); });
    }
  };
  return {
    size: slots.length,
    submit(job, { worker } = {}) {
      return new Promise((res, rej) => { const t = { job, res, rej }; (worker === undefined ? shared : slots[worker].mine).push(t); pump(); });
    },
    ran: (job) => job.__ran,
    async close() { await Promise.all(slots.map((s) => s.w && s.w.terminate())); },
  };
}
