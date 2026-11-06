/*
 * A gun's sounds from its measurements: a first attempt for every sound of a gun we only know the numbers for.
 *
 * Every sound tuned by hand so far (the AR-15, KV-47, MP5 and G19 in firearms.ts and more-guns.ts) comes down to a
 * few physical measurements turned into contacts by rules that didn't change from gun to gun:
 *
 *   timing      the hand's pull over the stroke; the run home from the reciprocating mass and the spring
 *               (x = F t^2 / 2m): when each part is reached, and how fast
 *   order       the cartridge's length sets where the bolt clears the rim on the way back and strips the round
 *               on the way home; the lock-up kind sets what happens in the last millimetres
 *   pitch, ring each part a body of its material and size (its mass from its measured mass and length); parts
 *               held home (a locked bolt, a spring on its rod) don't ring as free bars
 *   texture     how it's lubricated (greased, oiled, dry) is the rubs' surface texture
 *   muffling    how closed the receiver is: a shell's walls cut the highs, its openings let some straight out
 *   the box     the receiver's inside dimensions are an air space that rings
 *
 * A GunSpec holds those measurements; gunScenes() builds the charge (loaded, empty magazine, no magazine), the
 * hold-open release if it has one, the magazine in and out, and registers its magazine for the drop scenes. The
 * result is a first attempt: listen, then tune the few numbers that matter (see SOUND_DESIGN.md, From measurements).
 */

import type { Scene, SceneElement } from '../scene.js';
import { mat } from '../presets.js';
import type { FrictionParams } from '../params.js';
import { hit, rub, snap, steelBar, steelBlock, springWire, arCase, arFollower, SHEET_RATTLE, MAG_TYPES, magDrops, type Body, type MagType } from './firearms.js';

// ------------------------------------------------------------------------------------------------ the measurements

export type Material = 'steel' | 'aluminum' | 'polymer';

export interface GunSpec {
  id: string;
  name: string;
  /** The action: what reciprocates and what drives it home. */
  action: {
    /** Everything that moves together when it runs home (bolt carrier + bolt, or slide + barrel; + buffer), kg. */
    mass: number;
    /** Its travel from home to the rear stop, m. */
    stroke: number;
    /** The return spring's push at home and fully back, N. */
    springHome: number;
    springRear: number;
    /** The carrier (or slide) length and the bolt (or barrel) length, cm. */
    carrierCm: number;
    boltCm: number;
    /** How it locks: a turning bolt, roller-delayed, a tilting barrel (Browning), or not at all (straight blowback:
     *  the bolt's mass and spring hold it). */
    lockup: 'rotating' | 'rollers' | 'tilting' | 'blowback';
    /** Lubrication of the sliding parts. */
    lube: 'greased' | 'oiled' | 'dry';
    /** Locks open on an empty magazine (and is let go by a catch or slide stop). */
    holdOpen: boolean;
    /** What fires it: an exposed hammer the carrier rides down, or a striker. Hammer spring wire, mm. */
    trigger: 'hammer' | 'striker';
    hammerSpringMm?: number;
  };
  /** What the hand works. */
  handle: {
    /** On the carrier and moving with it, separate and only pulled back (AR, MP5), or the slide itself (pistol). */
    kind: 'on-carrier' | 'separate' | 'slide';
    material: Material;
    lengthCm: number;
    /** Separate handles: sprung home in its own tube (MP5), or latched into the receiver (AR). */
    returns?: 'own-spring' | 'latch';
  };
  receiver: {
    /** How it's made: machined aluminium, stamped sheet steel, or a polymer frame. */
    build: 'billet' | 'stamped' | 'polymer';
    wallMm: number;
    /** Inside length, width, height, cm (its air space). */
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    /** How the action is heard: 'open' (a big port and open well: most of it straight out), 'closed' (a tube, a
     *  small port), 'slide' (a slide over the barrel). Billet uppers with a dust cover read as 'open'. */
    ports: 'open' | 'closed' | 'slide';
    /** A loose stamped top cover that buzzes (AK). */
    looseCover?: boolean;
    /**
     * The return spring in a tube in the stock (an AR's receiver extension): its length and bore, cm, and the buffer
     * weight riding in it, kg. The spring sings in the tube's air column, and the buffer's weights shift and slam.
     */
    bufferTube?: { lengthCm: number; boreCm: number; bufferKg: number };
  };
  /** The whole gun, which takes the lock-up's blow: the barrel rings, the gun flexes as one body, a separate lower
   *  (frame) rings through its pins. These carry the low end of every slam home. */
  gun: {
    /** Barrel length and outside diameter (at the chamber end), cm and mm. */
    barrelCm: number;
    barrelMm: number;
    /** Overall length, cm, and what most of it is (the material that flexes). */
    lengthCm: number;
    frame: Material;
    /** A separate lower receiver pinned to the upper (an AR): it rings on its own. */
    splitFrame?: boolean;
  };
  cartridge: {
    /** Overall length and case length, mm; one round's mass, g. */
    oalMm: number;
    caseMm: number;
    massG: number;
  };
  magazine: {
    capacity: number;
    /** Length (along the feed), width (front to back), thickness, cm. */
    lengthCm: number;
    widthCm: number;
    thicknessCm: number;
    material: Material;
    wallMm: number;
    /** Stamped reinforcing ribs (their pitch, cm). */
    ribPitchCm?: number;
    massEmptyKg: number;
    /** Spring on an empty follower, N, and its rate, N/m. */
    springN: number;
    springRate: number;
    /** How it goes in: pushed straight up the well, or hooked at the front and rocked back (AK). */
    insert: 'straight' | 'rock-in';
    /** Its catch: a button, or a paddle behind the well. */
    catch: 'button' | 'paddle';
    /** Falls free when let go (a pistol's, a straight well), or has to be pulled. */
    freeDrop: boolean;
    /** Its well: part of a machined aluminium lower, stamped steel, or a polymer grip. */
    well: 'billet' | 'stamped' | 'polymer';
    /** How it fits the well: snug, or loose with play (worn sheet metal that knocks the walls on the way). */
    fit?: 'snug' | 'loose';
  };
}

// ------------------------------------------------------------------------------------------------ rules

const POLYMER = { ...mat('nylon'), material: 'custom', stiffness: 1.6, loss: 0.09 };
const MAG_POLY = { ...mat('nylon'), material: 'custom', stiffness: 2.4, loss: 0.05 };
const matOf = (m: Material) => (m === 'polymer' ? POLYMER : mat(m));
const TEXTURE: Record<GunSpec['action']['lube'], Partial<FrictionParams>> = {
  greased: { roughness: 1, grain: 0.8, periodicity: 0, contactWidth: 0.25 },
  oiled: { roughness: 1.5, grain: 0.15, periodicity: 0, contactWidth: 0.15 },
  dry: { roughness: 6, grain: 0.3, periodicity: 0, contactWidth: 0.05 },
};
const GRIT = { roughness: 9, grain: 0.35, periodicity: 0.25, stickSlip: 0.3, stickPitch: 900, contactWidth: 0.04 };

