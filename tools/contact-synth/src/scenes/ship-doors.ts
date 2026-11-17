/*
 * A ship's sliding doors: precise, greased rollers on a rail (steel on steel with a film of oil: friction.lubrication), the
 * door stopping softly against its cushion, and the pneumatic seal's puff at the end. A bulkhead door and the heavier blast
 * door, each opening and closing. Dry (--dry) for the game's own acoustics.
 */
import type { Scene, SceneElement } from '../scene.js';
import { mat } from '../presets.js';
import { hit, rub, type Body } from './firearms.js';

const door = (cm: number, mm: number): Body => ({ ...mat('steel'), shape: 'plate', size: cm, thickness: mm, modes: 1, irregularity: 0.6, damping: 0.85, level: 0 });
const rail: Body = { ...mat('steel'), shape: 'bar', size: 60, thickness: 12, modes: 1, irregularity: 0.6, damping: 0.8, level: 0 };
const cushion: Body = { ...mat('nylon'), material: 'custom', stiffness: 0.8, loss: 0.15, shape: 'bar', size: 6, thickness: 20, modes: 0, irregularity: 0.5, damping: 0.8, level: 0 };

function slideDoor(id: string, title: string, o: { blast: boolean; open: boolean }): Scene {
  const k = o.blast ? 1 : 0, run = (o.blast ? 0.95 : 0.5) * (o.open ? 1 : 0.9), D = door(o.blast ? 120 : 90, o.blast ? 9 : 4);
  const glide = { profile: 'swell' as const, roughness: 1, grain: 0.4, periodicity: 0, contactWidth: 0.1, lubrication: 0.85 };
  const els: SceneElement[] = [
    rub('rollers running on their rail', 0.02, -12 + 3 * k, { ...glide, force: o.blast ? 14 : 7, duration: run, speed: o.blast ? 1.0 : 1.8 }, D, rail),
    rub('their bearings, a finer glide', 0.02, -19, { ...glide, force: 3, duration: run, speed: o.blast ? 1.6 : 2.8, grain: 0.15, roughness: 0.5 }, D, rail),
    hit('the door sets against its cushion', 0.02 + run, -14 + 3 * k, o.blast ? 0.22 : 0.12, D, cushion, { radius: 6, click: 0.05, sharp: 0.1, scatter: 0.1 }),
  ];
  return { id, title, room: 0.04, roomSize: 0.35, tracks: [{ name: 'door', description: title, elements: els }] };
}

export const SHIP_DOOR_SCENES: Scene[] = [
  slideDoor('ship-door-open', 'Ship door: sliding open', { blast: false, open: true }),
  slideDoor('ship-door-close', 'Ship door: sliding closed', { blast: false, open: false }),
  slideDoor('ship-door-blast-open', 'Ship blast door: sliding open', { blast: true, open: true }),
  slideDoor('ship-door-blast-close', 'Ship blast door: sliding closed', { blast: true, open: false }),
];
