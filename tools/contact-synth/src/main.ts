// Browser UI: builds the sliders from the schema, renders in a worker, plays and draws the result.

import { cloneParams, defaultParams, getPath, setPath, withPatch, type Params } from './params.js';
import { MATERIALS, materialById } from './materials.js';
import { PRESETS } from './presets.js';
import { SECTIONS, type Control, type RangeControl } from './schema.js';
import { render, type RenderInfo } from './render.js';
import { encodeWav } from './wav.js';
import { drawViz, type VizLayout } from './viz.js';

const SR = 48000;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

let params: Params = loadFromHash() ?? withPatch(PRESETS[0].patch);
let currentPreset = loadFromHash() ? '' : PRESETS[0].id;
let last: { samples: Float32Array; sampleRate: number; info: RenderInfo } | null = null;
let layout: VizLayout | null = null;
const refreshers = new Map<string, () => void>();

// ---------- helpers ----------
function fmt(c: RangeControl, v: number): string {
  const d = c.digits ?? 2;
  let s: string;
  if (Math.abs(v) > 0 && Math.abs(v) < 0.01 && d > 2) s = v.toExponential(1);
  else s = v.toFixed(d);
  return c.unit ? `${s} ${c.unit}` : s;
}
const toSlider = (c: RangeControl, v: number) => (c.log ? (1000 * Math.log(v / c.min)) / Math.log(c.max / c.min) : v);
const fromSlider = (c: RangeControl, s: number) => {
  if (!c.log) return s;
  const v = c.min * Math.pow(c.max / c.min, s / 1000);
  // Round log values to 3 significant figures so they read cleanly.
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 2);
  return Math.round(v / p) * p;
};

function loadFromHash(): Params | null {
  const m = location.hash.match(/^#p=(.+)$/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))));
    return withPatch(JSON.parse(json));
  } catch {
    return null;
  }
}
function saveToHash(): void {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(params)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  history.replaceState(null, '', `#p=${b64}`);
}

// ---------- build controls ----------
const SECTION_SWITCH: Record<string, string> = {
  impact: 'impact.velocity', friction: 'friction.force', snap: 'snap.count', flex: 'flex.amount', coil: 'coil.level',
};

function buildControls(): void {
  const host = $('#controls');
  host.innerHTML = '';
  for (const sec of SECTIONS) {
    const det = document.createElement('details');
    det.className = 'section';
    det.dataset.section = sec.id;
    det.open = true;
    const sum = document.createElement('summary');
    sum.innerHTML = `<span class="sec-title">${sec.title}</span><span class="sec-state"></span>`;
    det.appendChild(sum);
    const blurb = document.createElement('p');
    blurb.className = 'blurb';
    blurb.textContent = sec.blurb;
    det.appendChild(blurb);
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const c of sec.controls) grid.appendChild(buildControl(c));
    det.appendChild(grid);
    host.appendChild(det);
  }
  refreshSections();
}