/** A steel part of a measured mass and length as a bar: its square section from mass = ρ L t². */
function massBar(kg: number, cm: number, modes = 1, damping = 0.6): Body {
  const t = Math.sqrt(kg / (7850 * (cm / 100))) * 1000;
  return { ...mat('steel'), shape: 'bar', size: cm, thickness: Math.max(3, t), modes, irregularity: 0.6, damping, level: 0 };
}

/** Hand pull from rest over `d` m in `T` s (a smooth yank): the time it's gone `x`. */
function pullAt(x: number, d: number, T: number): number {
  const u = Math.min(1, Math.max(0, x / d));
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const s = (lo + hi) / 2; if (3 * s * s - 2 * s * s * s < u) lo = s; else hi = s; }
  return ((lo + hi) / 2) * T;
}

/** Everything that follows from the measurements. */
export function derive(g: GunSpec) {
  const a = g.action, r = g.receiver, F = (a.springHome + a.springRear) / 2;
  const run = (x: number) => { const t = Math.sqrt((2 * Math.max(0, x) * a.mass) / F); return { t, v: (F / a.mass) * t }; };
  const vHome = run(a.stroke).v;
  // the receiver: a shell of its build, its air space from its inside dimensions
  const shell: Body = r.build === 'billet' ? { ...mat('aluminum'), shape: 'shell', size: r.lengthCm, thickness: r.wallMm, modes: 0, irregularity: 0.7, damping: 0.7, level: 0 }
    : r.build === 'stamped' ? { ...mat('steel'), shape: 'plate', size: r.lengthCm, thickness: r.wallMm, modes: 3, irregularity: 0.8, damping: 0.4, level: 0 }
    : { ...POLYMER, shape: 'shell', size: r.lengthCm, thickness: r.wallMm, modes: 0, irregularity: 0.7, damping: 0.82, level: 0 };
  const housing: Scene['housing'] = {
    amount: r.build === 'polymer' ? 0.45 : 0.7, cavity: r.build === 'polymer' ? 0.2 : 0.6, ...shell,
    cavities: [{ length: r.lengthCm * 0.9, width: r.widthCm, depth: r.heightCm, q: r.build === 'polymer' ? 4 : r.build === 'stamped' ? 10 : 9, level: 1 }],
  };
  // heard through it: thicker, more closed walls cut lower and leak less (from the AK, MP5 and G19 tuning)
  const enclosure = r.ports === 'open' && r.build === 'billet' ? undefined
    : { cutoff: r.ports === 'open' ? 2200 : r.ports === 'closed' ? 1800 : 2000, leak: r.ports === 'open' ? 0.18 : r.ports === 'closed' ? 0.12 : 0.1 };
  // the moving parts, from their mass and length; as they land they're held home (no free ring)
  const carrier = massBar(a.mass * 0.8, a.carrierCm, 1, 0.7);
  const carrierSliding: Body = { ...carrier, modes: 0, damping: 0.8 };
  const bolt = massBar(a.mass * 0.2, a.boltCm, 1, 0.7);
  const trunnion = steelBlock(5, 25);
  const spring = { ...springWire(Math.max(6, a.stroke * 250), a.lockup === 'tilting' ? 1 : 1.4), modes: 0, damping: 0.75 };
  const springSings = springWire(Math.max(6, a.stroke * 250), 1.3);
  const coil = { level: 0.5, length: Math.max(4, a.stroke * 150), dispersion: 0.6, decay: 0.15, brightness: 4000 };
  const round: Body = { ...arCase, size: g.cartridge.oalMm / 10, thickness: Math.min(12, 4 + g.cartridge.caseMm / 8) };
  const texture = TEXTURE[a.lube];
  // where the round is on the way back and home: the bolt rides it until its face clears the rim, a cartridge length
  // back; going home it strips it there
  const clear = Math.min(a.stroke * 0.95, g.cartridge.oalMm / 1000 + 0.004);
  const bt = r.bufferTube;
  const tube = bt ? { housing: { amount: 0.8, cavity: 0.8, cavityWidth: bt.boreCm, ...mat('aluminum'), shape: 'shell' as const, size: bt.lengthCm, thickness: 2.5, modes: 0, irregularity: 0.6, damping: 0.45 } } : null;
  return { tube, F, run, vHome, shell, housing, enclosure, carrier, carrierSliding, bolt, trunnion, spring, springSings, coil, round, texture, clear };
}

/** The gun's magazine as a MagType, for the drop scenes. */
export function magTypeOf(g: GunSpec): MagType {
  const m = g.magazine, wall = m.material === 'polymer' ? MAG_POLY : mat(m.material);
  const perRound = Math.max(0.003, (m.lengthCm / 100 - 0.03) / m.capacity) * (m.insert === 'rock-in' ? 1 : 1);
  const floorplate: Body = m.material === 'polymer' ? { ...MAG_POLY, shape: 'plate', size: m.thicknessCm + 1, thickness: 3, modes: 0, irregularity: 0.5, damping: 0.65, level: 0 }
    : { ...mat('steel'), shape: 'plate', size: m.widthCm + 1, thickness: 1, modes: 1, irregularity: 0.5, damping: 0.5, level: 0 };
  const lips: Body = { ...(m.material === 'aluminum' ? mat('aluminum') : mat('steel')), shape: 'plate', size: m.widthCm * 0.6, thickness: m.material === 'polymer' ? 0.5 : m.wallMm, modes: 0, irregularity: 0.7, damping: 0.5, level: 0 };
  return {
    id: g.id, name: `${g.name} (${m.capacity}-round)`, capacity: m.capacity, dims: [m.lengthCm / 100, m.widthCm / 100, m.thicknessCm / 100],
    shellMass: m.massEmptyKg * 0.92, followerMass: m.massEmptyKg * 0.08, roundMass: g.cartridge.massG / 1000, stackPerRound: perRound,
    springPreload: m.springN, springRate: m.springRate, wall, wallMm: m.wallMm, wallModes: m.material === 'polymer' ? 0 : m.material === 'aluminum' ? 5 : 4,
    wallDamping: m.material === 'polymer' ? 0.55 : m.material === 'aluminum' ? 0.25 : 0.3, bounce: m.material === 'polymer' ? 0.75 : 1, edgeHardness: m.material === 'polymer' ? 0.25 : 1,
    folded: m.material === 'steel', ribbed: m.ribPitchCm ? { pitch: m.ribPitchCm, stiffen: m.material === 'steel' ? 1 + 3.75 / m.ribPitchCm : 1.5 } : undefined,
    floorplate, lips, round: { ...arCase, size: g.cartridge.oalMm / 10, thickness: Math.min(12, 4 + g.cartridge.caseMm / 8) },
    follower: m.material === 'polymer' ? { ...arFollower, ...MAG_POLY, modes: 0 } : arFollower, spring: springWire(Math.max(5, m.lengthCm / 2), 1),
  };
}

// ------------------------------------------------------------------------------------------------ the scenes

