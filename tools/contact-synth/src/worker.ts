// Renders off the main thread so sliders stay responsive.
import { render } from './render.js';
import type { Params } from './params.js';

interface Job { id: number; params: Params; sampleRate: number }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, params, sampleRate } = e.data;
  try {
    const r = render(params, sampleRate);
    (self as unknown as Worker).postMessage({ id, samples: r.samples, sampleRate: r.sampleRate, info: r.info }, [r.samples.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
