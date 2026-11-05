// UI description of every parameter: one entry per slider/select, grouped into sections.
const shapeOptions = [
    { value: 'bar', label: 'Bar / rod / strip' },
    { value: 'plate', label: 'Plate / sheet / panel' },
    { value: 'shell', label: 'Shell (can, pot, box, case)' },
    { value: 'block', label: 'Solid block / chunk' },
];
function bodyControls(prefix) {
    return [
        { kind: 'select', path: `${prefix}.material`, label: 'Material', options: [], hint: 'Sets stiffness, density and loss below. Moving any of those makes it "Custom".' },
        { kind: 'range', path: `${prefix}.stiffness`, label: 'Stiffness (E)', min: 0.01, max: 250, log: true, unit: 'GPa', digits: 2, hint: 'Young\'s modulus. Raises pitch and makes contact harder and brighter. Metals 70-210, plastics 1-3.' },
        { kind: 'range', path: `${prefix}.density`, label: 'Density', min: 500, max: 12000, log: true, unit: 'kg/m³', digits: 0, hint: 'Heavier lowers pitch and makes the body harder to set ringing.' },
        { kind: 'range', path: `${prefix}.loss`, label: 'Internal loss (η)', min: 0.00005, max: 0.3, log: true, digits: 5, hint: 'How fast vibration turns to heat. Metals ring (1e-4), plastics thud (2e-2), rubber dies instantly.' },
        { kind: 'select', path: `${prefix}.shape`, label: 'Shape', options: shapeOptions, hint: 'Sets the overtone pattern: bars are sparse and clangy, plates dense and washy, shells beat, blocks barely ring.' },
        { kind: 'range', path: `${prefix}.size`, label: 'Size', min: 0.5, max: 150, log: true, unit: 'cm', digits: 1, hint: 'Longest dimension. Pitch falls with the square of size.' },
        { kind: 'range', path: `${prefix}.thickness`, label: 'Thickness', min: 0.05, max: 100, log: true, unit: 'mm', digits: 2, hint: 'Wall / sheet / bar thickness. Pitch rises in proportion. Thin = low, wobbly and loud; thick = high and solid.' },
        { kind: 'range', path: `${prefix}.damping`, label: 'Held / damped', min: 0, max: 1, step: 0.01, digits: 2, hint: '0 = hanging free, 1 = clamped, gripped or sitting on something soft.' },
        { kind: 'range', path: `${prefix}.irregularity`, label: 'Irregularity', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Dents, holes, ribs: detunes and splits modes (more clangy, less pure).' },
        { kind: 'range', path: `${prefix}.modes`, label: 'Mode budget', min: 1, max: 128, step: 1, digits: 0, hint: 'How many resonances to simulate. More = richer and slower.' },
        { kind: 'range', path: `${prefix}.level`, label: 'Level', min: -40, max: 12, step: 0.5, unit: 'dB', digits: 1, hint: 'Trim on top of the physical balance between the two bodies.' },
    ];
}
export const SECTIONS = [
    {
        id: 'impact', title: 'Impact', blurb: 'A hit or drop, with bounces.',
        controls: [
            { kind: 'range', path: 'impact.velocity', label: 'Impact speed', min: 0, max: 8, step: 0.01, unit: 'm/s', digits: 2, hint: '0 = no impact. Faster is louder and slightly brighter (shorter contact).' },
            { kind: 'range', path: 'impact.restitution', label: 'Bounciness', min: 0, max: 0.9, step: 0.01, digits: 2, hint: 'Coefficient of restitution: how much speed survives each bounce.' },
            { kind: 'range', path: 'impact.scatter', label: 'Tumble / clatter', min: 0, max: 1, step: 0.01, digits: 2, hint: '0 = a ball bouncing cleanly; 1 = an awkward object hitting end-over-end at different spots.' },
            { kind: 'range', path: 'impact.contactRadius', label: 'Contact curvature', min: 0.1, max: 60, log: true, unit: 'mm', digits: 1, hint: 'Small = a corner or edge hits; large = a flat face. Also used for snaps and rattles.' },
            { kind: 'range', path: 'impact.click', label: 'Contact click', min: 0, max: 1, step: 0.01, digits: 2, hint: 'The sharp tick radiated by the collision itself, apart from any ringing.' },
        ],
    },
    {
        id: 'friction', title: 'Slide / scrape / squeak', blurb: 'Continuous rubbing. The surface texture is read out at the sliding speed.',
        controls: [
            { kind: 'range', path: 'friction.force', label: 'Pressing force', min: 0, max: 50, step: 0.1, unit: 'N', digits: 1, hint: '0 = no sliding. Pressing harder is louder and grabbier.' },
            { kind: 'range', path: 'friction.duration', label: 'Duration', min: 0.05, max: 6, step: 0.01, unit: 's', digits: 2, hint: 'How long the bodies rub.' },
            { kind: 'range', path: 'friction.speed', label: 'Speed', min: 0.005, max: 3, log: true, unit: 'm/s', digits: 3, hint: 'Peak sliding speed. Faster raises the pitch of the texture and makes it louder.' },
            {
                kind: 'select', path: 'friction.profile', label: 'Motion', hint: 'How the speed changes over the stroke.',
                options: [
                    { value: 'steady', label: 'Steady' }, { value: 'accelerate', label: 'Speeding up' }, { value: 'decelerate', label: 'Slowing down' },
                    { value: 'swell', label: 'Swell (slow-fast-slow)' }, { value: 'backforth', label: 'Back and forth' },
                ],
            },
            { kind: 'range', path: 'friction.strokes', label: 'Strokes', min: 1, max: 12, step: 1, digits: 0, hint: 'For back-and-forth motion.' },
            { kind: 'range', path: 'friction.roughness', label: 'Roughness', min: 0.1, max: 1000, log: true, unit: 'µm', digits: 1, hint: 'Texture depth. Polished ~0.5, sanded ~10, rusty / cast ~100, teeth or ridges 300+. Slide → scrape.' },
            { kind: 'range', path: 'friction.grain', label: 'Grain / ridge spacing', min: 0.01, max: 20, log: true, unit: 'mm', digits: 2, hint: 'Size of the bumps. With high periodicity this is the tooth pitch (ratchet, zip tie, file).' },
            { kind: 'range', path: 'friction.periodicity', label: 'Periodicity', min: 0, max: 1, step: 0.01, digits: 2, hint: '0 = random grit, 1 = regular teeth that click one by one.' },
            { kind: 'range', path: 'friction.stickSlip', label: 'Stick-slip', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Grab-and-release: low = chatter / creak, high = a pitched squeal.' },
            { kind: 'range', path: 'friction.stickPitch', label: 'Stick-slip rate', min: 10, max: 4000, log: true, unit: 'Hz', digits: 0, hint: 'Squeak pitch at full speed. It follows the speed, so it drops as the motion slows.' },
            { kind: 'range', path: 'friction.contactWidth', label: 'Contact softness', min: 0.002, max: 5, log: true, unit: 'mm', digits: 3, hint: 'Size of the micro-contacts. A sharp hard edge is fine (bright); a soft broad pad smears the texture (dull).' },
        ],
    },
    {
        id: 'snap', title: 'Snap / latch / click', blurb: 'Load up, then release: catches, detents, buttons, buckles.',
        controls: [
            { kind: 'range', path: 'snap.count', label: 'Snaps', min: 0, max: 12, step: 1, digits: 0, hint: '0 = none. Several = a detent ratchet or a multi-stage latch.' },
            { kind: 'range', path: 'snap.strength', label: 'Strength', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Energy dumped by each release.' },
            { kind: 'range', path: 'snap.spacing', label: 'Spacing', min: 1, max: 800, log: true, unit: 'ms', digits: 0, hint: 'Time between successive snaps.' },
            { kind: 'range', path: 'snap.preload', label: 'Load time', min: 0, max: 800, step: 1, unit: 'ms', digits: 0, hint: 'How long the part is pushed before it gives.' },
            { kind: 'range', path: 'snap.creak', label: 'Creak while loading', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Stick-slip groan as the part is strained.' },
            { kind: 'range', path: 'snap.seat', label: 'Seat hit', min: 0, max: 1, step: 0.01, digits: 2, hint: 'The second "clack" when the released part lands on its stop.' },
            { kind: 'range', path: 'snap.seatDelay', label: 'Seat delay', min: 0.5, max: 80, log: true, unit: 'ms', digits: 1, hint: 'Travel time between release and landing.' },
        ],
    },
    { id: 'bodyA', title: 'Body A (main object)', blurb: 'The object that moves, swings or slides: its contact spot travels when sliding, and flex applies to it.', controls: bodyControls('bodyA') },
    { id: 'bodyB', title: 'Body B (the other object)', blurb: 'What A hits, lands on, or rubs against.', controls: bodyControls('bodyB') },
    {
        id: 'flex', title: 'Springy flex (swing)', blurb: 'A large, slow swing of body A: overhanging ruler, sheet metal, latch arm, door-stop spring.',
        controls: [
            { kind: 'range', path: 'flex.amount', label: 'Swing', min: 0, max: 1, step: 0.01, digits: 2, hint: '0 = rigid. Kicked by every hit or snap.' },
            { kind: 'range', path: 'flex.freq', label: 'Swing rate', min: 1, max: 600, log: true, unit: 'Hz', digits: 1, hint: 'Ruler overhang 10-40 Hz, thin sheet 2-8 Hz, latch arm / door-stop spring 100-400 Hz.' },
            { kind: 'range', path: 'flex.decay', label: 'Swing decay', min: 0.02, max: 6, log: true, unit: 's', digits: 2, hint: 'How long it keeps swinging.' },
            { kind: 'range', path: 'flex.rattle', label: 'Rattle against support', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Slaps its support every cycle: the "brrrr" of a ruler twanged on a desk.' },
            { kind: 'range', path: 'flex.wobble', label: 'Pitch wobble', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Bending changes the ring pitch: wobble board, thunder sheet, saw blade.' },
            { kind: 'range', path: 'flex.tone', label: 'Swing tone', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Hear the swing itself, when it\'s fast enough to be a note (door stop "doiing").' },
        ],
    },
    {
        id: 'coil', title: 'Coil spring', blurb: 'Waves running up and down a helical spring: they disperse into chirps that echo.',
        controls: [
            { kind: 'range', path: 'coil.level', label: 'Coil level', min: 0, max: 1, step: 0.01, digits: 2, hint: '0 = no coil spring.' },
            { kind: 'range', path: 'coil.length', label: 'Spring length', min: 1, max: 300, log: true, unit: 'ms', digits: 1, hint: 'Round-trip travel time: short pen spring ~3 ms, door stop ~10 ms, slinky / spring reverb 50-150 ms.' },
            { kind: 'range', path: 'coil.dispersion', label: 'Dispersion (zing)', min: 0, max: 1, step: 0.01, digits: 2, hint: '0 = plain echo, 1 = strong "pew" chirps.' },
            { kind: 'range', path: 'coil.decay', label: 'Coil decay', min: 0.03, max: 8, log: true, unit: 's', digits: 2, hint: 'How long the echoes last.' },
            { kind: 'range', path: 'coil.brightness', label: 'Brightness', min: 300, max: 16000, log: true, unit: 'Hz', digits: 0, hint: 'Losses at high frequency inside the coil.' },
        ],
    },
    {
        id: 'out', title: 'Output', blurb: 'Space, length and randomness.',
        controls: [
            { kind: 'range', path: 'out.room', label: 'Room', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Dry to roomy.' },
            { kind: 'range', path: 'out.roomSize', label: 'Room size', min: 0, max: 1, step: 0.01, digits: 2, hint: 'Closet to hall.' },
            { kind: 'range', path: 'out.length', label: 'Max length', min: 0.2, max: 10, step: 0.1, unit: 's', digits: 1, hint: 'Render length; trailing silence is trimmed.' },
            { kind: 'range', path: 'out.seed', label: 'Seed', min: 1, max: 9999, step: 1, digits: 0, hint: 'Changes contact spots, bounce timing, texture and mode detuning. "Vary" picks a new one.' },
        ],
    },
];
//# sourceMappingURL=schema.js.map