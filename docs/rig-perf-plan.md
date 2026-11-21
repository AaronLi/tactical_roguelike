# Rig performance: the plan

Where it stands (seed 3 boarding level, pilot seat, 2026-11-21): `rig.update` costs about 1.65 ms a frame for 16-17 rigs, and
about three-quarters of that is three.js recomputing world matrices (`updateMatrixWorld`, `multiplyMatrices`,
`updateWorldMatrix`, `invert`: 163 of 217 ms a second). The posing itself (IK, fingers, the powered ragdoll, sampling) is about 10%.
15 of those 16 rigs are people inside the boarded ship, behind her hull. The renderer recomputes every world matrix once a frame
before drawing ('render: scene matrices', js/profiler.ts), so none of the matrices made inside `rig.update` are needed for drawing:
they're there to answer "where is this joint in the world now" partway through a solve.

## The safety net: pose parity

`tools/rig_parity_steps.mjs` drives 24 scenarios (standing, walking, crouched, aiming, leaning, reloads, a magazine check, hands
up, cowering, zip-tied, the radio, blinded, weakened, down, dead, limp, a shield, a throw, recoil, a hit, holstered, a player
aiming, prone on a bipod, reloading), each a fresh rig of a fixed seed with Math.random seeded and performance.now its own clock,
and records every object's world matrix (as drawn, and as `update` left it) and the hitboxes every third frame of 90.

    RIG_PARITY=record node tools/space_shot.mjs "mute&play&nofoes" tools/rig_parity_steps.mjs --port 8151 --gpu   (before)
    node tools/space_shot.mjs "mute&play&nofoes" tools/rig_parity_steps.mjs --port 8151 --gpu                       (after)

Unchanged code compares SAME everywhere (max difference 0); a different random seed (RIG_SEED_XOR) makes `dead` differ, its
objects listed by rig part (legR.th, armR.wr/Bone#2, gun...). Recordings are in reports/rig-parity/ (not in git): record them on
the code before each step.

- **drawn** must stay the same (to float rounding, 1e-4) after every step: it's what's seen.
- **hitboxes** must stay the same: shots are tested against them.
- **left by update** may change in step 1 (subtrees no longer refreshed); each object listed then needs no reader that takes its
  `matrixWorld` without refreshing it first. Readers outside js/rig.ts (ballistics, highlights, hud, player, views) go through
  `getWorldPosition` / `localToWorld`, which refresh their own chain; the one bare read (`views.ts` muzzle direction, from
  `rig.gun.matrixWorld`) follows a `localToWorld` of the same gun. Inside js/rig.ts the bare reads (`transformDirection(x.matrixWorld)`,
  `applyMatrix4(x.matrixWorld)`, `atW`, `W` in hitboxes) are the ones to check site by site.

## Step 1: refresh chains, not subtrees (js/rig.ts)

About 100 sites. The big ones, by the profile:
- `ragdollPose` (about 40% of rig time): `root.updateMatrixWorld(true)` at its start and its end, `hips.updateMatrixWorld(true)`,
  and four limbs through `aimBone`.
- `aimBone`: ends with `bone.updateMatrixWorld(true)`, the bone's whole subtree (an upper arm: forearm, hand, every finger, the
  gun) when the next read wants where one child starts.
- `update`: whole-rig refreshes before the leg IK and before the gun hold; `chest`, `head`, `gunMount` subtree refreshes before
  hand placement (lines ~1207, 1263, 1278, 1402, 1412, 1428, 1437).
- `gripHand`, `poseFingers`, `powerStep`'s reads.

The change at each: what's read next is refreshed (`fresh([...])`, the existing helper that refreshes each listed object's chain
once, top down, or `updateWorldMatrix(true, false)` for one), not the subtree; repeated whole-rig refreshes dropped where nothing
in between moved. The renderer's own refresh does the rest. Expect most of the ~1.2 ms of matrix work to go. Verified by the
parity harness and a profile (js/profiler.ts 'rigs: people').

## Step 2: people you can't see, posed less (js/views.ts)

A person's rig is updated every frame wherever they are. Ones that can't be seen (behind a ship's hull from outside: the same test
as js/interiorcull.ts, the line from the camera to them through her openings; out of the view's cone; past the fog) need not be
posed every frame. Options, safest first:
- posed at a lower rate (every 4th frame, with 4x the dt), caught up the frame they're seen again;
- not posed at all while hidden, their state (`rd`, phase, weights) left to settle when they're seen again.
Hitboxes are what shots are tested against (js/ballistics.ts), and they come off the pose: a shot at someone unseen (through a
wall, a ship's hull) still needs them where they are. So either keep hitboxes posed (a coarse pose: no fingers, no gun hold) or
pose a hidden rig fully the moment a shot or a hit test asks for it. To be decided with the AI/shot code in view.

## Step 3: a skeleton of its own (pure maths)

The solve run on the joints in typed arrays (positions and rotations, parent indices), the world transforms composed down the
chain as it goes, nothing of three.js touched until the end, when each bone's local rotation and position is written back once.
The rig's three.js objects become what's drawn, not what's computed with. This is the one that could move to WebAssembly (the
data's flat), though plain JS on typed arrays should be fast enough; worth deciding after step 1's numbers. Larger: the solve's
code (IK, aimBone, ragdollPose, the hand and finger posing) rewritten against the skeleton's arrays, function by function, each
checked against the parity recordings as it lands.

Order: 1, measure; 2, measure; 3 only if what's left still matters.
