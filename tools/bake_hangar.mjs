// Bakes the hangar's fixed parts (docs/hangar-data.md) to glTF, from the game's own code: the hangar's builder (js/hangar.ts fixtures, js/range.ts and
// js/course.ts fixtures) and the shell's fixed pieces (js/level.ts buildMesh, hubFixed), run in a headless Chromium (Edge or Chrome) on the game's page,
// so the signs' canvases are drawn by a browser, exported there with three's GLTFExporter, then compressed here as the packs are (tools/model_emit.mjs).
//   assets/models/scenes/hangar.glb    the scene: one root node `hangar` (translation z = RZ, the hall's coordinates under it), a group for each part of the
//                                      hall (zones, workshop, outfitters, store, stash, nightjar, lounge, helipad, range, course, shell), their meshes, and the
//                                      anchors (empties a_<kind>[_<i>], extras { anchor, i, ry, ... }) where the game adds what changes; the shell group (z = -RZ:
//                                      the map's coordinates) holds the shell's fixtures and `lights` (an empty per lamp, extras: the map's light)
//   assets/models/scenes/hangar.json   the same scene as data, for the Bevy port and the golden test: the anchors, the lights, the collision (the solids
//                                      js/hangar.ts decorate adds to the hangar's map, in the map's coordinates), the counts
//   assets/models/scenes/index.json    { version, scenes: { hangar: { file, data, bytes, tris, meshes, nodes, anchors } } }
// The files go into the model bundle (tools/bundle_models.mjs; `npm run bake:hangar` runs both). Needs the compiled game (tsc) and a Chromium: the
// BROWSER environment variable, or Edge / Chrome / Chromium where they usually are. The textures are drawn with the machine's fonts.
//   node tools/bake_hangar.mjs [--port N] [--keep-raw]
import fs from 'fs'; import path from 'path'; import http from 'http'; import os from 'os'; import { spawn, execSync } from 'child_process';
import { ROOT } from './model_env.mjs';
import { makeIO, compression } from './model_emit.mjs';
import { dedup } from '@gltf-transform/functions';

const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.join(ROOT, 'assets/models/scenes/'), THREE_VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/three/package.json'), 'utf8')).version;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!fs.existsSync(path.join(ROOT, 'dist/js/hangar.js'))) { console.error('dist/js/hangar.js missing: run tsc first (npm run bake:hangar does)'); process.exit(1); }

