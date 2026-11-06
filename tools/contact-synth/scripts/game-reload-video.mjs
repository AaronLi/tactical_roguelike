// Record one of the game's guns in first person working through its actions, and dub it with this
// synth's sounds, each placed on the frame the animation reaches its moment: the handle or slide at
// the rear and the bolt home, the old magazine out of the well, the new one seated, the bolt catch or
// slide stop hit. Guns: m4 (the Mk18 CQBR), ak (KV-47), mp5, g19.
//
// The game runs in headless Chromium on a stepped clock (exactly one frame's time per frame, whatever the
// rendering speed), so every frame and every logged moment lines up with the sound.
//
// Usage: (from the repo root) HOST=127.0.0.1 node serve.js &
//        (the game built and its models baked: npm run build && npm run bake:models)
//        cd tools/contact-synth && npm run build && node scripts/game-reload-video.mjs <out.mp4> [--gun m4|ak|mp5|g19] [--url http://127.0.0.1:8080/]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // (the globally installed one)
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, copyFileSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
import { speakerMaster } from './speaker-master.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENES, renderScene, encodeWav, arChargeScene, chargeScene, magDropScene } from '../dist/index.js';
import { T0 } from '../dist/excitation.js';

const args = process.argv.slice(2);
const out = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('url', 'http://127.0.0.1:8080/');
const GUN = opt('gun', 'm4');
// --redub <silent.mp4> --events <recording.log | .events.json>: don't record; dub a recording made earlier
const REDUB = opt('redub', null), EVENTS = opt('events', null);
// --wet: the synth's own room on every sound (default: dry, the room left to the game); --no-space: plain mono
const WET = args.includes('--wet'), SPACE = !args.includes('--no-space');
// --forward <m>: every sound placed this much further out ahead of you than its part of the gun (default 0.5)
const FORWARD = +opt('forward', '0.5');
// --no-shots: no gunshots (they're there for a loudness reference: the game's own reports, at the game's own levels)
const SHOTS = !args.includes('--no-shots');
// Each gun: its caption, how it's charged, how its action is worked after a run-dry reload ('release': a bolt
// catch or slide stop, 'rack': the handle again), and which sound goes on which moment.
const GUNS = {
  m4: { mag: 'ar15', title: 'Mk18 CQBR (AR-15)', charge: 'Charging handle pulled back and let go: chambers a round', after: 'release', afterCap: 'Magazine change, then the bolt catch hit',
    charge_: ['ar15-charge', 'handle bottoms out', 'carrier slams onto the bolt'], magOut: ['ar15-mag-out', 'magazine drops off the catch'], magOutEmpty: ['ar15-mag-out-empty', 'magazine drops off the catch'],
    magIn: ['ar15-mag-in', 'mag catch clicks into the hole in the magazine'], release: ['ar15-bolt-release', 'carrier slams onto the bolt'] },
  ak: { mag: 'kv47', title: 'KV-47 (AKM)', charge: 'Charging handle yanked back and let go: chambers a round', after: 'rack', afterCap: 'Magazine rocked in, then the handle racked (no hold-open)',
    charge_: ['kv47-charge', 'carrier slams into the rear trunnion', 'carrier slams home'], rackEmpty: ['kv47-charge', 'carrier slams into the rear trunnion', 'carrier slams home'],
    magOut: ['kv47-mag-out', 'front lug unhooks from the trunnion'], magOutEmpty: ['kv47-mag-out-empty', 'front lug unhooks from the trunnion'], magIn: ['kv47-mag-in', 'paddle snaps over the rear lug'] },
  mp5: { mag: 'mp5', title: 'MP5', charge: 'Cocking handle pulled back and let go: chambers a round', after: 'rack', afterCap: 'Magazine change, then the cocking handle',
    charge_: ['mp5-charge', 'handle stops at the end of its slot', 'rollers snap out into the trunnion'], rackEmpty: ['mp5-charge', 'handle stops at the end of its slot', 'rollers snap out into the trunnion'],
    magOut: ['mp5-mag-out', 'catch lets go of the magazine'], magOutEmpty: ['mp5-mag-out-empty', 'catch lets go of the magazine'], magIn: ['mp5-mag-in', 'catch clicks into the magazine'] },
  g19: { mag: 'g19', title: 'G19', rearCue: 'drop_slide', charge: 'Slide racked and let go: chambers a round', after: 'release', afterCap: 'Magazine change, then the slide stop hit',
    charge_: ['g19-rack', 'slide stops at the rear', 'slide slams home'], magOut: ['g19-mag-out', 'catch lets go of the magazine'], magOutEmpty: ['g19-mag-out-empty', 'catch lets go of the magazine'],
    magIn: ['g19-mag-in', 'catch clicks into the magazine'], release: ['g19-slide-release', 'slide slams home'] },
};
// The charge sound is rebuilt with the animation's own timing (js/vmanim.ts rack: the hand draws the action
// back from 30% to 52% of it and lets go at once, home at 60%), keeping each gun's real stroke.
const CHARGE_BUILD = { m4: (t) => arChargeScene('loaded', t), ak: (t) => chargeScene('ak', 'loaded', t), mp5: (t) => chargeScene('mp5', 'loaded', t), g19: (t) => chargeScene('g19', 'loaded', t) };
const HANDLE_PARTS = { m4: /charging handle|handle (bottoms|rattles)|latch/, mp5: /cocking handle|handle (stops|hits|spring)/ };
const C = GUNS[GUN];
if (!C) { console.error('--gun: one of ' + Object.keys(GUNS).join(', ')); process.exit(1); }
// 30 fps at 960x540: headless WebGL (SwiftShader) takes seconds a frame, so this keeps a run to ~45 min.
const FPS = +opt('fps', '30'), W = 960, H = 540;
if (!out) { console.error('usage: game-reload-video.mjs <out.mp4>'); process.exit(1); }

