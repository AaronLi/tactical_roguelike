import type { Scene } from '../scene.js';
import { RECON_SCENES } from './recon-cs6.js';
import { FIREARM_SCENES } from './firearms.js';

export const SCENES: Scene[] = [...RECON_SCENES, ...FIREARM_SCENES];
export { RECON_CS6, RECON_CS6_DRY } from './recon-cs6.js';
export {
  PUMP_SHOTGUN, AR15_CHARGE, AR15_CHARGE_EMPTY, AR15_CHARGE_NO_MAG, AR15_BOLT_RELEASE, AR15_BOLT_RELEASE_EMPTY, AR15_BOLT_RELEASE_NO_MAG,
  AR15_MAG_IN, AR15_MAG_IN_EMPTY, AR15_MAG_OUT, AR15_MAG_OUT_EMPTY, AR15_LOAD_RACK_UNLOAD, AR15_MAG_IN_OUT, AR15_MAG_DROPS,
} from './firearms.js';