// ---- a static server for the page (the repo's folder)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.rtb': 'application/octet-stream', '.glb': 'model/gltf-binary', '.map': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]), file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (url !== '/' && url.endsWith('/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(''); } // (a folder: an empty listing, js/stickers.ts)
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
});
await new Promise((r) => server.listen(+(arg('--port') || process.env.HANGAR_BAKE_PORT || 0), '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- a headless Chromium, driven over the DevTools protocol
function browserPath() {
  if (process.env.BROWSER && fs.existsSync(process.env.BROWSER)) return process.env.BROWSER;
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const win = pf.flatMap((d) => [path.join(d, 'Microsoft/Edge/Application/msedge.exe'), path.join(d, 'Google/Chrome/Application/chrome.exe')]);
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  for (const f of [...win, ...mac]) if (fs.existsSync(f)) return f;
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) { try { const p = execSync(`command -v ${n}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (p) return p; } catch { /* not there */ } }
  return null;
}
const exe = browserPath();
if (!exe) { console.error('bake_hangar: no Chromium found (set BROWSER to Edge, Chrome or Chromium)'); server.close(); process.exit(1); }
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-bake-hangar-'));
const proc = spawn(exe, ['--headless=new', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
let ws, seq = 0; const pend = new Map(), logs = [];
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pend.set(id, { res, rej })); };
async function ev(expr, timeout = 120000) {
  const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), sleep(timeout).then(() => ({ timeout: true }))]);
  if (r.timeout) throw new Error('timed out: ' + expr.slice(0, 80));
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
}
async function finish(code) {
  try { if (ws) await Promise.race([send('Browser.close'), sleep(1500)]); } catch { /* gone */ }
  proc.kill(); server.close(); await sleep(400);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
  process.exit(code);
}

// ---- what runs in the page: the hangar's map, its fixed parts drawn by the game's code, made ready for glTF, exported
// (a function, sent as its source: it sees only the page's globals)
async function inPage(threeVer) {
  const T = THREE, G = window.G, RZ = G.Hangar.RZ, WALL_H = G.Level.WALL_H;
  const { GLTFExporter } = await import(`https://cdn.jsdelivr.net/npm/three@${threeVer}/examples/jsm/exporters/GLTFExporter.js/+esm`);
  // the scene, for a map (Math.random seeded while it's drawn: the level's own textures' speckle, js/level.ts _tex, is random,
  // and a bake that came out the same twice would change the bundle for nothing)
  const build = (seed, level) => {
    let s = 0x5eed; const rnd = Math.random; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try { return drawn(seed, level); } finally { Math.random = rnd; }
  };
  const drawn = (seed, level) => {
    const map = G.Level.generateHub(seed, level), root = G.Hangar.fixtures(map), shell = new T.Group();
    shell.name = 'shell'; shell.position.z = -RZ; root.add(shell);
    const lv = G.Level.buildMesh(map, { pool: false, hubFixed: true }); // (the shell's fixed pieces, marked: js/level.ts buildMesh)
    for (const o of [...lv.children]) if (o.userData.hubFixed) { delete o.userData.hubFixed; shell.add(o); }
    const lights = new T.Group(); lights.name = 'lights'; shell.add(lights);
    (map.lights || []).forEach((l, i) => { const e = new T.Object3D(); e.name = 'light_' + i; e.position.set(l.x, (l.gy || 0) + (l.y != null ? l.y : WALL_H), l.z); e.userData = { light: JSON.parse(JSON.stringify(l)) }; lights.add(e); });
    return { map, root };
  };
  // the same whatever the seed and level the hangar's entered with (a fingerprint of every mesh's place, size, material and texture size)
  const fp = (root) => { root.updateMatrixWorld(true); const out = []; root.traverse((o) => { if (o.isMesh) { const m = o.material, g = o.geometry; out.push([o.matrixWorld.elements.map((v) => v.toFixed(4)).join(','), g.attributes.position.count, g.index ? g.index.count : 0, o.count || 1, m.type, m.color ? m.color.getHexString() : '', m.map ? m.map.image.width + 'x' + m.map.image.height : ''].join('|')); } else if (o.userData.anchor) out.push(o.name + o.position.toArray().map((v) => v.toFixed(4)).join(',')); }); return out.join('\n'); };
  const A = build(1, 1), B = build(987654, 7);
  if (fp(A.root) !== fp(B.root)) throw new Error('the hangar\'s fixed parts differ between two seeds and levels: something in them is not fixed');
  const { map, root } = A;
  root.updateMatrixWorld(true);
  // ready for glTF:
  //  - an instanced mesh (the rockwork, the shell's ceiling and roof) stays one (EXT_mesh_gpu_instancing, its colours _COLOR_0)
  const flatDone = new Map();
  root.traverse((o) => {
    if (o.layers.mask !== 1) o.userData.layers = o.layers.mask;
    if (!o.isMesh) return;
    const m = o.material;
    if (m.flatShading) { let g = flatDone.get(o.geometry); if (!g) { g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.computeVertexNormals(); flatDone.set(o.geometry, g); } o.geometry = g; }
    if (!m.userData.rt) {
      const rt = {};
      if (m.transparent) rt.tr = 1;
      if (!m.depthWrite) rt.dw = 0;
      if (m.alphaTest) rt.at = m.alphaTest;
      if (m.polygonOffset) rt.po = [m.polygonOffsetFactor, m.polygonOffsetUnits];
      if (m.transparent) rt.op = m.opacity;
      if (m.map && m.map.anisotropy > 1) rt.an = m.map.anisotropy;
      if (Object.keys(rt).length || m.transparent) m.userData.rt = rt; // (a transparent one always: the loader makes BLEND materials not write depth)
    }
    if (!m.name) m.name = (m.isMeshBasicMaterial ? 'basic_' : 'std_') + (m.color ? m.color.getHexString() : '') + (m.map ? '_tex' : '');
  });
  // the data beside it: the anchors, the lights, the collision (decorate's solids, on a world of their own)
  const anchors = [], lights = [];
  root.traverse((o) => {
    if (o.userData.anchor) { const p = new T.Vector3(); o.getWorldPosition(p); anchors.push({ name: o.name, parent: o.parent.name, hall: o.position.toArray().map((v) => +v.toFixed(6)), map: p.toArray().map((v) => +v.toFixed(6)), extras: o.userData }); }
    if (o.userData.light) { const p = new T.Vector3(); o.getWorldPosition(p); lights.push({ name: o.name, map: p.toArray().map((v) => +v.toFixed(6)), light: o.userData.light }); }
  });
  const world = G.World.create(); G.Hangar.decorate(Object.assign({}, map, { world }));
  const solids = world.solids.filter(Boolean).map((s) => { const o = {}; for (const [k, v] of Object.entries(s)) if (k !== 'id' && k !== 'target') o[k] = Array.isArray(v) ? JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'number' ? +x.toFixed(6) : x))) : v; return o; });
  // export
  const scene = new T.Scene(); scene.add(root);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false, maxTextureSize: 4096 });
  let s = ''; const u8 = new Uint8Array(glb); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { glb: btoa(s), anchors, lights, solids, rz: RZ, map: { W: map.W, H: map.H, TS: G.Level.TS } };
}

