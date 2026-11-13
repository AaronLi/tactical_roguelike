// Drives the game in a headless Chromium (as tools/bake_hangar.mjs does: the DevTools protocol, no dependencies) for a look
// at the space direction without a window: opens a debug-start URL (js/debugstart.ts), waits till it's ready, runs steps,
// saves screenshots. The page's console errors and exceptions are printed.
//   node tools/space_shot.mjs "<query>" <steps.mjs> [--port 8151] [--out dir] [--gpu]
// steps.mjs: export default async ({ ev, shot, sleep, key, log }) => { ... }
//   ev(js): evaluate in the page (a promise is awaited); shot(name): a PNG in the out dir; key(code, down): a key held or let go
//   send(method, params): a DevTools protocol command of your own (Profiler.start, ...); on(method, fn): its events; out: the out dir
// The page is served by `node serve.js` (PORT) already running, or --port's.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { pathToFileURL } from 'node:url';
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const query = process.argv[2] || 'mute&hangar', stepsFile = process.argv[3], port = +(arg('--port') || 8151), out = arg('--out') || path.join(os.tmpdir(), 'space_shot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function browserPath() {
  if (process.env.BROWSER && fs.existsSync(process.env.BROWSER)) return process.env.BROWSER;
  const c = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return c.find((p) => fs.existsSync(p));
}
const exe = browserPath(); if (!exe) { console.error('no Chromium found (set BROWSER)'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'space-shot-'));
const proc = spawn(exe, ['--headless=new', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--mute-audio',
  ...(process.argv.includes('--gpu') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) { await sleep(100); try { const [p] = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n'); const tabs = await (await fetch(`http://127.0.0.1:${p}/json`)).json(); const t = tabs.find((q) => q.type === 'page'); if (t) wsUrl = t.webSocketDebuggerUrl; } catch { /* not up yet */ } }
if (!wsUrl) { console.error('the browser did not start'); proc.kill(); process.exit(1); }
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pend = new Map(), errs = [], subs = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method && subs.has(m.method)) subs.get(m.method)(m.params);
  if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errs.push('EXCEPTION ' + ((d.exception && d.exception.description) || d.text) + (d.url ? ' @ ' + d.url.split('/').pop() + ':' + d.lineNumber : '')); }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || (m.params.type === 'log' && process.argv.includes('--logs')))) errs.push(m.params.type.toUpperCase() + ' ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 400));
});
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pend.set(id, { res, rej })); };
async function ev(expr, timeout = 60000) {
  const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), sleep(timeout).then(() => ({ timeout: true }))]);
  if (r.timeout) throw new Error('timed out: ' + expr.slice(0, 80));
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(out, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('shot', f); return f; }
const VK = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyF: 70, KeyG: 71, KeyJ: 74, KeyL: 76, KeyQ: 81, KeyE: 69, KeyC: 67, KeyV: 86, KeyT: 84, KeyX: 88, Space: 32, ShiftLeft: 16 };
const key = (code, down) => send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', code, key: code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: VK[code] || 0 });
let code = 0;
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?${query}` });
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) { await sleep(500); if (await ev('!!window.__debugReady').catch(() => false)) break; }
  console.log('ready after', ((Date.now() - t0) / 1000).toFixed(1), 's:', await ev('!!window.__debugReady'));
  if (stepsFile) await (await import(pathToFileURL(path.resolve(stepsFile)).href)).default({ ev, shot, sleep, key, send, on: (method, fn) => subs.set(method, fn), out, log: console.log });
  else await shot('page');
} catch (e) { console.error('FAILED:', e.message); code = 1; }
for (const e of [...new Set(errs)].slice(0, 40)) console.log(e);
try { await Promise.race([send('Browser.close'), sleep(1500)]); } catch { /* gone */ }
proc.kill(); await sleep(300);
try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* held */ }
process.exit(code);
