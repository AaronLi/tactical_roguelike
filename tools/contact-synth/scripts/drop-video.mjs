// Render a simulated magazine drop as a video with its synthesized sound: the rigid-body simulation
// drawn by a small software renderer (no dependencies), real time with sound, then a 4x slow-motion
// replay, encoded with ffmpeg.
//
// Usage: npm run build && node scripts/drop-video.mjs <rounds 0|10|20|30> <way bottom|top|sideways|forwards> <out.mp4>
//          [--surface asphalt|concrete] [--box 0.7] [--toss 0.15] [--seed 1] [--size 960x540]
import { simulateBoxDrop, magDropSpec, magDropScene, renderScene, encodeWav, quatMatrix } from '../dist/index.js';
import { T0 } from '../dist/excitation.js';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [roundsArg, way, out] = args;
if (!out) { console.error('usage: drop-video.mjs <rounds> <way> <out.mp4> [--surface asphalt] [--box 0.7] [--toss 0.15] [--seed 1]'); process.exit(1); }
const o = { rounds: +roundsArg, way, surface: opt('surface', 'asphalt'), box: +opt('box', '0.6'), toss: +opt('toss', '0.15'), start: +opt('start', '0'), seed: +opt('seed', '1') };
const [OW, OH] = opt('size', '960x540').split('x').map(Number);
const SS = 2, W = OW * SS, H = OH * SS;
const FPS = 60, SLOW = 4;

// ---------- simulate and synthesize ----------
const spec = magDropSpec(o);
const sim = simulateBoxDrop(spec);
const scene = magDropScene(o, sim);
const audio = renderScene(scene, 48000);
const allEls = scene.tracks.flatMap((t) => t.elements);
const audioStart = Math.min(...allEls.map((e) => e.at)) - T0; // sim time of audio sample 0
const endT = Math.min(spec.duration, sim.restT + 0.5);
console.log(`${scene.id}: ${sim.contacts.length} contacts, ${sim.slides.length} slides, ${sim.knocks.length} knocks, rest at ${sim.restT.toFixed(2)} s`);
const [L, Wd, Th] = spec.dims;
const loaded = o.rounds > 0;
const box = o.box;
const wallH = 0.18, wallT = 0.04; // matches magDropSpec's walls
// Visible contact markers: the louder contacts, as rings spreading from where they touched.
const Jref = (0.12 + 0.012 * o.rounds) * 4.85 * 1.3;
const marks = sim.contacts.filter((c) => c.impulse / Jref > 0.03).map((c) => ({ ...c, s: Math.min(1, Math.sqrt(c.impulse / Jref)) }));

// ---------- camera ----------
const eye = [0.32, -0.62, 0.95], at = [0, 0.02, 0.0], up = [0, 0, 1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const n = Math.hypot(...a); return a.map((v) => v / n); };
const fwd = nrm(sub(at, eye)), right = nrm(crs(fwd, up)), camUp = crs(right, fwd);
const focal = (H / 2) / Math.tan((38 * Math.PI) / 180 / 2);
const project = (p) => { const d = sub(p, eye); const z = dot(d, fwd); return [W / 2 + (dot(d, right) / z) * focal, H / 2 - (dot(d, camUp) / z) * focal, z]; };
const light = nrm([0.45, -0.25, 1]);

// ---------- textures ----------
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf); };
// Asphalt: dark binder with grey aggregate chips of a few mm, a few lighter stones.
function asphalt(u, v) {
  const chip = vnoise(u / 0.0035, v / 0.0035), fine = vnoise(u / 0.0012 + 31, v / 0.0012 + 17), big = vnoise(u / 0.08, v / 0.08);
  let g = 0.11 + 0.07 * chip + 0.04 * fine + 0.03 * big;
  if (hash(Math.floor(u / 0.004), Math.floor(v / 0.004)) > 0.95 && chip > 0.6) g += 0.06;
  return [g * 0.98, g, g * 1.02];
}

// ---------- geometry ----------
function boxGeom(center, R, half) {
  const c = []; for (let i = 0; i < 8; i++) { const l = [(i & 1 ? 1 : -1) * half[0], (i & 2 ? 1 : -1) * half[1], (i & 4 ? 1 : -1) * half[2]];
    c.push([center[0] + R[0] * l[0] + R[1] * l[1] + R[2] * l[2], center[1] + R[3] * l[0] + R[4] * l[1] + R[5] * l[2], center[2] + R[6] * l[0] + R[7] * l[1] + R[8] * l[2]]); }
  // faces as corner index quads with outward body normal axis/sign
  return { c, faces: [[[0, 2, 6, 4], 0, -1], [[1, 5, 7, 3], 0, 1], [[0, 4, 5, 1], 1, -1], [[2, 3, 7, 6], 1, 1], [[0, 1, 3, 2], 2, -1], [[4, 6, 7, 5], 2, 1]] };
}
const walls = box ? [[[box / 2 + wallT / 2, 0, wallH / 2], [wallT / 2, box / 2 + wallT, wallH / 2]], [[-box / 2 - wallT / 2, 0, wallH / 2], [wallT / 2, box / 2 + wallT, wallH / 2]],
  [[0, box / 2 + wallT / 2, wallH / 2], [box / 2, wallT / 2, wallH / 2]], [[0, -box / 2 - wallT / 2, wallH / 2], [box / 2, wallT / 2, wallH / 2]]] : [];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Ray vs the magazine (oriented box) for shadows: slab test in the box frame.
