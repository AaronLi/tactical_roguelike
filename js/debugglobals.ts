// The console's object, `window.G`: every file's module (its name as the file calls it: G.U, G.Level, G.Me, G.ServerLink ...) and the data and
// functions the files export by name (G.WEAPONS, G.roundOf ...), the object the game's files put themselves on before they imported each other
// (docs/modules-plan.md phase 7). Nothing in the game reads it: it is for the DevTools console and the browser checks (tools/smoke.mjs and the
// others read G.ServerLink, G.Game ... through page.evaluate), and js/main.ts imports this file last, so it holds the one object each file made.
// The names are in the order the files first registered them (the order the page's modules run in). On the page only: the workers have no G.
// tools/vm_game.mjs reads this file's import lines for the names (which file has which), to build the same G for the tools' contexts.
import { BundlesEnv } from './bundlesenv.js';
import { Acoustics } from './acoustics.js';
import { Ambience } from './ambience.js';
import { Arsenal } from './arsenal.js';
import { Audio } from './audio.js';
import { Ballistics } from './ballistics.js';
import { Bolts } from './bolts.js';
import { Callsigns } from './callsigns.js';
import { Career } from './career.js';
import { Casings } from './casings.js';
import { Cloud } from './cloud.js';
import { CloudConfig } from './cloudconfig.js';
import { Course } from './course.js';
import { Damage } from './damage.js';
import { AKIMBO_OFF, AMMO, AMMO_RARITY, AMMO_TYPES, ARMORS, ARMOR_LIST, AUTO_ONLY, BELT_FAMILY, BOLT_HOLD, CALIBERS, CHARGE_GR, CLASS_SND, CLICK, ENEMIES, ENEMY_GEAR, EXPLOSIVES_OFF, FIRE_MODES, GRAVITY, GUN_KG, GUN_SPECS, HANGAR_ROWS, HANGAR_THEME, MAG_FAMILY, MODE_INFO, MODE_NAME, MUZZLE_V, OFF_GUNS, OPEN_BOLT, PLAYER_COLORS, PLUSP, RECOIL, RECOIL_K, REV, ROUND_LIFE, SHIELDS, SOUND_SPEED, SUPPRESSOR, THEMES, TIER_COLORS, TIER_NAMES, VENDOR_QUIPS, WEAPONS, WEAPON_LIST, aimSway, ammoOk, ammoTypes, asCal, ballFor, ballistics, barrelMm, barrelsOf, baseAm, beltFed, boltHold, boreTip, calOf, calsOf, capOf, cartOf, chambered, dragOf, fblock, flight, fullReload, gearTier, loadFor, loadOf, loaded, magFam, magFits, obtainable, perOf, physRecoil, pickBarrels, plusOf, recoilImpulse, revolver, rollAmmo, roundDef, roundOf, roundSpec, roundSpeed, shotDef, shotK, shotSoundKey, sightH, stdMag, volleyVol, zeroOf, zeroSlope } from './data.js';
import { DebugStart } from './debugstart.js';
import { Demo } from './demo.js';
import { Footsteps } from './footsteps.js';
import { Furniture } from './furniture.js';
import { FurnMesh } from './furnmesh.js';
import { FurnSpec } from './furnspec.js';
import { Game } from './game.js';
import { Pad } from './gamepad.js';
import { Gear } from './gear.js';
import { Glare } from './glare.js';
import { Models } from './glb.js';
import { GunAudio } from './gunaudio.js';
import { GunMaterials } from './gunmaterials.js';
import { GunModels } from './gunmodels.js';
import { GunRig } from './gunrig.js';
import { GunsmithUI } from './gunsmith.js';
import { Handling } from './handling.js';
import { Hangar } from './hangar.js';
import { Headgear } from './headgear.js';
import { Highlights } from './highlights.js';
import { Wind } from './wind.js';
import { Homes } from './homes.js';
import { HUD } from './hud.js';
import { HumanData } from './humandata.js';
import { Humans } from './humans.js';
import { Icons } from './icons.js';
import { InvUI } from './invui.js';
import { Landing } from './landing.js';
import { Level } from './level.js';
import { LevelDesc } from './leveldesc.js';
import { LevelView } from './levelview.js';
import { LightGrid } from './lightgrid.js';
import { GpuAo } from './gpuao.js';
import { GunAo } from './gunao.js';
import { Loadout } from './loadout.js';
import { Loot } from './loot.js';
import { Materials } from './materials.js';
import { Med } from './medical.js';
import { MenuShow } from './menushow.js';
import { Net } from './net.js';
import { Gunsmith } from './parts.js';
import { Me } from './player.js';
import { Prep } from './prep.js';
import { Prof } from './profiler.js';
import { Range } from './range.js';
import { Recorder } from './recorder.js';
import { R } from './render.js';
import { Rig } from './rig.js';
import { Route } from './route.js';
import { Scars } from './scars.js';
import { Server } from './server.js';
import { ServerHost } from './serverhost.js';
import { ServerLink } from './serverlink.js';
import { ShipGen } from './shipgen.js';
import { ShipModel } from './shipmodel.js';
import { InteriorCull } from './interiorcull.js';
import { Shop } from './shop.js';
import { ShopUI } from './shopui.js';
import { ShotLog } from './shotlog.js';
import { Sim } from './sim.js';
import { Space } from './space.js';
import { Radar } from './radar.js';
import { RadarView } from './radarview.js';
import { SuiteView } from './suiteview.js';
import { SpaceData } from './spacedata.js';
import { SpaceSv } from './spaceserver.js';
import { SpaceUI } from './spaceui.js';
import { Stickers } from './stickers.js';
import { Touch } from './touch.js';
import { Hooks, U } from './util.js';
import { Viewmodel } from './viewmodel.js';
import { Views } from './views.js';
import { VMAnim } from './vmanim.js';
import { World } from './world.js';
import { ZeroUI } from './zeroing.js';
import { Zip } from './zip.js';

