/*
 * Presets are just points in the generic parameter space: a patch on top of the
 * defaults. Every one of them can be reached (and blended away from) with the
 * sliders.
 */
import { materialById } from './materials.js';
/** Material fields for a body patch. */
function mat(id) {
    const m = materialById(id);
    if (!m)
        throw new Error(`unknown material ${id}`);
    return { material: m.id, stiffness: m.stiffness, density: m.density, loss: m.loss };
}
const NO_IMPACT = { velocity: 0 };
export const PRESETS = [
    // ---------------- Impacts ----------------
    {
        id: 'coin-steel', label: 'Coin dropped on a steel plate', group: 'Impacts',
        patch: {
            impact: { velocity: 2.2, restitution: 0.6, scatter: 0.55, contactRadius: 1, click: 0.2 },
            bodyA: { ...mat('steel'), shape: 'plate', size: 35, thickness: 2, modes: 40, irregularity: 0.3, damping: 0.15, level: -4 },
            bodyB: { ...mat('brass'), shape: 'plate', size: 2.4, thickness: 1.8, modes: 16, irregularity: 0.2, damping: 0, level: 0 },
            out: { length: 3.5, room: 0.15 },
        },
    },
    {
        id: 'spoon-pot', label: 'Spoon tapping a steel pot', group: 'Impacts',
        patch: {
            impact: { velocity: 1.2, restitution: 0.15, scatter: 0.05, contactRadius: 4, click: 0.15 },
            bodyA: { ...mat('stainless'), shape: 'shell', size: 20, thickness: 1.2, modes: 40, irregularity: 0.25, damping: 0.05, level: 0 },
            bodyB: { ...mat('stainless'), shape: 'bar', size: 16, thickness: 2, modes: 16, irregularity: 0.2, damping: 0.5, level: -8 },
            out: { length: 4 },
        },
    },
    {
        id: 'wrench-concrete', label: 'Wrench dropped on concrete', group: 'Impacts',
        patch: {
            impact: { velocity: 3.5, restitution: 0.35, scatter: 0.85, contactRadius: 2, click: 0.35 },
            bodyA: { ...mat('steel'), shape: 'bar', size: 22, thickness: 6, modes: 24, irregularity: 0.5, damping: 0, level: 0 },
            bodyB: { ...mat('concrete'), shape: 'block', size: 100, thickness: 100, modes: 12, irregularity: 0.5, damping: 1, level: -10 },
            out: { length: 3 },
        },
    },
    {
        id: 'bolt-bench', label: 'Bolt bouncing on a steel bench', group: 'Impacts',
        patch: {
            impact: { velocity: 2.5, restitution: 0.55, scatter: 0.7, contactRadius: 1.5, click: 0.3 },
            bodyA: { ...mat('steel'), shape: 'plate', size: 60, thickness: 4, modes: 40, irregularity: 0.4, damping: 0.4, level: -6 },
            bodyB: { ...mat('steel'), shape: 'bar', size: 5, thickness: 8, modes: 12, irregularity: 0.3, damping: 0, level: 0 },
        },
    },
    {
        id: 'can-tap', label: 'Empty aluminium can, flicked', group: 'Impacts',
        patch: {
            impact: { velocity: 0.8, restitution: 0.2, scatter: 0.1, contactRadius: 6, click: 0.3 },
            bodyA: { ...mat('aluminum'), shape: 'shell', size: 12, thickness: 0.12, modes: 48, irregularity: 0.6, damping: 0.2, level: 0 },
            bodyB: { ...mat('rubber'), shape: 'block', size: 2, thickness: 1.5, modes: 4, irregularity: 0, damping: 1, level: -30 },
            out: { length: 1.5 },
        },
    },
    {
        id: 'pipe-chime', label: 'Steel pipe struck (chime)', group: 'Impacts',
        patch: {
            impact: { velocity: 1.5, restitution: 0.1, scatter: 0, contactRadius: 5, click: 0.1 },
            bodyA: { ...mat('steel'), shape: 'bar', size: 60, thickness: 14, modes: 12, irregularity: 0.1, damping: 0, level: 0 },
            bodyB: { ...mat('nylon'), shape: 'block', size: 4, thickness: 3, modes: 6, irregularity: 0, damping: 1, level: -20 },
            out: { length: 6, room: 0.25, roomSize: 0.7 },
        },
    },
    {
        id: 'plastic-case-drop', label: 'Plastic case dropped on the floor', group: 'Impacts',
        patch: {
            impact: { velocity: 3, restitution: 0.3, scatter: 0.8, contactRadius: 8, click: 0.4 },
            bodyA: { ...mat('abs'), shape: 'shell', size: 30, thickness: 3, modes: 32, irregularity: 0.5, damping: 0, level: 0 },
            bodyB: { ...mat('concrete'), shape: 'block', size: 100, thickness: 100, modes: 12, irregularity: 0.5, damping: 1, level: -10 },
            out: { length: 1.5 },
        },
    },
    {
        id: 'pen-desk', label: 'Plastic pen dropped on a desk', group: 'Impacts',
        patch: {
            impact: { velocity: 1.8, restitution: 0.45, scatter: 0.9, contactRadius: 2, click: 0.5 },
            bodyA: { ...mat('polystyrene'), shape: 'bar', size: 14, thickness: 7, modes: 16, irregularity: 0.4, damping: 0, level: 0 },
            bodyB: { ...mat('wood'), shape: 'plate', size: 80, thickness: 25, modes: 24, irregularity: 0.3, damping: 0.6, level: -6 },
            out: { length: 1.5 },
        },
    },
    {
        id: 'tupperware-tap', label: 'Knuckle on a plastic tub', group: 'Impacts',
        patch: {
            impact: { velocity: 1, restitution: 0.05, scatter: 0, contactRadius: 15, click: 0.2 },
            bodyA: { ...mat('pp'), shape: 'shell', size: 18, thickness: 1, modes: 32, irregularity: 0.4, damping: 0.1, level: 0 },
            bodyB: { ...mat('rubber'), shape: 'block', size: 3, thickness: 2, modes: 4, irregularity: 0, damping: 1, level: -30 },
            out: { length: 1 },
        },
    },
    // ---------------- Sliding & scraping ----------------
    {
        id: 'steel-scrape', label: 'Steel bar scraped across a steel plate', group: 'Sliding & scraping',
        patch: {
            impact: { velocity: 0.12, restitution: 0, scatter: 0, contactRadius: 1, click: 0.1 },
            friction: { force: 20, duration: 1.4, speed: 0.4, profile: 'swell', roughness: 40, grain: 0.6, periodicity: 0.05, stickSlip: 0.15, stickPitch: 700, contactWidth: 0.03 },
            bodyA: { ...mat('steel'), shape: 'plate', size: 45, thickness: 3, modes: 48, irregularity: 0.35, damping: 0.25, level: 0 },
            bodyB: { ...mat('steel'), shape: 'bar', size: 20, thickness: 6, modes: 20, irregularity: 0.3, damping: 0.4, level: -4 },
            out: { length: 2.5 },
        },
    },
    {
        id: 'drawer-slide', label: 'Metal drawer sliding shut', group: 'Sliding & scraping',
        patch: {
            impact: { velocity: 0.9, restitution: 0.2, scatter: 0.3, contactRadius: 10, click: 0.2 },
            friction: { force: 8, duration: 0.7, speed: 0.6, profile: 'decelerate', roughness: 6, grain: 0.3, periodicity: 0.25, stickSlip: 0.05, contactWidth: 0.05 },
            bodyA: { ...mat('steel'), shape: 'shell', size: 50, thickness: 0.8, modes: 48, irregularity: 0.5, damping: 0.5, level: 0 },
            bodyB: { ...mat('steel'), shape: 'bar', size: 40, thickness: 1.2, modes: 20, irregularity: 0.3, damping: 0.5, level: -6 },
            out: { length: 2 },
        },
    },
    {
        id: 'file-rasp', label: 'File rasping steel (back and forth)', group: 'Sliding & scraping',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 15, duration: 2, speed: 0.35, profile: 'backforth', strokes: 4, roughness: 60, grain: 0.35, periodicity: 0.85, stickSlip: 0, contactWidth: 0.02 },
            bodyA: { ...mat('steel'), shape: 'block', size: 6, thickness: 2, modes: 12, irregularity: 0.4, damping: 0.8, level: 0 },
            bodyB: { ...mat('springsteel'), shape: 'bar', size: 25, thickness: 4, modes: 24, irregularity: 0.2, damping: 0.5, level: 0 },
            out: { length: 2.4, room: 0.1 },
        },
    },
    {
        id: 'chain-drag', label: 'Rough cast iron dragged on concrete', group: 'Sliding & scraping',
        patch: {
            impact: { velocity: 0.6, restitution: 0.1, scatter: 0.6, contactRadius: 3, click: 0.3 },
            friction: { force: 25, duration: 1.6, speed: 0.5, profile: 'steady', roughness: 200, grain: 2, periodicity: 0.1, stickSlip: 0.25, stickPitch: 120, contactWidth: 0.2 },
            bodyA: { ...mat('castiron'), shape: 'block', size: 15, thickness: 8, modes: 16, irregularity: 0.6, damping: 0.3, level: 0 },
            bodyB: { ...mat('concrete'), shape: 'block', size: 100, thickness: 100, modes: 12, irregularity: 0.5, damping: 1, level: -6 },
        },
    },
    {
        id: 'tray-slide', label: 'Plastic tray slid across a table', group: 'Sliding & scraping',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 6, duration: 0.9, speed: 0.5, profile: 'swell', roughness: 4, grain: 0.2, periodicity: 0, stickSlip: 0.05, contactWidth: 0.08 },
            bodyA: { ...mat('pp'), shape: 'plate', size: 35, thickness: 2, modes: 32, irregularity: 0.3, damping: 0.2, level: 0 },
            bodyB: { ...mat('wood'), shape: 'plate', size: 80, thickness: 25, modes: 24, irregularity: 0.3, damping: 0.6, level: -6 },
            out: { length: 1.4 },
        },
    },
    {
        id: 'crate-drag', label: 'Plastic crate dragged on concrete', group: 'Sliding & scraping',
        patch: {
            impact: { velocity: 0.4, restitution: 0, scatter: 0.3, contactRadius: 10, click: 0.2 },
            friction: { force: 30, duration: 1.5, speed: 0.4, profile: 'steady', roughness: 120, grain: 1.2, periodicity: 0.1, stickSlip: 0.35, stickPitch: 90, contactWidth: 0.3 },
            bodyA: { ...mat('hdpe'), shape: 'shell', size: 45, thickness: 4, modes: 32, irregularity: 0.5, damping: 0.1, level: 0 },
            bodyB: { ...mat('concrete'), shape: 'block', size: 100, thickness: 100, modes: 12, irregularity: 0.5, damping: 1, level: -8 },
        },
    },
    {
        id: 'zip-tie', label: 'Zip tie pulled tight', group: 'Sliding & scraping',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 5, duration: 0.8, speed: 0.12, profile: 'accelerate', roughness: 250, grain: 1.3, periodicity: 1, stickSlip: 0, contactWidth: 0.05 },
            bodyA: { ...mat('nylon'), shape: 'bar', size: 3, thickness: 1.5, modes: 12, irregularity: 0.3, damping: 0.2, level: 0 },
            bodyB: { ...mat('nylon'), shape: 'bar', size: 20, thickness: 1.2, modes: 16, irregularity: 0.3, damping: 0.3, level: -4 },
            out: { length: 1.2, room: 0.05 },
        },
    },
    {
        id: 'ratchet', label: 'Ratchet wrench (back and forth)', group: 'Sliding & scraping',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 10, duration: 1.6, speed: 0.06, profile: 'backforth', strokes: 4, roughness: 400, grain: 1.5, periodicity: 1, stickSlip: 0, contactWidth: 0.02 },
            bodyA: { ...mat('steel'), shape: 'block', size: 4, thickness: 2.5, modes: 12, irregularity: 0.3, damping: 0.4, level: 0 },
            bodyB: { ...mat('steel'), shape: 'bar', size: 22, thickness: 8, modes: 20, irregularity: 0.3, damping: 0.5, level: 0 },
            out: { length: 2 },
        },
    },
    {
        id: 'hinge-squeak', label: 'Squeaky metal hinge', group: 'Sliding & scraping',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 18, duration: 1.5, speed: 0.05, profile: 'swell', roughness: 3, grain: 0.3, periodicity: 0, stickSlip: 0.95, stickPitch: 900, contactWidth: 0.05 },
            bodyA: { ...mat('steel'), shape: 'plate', size: 10, thickness: 2, modes: 32, irregularity: 0.4, damping: 0.3, level: 0 },
            bodyB: { ...mat('steel'), shape: 'bar', size: 8, thickness: 6, modes: 16, irregularity: 0.3, damping: 0.5, level: -6 },
            out: { length: 2, room: 0.2 },
        },
    },
    {
        id: 'plastic-squeak', label: 'Plastic parts rubbing (creak/squeak)', group: 'Sliding & scraping',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 10, duration: 1.2, speed: 0.04, profile: 'backforth', strokes: 2, roughness: 2, grain: 0.2, periodicity: 0, stickSlip: 0.7, stickPitch: 260, contactWidth: 0.1 },
            bodyA: { ...mat('pvc'), shape: 'shell', size: 15, thickness: 2, modes: 32, irregularity: 0.4, damping: 0.1, level: 0 },
            bodyB: { ...mat('abs'), shape: 'plate', size: 12, thickness: 2, modes: 24, irregularity: 0.3, damping: 0.2, level: -2 },
            out: { length: 1.6 },
        },
    },
    // ---------------- Latches, clicks & snaps ----------------
    {
        id: 'latch-snap', label: 'Plastic latch snapping shut', group: 'Latches & clicks',
        patch: {
            impact: NO_IMPACT,
            snap: { count: 1, strength: 0.8, preload: 140, creak: 0.5, seat: 0.6, seatDelay: 9 },
            bodyA: { ...mat('abs'), shape: 'bar', size: 2.5, thickness: 1.6, modes: 16, irregularity: 0.3, damping: 0.2, level: 0 },
            bodyB: { ...mat('abs'), shape: 'shell', size: 12, thickness: 2.2, modes: 32, irregularity: 0.4, damping: 0.1, level: 0 },
            flex: { amount: 0.4, freq: 220, decay: 0.06, rattle: 0.3, wobble: 0, tone: 0.1 },
            out: { length: 0.6, room: 0.1 },
        },
    },
    {
        id: 'battery-cover', label: 'Battery cover clicking in', group: 'Latches & clicks',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 3, duration: 0.18, speed: 0.08, profile: 'steady', roughness: 3, grain: 0.15, periodicity: 0, stickSlip: 0.2, stickPitch: 300, contactWidth: 0.05 },
            snap: { count: 2, strength: 0.6, spacing: 35, preload: 160, creak: 0.3, seat: 0.4, seatDelay: 4 },
            bodyA: { ...mat('polycarbonate'), shape: 'plate', size: 5, thickness: 1, modes: 24, irregularity: 0.3, damping: 0.2, level: 0 },
            bodyB: { ...mat('abs'), shape: 'shell', size: 14, thickness: 2, modes: 32, irregularity: 0.4, damping: 0.3, level: -2 },
            out: { length: 0.6, room: 0.05 },
        },
    },
    {
        id: 'buckle', label: 'Side-release buckle clipping', group: 'Latches & clicks',
        patch: {
            impact: NO_IMPACT,
            snap: { count: 2, strength: 0.9, spacing: 6, preload: 90, creak: 0.2, seat: 0.7, seatDelay: 14 },
            bodyA: { ...mat('pom'), shape: 'bar', size: 3, thickness: 2, modes: 16, irregularity: 0.2, damping: 0.1, level: 0 },
            bodyB: { ...mat('pom'), shape: 'shell', size: 5, thickness: 1.8, modes: 24, irregularity: 0.3, damping: 0.2, level: 0 },
            flex: { amount: 0.3, freq: 350, decay: 0.04, rattle: 0, wobble: 0, tone: 0.05 },
            out: { length: 0.5, room: 0.05 },
        },
    },
    {
        id: 'pen-click', label: 'Retractable pen click', group: 'Latches & clicks',
        patch: {
            impact: NO_IMPACT,
            snap: { count: 1, strength: 0.7, preload: 60, creak: 0.1, seat: 0.8, seatDelay: 6 },
            bodyA: { ...mat('pom'), shape: 'bar', size: 1.5, thickness: 2, modes: 12, irregularity: 0.2, damping: 0.2, level: 0 },
            bodyB: { ...mat('abs'), shape: 'shell', size: 13, thickness: 1.2, modes: 24, irregularity: 0.3, damping: 0.3, level: 0 },
            coil: { level: 0.2, length: 4, dispersion: 0.5, decay: 0.15, brightness: 9000 },
            out: { length: 0.5, room: 0.05 },
        },
    },
    {
        id: 'toggle-switch', label: 'Metal toggle switch', group: 'Latches & clicks',
        patch: {
            impact: NO_IMPACT,
            snap: { count: 1, strength: 1, preload: 40, creak: 0, seat: 0.9, seatDelay: 2.5 },
            bodyA: { ...mat('brass'), shape: 'bar', size: 2, thickness: 3, modes: 12, irregularity: 0.2, damping: 0.3, level: 0 },
            bodyB: { ...mat('steel'), shape: 'plate', size: 15, thickness: 1.2, modes: 32, irregularity: 0.3, damping: 0.4, level: -2 },
            coil: { level: 0.3, length: 3, dispersion: 0.4, decay: 0.2, brightness: 8000 },
            out: { length: 0.6, room: 0.1 },
        },
    },
    {
        id: 'bottle-cap', label: 'Plastic bottle cap twisted open', group: 'Latches & clicks',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 6, duration: 0.6, speed: 0.03, profile: 'swell', roughness: 150, grain: 0.8, periodicity: 0.9, stickSlip: 0.3, stickPitch: 80, contactWidth: 0.05 },
            snap: { count: 3, strength: 0.4, spacing: 120, preload: 60, creak: 0.3, seat: 0, seatDelay: 5 },
            bodyA: { ...mat('pp'), shape: 'shell', size: 3, thickness: 1.2, modes: 16, irregularity: 0.4, damping: 0.3, level: 0 },
            bodyB: { ...mat('pet'), shape: 'shell', size: 20, thickness: 0.3, modes: 32, irregularity: 0.6, damping: 0.2, level: -2 },
            out: { length: 0.9, room: 0.05 },
        },
    },
    // ---------------- Springs & springy metal ----------------
    {
        id: 'doorstop', label: 'Door-stop spring flicked (boing)', group: 'Springs',
        patch: {
            impact: { velocity: 1.5, restitution: 0.2, scatter: 0, contactRadius: 1, click: 0.2 },
            bodyA: { ...mat('springsteel'), shape: 'bar', size: 8, thickness: 1.2, modes: 16, irregularity: 0.2, damping: 0.35, level: -12 },
            bodyB: { ...mat('rubber'), shape: 'block', size: 2, thickness: 1.5, modes: 4, irregularity: 0, damping: 1, level: -30 },
            flex: { amount: 1, freq: 140, decay: 1.4, rattle: 0.15, wobble: 0.3, tone: 0.7 },
            coil: { level: 0.6, length: 12, dispersion: 0.7, decay: 1.4, brightness: 5000 },
            out: { length: 2.5, room: 0.1 },
        },
    },
    {
        id: 'spring-zap', label: 'Long coil spring struck ("pew")', group: 'Springs',
        patch: {
            impact: { velocity: 2, restitution: 0.1, scatter: 0, contactRadius: 1, click: 0.1 },
            bodyA: { ...mat('springsteel'), shape: 'bar', size: 3, thickness: 1, modes: 8, irregularity: 0.2, damping: 0.5, level: -6 },
            bodyB: { ...mat('steel'), shape: 'bar', size: 10, thickness: 5, modes: 8, irregularity: 0.2, damping: 0.8, level: -12 },
            coil: { level: 1, length: 70, dispersion: 0.95, decay: 2.5, brightness: 6000 },
            out: { length: 3, room: 0.1 },
        },
    },
    {
        id: 'spring-stretch', label: 'Spring stretched and released', group: 'Springs',
        patch: {
            impact: NO_IMPACT,
            friction: { force: 3, duration: 0.4, speed: 0.15, profile: 'accelerate', roughness: 80, grain: 1, periodicity: 0.95, stickSlip: 0, contactWidth: 0.05 },
            snap: { count: 1, strength: 1, preload: 400, creak: 0.15, seat: 0.5, seatDelay: 40 },
            bodyA: { ...mat('springsteel'), shape: 'bar', size: 4, thickness: 1, modes: 12, irregularity: 0.3, damping: 0.2, level: 0 },
            bodyB: { ...mat('steel'), shape: 'bar', size: 4, thickness: 1, modes: 12, irregularity: 0.3, damping: 0.2, level: 0 },
            flex: { amount: 0.8, freq: 9, decay: 0.8, rattle: 0.8, wobble: 0.3, tone: 0 },
            coil: { level: 0.7, length: 25, dispersion: 0.8, decay: 1.2, brightness: 7000 },
            out: { length: 2 },
        },
    },
    {
        id: 'ruler-twang', label: 'Steel ruler twanged off a desk', group: 'Springs',
        patch: {
            impact: NO_IMPACT,
            snap: { count: 1, strength: 0.5, preload: 0, creak: 0, seat: 0, seatDelay: 5 },
            bodyA: { ...mat('springsteel'), shape: 'bar', size: 30, thickness: 0.8, modes: 32, irregularity: 0.2, damping: 0.4, level: 0 },
            bodyB: { ...mat('wood'), shape: 'plate', size: 80, thickness: 25, modes: 24, irregularity: 0.3, damping: 0.6, level: -2 },
            flex: { amount: 1, freq: 28, decay: 1.6, rattle: 0.9, wobble: 0.5, tone: 0.3 },
            out: { length: 2.5 },
        },
    },
    {
        id: 'plastic-ruler', label: 'Plastic ruler twanged', group: 'Springs',
        patch: {
            impact: NO_IMPACT,
            snap: { count: 1, strength: 0.5, preload: 0, creak: 0, seat: 0, seatDelay: 5 },
            bodyA: { ...mat('acrylic'), shape: 'bar', size: 30, thickness: 2.5, modes: 24, irregularity: 0.2, damping: 0.3, level: 0 },
            bodyB: { ...mat('wood'), shape: 'plate', size: 80, thickness: 25, modes: 24, irregularity: 0.3, damping: 0.6, level: -2 },
            flex: { amount: 1, freq: 18, decay: 0.7, rattle: 0.8, wobble: 0.3, tone: 0.4 },
            out: { length: 1.5 },
        },
    },
    {
        id: 'sheet-wobble', label: 'Thin steel sheet wobbled (thunder sheet)', group: 'Springs',
        patch: {
            impact: { velocity: 0.8, restitution: 0, scatter: 0, contactRadius: 30, click: 0 },
            bodyA: { ...mat('steel'), shape: 'plate', size: 70, thickness: 0.5, modes: 64, irregularity: 0.5, damping: 0.05, level: 0 },
            bodyB: { ...mat('rubber'), shape: 'block', size: 8, thickness: 4, modes: 4, irregularity: 0, damping: 1, level: -30 },
            flex: { amount: 1, freq: 4.5, decay: 2.5, rattle: 0, wobble: 1, tone: 0.1 },
            out: { length: 4, room: 0.25, roomSize: 0.6 },
        },
    },
    {
        id: 'saw-blade', label: 'Hand-saw blade flexed and flicked', group: 'Springs',
        patch: {
            impact: { velocity: 1.2, restitution: 0, scatter: 0, contactRadius: 3, click: 0.1 },
            bodyA: { ...mat('springsteel'), shape: 'plate', size: 50, thickness: 0.9, modes: 48, irregularity: 0.3, damping: 0.05, level: 0 },
            bodyB: { ...mat('rubber'), shape: 'block', size: 2, thickness: 1.5, modes: 4, irregularity: 0, damping: 1, level: -30 },
            flex: { amount: 1, freq: 7, decay: 1.5, rattle: 0, wobble: 0.6, tone: 0 },
            out: { length: 3.5, room: 0.15 },
        },
    },
];
//# sourceMappingURL=presets.js.map