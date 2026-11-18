// What the model and audio bundles cost a session (docs/models.md "Bundles"): steps for tools/space_shot.mjs. It opens a level on a
// fresh browser profile (a first visit: nothing in the local store), and prints how long the page took to be playable, what the
// bundles' reader did (files asked for, chunks unpacked, bytes, milliseconds: G.Bundles.stats()) and what the page holds in memory
// after a garbage collection (the JS heap, and the bytes behind ArrayBuffers and Blobs, which is where a bundle lives).
//   node serve.js &                                   (PORT=8231, say)
//   node tools/space_shot.mjs "mute&play=warehouse&gun=m4" tools/bundle_bench.mjs --port 8231 --gpu
// To compare two formats, run it against two checkouts served on two ports. BENCH_LABEL names the run in the output.
export default async ({ ev, sleep, log, send }) => {
  const mb = (n) => (n / 1048576).toFixed(1).padStart(7) + ' MB';
  const mem = async () => { await send('HeapProfiler.collectGarbage'); await sleep(300); await send('HeapProfiler.collectGarbage'); return send('Runtime.getHeapUsage'); };
  const stats = async () => JSON.parse(await ev(`JSON.stringify({ models: G.Bundles.stats()[0] || null, audio: (G.AudioBundle && G.AudioBundle.stats()[0]) || null,
    res: performance.getEntriesByType('resource').filter((r) => /\\.rtb/.test(r.name)).map((r) => ({ name: r.name.split('/').pop().split('?')[0], ms: Math.round(r.duration), bytes: r.transferSize || r.encodedBodySize })),
    ready: Math.round(performance.now()) })`));
  const line = (what, s, m) => {
    const b = s.models || {}, r = b.read;
    log(`${what}`);
    log(`  models bundle: ${b.files} files${b.chunks ? ' in ' + b.chunks + ' chunks' : ''}, ${mb(b.wire || 0)} downloaded, ${mb(b.bytes || 0)} unpacked in all, from ${b.from}`);
    log(r ? `  read so far:   ${r.files} files asked for, ${r.chunks} chunks unpacked (${mb(r.bytes)}) in ${r.ms} ms; ${b.open} chunks held unpacked now` : '  read so far:   (this format unpacks the whole bundle at once and holds it)');
    log(`  memory:        JS heap ${mb(m.usedSize)}, ArrayBuffers and Blobs ${mb(m.backingStorageSize || 0)}, other native ${mb(m.embedderHeapUsedSize || 0)}`);
  };
  await send('HeapProfiler.enable');
  log(`== ${process.env.BENCH_LABEL || 'bundles'} ==`);
  const s0 = await stats();
  for (const r of s0.res) log(`  fetched ${r.name}: ${mb(r.bytes)} in ${r.ms} ms`);
  log(`  page playable ${(s0.ready / 1000).toFixed(1)} s after it began loading`);
  line('in the level, just arrived', s0, await mem());
  await sleep(15000); // (the unpacked chunks are let go a few seconds after their last read)
  line('15 s later', await stats(), await mem());
  // a second visit, on the same profile: the bundle should come from the local store, with no download
  await send('Page.reload'); await sleep(1500);
  for (let i = 0; i < 240 && !(await ev('!!window.__debugReady').catch(() => false)); i++) await sleep(500);
  const s2 = await stats();
  log(`  second visit: ${s2.res.length ? s2.res.map((r) => 'fetched ' + r.name + ' ' + mb(r.bytes)).join(', ') : 'no bundle fetched'}; page playable ${(s2.ready / 1000).toFixed(1)} s after it began loading`);
  line('second visit, in the level', s2, await mem());
  await sleep(15000);
  line('second visit, 15 s later', await stats(), await mem());
};