(window as any).G = {
  Bundles: BundlesEnv.Bundles, AudioBundle: BundlesEnv.AudioBundle, U, Hooks, TIER_NAMES, TIER_COLORS, CLASS_SND, WEAPON_LIST, WEAPONS,
  EXPLOSIVES_OFF, AKIMBO_OFF, OFF_GUNS, obtainable, AUTO_ONLY, FIRE_MODES, MODE_NAME, MODE_INFO, roundOf, perOf, cartOf, calsOf, asCal, capOf,
  barrelsOf, pickBarrels, barrelMm, shotK, roundSpec, shotDef, shotSoundKey, OPEN_BOLT, chambered, revolver, REV, fblock, volleyVol, fullReload,
  BOLT_HOLD, boltHold, loaded, MAG_FAMILY, BELT_FAMILY, magFam, magFits, beltFed, GUN_SPECS, SUPPRESSOR, ARMOR_LIST, SHIELDS, ARMORS, ENEMIES,
  THEMES, HANGAR_ROWS, HANGAR_THEME, PLAYER_COLORS, VENDOR_QUIPS, CALIBERS, calOf, stdMag, PLUSP, AMMO, baseAm, plusOf, AMMO_TYPES, ammoTypes,
  loadOf, MUZZLE_V, SOUND_SPEED, dragOf, roundSpeed, CHARGE_GR, GUN_KG, RECOIL_K, RECOIL, aimSway, recoilImpulse, physRecoil, GRAVITY, zeroOf,
  sightH, ROUND_LIFE, ballistics, flight, zeroSlope, CLICK, boreTip, ballFor, loadFor, AMMO_RARITY, rollAmmo, ammoOk, roundDef, gearTier, ENEMY_GEAR,
  Gunsmith, Scars, Damage, LevelDesc, World, ShipGen, Furniture, Homes, Level, Materials, SpaceData, Sim, Stickers, Gear, Ballistics, Med, Zip,
  Callsigns, Arsenal, Acoustics, Ambience, GunAudio, Footsteps, Audio, GunMaterials, Models, GunRig, HumanData, Humans, Headgear, FurnSpec, FurnMesh,
  LightGrid, GpuAo, GunAo, LevelView, Wind, Rig, VMAnim, Highlights, R, Viewmodel, GunModels, Icons, Bolts, Route, Shop, Recorder, SpaceSv, Server, ServerHost,
  ServerLink, Net, Career, CloudConfig, Handling, Loot, Casings, Range, Course, GunsmithUI, Hangar, ZeroUI, ShopUI, InvUI, Touch, Pad, Landing, Prep,
  ShipModel, InteriorCull, SpaceUI, Radar, RadarView, SuiteView, Space, Me, Cloud, MenuShow, Prof, Game, Glare, Views, ShotLog, HUD, Loadout, Demo, DebugStart,
};
