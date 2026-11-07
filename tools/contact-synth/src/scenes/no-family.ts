/*
 * The guns with no magazine and action of the kinds from-spec.ts builds: a revolver's cylinder, a break-action's
 * hinge, a belt-fed's feed cover and its belt, an M1's en-bloc clip. A first attempt at each, from the same contacts
 * (steel on steel, brass in steel chambers, a sprung latch's snap): each part a body of its material and size, heavily
 * damped as parts held in an assembly are (firearms.ts), each scene through a housing for the frame it's all in.
 */

import type { Scene, SceneElement } from '../scene.js';
import { mat } from '../presets.js';
import { hit, rub, snap, springWire, arCase, SHEET_BUZZ, SHEET_RATTLE, type Body } from './firearms.js';

const steel = (cm: number, mm: number, damping = 0.6, modes = 1): Body => ({ ...mat('steel'), shape: 'bar', size: cm, thickness: mm, modes, irregularity: 0.6, damping, level: 0 });
const block = (cm: number, mm: number, damping = 0.65): Body => ({ ...mat('steel'), shape: 'block', size: cm, thickness: mm, modes: 1, irregularity: 0.7, damping, level: 0 });
const frame = (cm: number, mm: number): Body => ({ ...mat('steel'), shape: 'shell', size: cm, thickness: mm, modes: 0, irregularity: 0.7, damping: 0.6, level: 0 });
const brass = (cm: number, mm: number): Body => ({ ...arCase, size: cm, thickness: mm });
const hull: Body = { ...mat('nylon'), material: 'custom', stiffness: 1.4, loss: 0.08, shape: 'bar', size: 7, thickness: 18, modes: 0, irregularity: 0.6, damping: 0.6, level: 0 };
const head: Body = { ...mat('brass'), shape: 'bar', size: 1, thickness: 20, modes: 1, irregularity: 0.5, damping: 0.5, level: 0 };
const oiled = { roughness: 2, grain: 0.3, periodicity: 0, contactWidth: 0.1 };
const scene = (id: string, title: string, housing: Body & { amount: number; cavity: number }, els: SceneElement[]): Scene =>
  ({ id, title, room: 0.04, roomSize: 0.35, housing, tracks: [{ name: 'hands', description: title, elements: els }] });

// ------------------------------------------------------------------------------------------------ a revolver

const cyl = block(4, 38, 0.55), crane = steel(5, 6), revFrame = frame(18, 6), latch = steel(2, 4), rod = steel(5, 5, 0.7);
const REV_HOUSING = { amount: 0.4, cavity: 0.1, ...revFrame };

