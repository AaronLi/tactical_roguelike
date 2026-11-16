// Types js/shotlog.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/shotlog.ts.

interface ShotPath { p: number[][]; ev: ShotEv[]; hit: ShotHit[]; }

interface ShotGhost extends THREE.Group { mat: THREE.Material; uses: number; }

// Breach Protocol: F9's record of the shots that hit someone (js/player.ts roundDone, and the squad's through the host), and of
// the fragments of your grenades and of suspects' grenades thrown at you (js/player.ts fragDone: one shot a grenade).
// A round's path is kept whether F9's on or not (js/player.ts newPath), so this works for a shot fired before you pressed it:
// each one that hit someone leaves, for the level (the last MAX of them), a ghost of whoever it hit as they stood when it
// struck, the whole of its trail, coloured by speed as the trails are (js/render.ts trailColour), and markers on it: its speed
// at the muzzle, where it crossed each Mach number, what it went through or off, how fast it went in, how fast it was past
// their armour, how fast it came out or where it stopped, and the track of each fragment and splinter it threw off inside them.
// A thermobaric's burst (js/player.ts tbModel) is kept too, as the volume it filled: every cell of floor its fireball reached as a glowing
// column floor to ceiling, the rest of the space its pressure filled as tiles on the floor, and what it came to (how big, how closed,
// the pressure it held, what it did to each suspect): shown whenever F9 is (keepFill).
// All of it's only for whoever you've picked out with the crosshair, who stays picked when you look away (js/hud.ts debugTarget:
// hbLast): nobody else's shows, and with nobody picked out it's the shots that hit you.
// A round's finished path (js/player.ts newPath): p the points [x, y, z, speed], ev the events [point, 'e' | 'x' | 'r', ...],
// hit the hits (each a row of numbers and sub-arrays, indexed as the readout below does).
type ShotEv = any[]; // [point, 'e' | 'x' | 'r', fx, nx, ny, nz, material name, ...]: a row of mixed numbers and strings

type ShotHit = any[]; // [point, key, speed in, [kg], dx, dy, dz, passed through, armour (ShotArmour), [depth, what] it stopped in, fragments]
