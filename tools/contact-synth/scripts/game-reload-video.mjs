// Record the game's own AR-15 viewmodel (fitted with the short barrel: an MK18) working through its
// actions, and dub it with this synth's sounds, each placed on the frame the animation reaches its
// moment: the charging handle at the rear and the bolt home, the old magazine out of the well, the
// new one seated, the bolt catch hit.
//
// The game runs in headless Chromium on a stepped clock (exactly one frame's time per frame, whatever the
// rendering speed), so every frame and every logged moment lines up with the sound.
//
// Usage: (from the repo root) HOST=127.0.0.1 node serve.js &
//        cd tools/contact-synth && npm run build && node scripts/game-reload-video.mjs <out.mp4> [--url http://127.0.0.1:8080/]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // (the globally installed one)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
import { speakerMaster } from './speaker-master.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENES, renderScene, encodeWav } from '../dist/index.js';
import { T0 } from '../dist/excitation.js';

const args = process.argv.slice(2);
const out = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('url', 'http://127.0.0.1:8080/');
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
await page.addInitScript((f) => { window.__fps = f; }, FPS);
await page.goto(URL);
await page.waitForFunction(() => window.G && G.Game && G.Me, null, { timeout: 60000 });

// A solo level with nobody in it, stood at its longest clear sight line (as the game's own ?demo does).
await page.evaluate(async () => {
  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
  const until = async (f) => { while (!f()) await sleep(0.1); };
  G.Game.solo(); await sleep(0.8);
  G.Server.startRun();
  await until(() => G.Game.phase === 'route' && G.Game.routeMap);
  G.Me.sidearmChosen = true; // (the route waits on the sidearm choice)
  const g0 = G.Game; g0.pickRoute(G.Route.options(g0.routeMap, g0.routeSt.path[g0.routeSt.path.length - 1])[0]);
  await until(() => G.Game.phase === 'level' && G.Me.kit);
  await sleep(1.0);
  G.Server.enemies.clear();
  const g = G.Game; let lk = true; Object.defineProperty(g, 'locked', { get: () => lk, set: () => {}, configurable: true });
  for (const el of ['pause', 'clickToPlay']) { const e = g.$(el); if (e) e.classList.add('hidden'); }
  G.Game.setMuted(true);
  // Stay in the spawn room, where it's lit; the game's level-start banner and objectives off (they fade on
  // real time, which the stepped clock doesn't run).
  const m = G.Me; m.pitch = -0.05; if (m.vel) m.vel.set(0, 0, 0);
  const css = document.createElement('style'); css.textContent = '#toast,#levelInfo,#objective{display:none!important}'; document.head.appendChild(css);
  // The MK18: the AR-15 carbine with the short barrel fitted.
  const build = Object.assign({}, G.Gunsmith.compile('m4').build, { barrel: 'm4.br.short' });
  m.weapons.p = m.makeWeapon('m4', build); m.slot = null; m.swap('p');
  const w = m.weapons.p;
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
  window.__step = () => {
    window.__clock.step(1000 / FPS);
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
console.log('in the level, the MK18 drawn');
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
const T = 'MK18 (AR-15 carbine, short barrel)';

await cap(T, 'Drawn, a full magazine in, nothing chambered'); await busy(); await hold(1.0);
await cap(T, 'Charging handle pulled back and let go: chambers a round');
await page.evaluate(() => G.Me.startReload()); await busy(); await hold(1.0);
await cap(T, 'Magazine change with rounds left');
await page.evaluate(() => { const w = G.Me.cur(); w.mag = 12; w.tube = w.tube.slice(-12); G.Me.startReload(); }); await busy(); await hold(1.0);
await cap(T, 'Run dry: the bolt locks back');
await page.evaluate(() => { const w = G.Me.cur(); w.mag = 0; w.tube = []; w.chamber = null; }); await hold(0.8);
await cap(T, 'Magazine change, then the bolt catch hit');
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
  const sc = scene(id);
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
// the charge: the pull to the rear stop on the handle at the rear, the run home on the bolt home
const chargeBack = at('rack_slide'), chargeHome = at('bolt home', 0);
const charge = scene('ar15-charge');
place('ar15-charge', 'handle bottoms out', chargeBack, charge.tracks.filter((t) => t.name !== 'release-forward').map((t) => t.name));
place('ar15-charge', 'carrier slams onto the bolt', chargeHome, ['release-forward']);
// the partial reload: the loaded magazine out, a fresh one in
place('ar15-mag-out', 'magazine drops off the catch', at('magazine out', 0), null, -2);
place('ar15-mag-in', 'mag catch clicks into the hole in the magazine', at('insert_magazine', 0), null, -2);
// run dry: the empty one out, a fresh one in, the bolt catch
place('ar15-mag-out-empty', 'magazine drops off the catch', at('magazine out', 1), null, -2);
place('ar15-mag-in', 'mag catch clicks into the hole in the magazine', at('insert_magazine', 1), null, -2);
place('ar15-bolt-release', 'carrier slams onto the bolt', at('drop_slide'));
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