/** The cylinder swung out and the empties punched out by the ejector rod (rounds: how many come out). */
export function revolverOpen(rounds = 6): Scene {
  const els: SceneElement[] = [
    rub('thumb pushes the cylinder latch', 0, -14, { force: 6, duration: 0.03, speed: 0.2, profile: 'steady', roughness: 6, grain: 0.3 }, latch, revFrame),
    snap('latch lets the crane go', 0.03, -8, { strength: 0.6, seat: 0.2, seatDelay: 1 }, latch, crane),
    rub('crane swings out on its pivot', 0.045, -15, { force: 4, duration: 0.08, speed: 0.6, profile: 'swell', ...oiled }, crane, revFrame),
    rub('cylinder spins free on the crane, the hand ticking its ratchet', 0.05, -16, { force: 2, duration: 0.12, speed: 0.8, profile: 'decelerate', roughness: 6, grain: 2, periodicity: 0.9, contactWidth: 0.03 }, cyl, steel(1, 2)),
    hit('crane stops against the frame', 0.125, -4, 0.9, crane, revFrame, { radius: 2.5, click: 0.7, sharp: 0.7 }),
    rub('ejector rod pushed home', 0.32, -12, { force: 10, duration: 0.07, speed: 0.4, profile: 'steady', ...oiled }, rod, cyl),
    rub('ejector spring compresses', 0.322, -15, { force: 5, duration: 0.065, speed: 0.3, profile: 'accelerate', roughness: 4, grain: 0.3, contactWidth: 0.04 }, springWire(4, 0.8), rod, { coil: { level: 0.5, length: 4, dispersion: 0.5, decay: 0.1, brightness: 4000 } }),
  ];
  for (let i = 0; i < rounds; i++) els.push(rub('empty slides out of its chamber', 0.33 + i * 0.004, -16, { force: 2, duration: 0.05, speed: 0.6, profile: 'accelerate', roughness: 4, grain: 0.2, contactWidth: 0.05 }, brass(3.3, 9), cyl));
  els.push(hit('star clacks against the cylinder', 0.39, -8, 0.6, steel(3, 3), cyl, { radius: 2, click: 0.6, sharp: 0.7 }));
  els.push(rub('rod springs back', 0.42, -16, { force: 4, duration: 0.05, speed: 0.6, profile: 'decelerate', ...oiled }, rod, cyl));
  return scene('revolver-open', 'Revolver: cylinder out, empties ejected', REV_HOUSING, els);
}
/** The cylinder swung shut (the anchor: the latch clicking into the frame). */
export function revolverClose(): Scene {
  return scene('revolver-close', 'Revolver: cylinder shut', REV_HOUSING, [
    rub('crane swings in', 0, -14, { force: 4, duration: 0.06, speed: 0.6, profile: 'accelerate', ...oiled }, crane, revFrame),
    hit('cylinder meets the frame', 0.06, -6, 0.8, cyl, revFrame, { radius: 3, click: 0.6, sharp: 0.6 }),
    snap('latch clicks home into the frame', 0.062, -3, { strength: 0.9, seat: 0.5, seatDelay: 1 }, latch, revFrame),
    rub('cylinder turned by hand', 0.1, -15, { force: 2, duration: 0.05, speed: 0.4, profile: 'steady', roughness: 6, grain: 2, periodicity: 0.9, contactWidth: 0.03 }, cyl, steel(1, 2)),
    snap('bolt drops into its notch', 0.15, -9, { strength: 0.6, seat: 0.3, seatDelay: 1 }, steel(1.5, 3), cyl),
  ]);
}
/** A speed loader's rounds dropped into the chambers and let go (the anchor: the rounds' rims seating), then shut. */
export function revolverLoader(rounds = 6, shut: number | null = 0.28): Scene {
  const els: SceneElement[] = [];
  for (let i = 0; i < rounds; i++) els.push(rub('round slides into its chamber', i * 0.003, -15, { force: 2, duration: 0.05, speed: 0.6, profile: 'accelerate', roughness: 3, grain: 0.2, contactWidth: 0.05 }, brass(3.3, 9), cyl));
  for (let i = 0; i < rounds; i++) els.push(hit('rim seats on the cylinder', 0.05 + i * 0.0025, -9, 0.5, head, cyl, { radius: 1.2, click: 0.7, sharp: 0.8 }));
  els.push(rub('loader knob twisted', 0.09, -12, { force: 6, duration: 0.03, speed: 0.3, profile: 'steady', roughness: 8, grain: 0.5, contactWidth: 0.04 }, { ...mat('aluminum'), shape: 'bar', size: 3, thickness: 8, modes: 0, irregularity: 0.6, damping: 0.6, level: 0 }, springWire(2, 0.7)));
  els.push(snap('loader lets go of the rims', 0.12, -10, { strength: 0.5, seat: 0.2, seatDelay: 1 }, springWire(2, 0.7), head));
  if (shut != null) for (const e of revolverClose().tracks[0].elements) els.push({ ...e, at: e.at + shut - 0.062 });
  return scene('revolver-loader', 'Revolver: speed loader in, cylinder shut', REV_HOUSING, els);
}

// ------------------------------------------------------------------------------------------------ a break-action

const bbl = block(60, 24, 0.7), action = frame(16, 8), lever = steel(6, 7, 0.55), lumps = block(6, 18);
const BRK_HOUSING = { amount: 0.5, cavity: 0.1, ...action };