// ---------- the game, on a stepped clock ----------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.addInitScript(() => {
  const realNow = performance.now.bind(performance), realRaf = window.requestAnimationFrame.bind(window), realDate = Date.now;
  let fake = false, base = 0, dateBase = 0, off = 0, q = [];
  window.__clock = {
    on() { base = realNow(); dateBase = realDate(); off = 0; fake = true; },
    step(ms) { off += ms; const cbs = q; q = []; for (const cb of cbs) { try { cb(base + off); } catch (e) { console.error(e); } } },
    t: () => off / 1000,
  };
  performance.now = () => (fake ? base + off : realNow());
  Date.now = () => (fake ? dateBase + off : realDate());
  window.requestAnimationFrame = (cb) => { if (fake) { q.push(cb); return 1; } return realRaf(cb); };
});
await page.addInitScript(([f, g]) => { window.__fps = f; window.__gun = g; }, [FPS, GUN]);
await page.goto(URL);
await page.waitForFunction(() => window.G && G.Game && G.Me, null, { timeout: 60000 });

// A solo level with nobody in it, stood at its longest clear sight line (as the game's own ?demo does).
await page.evaluate(async () => {
  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
  const until = async (f) => { while (!f()) await sleep(0.1); };
  // (the game waits for the gun models to load before a solo run)
  if (G.Game.needModels) await new Promise((r) => G.Game.needModels(() => { G.Game.solo(); r(); })); else G.Game.solo();
  await sleep(0.8);
  G.Server.startRun();
  await until(() => G.Game.phase === 'route' && G.Game.routeMap);
  G.Me.sidearmChosen = true; // (the route waits on the sidearm choice)
  const g0 = G.Game; g0.pickRoute(G.Route.options(g0.routeMap, g0.routeSt.path[g0.routeSt.path.length - 1])[0]);
  await until(() => G.Game.phase === 'level' && G.Me.kit);
  await sleep(1.0);
  // the loading veil (shaders compiling) has to lift first: the game waits for it, in real time
  const veiled = () => { const v = G.Game.$('veil'); return !!v && v.classList.contains('on'); };
  await until(() => !veiled());
  // The level opens with the insertion flight (js/landing.ts): skip it as holding F does, and get out on the pad.
  const Ld = G.Landing;
  if (Ld && Ld.S) {
    await until(() => Ld.S.fly || Ld.S.landed);
    if (!Ld.S.landed) { Ld.S.ft = Ld.S.fly.dur; await until(() => Ld.S.landed); }
    for (let i = 0; i < 20 && Ld.S.landed && G.Me.seat != null; i++) { G.Me.fLatch = false; Ld.interact(G.Me, 10, true); await sleep(0.2); }
    G.Me.fLatch = false;
    await sleep(0.5);
  }
  await until(() => !veiled());
  G.Server.enemies.clear();
  const g = G.Game; let lk = true; Object.defineProperty(g, 'locked', { get: () => lk, set: () => {}, configurable: true });
  for (const el of ['pause', 'clickToPlay']) { const e = g.$(el); if (e) e.classList.add('hidden'); }
  G.Game.setMuted(true);
  // Stay in the spawn room, where it's lit; the game's level-start banner and objectives off (they fade on
  // real time, which the stepped clock doesn't run).
  const m = G.Me; m.pitch = -0.05; if (m.vel) m.vel.set(0, 0, 0);
  const css = document.createElement('style'); css.textContent = '#toast,#levelInfo,#objective{display:none!important}'; document.head.appendChild(css);
  // the gun, as it comes from the factory: a sidearm goes in the secondary slot
  const id = window.__gun, slot = G.WEAPONS[id] && G.WEAPONS[id].slot === 's' ? 's' : 'p';
  m.weapons[slot] = m.makeWeapon(id); m.slot = null; m.swap(slot);
  const w = m.weapons[slot];
  const pocket = { id: 99999, w: 14, h: 14, accept: null, label: 'Demo', items: [] }; m.pockets.unshift(pocket);
  for (let i = 0; i < 4; i++) G.Gear.stow(m, G.Gear.ammoItem(w.def), [pocket]);
  w.chamber = null; // nothing chambered yet: the first thing is to charge it
  // captions
  const cap = document.createElement('div');
  cap.id = 'cap';
  cap.style.cssText = 'position:fixed;left:50%;top:5%;transform:translateX(-50%);z-index:50;text-align:center;font:600 24px system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000;pointer-events:none';
  document.body.appendChild(cap);
  window.__caption = (a, b) => { cap.innerHTML = `${a}<div style="font-size:17px;font-weight:500;opacity:.85;margin-top:4px">${b}</div>`; };
  // the moments, logged on the stepped clock
  window.__log = [];
  // where the gun's parts are at each logged moment, relative to the camera (the viewmodel is drawn by the main
  // camera in its own pass): the magazine well, the ejection port (the action), the handle that's worked
  const rel3 = (h, v) => { if (!v) return null; G.R.vmScene.updateMatrixWorld(true); G.R.camera.updateMatrixWorld(); return G.R.camera.worldToLocal(h.holder.localToWorld(v.clone())).toArray(); };
  window.__anchors = () => {
    const a = G.R.vm && G.R.vm.userData && G.R.vm.userData.vma;
    if (!a) return null;
    const h = a.hs[0], A = h.A;
    return { well: rel3(h, A.WB), port: rel3(h, A.port || A.ch || A.slide || A.WB), handle: rel3(h, A.H || A.ch || A.slide || A.port) };
  };
  window.__log.push = (e) => Array.prototype.push.call(window.__log, { ...e, parts: window.__anchors() });
  const feed = m.feed.bind(m); m.feed = (ww) => { window.__log.push({ ev: 'bolt home', t: window.__clock.t() }); return feed(ww); };
  // an emergency (dump) reload drops the magazine on the floor (js/casings.ts dropMag): when it's let go, and from where
  const dropMag = G.Casings.dropMag.bind(G.Casings);
  G.Casings.dropMag = (def) => { const c = dropMag(def); window.__dropped = c; window.__log.push({ ev: 'magazine dropped', t: window.__clock.t(), y: c && c.p ? c.p.y : null }); return c; };
  // the gun's reports (js/gunaudio.ts play): which sound, how loud, when
  const gplay = G.GunAudio.play.bind(G.GunAudio);
  G.GunAudio.play = (id, pos, who, vol = 1) => { if (!pos) window.__log.push({ ev: 'shot', t: window.__clock.t(), id, vol }); return gplay(id, pos, who, vol); };
  const sample = G.Audio.sample.bind(G.Audio);
  G.Audio.sample = (name, ...r) => { window.__log.push({ ev: name, t: window.__clock.t() }); return sample(name, ...r); };
  window.__prevM = -1;
  const FPS = window.__fps;
  let lastAct = null;
  window.__step = () => {
    window.__clock.step(1000 / FPS);
    // an action being worked: its length, to time the charge sound to the animation
    if (m.act && m.act !== lastAct) window.__log.push({ ev: 'action', t: window.__clock.t(), dur: m.act.dur, kind: m.act.kind });
    lastAct = m.act;
    // how far through the magazine change (js/vmanim.js magClip): out of the well at 0.1, entering it at 0.74
    if (m.reloading && m.reloadTotal) {
      const k = (1 - m.reloadT / m.reloadTotal) * (m.reloadSeat || 1);
      const p = window.__prevM;
      if (p < 0.1 && k >= 0.1) window.__log.push({ ev: 'magazine out', t: window.__clock.t() });
      if (p < 0.74 && k >= 0.74) window.__log.push({ ev: 'magazine into the well', t: window.__clock.t() });
      window.__prevM = k;
    } else window.__prevM = -1;
    return { reloading: m.reloading, act: !!m.act, swap: m.swapT > 0 };
  };
  window.__clock.on();
});
console.log(`in the level, the ${C.title} drawn`);
// Whether this gun locks open on an empty magazine is the game's call (G.boltHold): follow what it does, so the
// captions and the sound after a run-dry reload match the animation (a bolt catch hit, or the handle racked).
const holds = await page.evaluate(() => G.boltHold(G.Me.cur().def));
if (!holds && C.after === 'release') {
  console.log(`  (the game doesn't hold the ${C.title} open: it racks it after a run-dry reload)`);
  Object.assign(C, { after: 'rack', afterCap: 'Magazine change, then the handle racked (the game holds it closed)', rackEmpty: C.charge_ });
}
// --still <frames>: step that many frames, save one picture, stop (to check the framing)
if (opt('still', null) !== null) {
  for (let i = 0; i < +opt('still'); i++) await page.evaluate(() => window.__step());
  await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
  await browser.close();
  console.log('wrote', out);
  process.exit(0);
}