type Fill = 'loaded' | 'empty' | 'none';
const OUTSIDE = /top cover|receiver rings|handle (claps|stops|hits|returns|latch)|thumb/;
const mark = (els: SceneElement[]) => { for (const e of els) if (OUTSIDE.test(e.what)) e.outside = true; return els; };

/** The run home from the rear (from `t0`): stripping and chambering a round from a loaded magazine, and the lock-up. */
function runHome(g: GunSpec, d: ReturnType<typeof derive>, t0: number, fill: Fill): { els: SceneElement[]; TL: number } {
  const a = g.action, fwd = (x: number) => t0 + d.run(x).t, TL = fwd(a.stroke), v = d.vHome;
  const mag = magTypeOf(g), magBody: Body = { ...mag.wall, shape: 'plate', size: g.magazine.lengthCm, thickness: g.magazine.wallMm, modes: 1, irregularity: 0.8, damping: 0.65, level: 0 };
  const els: SceneElement[] = [
    rub(a.lockup === 'tilting' ? 'slide runs home on its rails' : 'carrier runs home', t0, -9, { force: 6, duration: TL - t0, speed: v, profile: 'accelerate', ...d.texture }, d.carrierSliding, d.shell),
    rub('return spring extends', t0 + 0.0005, -10, { force: 5, duration: TL - t0, speed: v, profile: 'accelerate', roughness: 4, grain: 0.3, contactWidth: 0.05 }, d.spring, d.shell, { coil: { ...d.coil, level: 0.6 }, ...(d.tube || {}) }),
  ];
  if (a.trigger === 'hammer') els.push(rub('carrier runs over the cocked hammer', fwd(a.stroke * 0.3), -13, { force: 7, duration: Math.max(0.004, fwd(a.stroke * 0.8) - fwd(a.stroke * 0.3)), speed: v * 0.8, profile: 'steady', ...(a.lube === 'dry' ? GRIT : d.texture) }, d.carrierSliding, steelBar(5, 8)));
  if (fill === 'loaded') {
    const strip = fwd(Math.max(0.003, a.stroke - d.clear)), rest = Math.max(0.004, TL - strip);
    // (heard straight out of an open receiver, the chambering sits further under the slam than through a shell's walls)
    const cg = !d.enclosure ? -5 : 0;
    const before = els.length;
    els.push(
      hit('bolt face strips the top round', strip, -5, v * 0.6, d.bolt, d.round, { radius: 1.5, click: 0.6, sharp: 0.7 }),
      rub('round dragged out of the feed lips', strip + 0.0004, -11, { force: 5, duration: Math.min(0.006, rest * 0.4), speed: v * 0.7, profile: 'steady', roughness: 6, grain: 0.3, contactWidth: 0.05 }, d.round, magBody),
      hit('next round snaps up into the lips', strip + rest * 0.45, -12, 1.0, d.round, magBody, { radius: 1.5, click: 0.6, sharp: 0.7 }),
      hit('bullet glances off the feed ramp', strip + rest * 0.35, -12, 1.4, d.round, d.trunnion, { radius: 1.5, click: 0.6, sharp: 0.8 }),
      rub('round slides into the chamber', strip + rest * 0.4, -11, { force: 4, duration: Math.max(0.003, rest * 0.5), speed: v * 0.8, profile: 'steady', roughness: 4, grain: 0.2, contactWidth: 0.05 }, d.round, steelBar(10, 12)),
      hit('case seats in the chamber', TL - 0.002, -8, v * 0.5, d.round, steelBar(10, 12), { radius: 2.5, click: 0.7, sharp: 0.7 }),
      snap('extractor snaps over the rim', TL - 0.001, -9, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 1 }, steelBar(2, 3), d.round),
    );
    for (let i = before; i < els.length; i++) els[i].gainDb += cg;
  }
  // the lock-up
  if (a.lockup === 'rotating') {
    els.push(
      hit('bolt face meets the barrel', TL, -3, v, d.bolt, d.trunnion, { radius: 4, click: 0.85, sharp: 0.85 }),
      rub('bolt turns into its lugs', TL + 0.0003, -8, { force: 15, duration: 0.004, speed: 1.2, profile: 'steady', roughness: 8, grain: 0.1, periodicity: 0.2, contactWidth: 0.02 }, d.bolt, d.trunnion),
      hit('carrier slams home', TL + 0.0045, 0, v * 0.85, d.carrier, d.trunnion, { radius: 6, click: 0.9, sharp: 0.85 }),
    );
  } else if (a.lockup === 'rollers') {
    els.push(
      hit('bolt head meets the barrel', TL, -3, v, d.bolt, d.trunnion, { radius: 4, click: 0.85, sharp: 0.72 }),
      snap('rollers snap out into the trunnion', TL + 0.0015, 3, { strength: 0.9, preload: 0, seat: 0.6, seatDelay: 0.8 }, steelBar(1.3, 6, 0.5), d.trunnion),
      hit('carrier slams home', TL + 0.003, -2, v * 0.7, d.carrier, d.trunnion, { radius: 5, click: 0.85, sharp: 0.8 }),
    );
  } else if (a.lockup === 'blowback') {
    // nothing locks: the heavy bolt slams into the breech face and is held there by its spring
    els.push(
      hit('bolt slams into the breech', TL, 0, v, d.bolt, d.trunnion, { radius: 5, click: 0.85, sharp: 0.8 }),
      hit('bolt rebounds and settles', TL + 0.004, -16, v * 0.2, d.bolt, d.trunnion, { radius: 3, click: 0.6 }),
    );
  } else {
    els.push(
      rub('barrel cams up onto the locking block', TL - 0.003, -9, { force: 12, duration: 0.003, speed: 1.2, profile: 'steady', roughness: 6, grain: 0.1, contactWidth: 0.02 }, d.bolt, steelBlock(2, 8)),
      hit('barrel hood locks into the slide', TL, -2, v * 0.8, d.bolt, d.carrier, { radius: 3, click: 0.85, sharp: 0.72 }),
      hit('slide slams home', TL + 0.0005, 0, v, d.carrier, steelBar(1.5, 3, 0.6), { radius: 4, click: 0.85, sharp: 0.72 }),
    );
  }
  // the whole gun takes the blow: the barrel rings, the gun flexes as one body, a separate lower rings on its pins
  const gn = g.gun, slam = TL + (a.lockup === 'rotating' ? 0.0046 : a.lockup === 'rollers' ? 0.0031 : a.lockup === 'blowback' ? 0.0002 : 0.0006);
  // (a tilting barrel is the part that locks: its blow is already the hood locking into the slide; a polymer frame
  // in the hand soaks most of it up)
  if (a.lockup !== 'tilting') els.push(
    hit('barrel takes the blow', slam, -2, v * 0.85, { ...mat('steel'), shape: 'bar', size: gn.barrelCm, thickness: gn.barrelMm, modes: 3, irregularity: 0.5, damping: 0.7, level: 0 }, d.carrier, { scatter: 0.3, radius: 4, click: 0.8, sharp: 0.8 }, { housing: { amount: 0.5, cavity: 0.25 } }),
  );
  els.push(
    hit('gun body takes the blow', slam + 0.0001, gn.frame === 'polymer' ? -14 : -3, v * 0.85, { ...matOf(gn.frame), shape: 'bar', size: gn.lengthCm * 0.6, thickness: 10, modes: 3, irregularity: 0.5, damping: 0.8, level: 0 }, d.carrier, { scatter: 0.2, radius: 3, click: 0.3, sharp: gn.frame === 'polymer' ? 0.3 : 0.85 }),
  );
  if (gn.splitFrame) els.push(hit('lower receiver rings', slam + 0.0003, -6, v * 0.5, { ...matOf(gn.frame), shape: 'plate', size: 20, thickness: 4, modes: 4, irregularity: 0.8, damping: 0.45, level: 0 }, d.shell, { scatter: 0.4, radius: 3, click: 0.3, sharp: 0.8 }));
  if (d.tube) {
    // the buffer's weights, a beat behind the carrier, slam forward in it; the spring jolts, still loaded
    els.push(
      hit('buffer weights slam forward', TL + 0.006, -7, v * 0.4, steelBlock(1.5, 12), steelBlock(3, 20), { scatter: 0.6, radius: 3, click: 0.6 }, d.tube),
      hit('buffer spring jolts, still loaded', TL + 0.0003, -13, 1.2, springWire(25, 1.4), steelBlock(3, 20), { radius: 1, click: 0.05, sharp: 0.4 }, { coil: { level: 0.6, length: 11, dispersion: 0.45, decay: 0.12, brightness: 3000 }, ...d.tube }),
    );
  }
  if (a.lube !== 'dry') els.push({ what: 'oil squeezed out as it locks up', at: TL, gainDb: -11, sound: { kind: 'air', freq: 1500, q: 0.8, attackMs: 0.15, decayMs: 3 } });
  els.push(hit('receiver rings', TL + 0.004, g.receiver.build === 'polymer' ? -10 : -7, 1.2, d.shell, d.trunnion, { radius: 6, click: 0.2, sharp: g.receiver.build === 'polymer' ? 0.2 : 0.7 }));
  if (g.receiver.looseCover) els.push(hit('top cover clatters', TL + 0.005, -7, 1.5, { ...mat('steel'), shape: 'plate', size: g.receiver.lengthCm * 0.9, thickness: 0.8, modes: 2, irregularity: 0.9, damping: 0.35, level: 0 }, d.shell, { scatter: 0.5, radius: 3, click: 0.7, sharp: 0.8 }, SHEET_RATTLE));
  if (fill !== 'none') els.push(hit('magazine body rings', TL + 0.006, fill === 'empty' ? -11 : -15, 0.8, magBody, d.shell, { radius: 3, click: 0.2, sharp: 0.6 }));
  return { els, TL };
}

