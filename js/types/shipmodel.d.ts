// Types js/shipmodel.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/shipmodel.ts.

// What the space direction draws that a level doesn't (docs/space.md): the squad's own ship (her deck as js/spacedata.ts
// boxes has it, so what's drawn is what stops you), the outside of a ship that's boarded, made from her deck plan (js/shipgen.ts:
// each compartment shows on the hull as what it is), the asteroid the base is cut into, an interspatial anchor, a planet,
// the stars, the tunnel of a jump. Boxes mostly, merged a material: a ship is one draw call a colour.
interface SmShip { group: THREE.Group; nose: THREE.Group[]; ramp: THREE.Group; turrets: { base: THREE.Group; gun: THREE.Group; muzzle: THREE.Object3D }[]; thrust: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial; screen: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture }; nav: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture }; lights: THREE.PointLight[]; seats?: THREE.MeshStandardMaterial[][] }
