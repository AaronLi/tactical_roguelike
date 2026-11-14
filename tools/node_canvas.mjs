// A canvas for node, for the bakes that draw pictures with the game's own code (tools/bake_hangar.mjs: the signs, screens and
// floors): Skia compiled to WebAssembly (canvaskit-wasm), so the same on every machine that runs node, with no browser and
// nothing built for the platform. Its fonts are files that come with npm, not the machine's, so a sign's text is the same
// picture wherever it's baked: Arimo, Tinos and Cousine (@fontsource/*, SIL Open Font License 1.1), which are cut to the
// widths of Arial, Times New Roman and Courier New, so text laid out for a browser's sans-serif, serif and monospace fits.
//   const NC = await nodeCanvas();
//   NC.createCanvas(w, h)        what document.createElement('canvas') gives the game: width, height, getContext('2d'),
//                                toDataURL(), toBlob(cb), png() (its PNG's bytes)
//   NC.Canvas                    its class (three's exporter asks `instanceof HTMLCanvasElement`)
//   NC.install(scope)            document.createElement('canvas'), HTMLCanvasElement and FileReader set on scope (globalThis for
//                                three's GLTFExporter; a vm's context for the game)
// What CanvasKit's own 2D context leaves out, done here: the font families (a CSS list such as "Georgia, serif" or a generic
// name, to one of three faces: sans-serif, serif, monospace, each plain and bold), textAlign and textBaseline (it draws from
// the left of the alphabetic baseline whatever they're set to), and one canvas drawn onto another.
import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const FACES = [['sans-serif', 'normal', 'arimo/files/arimo-latin-400-normal.EXT'], ['sans-serif', 'bold', 'arimo/files/arimo-latin-700-normal.EXT'], ['serif', 'normal', 'tinos/files/tinos-latin-400-normal.EXT'], ['serif', 'bold', 'tinos/files/tinos-latin-700-normal.EXT'], ['monospace', 'normal', 'cousine/files/cousine-latin-400-normal.EXT'], ['monospace', 'bold', 'cousine/files/cousine-latin-700-normal.EXT']];
/** A CSS font ("bold 22px Georgia, serif") as the three faces have it: { css: 'bold 22px serif', px: 22 }. */
function fontOf(css) {
  const m = /^\s*((?:(?:italic|oblique|normal|bold|bolder|lighter|\d{3})\s+)*)(\d+(?:\.\d+)?)px\s+(.+)$/i.exec(String(css));
  if (!m) return null;
  const bold = /\b(bold|bolder|[6-9]00)\b/i.test(m[1]), first = m[3].split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  const fam = /mono|courier|consolas|menlo/.test(first) ? 'monospace' : /serif|georgia|times|garamond/.test(first) && !/sans/.test(first) ? 'serif' : 'sans-serif';
  return { css: (bold ? 'bold ' : '') + m[2] + 'px ' + fam, px: +m[2] };
}
// (how far below the alphabetic baseline each textBaseline's line is, as a part of the font's size: DejaVu's figures, near enough any face's)
const BASE = { alphabetic: 0, top: 0.76, hanging: 0.76, middle: 0.3, ideographic: -0.22, bottom: -0.22 };

export async function nodeCanvas() {
  const CK = await require('canvaskit-wasm/bin/canvaskit.js')({ locateFile: (f) => require.resolve('canvaskit-wasm/bin/' + f) });
  const fonts = FACES.map(([family, weight, file]) => [fs.readFileSync(require.resolve('@fontsource/' + file.replace('EXT', 'woff'))), { family, style: 'normal', weight }]);
  class Canvas {
    constructor(w = 300, h = 150) { this._w = w; this._h = h; this._ck = null; this._ctx = null; this._fonts = false; this.style = {}; }
    get width() { return this._w; } set width(v) { this._w = v | 0; this._drop(); }
    get height() { return this._h; } set height(v) { this._h = v | 0; this._drop(); }
    _drop() { if (this._ck) { this._ck.dispose(); this._ck = null; this._ctx = null; this._fonts = false; } } // (sized anew: cleared, as a canvas is)
    _make() { if (!this._ck) this._ck = CK.MakeCanvas(Math.max(1, this._w), Math.max(1, this._h)); return this._ck; }
    getContext(kind) {
      if (kind !== '2d') return null;
      if (this._ctx) return this._ctx;
      const self = this, ck = this._make(), g = ck.getContext('2d'), st = { font: '10px sans-serif', px: 10, textAlign: 'start', textBaseline: 'alphabetic' };
      const text = (fn) => (s, x, y) => { // (maxWidth: not squeezed)
        const w = st.textAlign === 'center' ? g.measureText(String(s)).width / 2 : st.textAlign === 'right' || st.textAlign === 'end' ? g.measureText(String(s)).width : 0;
        return g[fn](String(s), x - w, y + (BASE[st.textBaseline] || 0) * st.px);
      };
      const own = {
        canvas: this, fillText: text('fillText'), strokeText: text('strokeText'),
        drawImage(src, ...a) { if (src instanceof Canvas) { const im = ck.decodeImage(src.png()); try { return g.drawImage(im, ...a); } finally { if (im && im.delete) im.delete(); } } return g.drawImage(src, ...a); },
        createPattern(src, rep) { return g.createPattern(src instanceof Canvas ? ck.decodeImage(src.png()) : src, rep); },
      };
      this._ctx = new Proxy(g, {
        get(_t, k) { if (k in own) return own[k]; if (k === 'font' || k === 'textAlign' || k === 'textBaseline') return st[k]; const v = g[k]; return typeof v === 'function' ? v.bind(g) : v; },
        set(_t, k, v) {
          if (k === 'textAlign' || k === 'textBaseline') { st[k] = v; return true; }
          if (k === 'font') {
            const f = fontOf(v); if (!f) return true; // (not a font: kept as it was, as a browser does)
            if (!self._fonts) { self._fonts = true; for (const [bytes, d] of fonts) ck.loadFont(bytes, d); }
            st.font = String(v); st.px = f.px; g.font = f.css; return true;
          }
          g[k] = v; return true;
        },
      });
      return this._ctx;
    }
    toDataURL() { this.getContext('2d'); return this._ck.toDataURL(); }
    /** its PNG, as bytes */
    png() { return Buffer.from(this.toDataURL().split(',')[1], 'base64'); }
    toBlob(cb) { const b = this.png(); cb(new Blob([b], { type: 'image/png' })); }
  }
  // (three's exporter reads the blob a canvas gives it with a FileReader, which node has none of)
  class FileReader { readAsArrayBuffer(blob) { blob.arrayBuffer().then((ab) => { this.result = ab; if (this.onloadend) this.onloadend(); }); } }
  const createCanvas = (w, h) => new Canvas(w, h);
  const install = (scope) => {
    const doc = scope.document || (scope.document = {});
    doc.createElement = (tag) => (String(tag).toLowerCase() === 'canvas' ? new Canvas() : { style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} });
    doc.createElementNS = (_ns, tag) => doc.createElement(tag);
    scope.HTMLCanvasElement = Canvas; scope.FileReader = FileReader;
    return scope;
  };
  return { CK, Canvas, FileReader, createCanvas, install, fontOf };
}