/** The action pulled to the rear and let go (`pull`, `hold`: the hand's timing, s). */
export function chargeFromSpec(g: GunSpec, fill: Fill, timing: { pull?: number; hold?: number } = {}): Scene {
  const d = derive(g), a = g.action, h = g.handle;
  const T = timing.pull ?? 0.13 + 0.4 * a.stroke, back = (x: number) => pullAt(x, a.stroke, T), LET_GO = T + (timing.hold ?? 0.05);
  const handle: Body = { ...matOf(h.material), shape: 'bar', size: h.lengthCm, thickness: 5, modes: 2, irregularity: 0.6, damping: 0.4, level: 0 };
  const els: SceneElement[] = [
    // pulling: the action unlocks, runs back on its rails, the spring loads, the trigger is cocked
    a.lockup === 'rotating' ? snap('bolt lugs turn free', back(0.004), -9, { strength: 0.6, preload: 0, seat: 0.2, seatDelay: 1 }, d.bolt, d.trunnion)
      : a.lockup === 'rollers' ? snap('rollers cam in out of the trunnion', back(0.004), -8, { strength: 0.6, preload: 0, seat: 0.5, seatDelay: 1.2 }, steelBar(1.3, 6, 0.5), d.trunnion)
      : a.lockup === 'blowback' ? rub('bolt breaks away from the breech', back(0.002), -14, { force: 4, duration: 0.004, speed: 0.6, profile: 'steady', ...d.texture }, d.bolt, d.trunnion)
      : hit('barrel drops off the locking block', back(0.003), -9, 0.6, d.bolt, steelBlock(2, 8), { radius: 2, click: 0.7, sharp: 0.8 }),
    rub(a.lockup === 'tilting' ? 'slide drawn back on its rails' : 'carrier runs back', back(0.004), -10, { force: 6, duration: T - back(0.004), speed: 1, profile: 'swell', ...d.texture }, d.carrierSliding, d.shell),
    rub('return spring compresses', back(0.008), -10, { force: 6, duration: T - back(0.008), speed: 1, profile: 'swell', roughness: 5, grain: 0.3, contactWidth: 0.05 }, d.spring, d.shell, { coil: d.coil, ...(d.tube || {}) }),
    ...(d.tube ? [hit('buffer weights lag, then catch up', back(0.004), -16, 0.6, steelBlock(1.5, 12), steelBlock(3, 20), { scatter: 0.9, radius: 2 }, d.tube)] : []),
    ...[0.3, 0.5, 0.65, 0.78, 0.88, 0.95].map((k, i) => hit('spring coils tick on the guide', back(a.stroke * k), -18 + i * 0.6, 0.5, d.springSings, steelBar(15, 3), { radius: 1, click: 0.4, sharp: 0.6 })),
  ];
  if (a.trigger === 'hammer') {
    const hs = springWire(4, a.hammerSpringMm ?? 1.3), hcoil = { level: 0.6, length: 3.5, dispersion: 0.55, decay: 0.12, brightness: 5000 };
    els.push(
      hit('carrier meets the hammer', back(a.stroke * 0.25), -12, 0.9, d.carrier, steelBar(5, 8), { radius: 2, click: 0.6, sharp: 0.8 }),
      rub('carrier rides the hammer down', back(a.stroke * 0.26), -11, { force: 10, duration: Math.max(0.004, back(a.stroke * 0.7) - back(a.stroke * 0.26)), speed: 0.9, profile: 'steady', ...(a.lube === 'dry' ? GRIT : { ...d.texture, roughness: 3 }) }, d.carrierSliding, steelBar(5, 8)),
      rub('hammer spring winds up', back(a.stroke * 0.27), -12, { force: 7, duration: Math.max(0.004, back(a.stroke * 0.7) - back(a.stroke * 0.27)), speed: 0.6, profile: 'accelerate', roughness: 4, grain: 0.3, contactWidth: 0.04 }, hs, steelBar(5, 8), { coil: hcoil }),
      snap('hammer cocks', back(a.stroke * 0.72), -4, { strength: 0.8, preload: 0, seat: 0.3, seatDelay: 2 }, steelBar(5, 8), steelBar(3, 5), { coil: hcoil }),
    );
  } else els.push(snap('striker catches', back(0.006), -11, { strength: 0.5, preload: 0, seat: 0.2, seatDelay: 1 }, steelBar(3, 4), steelBar(2, 2)));
  // over the top round on the way back, until its face clears the rim; the round pops up behind it
  if (fill === 'loaded') els.push(
    rub('bolt rides over the top round', back(0.003), -14, { force: 4, duration: Math.max(0.004, back(d.clear) - back(0.003)), speed: 0.8, profile: 'swell', roughness: 3, grain: 0.2, contactWidth: 0.05 }, d.carrierSliding, d.round),
    hit('top round pops up into the feed lips', back(d.clear + 0.001), -11, 0.9, d.round, { ...magTypeOf(g).lips }, { radius: 1.5, click: 0.6, sharp: 0.7 }),
  );
  else if (fill === 'empty') els.push(rub('bolt rides over the empty follower', back(0.003), -16, { force: 3, duration: Math.max(0.004, back(d.clear) - back(0.003)), speed: 0.8, profile: 'swell', roughness: 3, grain: 0.3, contactWidth: 0.08 }, d.carrierSliding, arFollower));
  // the rear stop, and the handle's own sounds
  els.push(hit(a.lockup === 'tilting' ? 'slide stops at the rear' : 'carrier hits the rear stop', T, -3, 1.4, d.carrier, a.lockup === 'tilting' ? d.shell : steelBlock(5, 25), { radius: 4, click: 0.7, sharp: a.lockup === 'tilting' ? 0.3 : 0.8 }));
  if (h.kind === 'separate') els.push(hit('handle stops at the end of its travel', T + 0.001, -5, 1.3, handle, d.shell, { radius: 2, click: 0.8, sharp: 0.85 }));
  const home = runHome(g, d, LET_GO, fill);
  els.push(...home.els);
  // let go: a separate handle goes home on its own spring, or rides home and latches; one on the carrier went with it
  if (h.kind === 'separate' && h.returns === 'own-spring') {
    els.push(hit('handle returns home in its tube and hits the front of its slot', LET_GO + 0.032, -7, 1.6, handle, d.shell, { radius: 2, click: 0.8, sharp: 0.85 }, { coil: { level: 0.3, length: 9, dispersion: 0.55, decay: 0.1, brightness: 3000 } }));
  } else if (h.kind === 'separate') {
    const seat = home.TL + 0.005;
    els.push(
      hit('handle claps into its front stop', seat, 8, 1.6, handle, d.shell, { radius: 1.5, click: 0.85, sharp: 0.95 }),
      snap('handle latch clacks into the receiver', seat + 0.0045, 6, { strength: 0.75, preload: 0, seat: 0.2, seatDelay: 1.2 }, { ...matOf(h.material), shape: 'bar', size: 2.5, thickness: 3, modes: 1, irregularity: 0.5, damping: 0.45, level: 0 }, d.shell),
    );
  }
  mark(els);
  const pull = (e: SceneElement) => e.at < LET_GO - 0.001;
  return {
    id: `${g.id}-charge` + (fill === 'loaded' ? '' : fill === 'empty' ? '-empty-mag' : '-no-mag') + (timing.pull ? '-timed' : ''),
    title: `${g.name}: action pulled back and let go${fill === 'loaded' ? ', chambering a round' : fill === 'empty' ? ' (empty magazine)' : ' (no magazine)'} (from measurements)`,
    room: 0.04, roomSize: 0.35, housing: d.housing, enclosure: d.enclosure,
    tracks: [
      { name: 'pull-back', description: 'Pulled back: the action unlocks, runs back over the top round, the trigger cocks, it stops at the rear.', elements: els.filter(pull) },
      { name: 'release-forward', description: 'Let go: the spring drives it home, stripping and chambering a round, and it locks up.', elements: els.filter((e) => !pull(e)) },
    ],
  };
}