// ---------- the sequence, frame by frame (or a recording made earlier) ----------
let frames = 0, videoPath, log;
if (REDUB) {
  videoPath = REDUB;
  const d = await new Promise((res) => { const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', REDUB]); let o = ''; p.stdout.on('data', (x) => (o += x)); p.on('close', () => res(+o)); });
  frames = Math.round(d * FPS);
  const txt = readFileSync(EVENTS, 'utf8');
  if (EVENTS.endsWith('.json')) log = JSON.parse(txt);
  else {
    // a recording's printed log: "  1.700 s  rack_slide" (its actions' lengths are the game's: a charge from a
    // full magazine 0.45 s, a rack straight after a magazine change 0.6 s, a catch or slide stop 0.4 s)
    log = [...txt.matchAll(/^\s+([\d.]+) s\s+(\S+(?: \S+)*)\s*$/gm)].map((m) => ({ t: +m[1], ev: m[2] }));
    let nAct = 0;
    for (const e of log) if (e.ev === 'action') e.dur = nAct++ === 0 ? 0.45 : C.after === 'release' ? 0.4 : 0.6;
  }
  console.log(`re-dubbing ${REDUB}: ${frames} frames, ${log.length} logged moments`);
} else {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', join(mkdtempSync(join(tmpdir(), 'gv-')), 'v.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  videoPath = ff.spawnargs[ff.spawnargs.length - 1];
  const write = (b) => new Promise((res) => (ff.stdin.write(b) ? res() : ff.stdin.once('drain', res)));
  const frame = async () => {
    const st = await page.evaluate(() => window.__step());
    await write(await page.screenshot({ type: 'jpeg', quality: 92 }));
    frames++;
    if (frames % FPS === 0) console.log(`${(frames / FPS).toFixed(0)} s recorded`);
    return st;
  };
  const hold = async (s) => { for (let i = 0; i < Math.round(s * FPS); i++) await frame(); };
  const busy = async () => { for (let i = 0; i < 20 * FPS; i++) { const st = await frame(); if (!st.reloading && !st.act && !st.swap) return; } };
  const cap = (a, b) => page.evaluate(([x, y]) => window.__caption(x, y), [a, b]);
  const T = C.title;
  await cap(T, 'Drawn, a full magazine in, nothing chambered'); await busy(); await hold(1.0);
  await cap(T, C.charge);
  await page.evaluate(() => G.Me.startReload()); await busy(); await hold(1.0);
  if (SHOTS) {
    // three shots, for a loudness reference: the game's own reports, mixed at its own levels against the rest
    await cap(T, 'Fired three times (the game\'s own gunshot, for loudness)');
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { const m = G.Me; m.mouse.l = true; m.pressBuf = 0.15; }); await hold(0.07);
      await page.evaluate(() => { G.Me.mouse.l = false; }); await hold(0.45);
    }
    await hold(0.5);
  }
  await cap(T, 'Magazine change with rounds left');
  await page.evaluate(() => { const w = G.Me.cur(); w.mag = 12; w.tube = w.tube.slice(-12); G.Me.startReload(); }); await busy(); await hold(1.0);
  await cap(T, C.after === 'release' ? 'Run dry: it locks open' : 'Run dry: nothing to hold it open');
  await page.evaluate(() => { const w = G.Me.cur(); w.mag = 0; w.tube = []; w.chamber = null; }); await hold(0.8);
  await cap(T, 'Emergency reload: the empty magazine dropped, a fresh one in, ' + C.afterCap.replace(/^Magazine (change|rocked in), then /, ''));
  // R twice, quickly (js/player.ts): the reload becomes a dump reload, and with no dump pouch the magazine goes on the floor
  await page.evaluate(() => { const m = G.Me; m.startReload(); m.toDump(); if (m.reloadMode !== 'floor') { m.dumpDest = null; m.reloadMode = 'floor'; m.reloadTimes(m.cur().def, m.reloadTotal - m.reloadT); } });
  await busy(); await hold(1.8);
  // where the dropped magazine came to rest
  const rest = await page.evaluate(() => { const c = window.__dropped; return c && c.p ? { x: c.p.x, y: c.p.y, z: c.p.z } : null; });
  if (rest) await page.evaluate((r) => window.__log.push({ ev: 'magazine rests', t: window.__clock.t(), ...r }), rest);
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  log = await page.evaluate(() => window.__log);
  // keep the silent video and its moments, to dub again later (--redub)
  copyFileSync(videoPath, out.replace(/\.mp4$/, '') + '.silent.mp4');
  writeFileSync(out.replace(/\.mp4$/, '') + '.events.json', JSON.stringify(log));
  console.log(`\n${frames} frames`);
  for (const e of log) console.log(`  ${e.t.toFixed(3)} s  ${e.ev}`);
}