function hitsMag(p, mag) {
  const d = sub(p, mag.center); const R = mag.R;
  let tmin = 1e-4, tmax = 10;
  for (let a = 0; a < 3; a++) {
    const ax = [R[a], R[3 + a], R[6 + a]];
    const e = dot(ax, d), f = dot(ax, light), h = mag.half[a];
    if (Math.abs(f) < 1e-9) { if (Math.abs(e) > h) return false; continue; }
    let t1 = (-h - e) / f, t2 = (h - e) / f; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return false;
  }
  return true;
}

// ---------- rasterizer ----------
const color = new Float32Array(W * H * 3), depth = new Float32Array(W * H);
function tri(P, shade) {
  const S = P.map(project);
  if (S.some((s) => s[2] < 0.05)) return;
  const [a, b, c] = S;
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const iz = S.map((s) => 1 / s[2]);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    let w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
    let w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const z = w0 * iz[0] + w1 * iz[1] + w2 * iz[2];
    const k = y * W + x;
    if (z <= depth[k]) continue;
    depth[k] = z;
    const q0 = (w0 * iz[0]) / z, q1 = (w1 * iz[1]) / z, q2 = (w2 * iz[2]) / z;
    const wp = [q0 * P[0][0] + q1 * P[1][0] + q2 * P[2][0], q0 * P[0][1] + q1 * P[1][1] + q2 * P[2][1], q0 * P[0][2] + q1 * P[1][2] + q2 * P[2][2]];
    const col = shade(wp);
    color[k * 3] = col[0]; color[k * 3 + 1] = col[1]; color[k * 3 + 2] = col[2];
  }
}
const quad = (q, shade) => { tri([q[0], q[1], q[2]], shade); tri([q[0], q[2], q[3]], shade); };

function ringTint(wp, t, col) {
  for (const m of marks) {
    const age = t - m.t; if (age < 0 || age > 0.25) continue;
    const r = 0.008 + age * 0.35 * m.s, d = Math.hypot(wp[0] - m.point[0], wp[1] - m.point[1], wp[2] - m.point[2]);
    const a = Math.max(0, 1 - Math.abs(d - r) / 0.004) * (1 - age / 0.25) * m.s;
    if (a > 0) { col[0] += (1.0 - col[0]) * a; col[1] += (0.55 - col[1]) * a; col[2] += (0.1 - col[2]) * a; }
  }
  return col;
}

function frame(t) {
  color.fill(0); depth.fill(0);
  // sky / background gradient
  for (let y = 0; y < H; y++) { const g = 0.62 - 0.25 * (y / H); for (let x = 0; x < W; x++) { const k = (y * W + x) * 3; color[k] = g * 0.92; color[k + 1] = g * 0.95; color[k + 2] = g; } }
  // pose at t
  const tr = sim.trace; let i = Math.min(tr.length - 1, Math.max(0, Math.round(t * 240)));
  const pose = tr[i];
  const R = quatMatrix(pose.orientation);
  const mag = { center: pose.position, R, half: [L / 2, Wd / 2, Th / 2] };
  // floor
  const F = 1.6;
  const floorShade = (wp) => { let c = asphalt(wp[0], wp[1]); const lit = hitsMag([wp[0], wp[1], 0.0005], mag) ? 0.45 : 1; const n = light[2];
    c = c.map((v) => v * (0.35 + 0.75 * n * lit)); return ringTint(wp, t, c); };
  // Tiled, so tiles behind the camera can be dropped without losing the floor in front of it.
  const N = 32, st = (2 * F) / N;
  for (let ix = 0; ix < N; ix++) for (let iy = 0; iy < N; iy++) {
    const x0 = -F + ix * st, y0 = -F + iy * st;
    quad([[x0, y0, 0], [x0 + st, y0, 0], [x0 + st, y0 + st, 0], [x0, y0 + st, 0]], floorShade);
  }
  // walls (asphalt-faced curbs)
  for (const [cen, half] of walls) {
    const g = boxGeom(cen, I3, half);
    for (const [idx, ax, sg] of g.faces) {
      const n = [0, 0, 0]; n[ax] = sg; const lam = Math.max(0, dot(n, light));
      quad(idx.map((j) => g.c[j]), (wp) => { const u = ax === 0 ? wp[1] : wp[0], v = ax === 2 ? wp[1] : wp[2] + 3;
        let c = asphalt(u, v).map((x) => x * 1.15); const lit = ax === 2 ? 1 : hitsMag(wp.map((x, j) => x + n[j] * 0.0005), mag) ? 0.5 : 1;
        c = c.map((x) => x * (0.4 + 0.7 * lam * lit)); return ringTint(wp, t, c); });
    }
  }
  // the magazine: dark grey anodised aluminium, black floorplate (-x), green follower or brass on top (+x)
  const g = boxGeom(pose.position, R, mag.half);
  for (const [idx, ax, sg] of g.faces) {
    const nb = [0, 0, 0]; nb[ax] = sg;
    const n = [R[0] * nb[0] + R[1] * nb[1] + R[2] * nb[2], R[3] * nb[0] + R[4] * nb[1] + R[5] * nb[2], R[6] * nb[0] + R[7] * nb[1] + R[8] * nb[2]];
    const lam = Math.max(0, dot(n, light));
    const hv = nrm([light[0] - fwd[0], light[1] - fwd[1], light[2] - fwd[2]]);
    const spec = Math.pow(Math.max(0, dot(n, hv)), 30) * 0.35;
    let base = [0.24, 0.25, 0.26];
    if (ax === 0 && sg < 0) base = [0.07, 0.07, 0.07];
    if (ax === 0 && sg > 0) base = loaded ? [0.78, 0.6, 0.25] : [0.34, 0.42, 0.24];
    quad(idx.map((j) => g.c[j]), () => base.map((v) => v * (0.3 + 0.8 * lam) + spec));
  }
}

