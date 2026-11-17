'use strict';
// The highlights export worker's entry file (js/exportworker.ts imports it, after three.js, and nothing else): the game's own code the replay is
// drawn with, the files the worker's list (EXPORT_SCRIPTS) used to load, each run once, named in that list's order. A file runs when it is first imported,
// so one that imports a file that comes later here has it run first; what must hold is that a file that reads another while it loads comes after it,
// and tools/deps.mjs checks that (npm run deps:check). js/modelbundles.ts, which the page loads as a classic script, runs here as a module (the
// same IIFE). The files that read another this worker does not load (js/highlights.ts, js/render.ts ...) read them through ReplayEnv (js/replayenv.ts), which the page's files set and this worker leaves empty. The worker
// sets its stand-ins (ReplayEnv.Game, ReplayEnv.Net, two hooks) once this has loaded, which an import of the page's own files would have bypassed.
import './util.js';
import './medical.js';
import './materials.js';
import './data.js';
import './spacedata.js';
import './shipgen.js';
import './callsigns.js';
import './parts.js';
import './gear.js';
import './sim.js';
import './world.js';
import './ballistics.js';
import './damage.js';
import './leveldesc.js';
import './level.js';
import './furnspec.js';
import './furniture.js';
import './homes.js';
import './residents.js';
import './furnmesh.js';
import './lightgrid.js';
import './levelview.js';
import './render.js';
import './stickers.js';
import './gunmaterials.js';
import './gunmodels.js';
import './modelbundles.js';
import './glb.js';
import './gunrig.js';
import './viewmodel.js';
import './vmanim.js';
import './humandata.js';
import './humans.js';
import './headgear.js';
import './rig.js';
import './scars.js';
import './highlights.js';
