// The two bundles (js/modelbundles.ts: the baked models, the synthesized audio) for the files that read them.
// modelbundles.ts is a classic script that the page runs before anything else (so the download starts before three.js is fetched), and the export
// worker and the tools run it first; it leaves the two on `RTBundles` on the global. This reads them from there, when asked, as the files
// that were written before the modules did: `Bundles` is there wherever the models are used (a read where it is not throws), `AudioBundle`
// is `undefined` where nothing loaded modelbundles.ts (ambience.html), and the callers then take the loose files.
// A leaf: it imports nothing.
export const BundlesEnv = {
  get Bundles(): typeof G_Bundles { return (globalThis as any).RTBundles.Bundles; },
  get AudioBundle(): typeof G_AudioBundle | undefined { const b = (globalThis as any).RTBundles; return b && b.AudioBundle; },
};