/** Lever over, the barrels dropped open on the hinge pin, the extractors pushing the hulls up (the anchor: its start). */
export function breakOpen(shells = 2): Scene {
  const els: SceneElement[] = [
    rub('top lever pushed over', 0, -12, { force: 12, duration: 0.05, speed: 0.3, profile: 'steady', roughness: 5, grain: 0.3, stickSlip: 0.1 }, lever, action),
    rub('lever spring loads', 0.004, -16, { force: 6, duration: 0.045, speed: 0.25, profile: 'accelerate', roughness: 4, grain: 0.3, contactWidth: 0.04 }, springWire(3, 1.2), lever, { coil: { level: 0.5, length: 3, dispersion: 0.5, decay: 0.1, brightness: 4000 } }),
    snap('locking bolt draws out of the lumps', 0.05, -7, { strength: 0.8, seat: 0.3, seatDelay: 1 }, block(4, 10), lumps),
    rub('barrels swing down on the hinge pin', 0.06, -13, { force: 20, duration: 0.14, speed: 0.4, profile: 'accelerate', roughness: 3, grain: 0.4, stickSlip: 0.05 }, lumps, steel(4, 10)),
    hit('barrels stop on the action', 0.2, -3, 1.0, bbl, action, { radius: 4, click: 0.6, sharp: 0.6 }),
  ];
  for (let i = 0; i < shells; i++) els.push(rub('hull pushed up out of the chamber', 0.2 + i * 0.006, -14, { force: 4, duration: 0.05, speed: 0.4, profile: 'accelerate', roughness: 3, grain: 0.6, contactWidth: 0.1 }, hull, bbl));
  els.push(hit('extractor stops', 0.25, -10, 0.6, steel(3, 4), bbl, { radius: 2, click: 0.6, sharp: 0.7 }));
  return scene('break-open', 'Break-action: lever over, barrels down, hulls out', BRK_HOUSING, els);
}
/** The barrels lifted shut and locked (the anchor: the bolt snapping into the lumps). */
export function breakClose(): Scene {
  return scene('break-close', 'Break-action: barrels shut', BRK_HOUSING, [
    rub('barrels lifted on the hinge pin', 0, -14, { force: 18, duration: 0.09, speed: 0.5, profile: 'accelerate', roughness: 3, grain: 0.4 }, lumps, steel(4, 10)),
    hit('breech face meets the barrels', 0.09, -2, 1.3, bbl, action, { radius: 5, click: 0.8, sharp: 0.75 }),
    snap('locking bolt snaps into the lumps', 0.092, -3, { strength: 1, seat: 0.5, seatDelay: 1 }, block(4, 10), lumps),
    hit('top lever springs back to centre', 0.1, -8, 0.7, lever, action, { radius: 2, click: 0.7, sharp: 0.8 }),
  ]);
}
/** Shells dropped into the chambers by hand (the anchor: their rims seating), then the gun closed. kind: hulls or brass. */
export function breakLoad(shells = 2, shut: number | null = 0.3, kind: 'shell' | 'cartridge' = 'shell'): Scene {
  const rd = kind === 'shell' ? hull : brass(4, 12), els: SceneElement[] = [];
  for (let i = 0; i < shells; i++) {
    const t = i * 0.09;
    els.push(rub('round slides into its chamber', t, -13, { force: 3, duration: 0.06, speed: 0.6, profile: 'accelerate', roughness: 3, grain: 0.6, contactWidth: 0.1 }, rd, bbl));
    els.push(hit('rim seats on the extractor', t + 0.06, -7, 0.6, head, bbl, { radius: 1.5, click: 0.7, sharp: 0.8 }));
  }
  const at = (shells - 1) * 0.09 + 0.06;
  if (shut != null) for (const e of breakClose().tracks[0].elements) els.push({ ...e, at: e.at + at + shut - 0.092 });
  return scene('break-load', 'Break-action: rounds in, barrels shut', BRK_HOUSING, els);
}

// ------------------------------------------------------------------------------------------------ a belt-fed

const cover = { ...frame(28, 2), shape: 'plate' as const, modes: 1 }, tray = frame(12, 2), lmgRcv = frame(40, 3), link = steel(1.2, 1, 0.4, 2);
const box: Body = { ...mat('steel'), shape: 'shell', size: 15, thickness: 1.2, modes: 1, irregularity: 0.7, damping: 0.5, level: 0 };
const LMG_HOUSING = { amount: 0.45, cavity: 0.2, ...lmgRcv };

