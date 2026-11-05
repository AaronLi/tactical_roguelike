// The one place that says how the baker treats COUPLING: a slot whose part changes the SHAPE of another slot's geometry (not only moves it). The invariance
// sweep (tools/model_sweep.mjs: the default and loaded builds x every single part swap) finds them; each becomes a joint pack (one pack per combination of
// the parts involved), which is correct but multiplies the files and the bake. Today they are warnings, listed at the end of every bake.
//
// To make a coupling an error (the shape every gun should converge to: slots are independent, parts only MOVE each other), set COUPLING_IS_ERROR = true and
// list what is still allowed in COUPLING_EXCEPTIONS until the last one is gone.

/** true: a coupling that is not in COUPLING_EXCEPTIONS fails the bake. false: it is reported as a warning. */
export const COUPLING_IS_ERROR = false;

/**
 * The couplings still allowed when COUPLING_IS_ERROR is true. Each is 'pack<-slot' (the pack's geometry depends on that slot's part: e.g. 'handguard<-barrel')
 * on every platform, or { coupling: 'pack<-slot', platforms: ['m4', ...] } on just those.
 */
export const COUPLING_EXCEPTIONS = [];

/** Whether a coupling ('pack<-slot') on a platform is declared an exception. */
export function isException(coupling, platform) {
  return COUPLING_EXCEPTIONS.some((e) => (typeof e === 'string' ? e === coupling : e.coupling === coupling && (!e.platforms || e.platforms.includes(platform))));
}
