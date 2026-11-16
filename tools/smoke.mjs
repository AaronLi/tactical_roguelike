// The smoke check (docs/modules-plan.md: run after every step of the move to modules): the game opened at each of the
// debug-start URLs below (js/debugstart.ts), in a headless Chromium (the DevTools protocol, no dependencies, as
// tools/space_shot.mjs), with the server's thread on and off. Each passes if the page says it's ready within the time
// and nothing throws, while it loads or in the few seconds it then runs.
//   node tools/smoke.mjs                 all of them; serves the game itself (node serve.js on a free port)
//   node tools/smoke.mjs warehouse fly   only the cases whose name has one of these in it
//   node tools/smoke.mjs --port 8080     against a server already running
//   node tools/smoke.mjs --site <dir>    serves that folder instead (the release: a copy of the site with `npm run bundle -- --site <dir>` done)
//   node tools/smoke.mjs --list          the URLs, to open by hand or in another browser (no Chromium here: set BROWSER)
// Exit 1 if any case fails, 2 if there's no browser to run them in.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import net from 'node:net'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// name, query (mute is added), seconds to be ready in. The server's thread is on unless serverthread=0.
export const CASES = [
  ['level', 'play=warehouse&level=2', 90],
  ['level-main-thread', 'play=apartment&level=2&serverthread=0', 90],
  ['level-night', 'play=suburbs&night&nofoes', 90],
  ['level-research', 'play=research&level=3&nofoes&serverthread=0', 90],
  ['hangar', 'hangar', 90],
  ['fly', 'fly', 90],
  ['board', 'board=transport&nofoes', 120],
  ['board-artifact-main-thread', 'board=medium&obj=artifact&serverthread=0', 120],
  ['board-docked', 'board=small&obj=hvt&dock', 120],
  ['assault', 'assault=warehouse&dock', 120],
];
const RUN_FOR = 4; // (s, after ready: a few seconds of the game's own loop)

const want = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && (argv[i - 1] === '--port' || argv[i - 1] === '--site')));
const cases = CASES.filter(([n]) => !want.length || want.some((w) => n.includes(w)));
if (argv.includes('--list')) { for (const [n, q] of cases) console.log(n.padEnd(28), '/?' + q + '&mute'); process.exit(0); }

function browserPath() {
  if (process.env.BROWSER && fs.existsSync(process.env.BROWSER)) return process.env.BROWSER;
  return ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/opt/pw-browsers/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')].find((p) => fs.existsSync(p));
}
const exe = browserPath();
if (!exe) {
  console.error('no Chromium found (set BROWSER to one). The cases, to open by hand (each should say "[debug start] ready" and throw nothing):');
  for (const [n, q] of cases) console.error('  ' + n.padEnd(28) + '/?' + q + '&mute');
  process.exit(2);
}

// the game's server: the one given, or our own on a free port
let port = +(arg('--port') || 0), server = null;
if (!port) {
  port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  server = spawn(process.execPath, [path.join(ROOT, 'serve.js')], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...(arg('--site') ? { SITE_ROOT: path.resolve(arg('--site')) } : {}) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { await sleep(100); try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { /* not yet */ } }
}

const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
const proc = spawn(exe, ['--headless=new', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) { await sleep(100); try { const [p] = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n'); const tabs = await (await fetch(`http://127.0.0.1:${p}/json`)).json(); const t = tabs.find((x) => x.type === 'page'); if (t) wsUrl = t.webSocketDebuggerUrl; } catch { /* not yet */ } }
const quit = async (code) => { proc.kill(); if (server) server.kill(); await sleep(300); try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* held */ } process.exit(code); };
if (!wsUrl) { console.error('the browser did not start'); await quit(1); }

const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r));
let seq = 0, errs = []; const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errs.push('exception: ' + ((d.exception && d.exception.description) || d.text).split('\n').slice(0, 3).join(' | ') + (d.url ? ` @ ${d.url.split('/').pop()}:${d.lineNumber + 1}` : '')); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && m.params.entry.source !== 'network') errs.push('log: ' + m.params.entry.text.slice(0, 300));
});
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pend.set(id, { res, rej })); };
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.value; };
// (and the workers': the server's thread and the level's preparation throw there, not on the page)
await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }).catch(() => {});
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');

const results = [];
for (const [name, q, limit] of cases) {
  errs = [];
  const t0 = Date.now();
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?${q}&mute` });
  let ready = false;
  while (Date.now() - t0 < limit * 1000) { await sleep(500); if (await ev('!!window.__debugReady').catch(() => false)) { ready = true; break; } }
  const tReady = (Date.now() - t0) / 1000;
  if (ready) await sleep(RUN_FOR * 1000);
  const ok = ready && !errs.length;
  results.push({ name, ok, ready, t: tReady, errs: [...new Set(errs)] });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(28)} ${ready ? `ready in ${tReady.toFixed(1)} s` : `not ready after ${limit} s`}${errs.length ? `, ${new Set(errs).size} errors` : ''}`);
  for (const e of [...new Set(errs)].slice(0, 6)) console.log('       ' + e);
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
await quit(bad.length ? 1 : 0);
