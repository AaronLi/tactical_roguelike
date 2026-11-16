// Types js/course.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/course.ts.

interface CourseTarget {
  kind: CourseKind; x: number; z: number; box: number; n: number; hits: IpscHit[]; yaw: number; w: number; h: number; y0: number;
  c: HTMLCanvasElement; tex: THREE.CanvasTexture; grp: THREE.Group; solid: RangeSolid | null; hinge: THREE.Group; mat: THREE.MeshStandardMaterial; down: boolean; fall: number; vel: number;
}

// The IPSC course: the strip on the left of the shooting range (x 2..12, from the yard 28 m north, js/level.ts
// layHangar), a random stage laid out in it. A stage is three shooting boxes one behind the other, barriers to work
// round, and eight to eleven targets downrange of them: IPSC cardboard (two hits each, best two count), white
// no-shoots beside some of them, and steel poppers that fall when hit.
//   - The stage is laid from a seed every squad member shares. The REGENERATE button by the entrance (in the yard)
//     lays a new one, but only while nobody is in the course (G.Net: 'course').
//   - The START button in the first box: "standby", a random pause, the beep, and the clock runs. Every shot you
//     fire is a split; every hit is scored where it lands. The run ends when every target's done (each paper hit
//     twice, every popper down), or when you walk out of the course.
//   - The board in the yard shows the run: each target's hits, every shot's time and split, then the total, the
//     points (A 5, C 3, D 1, steel 5; a miss or a no-shoot hit -10) and the hit factor (points / seconds). Whoever's
//     shooting sends it to the others as it happens (G.Net: 'crun').
//   - Two spectator screens in the yard switch on while anyone's in the course: one behind the shooter, one looking
//     back at them from the far end.
// Coordinates are the hall's, as in js/range.ts (z negative past the hall's north wall; the yard's north edge, the
// range's firing line, is at FL).
// A target of the course: paper(q) or popper(q) give it its meshes and solid, resetTargets() its hits (and for a popper, whether it's down).
type CourseKind = 'paper' | 'steel' | 'noshoot';