// ---------- the sounds, each on its moment, each from its part of the gun ----------
const sr = 48000, total = frames / FPS;
const N = Math.ceil((total + 1) * sr);
const sources = []; // { data: Float32Array, part: 'well'|'port'|'handle'|'floor', t (to look the part up), what }
const scene = (id) => SCENES.find((s) => s.id === id);
// the gun's parts where they were at time t (the logged moment nearest it); a default spot if none was logged
const DEFAULT = { well: [0.12, -0.25, -0.35], port: [0.1, -0.17, -0.4], handle: [0.1, -0.15, -0.45] };
const partsAt = (t) => { let best = null; for (const e of log) if (e.parts && (!best || Math.abs(e.t - t) < Math.abs(best.t - t))) best = e; return (best && best.parts) || DEFAULT; };
/**
 * Place a rendered scene (or some of its tracks, or only the elements `keep` passes) so that element `what` lands at
 * time `at`, heard from the gun's `part`.
 */
function place(id, what, at, tracks = null, gainDb = 0, part = 'port', keep = null) {
  const sc0 = typeof id === 'string' ? scene(id) : id;
  const all = sc0.tracks.flatMap((t) => t.elements);
  const el = all.find((e) => e.what === what);
  if (!el) throw new Error(`${sc0.id}: no "${what}"`);
  const sc = keep ? { ...sc0, tracks: sc0.tracks.map((t) => ({ ...t, elements: t.elements.filter(keep) })).filter((t) => t.elements.length) } : sc0;
  const els = sc.tracks.flatMap((t) => t.elements);
  if (!els.length) return;
  const r = renderScene(sc, sr, 1, { dry: !WET });
  // the mix's sample 0 is at scene time (earliest element start - T0); stems start `start` s after it
  const origin = Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
  const g = Math.pow(10, gainDb / 20), data = new Float32Array(N);
  const add = (samples, start) => {
    const o = Math.round((at - (el.at - origin) + start) * sr);
    for (let i = 0; i < samples.length; i++) if (o + i >= 0 && o + i < N) data[o + i] += samples[i] * g;
  };
  if (!tracks) add(r.mix, 0);
  else for (const t of r.tracks) if (tracks.includes(t.name)) add(t.samples, t.start);
  sources.push({ data, part, t: at, what: sc0.id });
}
const at = (ev, n = 0) => { const l = log.filter((e) => e.ev === ev); if (!l[n]) throw new Error(`no ${ev} #${n}`); return l[n].t; };
// The action worked by hand (a charge): its pull-back stems with the rear stop on the handle (or slide) at the
// rear, its run home with the slam on the bolt home (the first one logged after it). The handle's own sounds come
// from the handle (the MP5's out at the front of its tube); the rest from the action, at the port.
const homeAfter = (t) => log.find((e) => e.ev === 'bolt home' && e.t >= t - 1e-6).t;
function worked([id, rear, slam], back) {
  // the action logged just before the handle reached the rear: its length sets the pull
  const act = log.filter((e) => e.ev === 'action' && e.t <= back + 1e-6).pop();
  const sc = act && act.dur ? CHARGE_BUILD[GUN]({ pull: 0.22 * act.dur, hold: 0 }) : scene(id);
  if (act && act.dur) console.log(`  ${sc.id}: pull ${(0.22 * act.dur * 1000).toFixed(0)} ms (the animation's), no hold`);
  const hp = HANDLE_PARTS[GUN], isHandle = (e) => !!hp && hp.test(e.what);
  const pullTracks = sc.tracks.filter((t) => t.name !== 'release-forward').map((t) => t.name), home = homeAfter(back);
  place(sc, rear, back, pullTracks, 0, 'port', (e) => !isHandle(e));
  place(sc, slam, home, ['release-forward'], 0, 'port', (e) => !isHandle(e));
  if (hp) {
    place(sc, rear, back, pullTracks, 0, 'handle', isHandle);
    place(sc, slam, home, ['release-forward'], 0, 'handle', isHandle);
  }
}
// (a pistol's slide at the rear is cued 'drop_slide' by the game, a rifle's handle 'rack_slide'; a release's home
// is 'drop_slide' too, so for a pistol it's the next one after the charge's)
const rearCue = C.rearCue || 'rack_slide';
worked(C.charge_, at(rearCue, 0));
// the partial reload: the loaded magazine out, a fresh one in (at the magazine well)
place(C.magOut[0], C.magOut[1], at('magazine out', 0), null, -2, 'well');
place(C.magIn[0], C.magIn[1], at('insert_magazine', 0), null, -2, 'well');
sources[sources.length - 1].calib = true;
// run dry, an emergency reload: the empty one let go (it falls free), a fresh one in, then the action
const dropped = log.find((e) => e.ev === 'magazine dropped'), rests = log.find((e) => e.ev === 'magazine rests');
place(C.magOutEmpty[0], C.magOutEmpty[1], dropped ? dropped.t : at('magazine out', 1), null, -2, 'well');
place(C.magIn[0], C.magIn[1], at('insert_magazine', 1), null, -2, 'well');
if (C.after === 'release') place(C.release[0], C.release[1], at('drop_slide', rearCue === 'drop_slide' ? 1 : 0), null, 0, 'port');
// (the game has the final say: if it racked when we expected the catch, or the reverse, the log shows which)
else worked(C.rackEmpty, at(rearCue, 1));
// ... and it hits the floor: the simulated drop of this gun's magazine, empty, from the height it was let go at,
// its release on the moment the game let it go (it clears the well ~50 ms later), heard from where it lands
if (dropped) {
  const height = dropped.y != null && rests ? Math.max(0.3, dropped.y - rests.y) : 1.2;
  const sc = magDropScene({ mag: C.mag, rounds: 0, way: 'forwards', height, toss: 0.4, surface: 'concrete' });
  const els = sc.tracks.flatMap((t) => t.elements);
  const origin = Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
  const r = renderScene(sc, sr, 1, { dry: !WET });
  const o = Math.round((dropped.t + 0.05 + origin) * sr), data = new Float32Array(N);
  for (let i = 0; i < r.mix.length; i++) if (o + i >= 0 && o + i < N) data[o + i] += r.mix[i] * Math.pow(10, -4 / 20);
  sources.push({ data, part: 'floor', t: dropped.t, what: sc.id });
  console.log(`  ${sc.id}: let go ${height.toFixed(2)} m above the floor`);
}
// Levels against the game's own mix: our magazine going in is set as loud as the game's own insert_magazine sample
// plays (its peak at the volume it's played at, 0.7), so its gunshots, played at their own gain, sit where the game
// puts them. (Without the game's sample: our sounds' peak at 0.89, as before.)
const ref = await page.evaluate(() => { const b = G.Audio.samples && G.Audio.samples.insert_magazine; if (!b) return null; let m = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); } return m * 0.7; });
const peakOf = (d) => { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); return m; };
const calib = sources.find((s) => s.calib);
let k;
if (ref && calib) { k = ref / peakOf(calib.data); console.log(`  levels: our magazine-in matched to the game's insert_magazine sample (peak ${ref.toFixed(3)})`); }
else { let pk = 0; for (let i = 0; i < N; i++) { let v = 0; for (const s of sources) v += s.data[i]; pk = Math.max(pk, Math.abs(v)); } k = 0.89 / pk; }
for (const s of sources) for (let i = 0; i < N; i++) s.data[i] *= k;
const shots = SHOTS ? log.filter((e) => e.ev === 'shot') : [];