/** Locked open on an empty magazine: the catch or slide stop hit, and the run home chambering a round. */
export function releaseFromSpec(g: GunSpec): Scene {
  const d = derive(g);
  const els = [
    snap(g.action.lockup === 'tilting' ? 'thumb presses the slide stop down' : 'thumb hits the bolt catch', 0, g.action.lockup === 'tilting' ? -8 : -15, { strength: 0.6, preload: 40, creak: 0.05, seat: 0.2, seatDelay: 1 }, steelBar(3, 2, 0.5), d.carrier),
    ...runHome(g, d, 0.041, 'loaded').els,
  ];
  mark(els);
  return {
    id: `${g.id}-release`, title: `${g.name}: let go from locked open, chambering a round (from measurements)`,
    room: 0.04, roomSize: 0.35, housing: d.housing, enclosure: d.enclosure,
    tracks: [{ name: 'release', description: 'The catch hit; the action runs home, chambering a round.', elements: els }],
  };
}

/** The magazine going in (pushed straight up or rocked in) or coming out (dropping free or pulled). */
export function magFromSpec(g: GunSpec, dir: 'in' | 'out', fill: 'loaded' | 'empty'): Scene {
  const d = derive(g), m = g.magazine, v = fill === 'loaded' ? 1 : 0.8;
  const M = magTypeOf(g);
  const body: Body = { ...M.wall, shape: 'plate', size: m.lengthCm, thickness: m.wallMm, modes: fill === 'empty' && m.material !== 'polymer' ? 4 : m.material === 'polymer' ? 0 : 2, irregularity: 0.8, damping: fill === 'empty' ? 0.35 : 0.65, level: 0 };
  const well: Body = m.well === 'billet' ? { ...mat('aluminum'), shape: 'block', size: 9, thickness: 60, modes: 1, irregularity: 0.4, damping: 0.65, level: 0 }
    : m.well === 'stamped' ? { ...mat('steel'), shape: 'plate', size: 12, thickness: 1.2, modes: 2, irregularity: 0.7, damping: 0.45, level: 0 }
    : { ...POLYMER, shape: 'shell', size: 12, thickness: 3, modes: 0, irregularity: 0.7, damping: 0.82, level: 0 };
  const catchBody: Body = m.catch === 'paddle' ? steelBar(5, 3) : m.well === 'polymer' ? { ...POLYMER, shape: 'block', size: 1.5, thickness: 5, modes: 0, irregularity: 0.5, damping: 0.5, level: 0 } : steelBar(2.5, 3);
  const slide = { roughness: 3, grain: 3, periodicity: 0, contactWidth: 0.2 };
  const L = m.lengthCm / 100, travel = Math.min(0.1, L * 0.45);
  let els: SceneElement[];
  if (dir === 'in' && m.insert === 'rock-in') {
    els = [
      hit('front lug hooks into the receiver', 0, -4, 1.0 * v, steelBlock(1.5, 4), d.trunnion, { radius: 1.5, click: 0.8, sharp: 0.9 }),
      rub('magazine rocks back on its front lug', 0.01, -12, { force: 5, duration: 0.09, speed: 0.4, profile: 'accelerate', roughness: 8, grain: 0.4, contactWidth: 0.05 }, steelBlock(1.5, 4), d.trunnion),
      snap('catch snaps over the rear lug', 0.1, -1, { strength: 0.85, preload: 0, seat: 0.4, seatDelay: 2 }, catchBody, steelBlock(1.5, 4), { coil: { level: 0.15, length: 2, dispersion: 0.3, decay: 0.03, brightness: 6000 } }),
      hit('magazine seats against the receiver', 0.102, -9, 0.6 * v, body, d.shell, { radius: 4, click: 0.6, sharp: 0.7 }),
    ];
  } else if (dir === 'in') {
    const t = travel / 1.0; // pushed up at ~1 m/s
    const loose = m.fit === 'loose';
    els = [
      // the air in the well above it shrinks as it goes up (its resonance rising), and with play it knocks the walls
      // on the way, closer together and harder as the hand speeds it up
      ...(loose ? [
        { what: 'air column in the well shrinks', at: 0.002, gainDb: -13, sound: { kind: 'tube' as const, fromCm: travel * 100, toCm: 1.2, durationMs: t * 1000, motion: 'accelerate' as const, q: 2.5 } },
        ...[0.06, 0.16, 0.27, 0.38, 0.5, 0.62, 0.72].map((x, i) => hit('magazine knocks the well', t * Math.sqrt(x), -17 + i * 1.2, (0.15 + i * 0.035) * v, { ...body, size: m.widthCm, modes: 0 }, well, { scatter: 0.8, radius: 2.5, click: 0.6, sharp: 0.35 }, { housing: { amount: 0.2, cavity: 0.15 } })),
      ] : []),
      rub('magazine pushed up the well', 0, -11, { force: 2.5, duration: t, speed: 0.9, profile: 'accelerate', ...slide }, body, well),
      rub('catch rides the magazine', t * 0.6, -14, { force: 5, duration: t * 0.4, speed: 0.8, profile: 'accelerate', roughness: 2, grain: 2, contactWidth: 0.1 }, catchBody, body),
      snap('catch clicks into the magazine', t, 0, { strength: 0.75, preload: 0, seat: 0, seatDelay: 1 }, catchBody, body, { coil: { level: 0.12, length: 1.4, dispersion: 0.3, decay: 0.025, brightness: 7000 } }),
      hit('magazine stops in the well', t + 0.008, -6, 1.2 * v, body, well, { radius: 3, click: 0.6, sharp: m.material === 'polymer' ? 0.3 : 0.8 }),
    ];
  } else {
    const fall = m.freeDrop ? Math.sqrt((2 * travel) / 9.81) : 0.055;
    els = [
      snap(m.catch === 'paddle' ? 'paddle pressed' : 'magazine button pressed', 0, -12, { strength: 0.4, preload: 40, creak: 0.05, seat: 0.1, seatDelay: 1 }, catchBody, d.shell),
      snap('catch lets go of the magazine', 0.042, -9, { strength: 0.5, preload: 0, seat: 0, seatDelay: 1 }, catchBody, body),
      ...(m.insert === 'rock-in' ? [hit('front lug unhooks', 0.12, -6, 0.8 * v, steelBlock(1.5, 4), d.trunnion, { radius: 1.5, click: 0.8, sharp: 0.9 })] : []),
      rub(m.freeDrop ? 'magazine falls out of the well' : 'magazine pulled out of the well', 0.045, -12, { force: 2, duration: fall, speed: travel * 2 / fall, profile: 'accelerate', ...slide }, body, well),
    ];
  }
  els.push(hit('magazine body rings', els[els.length - 1].at + 0.001, fill === 'empty' && m.material !== 'polymer' ? -9 : -16, 0.6, body, well, { radius: 3, click: 0.1, sharp: 0.6 }));
  if (fill === 'empty') els.push(hit('follower rattles', els[els.length - 1].at + 0.01, -16, 0.3, arFollower, body, { radius: 1.5, click: 0.6, sharp: 0.6 }));
  return {
    id: `${g.id}-mag-${dir}` + (fill === 'empty' ? '-empty' : ''), title: `${g.name}: ${fill} magazine ${dir === 'in' ? 'in' : 'out'} (from measurements)`,
    room: 0.04, roomSize: 0.35, housing: d.housing,
    tracks: [{ name: `mag-${dir}`, description: dir === 'in' ? 'The magazine goes in and the catch takes it.' : 'The catch let go; the magazine comes out.', elements: els }],
  };
}

