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
import { writeFileSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
import { speakerMaster } from './speaker-master.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENES, renderScene, encodeWav, arChargeScene, chargeScene } from '../dist/index.js';
import { T0 } from '../dist/excitation.js';

const args = process.argv.slice(2);
const out = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('url', 'http://127.0.0.1:8080/');
const GUN = opt('gun', 'm4');
// Each gun: its caption, how it's charged, how its action is worked after a run-dry reload ('release': a bolt
// catch or slide stop, 'rack': the handle again), and which sound goes on which moment.
const GUNS = {
  m4: { title: 'Mk18 CQBR (AR-15)', charge: 'Charging handle pulled back and let go: chambers a round', after: 'release', afterCap: 'Magazine change, then the bolt catch hit',
    charge_: ['ar15-charge', 'handle bottoms out', 'carrier slams onto the bolt'], magOut: ['ar15-mag-out', 'magazine drops off the catch'], magOutEmpty: ['ar15-mag-out-empty', 'magazine drops off the catch'],
    magIn: ['ar15-mag-in', 'mag catch clicks into the hole in the magazine'], release: ['ar15-bolt-release', 'carrier slams onto the bolt'] },
  ak: { title: 'KV-47 (AKM)', charge: 'Charging handle yanked back and let go: chambers a round', after: 'rack', afterCap: 'Magazine rocked in, then the handle racked (no hold-open)',
    charge_: ['kv47-charge', 'carrier slams into the rear trunnion', 'carrier slams home'], rackEmpty: ['kv47-charge', 'carrier slams into the rear trunnion', 'carrier slams home'],
    magOut: ['kv47-mag-out', 'front lug unhooks from the trunnion'], magOutEmpty: ['kv47-mag-out-empty', 'front lug unhooks from the trunnion'], magIn: ['kv47-mag-in', 'paddle snaps over the rear lug'] },
  mp5: { title: 'MP5', charge: 'Cocking handle pulled back and let go: chambers a round', after: 'rack', afterCap: 'Magazine change, then the cocking handle',
    charge_: ['mp5-charge', 'handle stops at the end of its slot', 'rollers snap out into the trunnion'], rackEmpty: ['mp5-charge', 'handle stops at the end of its slot', 'rollers snap out into the trunnion'],
    magOut: ['mp5-mag-out', 'catch lets go of the magazine'], magOutEmpty: ['mp5-mag-out-empty', 'catch lets go of the magazine'], magIn: ['mp5-mag-in', 'catch clicks into the magazine'] },
  g19: { title: 'G19', rearCue: 'drop_slide', charge: 'Slide racked and let go: chambers a round', after: 'release', afterCap: 'Magazine change, then the slide stop hit',
    charge_: ['g19-rack', 'slide stops at the rear', 'slide slams home'], magOut: ['g19-mag-out', 'catch lets go of the magazine'], magOutEmpty: ['g19-mag-out-empty', 'catch lets go of the magazine'],
    magIn: ['g19-mag-in', 'catch clicks into the magazine'], release: ['g19-slide-release', 'slide slams home'] },
};
// The charge sound is rebuilt with the animation's own timing (js/vmanim.ts rack: the hand draws the action
// back from 30% to 52% of it and lets go at once, home at 60%), keeping each gun's real stroke.
const CHARGE_BUILD = { m4: (t) => arChargeScene('loaded', t), ak: (t) => chargeScene('ak', 'loaded', t), mp5: (t) => chargeScene('mp5', 'loaded', t), g19: (t) => chargeScene('g19', 'loaded', t) };
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
  const feed = m.feed.bind(m); m.feed = (ww) => { window.__log.push({ ev: 'bolt home', t: window.__clock.t() }); return feed(ww); };
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

// ---------- the sequence, frame by frame ----------
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', join(mkdtempSync(join(tmpdir(), 'gv-')), 'v.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
const videoPath = ff.spawnargs[ff.spawnargs.length - 1];
let frames = 0;
const write = (b) => new Promise((res) => (ff.stdin.write(b) ? res() : ff.stdin.once('drain', res)));
async function frame() {
  const st = await page.evaluate(() => window.__step());
  await write(await page.screenshot({ type: 'jpeg', quality: 92 }));
  frames++;
  if (frames % FPS === 0) console.log(`${(frames / FPS).toFixed(0)} s recorded`);
  return st;
}
const hold = async (s) => { for (let i = 0; i < Math.round(s * FPS); i++) await frame(); };
const busy = async () => { for (let i = 0; i < 20 * FPS; i++) { const st = await frame(); if (!st.reloading && !st.act && !st.swap) return; } };
const cap = (a, b) => page.evaluate(([x, y]) => window.__caption(x, y), [a, b]);
const T = C.title;

await cap(T, 'Drawn, a full magazine in, nothing chambered'); await busy(); await hold(1.0);
await cap(T, C.charge);
await page.evaluate(() => G.Me.startReload()); await busy(); await hold(1.0);
await cap(T, 'Magazine change with rounds left');
await page.evaluate(() => { const w = G.Me.cur(); w.mag = 12; w.tube = w.tube.slice(-12); G.Me.startReload(); }); await busy(); await hold(1.0);
await cap(T, C.after === 'release' ? 'Run dry: it locks open' : 'Run dry: nothing to hold it open');
await page.evaluate(() => { const w = G.Me.cur(); w.mag = 0; w.tube = []; w.chamber = null; }); await hold(0.8);
await cap(T, C.afterCap);
await page.evaluate(() => G.Me.startReload()); await busy(); await hold(1.5);
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
const log = await page.evaluate(() => window.__log);
await browser.close();
console.log(`\n${frames} frames`);
for (const e of log) console.log(`  ${e.t.toFixed(3)} s  ${e.ev}`);

// ---------- the sounds, each on its moment ----------
const sr = 48000, total = frames / FPS;
const mix = new Float32Array(Math.ceil((total + 1) * sr));
const scene = (id) => SCENES.find((s) => s.id === id);
/** Place a rendered stem (or the whole mix) so that element `what` of the scene lands at time `at`. */
function place(id, what, at, tracks = null, gainDb = 0) {
  const sc = typeof id === 'string' ? scene(id) : id;
  const els = sc.tracks.flatMap((t) => t.elements);
  const el = els.find((e) => e.what === what);
  if (!el) throw new Error(`${id}: no "${what}"`);
  const r = renderScene(sc, sr);
  // the mix's sample 0 is at scene time (earliest element start - T0); stems start `start` s after it
  const origin = Math.min(...els.map((e) => e.at - (e.sound.kind === 'contact' ? T0 : 0)));
  const g = Math.pow(10, gainDb / 20);
  const add = (samples, start) => {
    const o = Math.round((at - (el.at - origin) + start) * sr);
    for (let i = 0; i < samples.length; i++) if (o + i >= 0 && o + i < mix.length) mix[o + i] += samples[i] * g;
  };
  if (!tracks) add(r.mix, 0);
  else for (const t of r.tracks) if (tracks.includes(t.name)) add(t.samples, t.start);
}
const at = (ev, n = 0) => { const l = log.filter((e) => e.ev === ev); if (!l[n]) throw new Error(`no ${ev} #${n}`); return l[n].t; };
// The action worked by hand (a charge): its pull-back stems with the rear stop on the handle (or slide) at the
// rear, its run home with the slam on the bolt home (the first one logged after it).
const homeAfter = (t) => log.find((e) => e.ev === 'bolt home' && e.t >= t - 1e-6).t;
function worked([id, rear, slam], back) {
  // the action logged just before the handle reached the rear: its length sets the pull
  const act = log.filter((e) => e.ev === 'action' && e.t <= back + 1e-6).pop();
  const sc = act ? CHARGE_BUILD[GUN]({ pull: 0.22 * act.dur, hold: 0 }) : scene(id);
  if (act) console.log(`  ${sc.id}: pull ${(0.22 * act.dur * 1000).toFixed(0)} ms (the animation's), no hold`);
  place(sc, rear, back, sc.tracks.filter((t) => t.name !== 'release-forward').map((t) => t.name));
  place(sc, slam, homeAfter(back), ['release-forward']);
}
// (a pistol's slide at the rear is cued 'drop_slide' by the game, a rifle's handle 'rack_slide'; a release's home
// is 'drop_slide' too, so for a pistol it's the next one after the charge's)
const rearCue = C.rearCue || 'rack_slide';
worked(C.charge_, at(rearCue, 0));
// the partial reload: the loaded magazine out, a fresh one in
place(C.magOut[0], C.magOut[1], at('magazine out', 0), null, -2);
place(C.magIn[0], C.magIn[1], at('insert_magazine', 0), null, -2);
// run dry: the empty one out, a fresh one in, then the action
place(C.magOutEmpty[0], C.magOutEmpty[1], at('magazine out', 1), null, -2);
place(C.magIn[0], C.magIn[1], at('insert_magazine', 1), null, -2);
if (C.after === 'release') place(C.release[0], C.release[1], at('drop_slide', rearCue === 'drop_slide' ? 1 : 0));
// (the game has the final say: if it racked when we expected the catch, or the reverse, the log shows which)
else worked(C.rackEmpty, at(rearCue, 1));
let pk = 0; for (const v of mix) pk = Math.max(pk, Math.abs(v));
for (let i = 0; i < mix.length; i++) mix[i] *= 0.89 / pk;
const tmp = mkdtempSync(join(tmpdir(), 'ga-'));
const wav = join(tmp, 'a.wav');
writeFileSync(wav, Buffer.from(encodeWav(mix, sr)));
await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', videoPath, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), out], { stdio: 'inherit' })
  .on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
rmSync(tmp, { recursive: true, force: true });
// Up to normal media loudness, for speakers (--raw: leave it at the synth's own peak-normalised level).
if (!args.includes('--raw')) {
  const loud = out.replace(/(\.\w+)$/, '.loud$1');
  const g = speakerMaster(out, loud);
  renameSync(loud, out);
  console.log(`speaker master: +${g} dB to -16 LUFS`);
}
console.log('wrote', out);