function buildControl(c: Control): HTMLElement {
  const row = document.createElement('label');
  row.className = 'ctl';
  row.title = c.hint;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = c.label;
  row.appendChild(name);

  if (c.kind === 'select') {
    const sel = document.createElement('select');
    if (c.path.endsWith('.material')) {
      const custom = document.createElement('option');
      custom.value = 'custom';
      custom.textContent = 'Custom';
      sel.appendChild(custom);
      for (const g of ['Metal', 'Plastic', 'Other'] as const) {
        const og = document.createElement('optgroup');
        og.label = g === 'Other' ? 'Other surfaces' : `${g}s`;
        for (const m of MATERIALS.filter((x) => x.group === g)) {
          const o = document.createElement('option');
          o.value = m.id;
          o.textContent = m.label;
          og.appendChild(o);
        }
        sel.appendChild(og);
      }
    } else {
      for (const o of c.options) {
        const el = document.createElement('option');
        el.value = o.value;
        el.textContent = o.label;
        sel.appendChild(el);
      }
    }
    sel.addEventListener('change', () => {
      setPath(params, c.path, sel.value);
      if (c.path.endsWith('.material')) {
        const m = materialById(sel.value);
        const body = c.path.split('.')[0];
        if (m) {
          setPath(params, `${body}.stiffness`, m.stiffness);
          setPath(params, `${body}.density`, m.density);
          setPath(params, `${body}.loss`, m.loss);
          for (const k of ['stiffness', 'density', 'loss']) refreshers.get(`${body}.${k}`)?.();
        }
      }
      changed();
    });
    refreshers.set(c.path, () => { sel.value = String(getPath(params, c.path)); });
    row.appendChild(sel);
  } else {
    const input = document.createElement('input');
    input.type = 'range';
    if (c.log) {
      input.min = '0';
      input.max = '1000';
      input.step = '1';
    } else {
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step ?? (c.max - c.min) / 1000);
    }
    const out = document.createElement('span');
    out.className = 'val';
    input.addEventListener('input', () => {
      const v = fromSlider(c, parseFloat(input.value));
      setPath(params, c.path, v);
      out.textContent = fmt(c, v);
      const [body, key] = c.path.split('.');
      if ((body === 'bodyA' || body === 'bodyB') && ['stiffness', 'density', 'loss'].includes(key)) {
        setPath(params, `${body}.material`, 'custom');
        refreshers.get(`${body}.material`)?.();
      }
      changed();
    });
    // Double-click the value to type an exact number.
    out.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const s = prompt(`${c.label}${c.unit ? ` (${c.unit})` : ''}`, String(getPath(params, c.path)));
      if (s == null) return;
      const v = parseFloat(s);
      if (!Number.isFinite(v)) return;
      setPath(params, c.path, Math.min(c.max, Math.max(c.min, v)));
      refreshers.get(c.path)?.();
      changed();
    });
    refreshers.set(c.path, () => {
      const v = getPath(params, c.path) as number;
      input.value = String(toSlider(c, v));
      out.textContent = fmt(c, v);
    });
    row.appendChild(input);
    row.appendChild(out);
  }
  return row;
}

function refreshAll(): void {
  for (const f of refreshers.values()) f();
  refreshSections();
  ($('#preset') as HTMLSelectElement).value = currentPreset;
}

function refreshSections(): void {
  for (const [sec, path] of Object.entries(SECTION_SWITCH)) {
    const el = document.querySelector(`[data-section="${sec}"]`) as HTMLElement | null;
    if (!el) continue;
    const on = (getPath(params, path) as number) > 0;
    el.classList.toggle('off', !on);
    (el.querySelector('.sec-state') as HTMLElement).textContent = on ? 'on' : 'off';
  }
}

// ---------- render / play ----------
let worker: Worker | null = null;
let jobId = 0;
let pendingTimer = 0;
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const d = e.data;
    if (d.id !== jobId) return; // stale
    if (d.error) {
      setStatus(`Render failed: ${d.error}`);
      return;
    }
    onRendered({ samples: d.samples, sampleRate: d.sampleRate, info: d.info });
  };
} catch {
  worker = null;
}

function requestRender(): void {
  clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    jobId++;
    setStatus('Rendering…');
    if (worker) worker.postMessage({ id: jobId, params: cloneParams(params), sampleRate: SR });
    else onRendered(render(params, SR));
  }, 90);
}

function onRendered(r: { samples: Float32Array; sampleRate: number; info: RenderInfo }): void {
  last = r;
  layout = drawViz($('#viz') as HTMLCanvasElement, r.samples, r.sampleRate);
  showInfo(r.info);
  setStatus(`${r.info.durationS.toFixed(2)} s · rendered in ${r.info.renderMs.toFixed(0)} ms`);
  if (($('#autoplay') as HTMLInputElement).checked && audioUnlocked) play();
}

let ctx: AudioContext | null = null;
let src: AudioBufferSourceNode | null = null;
let playStart = 0;
let audioUnlocked = false;