/** Every sound of a gun from its measurements (and its magazine registered for the drop scenes: magDrops(id)). */
export function gunScenes(g: GunSpec): Scene[] {
  MAG_TYPES[g.id] = magTypeOf(g);
  return [
    chargeFromSpec(g, 'loaded'), chargeFromSpec(g, 'empty'), chargeFromSpec(g, 'none'),
    ...(g.action.holdOpen ? [releaseFromSpec(g)] : []),
    magFromSpec(g, 'in', 'loaded'), magFromSpec(g, 'in', 'empty'), magFromSpec(g, 'out', 'loaded'), magFromSpec(g, 'out', 'empty'),
    ...magDrops(g.id),
  ];
}

// ------------------------------------------------------------------------------------------------ specs

/**
 * The four guns tuned by hand, as measurements only (their 'spec-' sounds are first attempts to compare with the
 * hand-tuned ones), and one built from measurements alone: the SR-25.
 */
export const GUN_SPECS: Record<string, GunSpec> = {
  'spec-ar15': {
    id: 'spec-ar15', name: 'AR-15 (spec)',
    action: { mass: 0.46, stroke: 0.094, springHome: 80, springRear: 160, carrierCm: 19, boltCm: 6, lockup: 'rotating', lube: 'greased', holdOpen: true, trigger: 'hammer', hammerSpringMm: 1.3 },
    handle: { kind: 'separate', material: 'aluminum', lengthCm: 18, returns: 'latch' },
    receiver: { build: 'billet', wallMm: 3, lengthCm: 18, widthCm: 2.6, heightCm: 2.2, ports: 'open', bufferTube: { lengthCm: 18, boreCm: 2.5, bufferKg: 0.13 } },
    gun: { barrelCm: 40, barrelMm: 16, lengthCm: 84, frame: 'aluminum', splitFrame: true },
    cartridge: { oalMm: 57, caseMm: 45, massG: 12 },
    magazine: { capacity: 30, lengthCm: 18, widthCm: 6, thicknessCm: 2.2, material: 'aluminum', wallMm: 0.9, massEmptyKg: 0.12, springN: 10, springRate: 130, insert: 'straight', catch: 'button', freeDrop: true, well: 'billet', fit: 'loose' },
  },
  'spec-kv47': {
    id: 'spec-kv47', name: 'KV-47 (spec)',
    action: { mass: 0.45, stroke: 0.1, springHome: 30, springRear: 50, carrierCm: 33, boltCm: 6.5, lockup: 'rotating', lube: 'dry', holdOpen: false, trigger: 'hammer', hammerSpringMm: 1.5 },
    handle: { kind: 'on-carrier', material: 'steel', lengthCm: 4 },
    receiver: { build: 'stamped', wallMm: 1, lengthCm: 26, widthCm: 4.2, heightCm: 3.6, ports: 'open', looseCover: true },
    gun: { barrelCm: 41, barrelMm: 17, lengthCm: 88, frame: 'steel' },
    cartridge: { oalMm: 56, caseMm: 39, massG: 16.3 },
    magazine: { capacity: 30, lengthCm: 23.5, widthCm: 7.5, thicknessCm: 3, material: 'steel', wallMm: 1, ribPitchCm: 2.5, massEmptyKg: 0.32, springN: 14, springRate: 150, insert: 'rock-in', catch: 'paddle', freeDrop: false, well: 'stamped' },
  },
  'spec-mp5': {
    id: 'spec-mp5', name: 'MP5 (spec)',
    action: { mass: 0.36, stroke: 0.075, springHome: 35, springRear: 55, carrierCm: 13, boltCm: 4, lockup: 'rollers', lube: 'oiled', holdOpen: false, trigger: 'hammer', hammerSpringMm: 1.2 },
    handle: { kind: 'separate', material: 'steel', lengthCm: 4, returns: 'own-spring' },
    receiver: { build: 'stamped', wallMm: 1.2, lengthCm: 30, widthCm: 3.2, heightCm: 3.2, ports: 'closed' },
    gun: { barrelCm: 22.5, barrelMm: 15, lengthCm: 68, frame: 'steel' },
    cartridge: { oalMm: 29, caseMm: 19, massG: 8 },
    magazine: { capacity: 30, lengthCm: 20, widthCm: 5.5, thicknessCm: 2.5, material: 'steel', wallMm: 0.8, ribPitchCm: 4, massEmptyKg: 0.13, springN: 9, springRate: 110, insert: 'straight', catch: 'paddle', freeDrop: false, well: 'stamped' },
  },
  'spec-g19': {
    id: 'spec-g19', name: 'G19 (spec)',
    action: { mass: 0.24, stroke: 0.032, springHome: 45, springRear: 65, carrierCm: 17, boltCm: 10, lockup: 'tilting', lube: 'oiled', holdOpen: true, trigger: 'striker' },
    handle: { kind: 'slide', material: 'steel', lengthCm: 17 },
    receiver: { build: 'polymer', wallMm: 3, lengthCm: 16, widthCm: 2.4, heightCm: 3, ports: 'slide' },
    gun: { barrelCm: 10.2, barrelMm: 12, lengthCm: 18.5, frame: 'polymer' },
    cartridge: { oalMm: 29, caseMm: 19, massG: 8 },
    magazine: { capacity: 15, lengthCm: 12.5, widthCm: 3.4, thicknessCm: 2.6, material: 'polymer', wallMm: 2, massEmptyKg: 0.068, springN: 9, springRate: 220, insert: 'straight', catch: 'button', freeDrop: true, well: 'polymer' },
  },
  // From measurements only (KAC SR-25 / AR-10 pattern, 7.62x51): a heavier carrier (~445 g with ~160 g of buffer) on a
  // longer stroke (~105 mm), a stiffer spring; the 71 mm cartridge (25 g); a 20-round steel magazine, ~15 x 7.5 x
  // 2.6 cm, ~0.2 kg empty. Estimates where no figure was to hand: the spring's forces and the magazine's spring.
  sr25: {
    id: 'sr25', name: 'SR-25',
    action: { mass: 0.6, stroke: 0.105, springHome: 90, springRear: 180, carrierCm: 21, boltCm: 7, lockup: 'rotating', lube: 'greased', holdOpen: true, trigger: 'hammer', hammerSpringMm: 1.4 },
    handle: { kind: 'separate', material: 'aluminum', lengthCm: 19, returns: 'latch' },
    receiver: { build: 'billet', wallMm: 3.5, lengthCm: 20, widthCm: 3, heightCm: 2.6, ports: 'open', bufferTube: { lengthCm: 18, boreCm: 2.5, bufferKg: 0.16 } },
    gun: { barrelCm: 51, barrelMm: 22, lengthCm: 103, frame: 'aluminum', splitFrame: true },
    cartridge: { oalMm: 71, caseMm: 51, massG: 25 },
    magazine: { capacity: 20, lengthCm: 15, widthCm: 7.5, thicknessCm: 2.6, material: 'steel', wallMm: 0.9, massEmptyKg: 0.2, springN: 14, springRate: 160, insert: 'straight', catch: 'button', freeDrop: true, well: 'billet' },
  },
};

