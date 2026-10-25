'use strict';
// The profiler: where each frame's time goes, kept for the last stretch of play and saved from the pause menu (Esc,
// "Save performance profile") as a JSON file.
//
// It wraps the game's main pieces of work (the loop's own steps, the host's AI, the renderer, the network handlers,
// the world's ray casts) in timers, adds up each one's time over a frame, and writes the frame into a ring: the last
// CAP frames, in typed arrays set aside at the start, so it costs the same memory after an hour as after a minute.
// Besides the ring it keeps a few things that only ever hold so much: the worst frames seen this level (SPIKES of
// them, each with its breakdown), totals per piece of work, a histogram of frame times, and how often each kind of
// network message came and what handling it took (the first MSG_TYPES kinds).
//
// Times are inclusive (Me.update includes Me.move, which is listed too); "frame" is the time from one animation frame
// to the next (what you feel: it includes the GPU and the browser), "cpu" is the time spent in the game's loop.
G.Prof = (() => {
  const CAP = 3600, MAX_SEC = 48, SPIKES = 40, MSG_TYPES = 64, SPIKE_MS = 33;
  const FIX = ['t', 'frame', 'cpu', 'calls', 'tris', 'geoms', 'texs', 'progs', 'heap', 'rounds', 'enemies'];
  const NF = FIX.length;
  const ring = new Float32Array(CAP * (NF + MAX_SEC * 2)), stride = NF + MAX_SEC * 2;
  const names = [], idx = new Map(), acc = new Float64Array(MAX_SEC), cnt = new Uint32Array(MAX_SEC);
  const tot = new Float64Array(MAX_SEC), totN = new Float64Array(MAX_SEC), max = new Float64Array(MAX_SEC);
  const hist = new Uint32Array(26), HIST_STEP = 4; // frame times by 4 ms (the last: 100 ms and over)
  const msgs = new Map();
  let head = 0, filled = 0, frames = 0, t0 = performance.now(), lastFrame = 0, loopStart = 0, heap = 0, spikes = [], since = new Date().toISOString(), on = true;

  function sec(name) {
    let i = idx.get(name);
    if (i == null) { if (names.length >= MAX_SEC) return -1; i = names.length; names.push(name); idx.set(name, i); }
    return i;
  }
  // obj[fn] timed as `label` (each call's time added to the frame's)
  function wrap(obj, fn, label) {
    if (!obj || typeof obj[fn] !== 'function' || obj[fn].__prof) return;
    const f = obj[fn], i = sec(label || fn);
    if (i < 0) return;
    const w = function () {
      if (!on) return f.apply(this, arguments);
      const a = performance.now();
      try { return f.apply(this, arguments); } finally { acc[i] += performance.now() - a; cnt[i]++; }
    };
    w.__prof = true;
    obj[fn] = w;
  }
  // a network message handled: by its kind (t)
  function wrapMsg(obj, fn, side) {
    if (!obj || typeof obj[fn] !== 'function') return;
    const f = obj[fn], i = sec(side + ': messages');
    obj[fn] = function (m) {
      if (!on) return f.apply(this, arguments);
      const a = performance.now();
      try { return f.apply(this, arguments); } finally {
        const d = performance.now() - a, k = side + ':' + (m && typeof m.t === 'string' ? m.t.slice(0, 16) : '?');
        acc[i] += d; cnt[i]++;
        let q = msgs.get(k);
        if (!q && msgs.size < MSG_TYPES) msgs.set(k, (q = { n: 0, ms: 0, max: 0 }));
        if (q) { q.n++; q.ms += d; if (d > q.max) q.max = d; }
      }
    };
  }

  function frameBegin() { loopStart = performance.now(); }
  function frameEnd() {
    const now = performance.now(), frame = lastFrame ? loopStart - lastFrame : 0, cpu = now - loopStart;
    lastFrame = loopStart;
    if (!on) { acc.fill(0); cnt.fill(0); return; }
    frames++;
    if ((frames & 31) === 0 && performance.memory) heap = performance.memory.usedJSHeapSize / 1048576; // (Chrome only)
    const info = G.R && G.R.renderer ? G.R.renderer.info : null, o = head * stride;
    const fix = [(loopStart - t0) / 1000, frame, cpu, info ? info.render.calls : 0, info ? info.render.triangles : 0, info ? info.memory.geometries : 0, info ? info.memory.textures : 0,
      info && info.programs ? info.programs.length : 0, heap, G.Me && G.Me.rounds ? G.Me.rounds.length : 0, G.Views && G.Views.enemies ? G.Views.enemies.size : 0];
    for (let k = 0; k < NF; k++) ring[o + k] = fix[k];
    for (let i = 0; i < names.length; i++) {
      ring[o + NF + i * 2] = acc[i]; ring[o + NF + i * 2 + 1] = cnt[i];
      tot[i] += acc[i]; totN[i] += cnt[i]; if (acc[i] > max[i]) max[i] = acc[i];
    }
    if (frame > 0) hist[Math.min(hist.length - 1, Math.floor(frame / HIST_STEP))]++;
    // the worst frames, each with what took the time in it
    if (frame > SPIKE_MS && frames > 3) { // (a level's first frames included: its shaders compiling are a hitch you feel)
      if (spikes.length < SPIKES || frame > spikes[spikes.length - 1].frame) {
        const parts = {};
        for (let i = 0; i < names.length; i++) if (acc[i] > 0.05) parts[names[i]] = { ms: r2(acc[i]), n: cnt[i] };
        spikes.push({ t: r2(fix[0]), frame: r2(frame), cpu: r2(cpu), calls: fix[3], tris: fix[4], progs: fix[7], heap: r2(heap), parts });
        spikes.sort((a, b) => b.frame - a.frame);
        if (spikes.length > SPIKES) spikes.length = SPIKES;
      }
    }
    head = (head + 1) % CAP; if (filled < CAP) filled++;
    acc.fill(0); cnt.fill(0);
  }
  const r2 = (v) => Math.round(v * 100) / 100;

  // ---------------------------------------------------------------- a summary, and the file
  function series(k) { const out = new Float32Array(filled); for (let j = 0; j < filled; j++) out[j] = ring[((head - filled + j + CAP) % CAP) * stride + k]; return out; }
  function stats(a) {
    if (!a.length) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const s = Float32Array.from(a).sort(), q = (p) => r2(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
    let sum = 0; for (const v of a) sum += v;
    return { avg: r2(sum / a.length), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: r2(s[s.length - 1]) };
  }
  function summary() {
    const frame = series(1), cpu = series(2), sections = {};
    names.forEach((n, i) => { const s = stats(series(NF + i * 2)), c = series(NF + i * 2 + 1); let calls = 0; for (const v of c) calls += v; sections[n] = Object.assign(s, { callsPerFrame: r2(calls / Math.max(1, filled)), sessionAvg: r2(tot[i] / Math.max(1, frames)), sessionMax: r2(max[i]) }); });
    const order = Object.keys(sections).sort((a, b) => sections[b].avg - sections[a].avg);
    return { frames: filled, seconds: filled ? r2(series(0)[filled - 1] - series(0)[0]) : 0, frame: stats(frame), cpu: stats(cpu), sections: Object.fromEntries(order.map((k) => [k, sections[k]])) };
  }
  function context() {
    const g = G.Game || {}, m = g.map, info = G.R && G.R.renderer && G.R.renderer.info;
    return {
      saved: new Date().toISOString(), recordingSince: since, userAgent: navigator.userAgent, screen: [innerWidth, innerHeight, devicePixelRatio],
      level: g.level, phase: g.phase, hub: !!g.hub, host: !!(G.Net && G.Net.isHost), players: g.roster ? Object.keys(g.roster).length : 1,
      map: m ? { theme: m.theme && m.theme.name, W: m.W, H: m.H, floors: m.NF || 1, solids: m.world ? m.world.solids.filter(Boolean).length : 0, lights: (m.lights || []).length, props: m.props ? m.props.size : 0, windows: (m.windows || []).length, doors: (m.doors || []).length } : null,
      enemies: G.Views && G.Views.enemies ? G.Views.enemies.size : 0, scene: G.R && G.R.scene ? countObjects(G.R.scene) : 0,
      renderer: info ? { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : 0 } : null,
      heapMB: performance.memory ? r2(performance.memory.usedJSHeapSize / 1048576) : null,
      settings: g.settings || null,
    };
  }
  function countObjects(o) { let n = 0; o.traverse(() => n++); return n; }
  function report() {
    const cols = FIX.concat(names.flatMap((n) => [n + ' ms', n + ' calls']));
    const rows = [];
    for (let j = 0; j < filled; j++) { const o = ((head - filled + j + CAP) % CAP) * stride, row = []; for (let k = 0; k < NF + names.length * 2; k++) row.push(r2(ring[o + k])); rows.push(row); }
    const histo = {}; hist.forEach((n, i) => { if (n) histo[i === hist.length - 1 ? `${i * HIST_STEP}+ ms` : `${i * HIST_STEP}-${(i + 1) * HIST_STEP} ms`] = n; });
    const net = Object.fromEntries([...msgs].sort((a, b) => b[1].ms - a[1].ms).map(([k, q]) => [k, { n: q.n, ms: r2(q.ms), avg: r2(q.ms / q.n), max: r2(q.max) }]));
    return { about: 'Breach Protocol performance profile: summary (the last frames in the ring), the worst frames this level, the frame-time histogram and network handling since recording began, then every frame in the ring (columns, rows).', context: context(), summary: summary(), spikes, histogram: histo, network: net, columns: cols, frames: rows };
  }
  function save() {
    const blob = new Blob([JSON.stringify(report())], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `breach-profile-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  // a line for the pause menu: what the last stretch looked like
  function line() {
    if (!filled) return 'Profiler: nothing recorded yet';
    const sm = summary(), f = sm.frame, s = sm.sections, top = Object.keys(s).filter((k) => !/: messages$/.test(k)).slice(0, 3).map((k) => `${k} ${s[k].avg} ms`).join(' · ');
    return `Last ${Math.round(sm.seconds)} s: ${f.avg} ms a frame (95%: ${f.p95}, worst ${f.max}) · ${top}`;
  }
  // a new level: the worst frames start over (they'd be another level's), and the totals with them
  function reset() { spikes = []; tot.fill(0); totN.fill(0); max.fill(0); hist.fill(0); msgs.clear(); frames = 0; since = new Date().toISOString(); }

  // ---------------------------------------------------------------- what's timed
  function install() {
    const Gm = G.Game;
    const loop = Gm.loop;
    Gm.loop = function () { frameBegin(); try { return loop.apply(this, arguments); } finally { frameEnd(); } };
    wrap(Gm, 'serverTick', 'host: server tick');
    wrap(Gm, 'updateDoors', 'doors');
    wrap(G.Me, 'update', 'Me.update'); wrap(G.Me, 'move', 'Me.move'); wrap(G.Me, 'weaponUpdate', 'Me.weapon'); wrap(G.Me, 'interact', 'Me.interact');
    wrap(G.Me, 'updateCamera', 'Me.camera'); wrap(G.Me, 'stepRounds', 'Me.rounds'); wrap(G.Me, 'sendState', 'Me.sendState'); wrap(G.Me, 'spectate', 'Me.spectate'); wrap(G.Me, 'flushHits', 'Me.flushHits');
    wrap(G.Views, 'update', 'Views.update');
    wrap(G.Hangar, 'update', 'Hangar.update');
    wrap(G.InvUI, 'update', 'InvUI.update'); wrap(G.InvUI, 'tick', 'InvUI.tick');
    wrap(G.GunAudio, 'updateListener', 'audio listener');
    wrap(G.R, 'update', 'R.update (effects)'); wrap(G.R, 'render', 'R.render');
    wrap(G.HUD, 'update', 'HUD.update');
    wrap(G.LightGrid, 'flush', 'LightGrid.flush');
    wrap(G.Casings, 'update', 'Casings.update');
    // the host's AI and the world (inside the server tick, and inside other things: their own lines)
    wrap(G.Server, 'update', 'host: update'); wrap(G.Server, 'think', 'host: enemy AI'); wrap(G.Server, 'footsteps', 'host: footsteps'); wrap(G.Server, 'snapshot', 'host: snapshot');
    wrap(G.Level, 'flow', 'pathfinding (flow)'); wrap(G.Level, 'los', 'line of sight');
    wrap(G.World, 'raycast', 'World.raycast'); wrap(G.World, 'resolve', 'World.resolve'); wrap(G.World, 'query', 'World.query');
    wrapMsg(Gm, 'onMsg', 'client'); wrapMsg(G.Server, 'handle', 'host');
  }
  install();

  return { save, report, summary, line, reset, wrap, sec, get on() { return on; }, set on(v) { on = !!v; } };
})();
