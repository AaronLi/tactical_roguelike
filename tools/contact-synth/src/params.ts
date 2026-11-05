/*
 * The generic description of a contact sound.
 *
 * Every sound this synth makes is described the same way, so any combination
 * can be dialled in with sliders:
 *
 *   GESTURE  — how the two bodies touch over time. Three independent layers:
 *              impact (a hit, with bounces), friction (slide / scrape / squeak,
 *              driven by a surface texture read out at the sliding speed) and
 *              snaps (catch-and-release: a latch, detent or button).
 *   BODIES   — the two objects in contact. Each one is a material
 *              (stiffness, density, internal loss) plus a geometry (shape,
 *              size, thickness) plus how it's held. These set its modes:
 *              the frequencies it rings at and how long they last.
 *   ELASTIC  — springy behaviour that isn't plain ringing: a coil spring's
 *              dispersive "boing/zing" and a large slow flex (a ruler or sheet
 *              swinging) that can rattle against its support or bend the pitch.
 *   OUTPUT   — room, length, seed.
 */

export type Shape = 'bar' | 'plate' | 'shell' | 'block';
export type SpeedProfile = 'steady' | 'accelerate' | 'decelerate' | 'swell' | 'backforth';

export interface BodyParams {
  /** Material preset id, or 'custom' once a material slider is moved. */
  material: string;
  /** Young's modulus, GPa. Stiffer = higher pitch, harder (brighter) contact. */
  stiffness: number;
  /** kg/m³. Denser = lower pitch, heavier. */
  density: number;
  /** Internal loss factor η. Metals ~1e-4..1e-3 (ring), plastics ~1e-2..1e-1 (thud). */
  loss: number;
  shape: Shape;
  /** Longest dimension, cm. */
  size: number;
  /** Wall / sheet / bar thickness, mm (for a block: its smallest dimension). */
  thickness: number;
  /** Max isolated resonances rendered as distinct (narrow-band) pitches; the rest are noise bands. */
  modes: number;
  /** 0 = ideal geometry, 1 = dented / irregular (detuned, split modes). */
  irregularity: number;
  /** 0 = hanging free, 1 = clamped / held firmly / resting on something soft. */
  damping: number;
  /** Level trim, dB. */
  level: number;
}

export interface ImpactParams {
  /** Impact speed, m/s. 0 turns impacts off. */
  velocity: number;
  /** Coefficient of restitution: 0 = dead stop, 0.9 = lively bounces. */
  restitution: number;
  /** 0 = clean ball-like bounces, 1 = tumbling clatter (secondary hits, varied spots). */
  scatter: number;
  /** Radius of the contacting surface, mm: small = corner/edge, large = flat face. */
  contactRadius: number;
  /** Rigid-body "click" radiated directly by the contact, 0..1. */
  click: number;
  /**
   * 0..1 edge hardness: how much of each contact happens first through a hard edge,
   * corner or burr, giving a very short, bright crack ahead of the main contact.
   * Hard plastics and metals snap; rubber and foam can't (scaled by stiffness).
   */
  sharpness: number;
}

export interface FrictionParams {
  /** Normal (pressing) force, N. 0 turns sliding off. */
  force: number;
  /** Seconds of contact. */
  duration: number;
  /** Peak sliding speed, m/s. */
  speed: number;
  profile: SpeedProfile;
  /** Strokes for back-and-forth. */
  strokes: number;
  /** Texture depth, µm. Polished ~0.5, sanded ~10, rough cast / rust ~100+. */
  roughness: number;
  /** Texture wavelength / ridge spacing, mm. */
  grain: number;
  /** 0 = random grit, 1 = regular ridges (file, ratchet, zip tie, knurling). */
  periodicity: number;
  /** Stick-slip tendency: 0 = clean slide, 1 = strong squeal / chatter. */
  stickSlip: number;
  /** Stick-slip rate at full speed, Hz (squeak pitch). */
  stickPitch: number;
  /** Size of the micro-contacts, mm. Larger averages the texture out (duller). */
  contactWidth: number;
}

export interface SnapParams {
  /** Number of catch-and-release events. 0 turns snaps off. */
  count: number;
  /** 0..1 how much energy each release dumps. */
  strength: number;
  /** ms between snaps. */
  spacing: number;
  /** ms of loading (creak) before each snap. */
  preload: number;
  /** 0..1 creak during loading. */
  creak: number;
  /** 0..1 level of the follow-up "seat" hit (the latch landing on its stop). */
  seat: number;
  /** ms from release to seat. */
  seatDelay: number;
}