/**
 * Two generic families for the game's guns that have no hand-tuned twin: a 9 mm blowback submachine gun (Uzi / MPX /
 * MAC-10 class: a heavy stamped-steel bolt, nothing locking) and a 5.56 bullpup (Tavor / AUG / F2 class: a rotating
 * bolt in a polymer stock, a non-reciprocating handle on its own spring, polymer magazines). Typical figures, not one
 * gun's.
 */
GUN_SPECS.smg = {
  id: 'smg', name: 'Blowback SMG',
  action: { mass: 0.42, stroke: 0.07, springHome: 40, springRear: 70, carrierCm: 11, boltCm: 11, lockup: 'blowback', lube: 'oiled', holdOpen: false, trigger: 'striker' },
  handle: { kind: 'on-carrier', material: 'steel', lengthCm: 3 },
  receiver: { build: 'stamped', wallMm: 1, lengthCm: 25, widthCm: 3.5, heightCm: 3.5, ports: 'closed' },
  gun: { barrelCm: 26, barrelMm: 12, lengthCm: 60, frame: 'steel' },
  cartridge: { oalMm: 29, caseMm: 19, massG: 8 },
  magazine: { capacity: 32, lengthCm: 23, widthCm: 3, thicknessCm: 2.4, material: 'steel', wallMm: 0.8, massEmptyKg: 0.2, springN: 9, springRate: 110, insert: 'straight', catch: 'button', freeDrop: false, well: 'stamped' },
};
GUN_SPECS.bullpup = {
  id: 'bullpup', name: '5.56 bullpup',
  action: { mass: 0.4, stroke: 0.09, springHome: 60, springRear: 120, carrierCm: 15, boltCm: 6, lockup: 'rotating', lube: 'oiled', holdOpen: true, trigger: 'hammer', hammerSpringMm: 1.2 },
  handle: { kind: 'separate', material: 'steel', lengthCm: 5, returns: 'own-spring' },
  receiver: { build: 'polymer', wallMm: 3, lengthCm: 28, widthCm: 4, heightCm: 4, ports: 'closed' },
  gun: { barrelCm: 42, barrelMm: 16, lengthCm: 73, frame: 'polymer' },
  cartridge: { oalMm: 57, caseMm: 45, massG: 12 },
  magazine: { capacity: 30, lengthCm: 18, widthCm: 6.5, thicknessCm: 2.4, material: 'polymer', wallMm: 2, massEmptyKg: 0.135, springN: 10, springRate: 130, insert: 'straight', catch: 'button', freeDrop: true, well: 'polymer' },
};