function play(): void {
  if (!last) return;
  ctx ??= new AudioContext();
  audioUnlocked = true;
  void ctx.resume();
  src?.stop();
  const buf = ctx.createBuffer(1, last.samples.length, last.sampleRate);
  buf.copyToChannel(last.samples as Float32Array<ArrayBuffer>, 0);
  src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  playStart = ctx.currentTime;
  requestAnimationFrame(tickPlayhead);
}

function tickPlayhead(): void {
  const ph = $('#playhead');
  if (!ctx || !last || !layout) return;
  const t = ctx.currentTime - playStart;
  if (t > layout.duration) {
    ph.style.opacity = '0';
    return;
  }
  ph.style.opacity = '1';
  ph.style.left = `${(t / layout.duration) * 100}%`;
  requestAnimationFrame(tickPlayhead);
}

function showInfo(i: RenderInfo): void {
  const body = (label: string, p: Params['bodyA'], b: RenderInfo['a']) => {
    const mat = materialById(p.material)?.label ?? 'Custom';
    const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${f.toFixed(0)} Hz`);
    const ring = b.audibleModes ? `${b.audibleModes} audible modes from ${hz(b.lowestHz)} · rings ~${b.ringT60 < 1 ? `${(b.ringT60 * 1000).toFixed(0)} ms` : `${b.ringT60.toFixed(1)} s`}` : 'no audible modes (too small/stiff to ring)';
    const kg = b.mass < 1 ? `${(b.mass * 1000).toFixed(b.mass < 0.01 ? 1 : 0)} g` : `${b.mass.toFixed(1)} kg`;
    return `<div><b>${label}</b> ${mat} ${p.shape}, ${p.size} cm × ${p.thickness} mm · ${kg} · f₁ ${hz(b.f1)}<br><span class="dim">${ring}</span></div>`;
  };
  $('#info').innerHTML =
    body('A', params.bodyA, i.a) +
    body('B', params.bodyB, i.b) +
    `<div><b>Contact</b> ${i.contactMs < 1 ? `${(i.contactMs * 1000).toFixed(0)} µs` : `${i.contactMs.toFixed(2)} ms`} (Hertz) · ${i.events} contact events${i.rattles ? ` (${i.rattles} rattles)` : ''}</div>`;
}

function setStatus(s: string): void {
  $('#status').textContent = s;
}

function changed(): void {
  currentPreset = '';
  ($('#preset') as HTMLSelectElement).value = '';
  refreshSections();
  saveToHash();
  requestRender();
}

// ---------- presets, randomize, export ----------
function buildPresetMenu(): void {
  const sel = $('#preset') as HTMLSelectElement;
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '— custom —';
  sel.appendChild(none);
  const groups = [...new Set(PRESETS.map((p) => p.group))];
  for (const g of groups) {
    const og = document.createElement('optgroup');
    og.label = g;
    for (const p of PRESETS.filter((x) => x.group === g)) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.label;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.addEventListener('change', () => {
    const p = PRESETS.find((x) => x.id === sel.value);
    if (!p) return;
    params = withPatch(p.patch);
    currentPreset = p.id;
    refreshAll();
    saveToHash();
    requestRender();
  });
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rndLog = (a: number, b: number) => a * Math.pow(b / a, Math.random());
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const r3 = (v: number) => +v.toPrecision(3);

function randomBody(b: Params['bodyA'], allowOther: boolean): void {
  const mats = MATERIALS.filter((m) => allowOther || m.group !== 'Other');
  const m = pick(mats);
  Object.assign(b, { material: m.id, stiffness: m.stiffness, density: m.density, loss: m.loss });
  b.shape = pick(['bar', 'plate', 'shell', 'block'] as const);
  b.size = r3(rndLog(1.5, 80));
  b.thickness = r3(Math.min(b.size * 5, rndLog(0.2, 12)));
  b.damping = r3(rnd(0, 0.6));
  b.irregularity = r3(rnd(0, 0.7));
}

function randomize(): void {
  const p = defaultParams();
  randomBody(p.bodyA, false);
  randomBody(p.bodyB, true);
  p.bodyB.level = r3(rnd(-12, 0));
  const kinds = pick([['impact'], ['friction'], ['snap'], ['impact', 'friction'], ['friction', 'snap'], ['impact']]);
  p.impact.velocity = kinds.includes('impact') ? r3(rndLog(0.3, 5)) : 0;
  p.impact.restitution = r3(rnd(0, 0.7));
  p.impact.scatter = r3(rnd(0, 1));
  p.impact.contactRadius = r3(rndLog(0.5, 30));
  if (kinds.includes('friction')) {
    Object.assign(p.friction, {
      force: r3(rndLog(2, 30)), duration: r3(rnd(0.3, 1.8)), speed: r3(rndLog(0.03, 1)),
      profile: pick(['steady', 'accelerate', 'decelerate', 'swell', 'backforth'] as const), strokes: Math.round(rnd(2, 5)),
      roughness: r3(rndLog(1, 300)), grain: r3(rndLog(0.1, 3)), periodicity: r3(Math.random() < 0.3 ? rnd(0.7, 1) : rnd(0, 0.3)),
      stickSlip: r3(Math.random() < 0.3 ? rnd(0.5, 1) : rnd(0, 0.2)), stickPitch: r3(rndLog(80, 1500)),
    });
  }
  if (kinds.includes('snap')) Object.assign(p.snap, { count: Math.round(rnd(1, 3)), strength: r3(rnd(0.4, 1)), spacing: r3(rndLog(5, 200)), preload: r3(rnd(20, 200)), creak: r3(rnd(0, 0.6)), seat: r3(rnd(0, 0.8)) });
  if (Math.random() < 0.3) Object.assign(p.flex, { amount: r3(rnd(0.4, 1)), freq: r3(rndLog(3, 300)), decay: r3(rndLog(0.1, 2)), rattle: r3(rnd(0, 1)), wobble: r3(rnd(0, 0.6)), tone: r3(rnd(0, 0.5)) });
  if (Math.random() < 0.2) Object.assign(p.coil, { level: r3(rnd(0.3, 1)), length: r3(rndLog(3, 80)), dispersion: r3(rnd(0.3, 1)), decay: r3(rndLog(0.2, 2)) });
  p.out.seed = Math.floor(rnd(1, 9999));
  params = p;
  currentPreset = '';
  refreshAll();
  saveToHash();
  requestRender();
}

function download(): void {
  if (!last) return;
  const blob = new Blob([encodeWav(last.samples, last.sampleRate)], { type: 'audio/wav' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${currentPreset || 'contact'}-${params.out.seed}.wav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function copyParams(): Promise<void> {
  const json = JSON.stringify(params, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    setStatus('Parameters copied as JSON');
  } catch {
    prompt('Parameters (JSON):', JSON.stringify(params));
  }
}

// ---------- wire up ----------
buildPresetMenu();
buildControls();
refreshAll();
$('#play').addEventListener('click', () => {
  audioUnlocked = true;
  if (last) play();
  else requestRender();
});
$('#vary').addEventListener('click', () => {
  params.out.seed = 1 + Math.floor(Math.random() * 9998);
  refreshers.get('out.seed')?.();
  audioUnlocked = true;
  saveToHash();
  requestRender();
});
$('#random').addEventListener('click', () => { audioUnlocked = true; randomize(); });
$('#download').addEventListener('click', download);
$('#copy').addEventListener('click', () => void copyParams());
$('#collapse').addEventListener('click', () => {
  const all = [...document.querySelectorAll<HTMLDetailsElement>('details.section')];
  const anyOpen = all.some((d) => d.open);
  for (const d of all) d.open = !anyOpen;
});
($('#viz') as HTMLCanvasElement).addEventListener('click', () => { audioUnlocked = true; play(); });
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement && e.target.type !== 'range') && !(e.target instanceof HTMLSelectElement)) {
    e.preventDefault();
    audioUnlocked = true;
    play();
  }
});
let resizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = window.setTimeout(() => { if (last) layout = drawViz($('#viz') as HTMLCanvasElement, last.samples, last.sampleRate); }, 150);
});
requestRender();
