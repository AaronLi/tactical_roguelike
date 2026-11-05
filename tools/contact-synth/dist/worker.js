// Renders off the main thread so sliders stay responsive.
import { render } from './render.js';
self.onmessage = (e) => {
    const { id, params, sampleRate } = e.data;
    try {
        const r = render(params, sampleRate);
        self.postMessage({ id, samples: r.samples, sampleRate: r.sampleRate, info: r.info }, [r.samples.buffer]);
    }
    catch (err) {
        self.postMessage({ id, error: String(err) });
    }
};
//# sourceMappingURL=worker.js.map