/**
 * A turn-bolt worked by hand (Remington 700 / Mosin class), on the game's manual-action clock: the handle lifted
 * (cocking the striker and turning the lugs free), the bolt drawn back (the case pulled and flicked out), its stop,
 * pushed home (stripping and chambering a round) and turned down into its notch. `T`: when it reaches the rear stop.
 */
export function boltActionScene(T = 0.33): Scene {
  const steel = (cm: number, mm: number, damping = 0.6): Body => ({ ...mat('steel'), shape: 'bar', size: cm, thickness: mm, modes: 1, irregularity: 0.6, damping, level: 0 });
  const bolt = steel(20, 18, 0.7), boltSliding: Body = { ...bolt, modes: 0, damping: 0.8 }, rcv = { ...mat('steel'), shape: 'shell' as const, size: 22, thickness: 4, modes: 0, irregularity: 0.7, damping: 0.6, level: 0 };
  const handle = steel(6, 8, 0.5), cock = steel(3, 10), round: Body = { ...arCase, size: 8.4, thickness: 10 };
  const oiled = TEXTURE.oiled, coil = { level: 0.5, length: 4, dispersion: 0.55, decay: 0.12, brightness: 4000 };
  const L = T - 0.15, F = T + 0.04;
  const els: SceneElement[] = [
    hit('hand takes the bolt handle', L - 0.03, -18, 0.4, handle, steel(2, 2), { radius: 1, click: 0.3, sharp: 0.3 }),
    rub('cocking piece cams back up the bolt', L, -9, { force: 12, duration: 0.03, speed: 0.4, profile: 'steady', ...GRIT, stickSlip: 0.15 }, cock, bolt),
    rub('firing pin spring compresses', L + 0.002, -14, { force: 6, duration: 0.028, speed: 0.3, profile: 'accelerate', roughness: 4, grain: 0.3, contactWidth: 0.04 }, springWire(6, 1.1), bolt, { coil }),
    snap('lugs turn free', L + 0.03, -6, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 1 }, bolt, rcv),
    rub('bolt drawn back in the receiver', L + 0.035, -10, { force: 5, duration: T - L - 0.035, speed: 1, profile: 'swell', ...oiled }, boltSliding, rcv),
    rub('case pulled out of the chamber', L + 0.035, -12, { force: 6, duration: 0.03, speed: 0.6, profile: 'accelerate', roughness: 4, grain: 0.2, contactWidth: 0.05 }, round, steel(10, 12)),
    hit('case flicked out by the ejector', T - 0.006, -8, 1.2, round, steel(2, 3), { radius: 1.5, click: 0.8, sharp: 0.8 }),
    hit('bolt hits its stop', T, -2, 1.3, bolt, rcv, { radius: 4, click: 0.8, sharp: 0.8 }),
    rub('bolt pushed home in the receiver', F, -10, { force: 5, duration: 0.11, speed: 0.9, profile: 'swell', ...oiled }, boltSliding, rcv),
    hit('bolt face strips the top round', F + 0.04, -7, 0.7, bolt, round, { radius: 1.5, click: 0.6, sharp: 0.7 }),
    rub('round slides into the chamber', F + 0.045, -12, { force: 4, duration: 0.05, speed: 0.6, profile: 'steady', roughness: 4, grain: 0.2, contactWidth: 0.05 }, round, steel(10, 12)),
    hit('next round snaps up into the lips', F + 0.05, -14, 0.8, round, steel(5, 1), { radius: 1.5, click: 0.6, sharp: 0.7 }),
    hit('bolt closes on the chamber', F + 0.11, -4, 0.9, bolt, steel(10, 12), { radius: 3, click: 0.8, sharp: 0.8 }),
    snap('extractor snaps over the rim', F + 0.112, -10, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 1 }, steel(2, 3), round),
    rub('lugs cam home as the handle turns down', F + 0.125, -9, { force: 14, duration: 0.025, speed: 0.4, profile: 'steady', roughness: 8, grain: 0.1, periodicity: 0.2, contactWidth: 0.02 }, bolt, rcv),
    hit('handle drops into its notch', F + 0.152, -3, 1.0, handle, rcv, { radius: 2, click: 0.85, sharp: 0.85 }),
  ];
  return {
    id: 'bolt-action', title: 'Turn-bolt action worked by hand, chambering a round', room: 0.04, roomSize: 0.35,
    housing: { amount: 0.5, cavity: 0.3, ...rcv, cavities: [{ length: 18, width: 2, depth: 2, q: 8, level: 1 }] },
    tracks: [{ name: 'bolt', description: 'Up, back, the case out, home, down.', elements: els }],
  };
}

/** A round pushed in by hand: a shotshell past the loading gate into the tube, or a cartridge into a chamber. */
export function roundInScene(kind: 'shell' | 'cartridge'): Scene {
  const shell: Body = kind === 'shell' ? { ...mat('nylon'), material: 'custom', stiffness: 1.4, loss: 0.08, shape: 'bar', size: 7, thickness: 18, modes: 0, irregularity: 0.6, damping: 0.6, level: 0 } : { ...arCase, size: 4, thickness: 9 };
  const head = { ...mat('brass'), shape: 'bar' as const, size: 1, thickness: 20, modes: 1, irregularity: 0.5, damping: 0.5, level: 0 };
  const steel = (cm: number, mm: number): Body => ({ ...mat('steel'), shape: 'bar', size: cm, thickness: mm, modes: 1, irregularity: 0.6, damping: 0.6, level: 0 });
  const els: SceneElement[] = kind === 'shell' ? [
    rub('shell pushed past the loading gate', 0, -10, { force: 8, duration: 0.05, speed: 0.6, profile: 'accelerate', roughness: 3, grain: 0.6, contactWidth: 0.1 }, shell, steel(4, 2)),
    snap('shell latch clicks behind its rim', 0.05, -4, { strength: 0.7, preload: 0, seat: 0.3, seatDelay: 1 }, steel(2, 2), head),
    rub('magazine spring takes it', 0.052, -14, { force: 5, duration: 0.02, speed: 0.3, profile: 'steady', roughness: 4, grain: 0.3, contactWidth: 0.04 }, springWire(20, 1), steel(30, 2), { coil: { level: 0.5, length: 9, dispersion: 0.5, decay: 0.1, brightness: 3000 } }),
  ] : [
    rub('cartridge slid into the chamber', 0, -12, { force: 3, duration: 0.03, speed: 0.5, profile: 'accelerate', roughness: 3, grain: 0.2, contactWidth: 0.05 }, shell, steel(5, 12)),
    hit('rim seats on the chamber face', 0.03, -4, 0.8, head, steel(5, 12), { radius: 1.5, click: 0.8, sharp: 0.85 }),
  ];
  return { id: `${kind}-in`, title: kind === 'shell' ? 'Shotshell loaded into the tube' : 'Cartridge pushed into the chamber', room: 0.04, roomSize: 0.35, tracks: [{ name: 'in', description: 'In by hand.', elements: els }] };
}

export const SPEC_SCENES: Scene[] = [...Object.values(GUN_SPECS).flatMap(gunScenes), boltActionScene(), roundInScene('shell'), roundInScene('cartridge')];