// ---------- a single still (for checking the framing): --still <t> ----------
const still = opt('still', null);
if (still !== null) {
  frame(+still);
  const b = Buffer.alloc(W * H * 3);
  for (let k = 0; k < W * H * 3; k++) b[k] = Math.max(0, Math.min(255, Math.round(Math.pow(color[k], 1 / 1.6) * 255)));
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-', '-vf', `scale=${OW}:${OH}:flags=area`, '-frames:v', '1', out]);
  ff.stdin.end(b);
  await new Promise((res) => ff.on('close', res));
  console.log('wrote', out);
  process.exit(0);
}

// ---------- encode ----------
const tmp = mkdtempSync(join(tmpdir(), 'dropvid-'));
const wav = join(tmp, 'a.wav');
writeFileSync(wav, Buffer.from(encodeWav(audio.mix, 48000)));
const realFrames = Math.ceil(endT * FPS), slowFrames = Math.ceil(endT * FPS * SLOW), gap = Math.round(0.4 * FPS);
const total = realFrames + gap + slowFrames;
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const fillName = { 0: 'Empty', 10: '1/3 full (10 rounds)', 20: '2/3 full (20 rounds)', 30: 'Full (30 rounds)' }[o.rounds];
const wayName = { bottom: 'lands on its floorplate', top: 'lands on its feed lips', sideways: 'tumbling sideways', forwards: 'tumbling end over end' }[way];
const title = `${fillName} magazine, ${wayName}, ${o.surface}${box ? ' box' : ''}${o.toss > 0.3 ? ', thrown' : ''}`.replace(/:/g, '\\:');
const tReal = realFrames / FPS, tGap = gap / FPS;
const vf = [
  `scale=${OW}:${OH}:flags=area`,
  `drawtext=fontfile=${font}:text='${title}':x=20:y=18:fontsize=24:fontcolor=white:shadowcolor=black@0.7:shadowx=2:shadowy=2`,
  `drawtext=fontfile=${font}:text='real time, with sound':x=20:y=50:fontsize=20:fontcolor=white@0.85:shadowcolor=black@0.7:shadowx=2:shadowy=2:enable='lt(t,${tReal})'`,
  `drawtext=fontfile=${font}:text='4x slow motion':x=20:y=50:fontsize=20:fontcolor=white@0.85:shadowcolor=black@0.7:shadowx=2:shadowy=2:enable='gte(t,${tReal + tGap})'`,
].join(',');
const delayMs = Math.max(0, Math.round(audioStart * 1000));
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-i', wav,
  '-filter_complex', `[0:v]${vf}[v];[1:a]adelay=${delayMs}|${delayMs},apad[a]`, '-map', '[v]', '-map', '[a]', '-t', String(total / FPS),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const buf = Buffer.alloc(W * H * 3);
const write = (b) => new Promise((res) => (ff.stdin.write(b) ? res() : ff.stdin.once('drain', res)));
let last = null;
for (let f = 0; f < total; f++) {
  let t;
  if (f < realFrames) t = f / FPS; else if (f < realFrames + gap) t = null; else t = (f - realFrames - gap) / (FPS * SLOW);
  if (t !== null) {
    frame(Math.min(t, endT));
    for (let k = 0; k < W * H * 3; k++) buf[k] = Math.max(0, Math.min(255, Math.round(Math.pow(color[k], 1 / 1.6) * 255)));
    last = Buffer.from(buf);
  } else buf.fill(18);
  await write(t === null ? buf : last);
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out);
