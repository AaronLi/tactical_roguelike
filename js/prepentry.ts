'use strict';
// The level preparation's entry file (js/prepworker.ts imports it and nothing else): what a level needs to be laid out from its figures
// (js/level.ts generate) and its light grid worked out (js/lightgrid.ts compute), the same files the host's simulation uses for a level,
// each run once, named in the order the worker's list used to load them (PREP_SCRIPTS: the page's order, index.html). A file runs when it
// is first imported, so one that imports a file that comes later here (level imports homes) has it run first; what must hold is that a
// file that reads another while it loads comes after it, and tools/deps.mjs checks that (npm run deps:check). The ones nothing imports
// (residents registers itself and has no export) are why they are all named. The worker then asks Level and LightGrid.
import './util.js';
import './medical.js';
import './materials.js';
import './data.js';
import './spacedata.js';
import './shipgen.js';
import './callsigns.js';
import './arsenal.js';
import './parts.js';
import './gear.js';
import './sim.js';
import './world.js';
import './ballistics.js';
import './leveldesc.js';
import './level.js';
import './furnspec.js';
import './furniture.js';
import './homes.js';
import './residents.js';
import './damage.js';
import './furnmesh.js';
import './lightgrid.js';