export interface CoilParams {
  /** 0..1 level of the coil-spring wave layer. 0 = off. */
  level: number;
  /** Round-trip time of a wave along the coil, ms (longer spring = longer). */
  length: number;
  /** 0..1 dispersion: 0 = plain echo, 1 = strong "pew / zing" chirps. */
  dispersion: number;
  /** Decay time (T60) of the spring's echoes, s. */
  decay: number;
  /** Loop low-pass, Hz. */
  brightness: number;
}

export interface FlexParams {
  /** 0..1 how far the object swings. 0 = off. */
  amount: number;
  /** Swing frequency, Hz (ruler overhang ~10-40, sheet ~2-8, door-stop spring ~100-300). */
  freq: number;
  /** Swing decay (T60), s. */
  decay: number;
  /** 0..1 how hard it slaps its support each cycle (ruler-on-desk buzz). */
  rattle: number;
  /** 0..1 how much the swing bends the ring pitch (wobble board / thunder sheet). */
  wobble: number;
  /** 0..1 how much of the swing itself is heard as a tone. */
  tone: number;
}

/**
 * The enclosure the contact happens inside (a blaster's clamshell, a case, a
 * housing). Every contact is transmitted into it through its mounts, so it rings
 * along with the parts, and the air box inside it resonates. Off at amount 0.
 */
export interface HousingParams extends BodyParams {
  /** 0..1 how much of the sound comes through the housing. 0 = no housing. */
  amount: number;
  /** 0..1 air-cavity resonance inside the housing (the "hollow box" tone). */
  cavity: number;
  /**
   * Width of the air space inside, cm. 0 = a box in proportion to the size
   * (L × 0.45L × 0.2L). A small width makes it a long narrow bore (a rifle's upper
   * receiver, a tube): a series of pipe-like resonances, the "hollow" sound of
   * parts sliding inside a tube.
   */
  cavityWidth?: number;
}

export interface OutputParams {
  room: number;
  roomSize: number;
  /** Maximum length, s (trailing silence is trimmed). */
  length: number;
  seed: number;
}

export interface Params {
  impact: ImpactParams;
  friction: FrictionParams;
  snap: SnapParams;
  bodyA: BodyParams;
  bodyB: BodyParams;
  coil: CoilParams;
  flex: FlexParams;
  housing: HousingParams;
  out: OutputParams;
}

export function defaultParams(): Params {
  return {
    impact: { velocity: 1.5, restitution: 0.4, scatter: 0.4, contactRadius: 3, click: 0.25, sharpness: 0.6 },
    friction: {
      force: 0, duration: 1, speed: 0.3, profile: 'steady', strokes: 2, roughness: 10, grain: 0.5,
      periodicity: 0, stickSlip: 0, stickPitch: 600, contactWidth: 0.05,
    },
    snap: { count: 0, strength: 0.6, spacing: 150, preload: 80, creak: 0.3, seat: 0.5, seatDelay: 12 },
    bodyA: {
      material: 'steel', stiffness: 200, density: 7850, loss: 0.0004, shape: 'plate', size: 25, thickness: 1.5,
      modes: 32, irregularity: 0.3, damping: 0.1, level: 0,
    },
    bodyB: {
      material: 'steel', stiffness: 200, density: 7850, loss: 0.0004, shape: 'bar', size: 4, thickness: 4,
      modes: 16, irregularity: 0.3, damping: 0.3, level: -6,
    },
    coil: { level: 0, length: 30, dispersion: 0.6, decay: 1.2, brightness: 6000 },
    flex: { amount: 0, freq: 20, decay: 1, rattle: 0, wobble: 0, tone: 0 },
    housing: {
      amount: 0, cavity: 0.5, cavityWidth: 0, material: 'abs', stiffness: 2.3, density: 1050, loss: 0.02, shape: 'shell', size: 25, thickness: 2,
      modes: 16, irregularity: 0.6, damping: 0.3, level: 0,
    },
    out: { room: 0.15, roomSize: 0.4, length: 3, seed: 1 },
  };
}

export function cloneParams(p: Params): Params {
  return JSON.parse(JSON.stringify(p)) as Params;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type ParamPatch = DeepPartial<Params>;

/** Defaults overlaid with a patch (presets are patches). */
export function withPatch(patch: ParamPatch, base: Params = defaultParams()): Params {
  const p = cloneParams(base) as unknown as Record<string, Record<string, unknown>>;
  for (const [section, values] of Object.entries(patch)) {
    if (values && p[section]) Object.assign(p[section], values);
  }
  return p as unknown as Params;
}

export function getPath(p: Params, path: string): unknown {
  const [s, k] = path.split('.');
  return (p as unknown as Record<string, Record<string, unknown>>)[s][k];
}

export function setPath(p: Params, path: string, v: unknown): void {
  const [s, k] = path.split('.');
  (p as unknown as Record<string, Record<string, unknown>>)[s][k] = v;
}