/** A belt's links rattling against each other and on steel, n links over dur s, from t0. */
function linkRattle(t0: number, dur: number, n: number, db: number, on: Body, seed = 1): SceneElement[] {
  const els: SceneElement[] = [];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) els.push(hit('links clink', t0 + dur * (i / n + rnd() * 0.6 / n), db - rnd() * 6, 0.3 + rnd() * 0.4, link, i % 3 ? brass(5.7, 10) : on, { radius: 1, click: 0.8, sharp: 0.85 }, SHEET_RATTLE));
  return els;
}
/** The feed cover opened, the belt lifted off the tray, the box unhooked (the anchor: its start). empty: no belt left. */
export function beltOut(empty = false): Scene {
  const els: SceneElement[] = [
    rub('cover latch pressed', 0, -13, { force: 8, duration: 0.03, speed: 0.2, profile: 'steady', roughness: 5, grain: 0.3 }, steel(3, 4), lmgRcv),
    snap('cover latch lets go', 0.03, -6, { strength: 0.8, seat: 0.3, seatDelay: 1 }, steel(3, 4), cover, SHEET_BUZZ),
    rub('cover swings up on its hinge', 0.04, -14, { force: 5, duration: 0.12, speed: 0.6, profile: 'swell', roughness: 4, grain: 0.4 }, cover, steel(3, 6)),
    hit('cover stops at the top', 0.16, -5, 0.8, cover, lmgRcv, { radius: 2, click: 0.6, sharp: 0.6 }, SHEET_BUZZ),
    ...(empty ? [] : linkRattle(0.3, 0.18, 9, -12, tray, 3)),
    snap('box unhooked', 0.55, -9, { strength: 0.6, seat: 0.3, seatDelay: 1 }, steel(3, 3), box, SHEET_RATTLE),
    rub('box slid off its rail', 0.57, -14, { force: 4, duration: 0.08, speed: 0.5, profile: 'swell', roughness: 6, grain: 0.5 }, box, steel(8, 3), SHEET_RATTLE),
  ];
  return scene(empty ? 'belt-out-empty' : 'belt-out', 'Belt-fed: feed cover up, belt out, box off', LMG_HOUSING, els);
}
/** A box hooked on, its belt laid on the tray, the cover slammed (the anchor: the cover's latch). */
export function beltIn(): Scene {
  const els: SceneElement[] = [
    rub('box slid onto its rail', 0, -14, { force: 4, duration: 0.08, speed: 0.5, profile: 'decelerate', roughness: 6, grain: 0.5 }, box, steel(8, 3), SHEET_RATTLE),
    snap('box hooks on', 0.08, -6, { strength: 0.8, seat: 0.4, seatDelay: 1 }, steel(3, 3), box, SHEET_RATTLE),
    ...linkRattle(0.2, 0.2, 10, -11, tray, 7),
    hit('first round laid against the cartridge stop', 0.42, -8, 0.7, brass(5.7, 10), steel(3, 6), { radius: 1.5, click: 0.8, sharp: 0.8 }),
    rub('cover swung down', 0.5, -15, { force: 4, duration: 0.08, speed: 0.8, profile: 'accelerate', roughness: 4, grain: 0.4 }, cover, steel(3, 6)),
    hit('cover slammed shut', 0.58, -1, 1.5, cover, lmgRcv, { radius: 5, click: 0.8, sharp: 0.7 }, SHEET_BUZZ),
    snap('cover latch catches', 0.582, -5, { strength: 0.9, seat: 0.4, seatDelay: 1 }, steel(3, 4), lmgRcv),
    hit('feed pawls ride over the round', 0.585, -10, 0.6, steel(2, 3), brass(5.7, 10), { radius: 1, click: 0.7, sharp: 0.8 }),
  ];
  return scene('belt-in', 'Belt-fed: box on, belt laid, cover shut', LMG_HOUSING, els);
}

// ------------------------------------------------------------------------------------------------ an M1's clip

/** An en-bloc clip thumbed down into the magazine and the bolt let go (the anchor: the clip latch catching). */
export function enblocIn(): Scene {
  const clip: Body = { ...mat('springsteel'), shape: 'bar', size: 5, thickness: 1, modes: 2, irregularity: 0.5, damping: 0.4, level: 0 };
  const op = block(25, 14), rcv = frame(20, 5);
  return scene('enbloc-in', 'M1: clip in, bolt home', { amount: 0.5, cavity: 0.2, ...rcv }, [
    rub('clip pushed down into the well', 0, -13, { force: 14, duration: 0.09, speed: 0.4, profile: 'steady', roughness: 5, grain: 0.4, stickSlip: 0.1 }, clip, rcv),
    rub('follower spring compressed', 0.005, -15, { force: 8, duration: 0.085, speed: 0.4, profile: 'accelerate', roughness: 4, grain: 0.3, contactWidth: 0.04 }, springWire(12, 1.3), rcv, { coil: { level: 0.6, length: 9, dispersion: 0.5, decay: 0.12, brightness: 3500 } }),
    snap('clip latch catches the clip', 0.09, -4, { strength: 0.9, seat: 0.4, seatDelay: 1 }, steel(3, 4), clip),
    rub('operating rod runs home', 0.13, -12, { force: 6, duration: 0.05, speed: 2, profile: 'accelerate', ...oiled }, op, rcv),
    hit('bolt strips the top round', 0.15, -8, 0.8, block(10, 12), brass(7.8, 12), { radius: 1.5, click: 0.6, sharp: 0.7 }),
    hit('bolt slams home', 0.19, -1, 1.6, block(10, 12), rcv, { radius: 4, click: 0.8, sharp: 0.8 }),
    hit('op rod knocks its stop', 0.192, -6, 1.0, op, rcv, { radius: 3, click: 0.6, sharp: 0.6 }),
  ]);
}

export const NO_FAMILY_SCENES: Scene[] = [revolverOpen(), revolverClose(), revolverLoader(), breakOpen(), breakClose(), breakLoad(), beltOut(), beltOut(true), beltIn(), enblocIn()];
