// Types js/homes.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/homes.ts.

type HomeKit = FdKit;

type HomeStyle = Record<string, any>; // (a piece's style: whatever its build reads)

interface HomeFloor { kind: string; color: string; grout?: string; sound?: string }