// ---------- placed where each part is, in the game's own acoustics ----------
// Rendered offline in the game page: each sound through an HRTF panner at its part of the gun (where the part was
// when it happened, against a listener at the camera), plus the game's own echo paths from there
// (js/gunaudio.ts echoTaps: rays off the level's walls, each echo from its wall, darker each bounce). The dropped
// magazine is heard from where it came to rest on the floor, quieter for being further off.
let L = new Float32Array(N), R = L, echoes = 0;
for (const s of sources) for (let i = 0; i < N; i++) L[i] += s.data[i];
if (SPACE) {
  const payload = sources.map((s) => ({ b64: Buffer.from(s.data.buffer).toString('base64'), rel: s.part === 'floor' ? null : partsAt(s.t)[s.part] || DEFAULT[s.part], floor: s.part === 'floor' }));
  const muzzle = (() => { const p = (partsAt(shots[0] ? shots[0].t : 0).port || DEFAULT.port); return [p[0], p[1] + 0.02, p[2] - 0.35]; })();
  const res = await page.evaluate(async ({ payload, sr, rest, N, FORWARD, shots, muzzle }) => {
    const unb = (s) => { const bin = atob(s), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Float32Array(bytes.buffer); };
    const cam = G.R.camera, p = cam.position, q = cam.quaternion;
    const ctx = new OfflineAudioContext(2, N, sr);
    const l = ctx.listener, f = new THREE.Vector3(0, 0, -1).applyQuaternion(q), u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    if (l.positionX) { l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z; }
    else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    const placeAt = (node, at) => { if (node.positionX) { node.positionX.value = at.x; node.positionY.value = at.y; node.positionZ.value = at.z; } else node.setPosition(at.x, at.y, at.z); };
    let ntaps = 0;
    for (const sp of payload) {
      const data = unb(sp.b64);
      const buf = ctx.createBuffer(1, data.length, sr); buf.copyToChannel(data, 0);
      // (pushed FORWARD m further out ahead of you than the part itself)
      const pos = sp.floor ? new THREE.Vector3(rest.x, rest.y, rest.z) : p.clone().add(new THREE.Vector3(sp.rel[0], sp.rel[1], sp.rel[2] - FORWARD).applyQuaternion(q));
      const gain = sp.floor ? Math.min(1, 0.6 / Math.max(0.6, pos.distanceTo(p))) : 1;
      const s = ctx.createBufferSource(); s.buffer = buf;
      const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.rolloffFactor = 0; placeAt(pan, pos);
      const g0 = ctx.createGain(); g0.gain.value = gain;
      s.connect(pan).connect(g0).connect(ctx.destination); s.start(0);
      // The game's echo levels are for a source at least 2 m off (its gunshots); this one is closer, so its direct
      // sound is louder against what comes back off walls metres away: by the inverse-distance law, d/2.
      const near = Math.min(1, pos.distanceTo(p) / 2);
      const taps = G.GunAudio.echoTaps(G.Game.map, pos, p); ntaps += taps.length;
      for (const tp of taps) {
        const es = ctx.createBufferSource(); es.buffer = buf;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tp.order === 1 ? 5000 : 2800;
        const ep = ctx.createPanner(); ep.panningModel = 'HRTF'; ep.rolloffFactor = 0; placeAt(ep, tp.pos);
        const g = ctx.createGain(); g.gain.value = tp.amp * gain * near;
        es.connect(lp).connect(ep).connect(g).connect(ctx.destination); es.start(tp.delay);
      }
    }
    // The gunshots: the game's own report for this spot (its room baked in, as it plays it), at its own gain, and its
    // echo paths at its own levels, from the muzzle (out ahead of the port)
    const GA = G.GunAudio, map = G.Game.map;
    for (const sh of shots) {
      const mz = p.clone().add(new THREE.Vector3(muzzle[0], muzzle[1], muzzle[2] - FORWARD).applyQuaternion(q));
      const sig = GA.roomSig(map, p.x, p.z, GA.floorY(map, p));
      const buf = GA.bufs.get(sh.id + '|' + GA.sigKey(sig)) || GA.dry.get(sh.id);
      if (!buf) continue;
      const base = GA.GAIN * (sh.vol || 1);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.rolloffFactor = 0; placeAt(pan, mz);
      const g = ctx.createGain(); g.gain.value = base;
      s.connect(pan).connect(g).connect(ctx.destination); s.start(sh.t);
      const eb = GA.dry.get(sh.id) || buf;
      for (const tp of GA.echoTaps(map, mz, p)) {
        const es = ctx.createBufferSource(); es.buffer = eb;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tp.order === 1 ? 5000 : 2800;
        const ep = ctx.createPanner(); ep.panningModel = 'HRTF'; ep.rolloffFactor = 0; placeAt(ep, tp.pos);
        const eg = ctx.createGain(); eg.gain.value = base * tp.amp;
        es.connect(lp).connect(ep).connect(eg).connect(ctx.destination); es.start(sh.t + tp.delay);
      }
    }
    const o = await ctx.startRendering();
    const enc = (a) => { const u8 = new Uint8Array(a.buffer); let str = ''; for (let i = 0; i < u8.length; i += 0x8000) str += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(str); };
    return { L: enc(o.getChannelData(0)), R: enc(o.getChannelData(1)), taps: ntaps };
  }, { payload, sr, N, FORWARD, shots, muzzle, rest: rests ? { x: rests.x, y: rests.y, z: rests.z } : null });
  const dec = (s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
  L = dec(res.L); R = dec(res.R); echoes = res.taps;
  let m = 0; for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
  const down = m > 0.89 ? 0.89 / m : 1; // (only down, if it would clip: the balance is the game's)
  for (let i = 0; i < L.length; i++) { L[i] *= down; R[i] *= down; }
  console.log(`  ${shots.length} gunshots at the game's own level; peak ${(20 * Math.log10(m)).toFixed(1)} dBFS before any trim`);
  const seen = {};
  for (const s of sources) if (s.part !== 'floor') { const r = (partsAt(s.t)[s.part] || DEFAULT[s.part]).map((v) => v.toFixed(2)).join(', '); seen[s.part] = r; }
  console.log(`  ${sources.length} sounds placed at their parts (camera-relative x, y, z m: ${Object.entries(seen).map(([k, v]) => `${k} ${v}`).join('; ')}), ${echoes} echo paths`);
}
await browser.close();
// a 16-bit stereo WAV
const n = L.length, wavBuf = Buffer.alloc(44 + n * 4);
wavBuf.write('RIFF', 0); wavBuf.writeUInt32LE(36 + n * 4, 4); wavBuf.write('WAVE', 8); wavBuf.write('fmt ', 12);
wavBuf.writeUInt32LE(16, 16); wavBuf.writeUInt16LE(1, 20); wavBuf.writeUInt16LE(2, 22); wavBuf.writeUInt32LE(sr, 24); wavBuf.writeUInt32LE(sr * 4, 28); wavBuf.writeUInt16LE(4, 32); wavBuf.writeUInt16LE(16, 34);
wavBuf.write('data', 36); wavBuf.writeUInt32LE(n * 4, 40);
const s16 = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
for (let i = 0; i < n; i++) { wavBuf.writeInt16LE(s16(L[i]), 44 + i * 4); wavBuf.writeInt16LE(s16(R[i]), 46 + i * 4); }
const tmp = mkdtempSync(join(tmpdir(), 'ga-'));
const wav = join(tmp, 'a.wav');
writeFileSync(wav, wavBuf);
await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', videoPath, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), out], { stdio: 'inherit' })
  .on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
rmSync(tmp, { recursive: true, force: true });
// Up to normal media loudness, for speakers (--raw: leave it at its own peak-normalised level).
if (!args.includes('--raw')) {
  const loud = out.replace(/(\.\w+)$/, '.loud$1');
  const g = speakerMaster(out, loud);
  renameSync(loud, out);
  console.log(`speaker master: +${g} dB`);
}
console.log('wrote', out);
