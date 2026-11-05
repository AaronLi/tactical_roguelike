// Waveform + log-frequency spectrogram drawn into a canvas.
function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1;
            let ci = 0;
            for (let j = 0; j < len / 2; j++) {
                const a = i + j;
                const b = a + len / 2;
                const xr = re[b] * cr - im[b] * ci;
                const xi = re[b] * ci + im[b] * cr;
                re[b] = re[a] - xr;
                im[b] = im[a] - xi;
                re[a] += xr;
                im[a] += xi;
                const t = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = t;
            }
        }
    }
}
// Perceptual-ish colour ramp: near-black → violet → orange → pale yellow.
const RAMP = [
    [8, 8, 16], [40, 16, 80], [110, 30, 120], [190, 60, 90], [240, 120, 50], [252, 200, 90], [255, 250, 210],
];
function ramp(t) {
    const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = RAMP[i];
    const b = RAMP[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export function drawViz(canvas, x, sr) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const waveH = Math.round(H * 0.24);
    const specH = H - waveH;
    // Spectrogram
    const size = 1024;
    const win = new Float32Array(size);
    for (let i = 0; i < size; i++)
        win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    const cols = W;
    const img = ctx.createImageData(W, specH);
    const fMin = 30;
    const fMax = Math.min(20000, sr / 2);
    const rowBin = new Float32Array(specH);
    for (let y = 0; y < specH; y++) {
        const f = fMin * Math.pow(fMax / fMin, 1 - y / (specH - 1));
        rowBin[y] = (f / sr) * size;
    }
    const re = new Float32Array(size);
    const im = new Float32Array(size);
    const mag = new Float32Array(size / 2);
    const frames = [];
    let maxDb = -200;
    for (let c = 0; c < cols; c++) {
        const center = Math.round((c / cols) * x.length);
        const start = center - size / 2;
        for (let i = 0; i < size; i++) {
            const n = start + i;
            re[i] = n >= 0 && n < x.length ? x[n] * win[i] : 0;
            im[i] = 0;
        }
        fft(re, im);
        for (let k = 0; k < size / 2; k++)
            mag[k] = Math.hypot(re[k], im[k]);
        const col = new Float32Array(specH);
        for (let y = 0; y < specH; y++) {
            const b = rowBin[y];
            const k0 = Math.floor(b);
            const fr = b - k0;
            // Below one bin per row, take the strongest bin in the row's span so high partials don't vanish.
            let m = (mag[k0] ?? 0) * (1 - fr) + (mag[k0 + 1] ?? 0) * fr;
            const kEnd = y > 0 ? Math.floor(rowBin[y - 1]) : k0;
            for (let k = k0 + 1; k <= kEnd && k < mag.length; k++)
                m = Math.max(m, mag[k]);
            col[y] = 20 * Math.log10(m + 1e-9);
            if (col[y] > maxDb)
                maxDb = col[y];
        }
        frames.push(col);
    }
    const range = 80;
    for (let c = 0; c < cols; c++) {
        const col = frames[c];
        for (let y = 0; y < specH; y++) {
            const t = (col[y] - (maxDb - range)) / range;
            const [r, g, bl] = ramp(t);
            const o = (y * W + c) * 4;
            img.data[o] = r;
            img.data[o + 1] = g;
            img.data[o + 2] = bl;
            img.data[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, waveH);
    // Frequency grid labels
    ctx.font = `${10 * dpr}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (const f of [100, 1000, 10000]) {
        const y = waveH + (1 - Math.log(f / fMin) / Math.log(fMax / fMin)) * (specH - 1);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(2 * dpr, y - 14 * dpr, ctx.measureText(label).width + 6 * dpr, 12 * dpr);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(label, 5 * dpr, y - 4 * dpr);
    }
    // Waveform (min/max per column)
    const bg = getComputedStyle(canvas).getPropertyValue('--wave-bg').trim() || '#11131a';
    const fg = getComputedStyle(canvas).getPropertyValue('--wave-fg').trim() || '#8fd3ff';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, waveH);
    ctx.fillStyle = fg;
    const mid = waveH / 2;
    for (let c = 0; c < W; c++) {
        const a = Math.floor((c / W) * x.length);
        const b = Math.max(a + 1, Math.floor(((c + 1) / W) * x.length));
        let lo = 0;
        let hi = 0;
        for (let n = a; n < b && n < x.length; n++) {
            if (x[n] < lo)
                lo = x[n];
            if (x[n] > hi)
                hi = x[n];
        }
        ctx.fillRect(c, mid - hi * mid * 0.95, 1, Math.max(1, (hi - lo) * mid * 0.95));
    }
    // Time ticks
    const dur = x.length / sr;
    const step = dur > 4 ? 1 : dur > 1.5 ? 0.5 : dur > 0.6 ? 0.1 : 0.05;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let t = step; t < dur; t += step) {
        const px = (t / dur) * W;
        ctx.fillRect(px, waveH - 4 * dpr, 1, 4 * dpr);
        ctx.fillText(`${+t.toFixed(2)}s`, px + 2 * dpr, waveH - 5 * dpr);
    }
    return { waveH: waveH / dpr, duration: dur };
}
//# sourceMappingURL=viz.js.map