try {
  for (let i = 0; i < 100 && !ws; i++) {
    const f = path.join(prof, 'DevToolsActivePort');
    if (fs.existsSync(f)) { const [port] = fs.readFileSync(f, 'utf8').split('\n'); try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); } } catch { /* not yet */ } }
    if (!ws) await sleep(200);
  }
  if (!ws) throw new Error('the browser did not come up (' + exe + ')');
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } else if (d.method === 'Runtime.exceptionThrown') logs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 400)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: base + '/?mute&bake' });
  for (let i = 0; i < 300; i++) { if (await ev('!!(window.G && G.Hangar && G.Hangar.fixtures && G.Level && G.Range && G.Course && G.Highlights && window.THREE && document.readyState === "complete")').catch(() => false)) break; await sleep(200); }
  const state = await ev('JSON.stringify({ url: location.href, G: !!window.G, H: !!(window.G && G.Hangar), T: !!window.THREE, rs: document.readyState, n: document.scripts.length })').catch((e) => e.message);
  if (!/"T":true/.test(state)) throw new Error('the page did not come up: ' + state + (logs.length ? '\n  ' + logs.slice(0, 5).join('\n  ') : ''));
  const t0 = Date.now();
  const r = await ev(`(${inPage.toString()})(${JSON.stringify(THREE_VER)})`, 300000);
  const raw = Buffer.from(r.glb, 'base64');
  if (args.includes('--keep-raw')) fs.writeFileSync(path.join(os.tmpdir(), 'hangar-raw.glb'), raw);
  // compressed as the packs and props are (tools/model_emit.mjs: meshopt, int16 positions in each mesh's box, 10-bit normals, 12-bit UVs); identical
  // accessors, materials and pictures shared (dedup)
  const io = await makeIO(), doc = await io.readBinary(new Uint8Array(raw));
  await doc.transform(dedup(), ...compression());
  const buf = Buffer.from(await io.writeBinary(doc));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + 'hangar.glb', buf);
  // the counts, from the file as written
  const rootDoc = doc.getRoot();
  let tris = 0, prims = 0;
  for (const nd of rootDoc.listNodes()) { const me = nd.getMesh(); if (!me) continue; for (const p of me.listPrimitives()) { prims++; const ix = p.getIndices(), n = ix ? ix.getCount() : p.getAttribute('POSITION').getCount(); tris += n / 3; } }
  const stats = { bytes: buf.length, raw: raw.length, tris, meshes: rootDoc.listNodes().filter((n) => n.getMesh()).length, primitives: prims, nodes: rootDoc.listNodes().length, materials: rootDoc.listMaterials().length, textures: rootDoc.listTextures().length, anchors: r.anchors.length, lights: r.lights.length, solids: r.solids.length };
  const data = { version: 1, about: 'the hangar scene as data (docs/hangar-data.md): anchors (hall and map coordinates), lights (map), solids (collision, map coordinates)', rz: r.rz, map: r.map, three: THREE_VER, stats, anchors: r.anchors, lights: r.lights, solids: r.solids };
  fs.writeFileSync(OUT + 'hangar.json', JSON.stringify(data));
  fs.writeFileSync(OUT + 'index.json', JSON.stringify({ version: 1, scenes: { hangar: { file: 'hangar.glb', data: 'hangar.json', ...stats } } }, null, 1) + '\n');
  if (logs.length) console.log('page exceptions:\n  ' + logs.slice(0, 5).join('\n  '));
  console.log(`hangar: ${stats.meshes} meshes (${stats.tris} triangles), ${stats.materials} materials, ${stats.textures} textures, ${stats.anchors} anchors, ${stats.lights} lights, ${stats.solids} solids: ${buf.length} B (${raw.length} B as exported) in ${Date.now() - t0} ms (${OUT})`);
  await finish(0);
} catch (e) {
  console.error('bake_hangar failed: ' + (e && e.stack || e));
  if (logs.length) console.error('page exceptions:\n  ' + logs.slice(0, 5).join('\n  '));
  await finish(1);
}
