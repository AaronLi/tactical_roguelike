# Reload mocap

`mocap.html` is a tool page, not part of the game: you mime a reload at one ordinary camera, and it times your support hand
from the handguard to the magazine, the chest rig, the charging handle and back, beside the game's own reload clip for the
same gun. It is for animating: what a real reload's beats are, against what `js/vmanim.ts` plays.

It has two views. **Camera**: the camera's picture with the game's character (an officer in a chest rig) laid on your body,
the gun in its grip hand and the zones. **First person**: the same scene out of the character's eyes, placed and turned by
your head, with a white point at the middle of the view and a red laser down the gun's bore; the red ring is where the
bore points, and the corner says how far that is from the middle of the view.

```bash
npm run build        # once: the page loads the compiled game and the baked gun models
npm run dev          # then http://localhost:8080/mocap.html
```

`/mocap.html?demo` plays a made-up reload with no camera (and `&gun=ak` picks the gun): the place to see what the page
does. A camera needs `localhost` or https. The pose and hand models (MediaPipe's, about 20 MB) come from
cdn.jsdelivr.net and storage.googleapis.com the first time a camera or a video is used; nothing is installed.

## Using it

1. Pick the gun. **Start camera** (or **Open video or take…** for a recording of a reload, yours or anyone's).
2. Stand so the camera sees you from the waist up, turned a little so your support hand's side is toward it. Hold your
   grip hand as if on the pistol grip: the gun is drawn in it, turned as the hand is. Rest your support hand on the
   handguard (the green zone).
3. Reload. A take starts as the support hand leaves the handguard and ends when it has been back for a third of a second.
   **Space** starts and ends one by hand instead (a reload that doesn't begin on the handguard).
4. Read the timeline: your beats over the game's, on one scale of seconds, and in the table as times and as fractions of
   the whole. **Play** runs a take again; **Save** writes it as JSON; a saved take opens with **Open video or take…**.

**Grabs.** Each hand's curl is read from its fingers (0 flat, 1 a fist: the bars under the zones); the support hand closed
past 0.55 is a grab, until it opens past 0.38. The magazine leaves the gun only with a hand that closed on it at the
magazine and left closed; it is stowed where the hand opens at the rig or the belt, a fresh one is taken where it closes
there, and it seats as a hand holding one comes back to the well. The charging handle (or bolt handle) is drawn back as
far as a closed hand draws it. Each beat records when the hand closed and opened in it (the white marks on the timeline,
the Hand column, `grab` and `release` in a take file). **Grabs need a closed hand** off: all of that by the zones alone.

| Control | |
| --- | --- |
| Lock to chest (`L`) | The gun stays where it is against your chest instead of following the grip hand: for when the grip hand has to leave it (an AK's handle worked with the right hand), or its tracking wanders. **Shouldered** puts it at the shoulder as the game's first person holds it. It is held this way by itself whenever the grip hand is lost. |
| Character, Overlay opacity | The character on or off; how solid everything drawn over the camera's picture is (lower, to see yourself through it). |
| Bore laser | The laser and its ring. |
| First-person FOV, Look down | That view's horizontal field of view, and its gaze tipped down from where your head faces. A level gaze sees a shouldered gun, as the game's does; hands at the chest or the belt are far below it (55-65 shows them). |
| Left-handed | The grip hand is the left; the zones on the body swap sides. |
| Zones: Size, Depth counts | How big the zones are, and how much a distance toward or away from the camera counts (0.5: a zone reaches twice as far along the camera's ray as across the picture; depth is what one camera guesses). |
| Game's reload | Which of the game's magazine changes is laid beside yours: dropped, retained, to the dump pouch; run dry adds the action after it. Its hand path is the amber line on the gun. |
| Field of view | Your camera's horizontal field of view. Wrong, and everything is nearer or further than drawn, together: the zones still work. |
| Hands' depth from the body | On: each hand's distance is the body's wrist's. Off: from the hand's own apparent size (set **Hand size** to yours). |
| Grip pitch, yaw | The gun turned in the grip hand: pitch for the grip's rake against your knuckles, yaw to trim the muzzle left or right. |

## What comes out

- **Beats**: each stop of the support hand, by zone, in and out, as seconds from the take's start and as fractions of it;
  the game's the same; and how many points of the whole earlier or later yours starts.
- **Keys**: the hand's path in the gun's space (x right, y up, z back), reduced to its corners and written as the keys of
  `path()` in `js/vmanim.ts`: `[0.14, WB], [0.22, off(WB, 0, -0.07)], [0.36, A.P], …` (`off(p, forward, up, right)`, metres;
  `A.S` the handguard, `WB` the magazine's bottom, `A.P` the pouch, here the chest rig, `A.ch` / `A.H` / `A.slide` the action).
  They are a starting point to paste and tidy, not a finished clip: the fractions are of your take, the offsets carry the
  tracking's few centimetres of error.
- **A take file** (Save): the beats, the keys, the path sampled (`[t, x, y, z, zone]`), the game's beats, the settings, and
  every frame the landmark models gave (`raw`), which is what plays back. Loading one runs its frames through the page
  again, so the zones and settings of the day apply.

## How it works

- **Where things are** (`js/mocapmath.ts` `solveT`). The landmark models give each hand's 21 points and the body's 33 twice:
  on the picture, and in metres about their own centre (the right shape and size, no place). One translation puts the
  second onto the first through a pinhole camera: three unknowns, two linear equations a point. That is the monocular
  depth. A hand's own (from its apparent size) is smooth but biased by a quarter either way as the hand turns, so by
  default each hand is slid along the camera's ray to the depth of the body's wrist, followed with a quarter-second lag.
- **The gun** is the game's own model (`GunModels.display`), with its anchors (`GunRig.bind`: the same the first-person
  hands go to). It sits in the grip hand by the palm's frame: its right is the back of the hand, its up the knuckles' line.
- **The character** is the game's own (`Rig.create`), posed by `Rig.poseAt` (added for this): its skeleton laid on the
  body's points as a ragdoll's is, moved so its shoulders are on yours, each arm then solved to put its palm on yours,
  turned as yours and closed as far. It keeps its own proportions, so it is your pose, not your outline.
- **The first-person view** is at the midpoint of the eyes; the ears give the head's left and right and the eyes its
  front. It is drawn with the character's head left out. Its floor assumes the real camera is held level.
- **The zones** are capsules: on the gun from its anchors (the handguard, the lower half of the magazine and below it, the
  charging handle or bolt handle or slide), on the body from the shoulders and hips (the chest rig across the lower chest,
  a belt pouch on the support side). The support hand's palm is in a zone inside its radius, stays until 1.3 radii out,
  and a change counts once it has lasted 60 ms; a zone crossed in under a tenth of a second is not a beat.
- **The game's side** is the clip itself, not numbers copied from it: `VMAnim.reloadPose` and `VMAnim.actPose` (added for
  this) are sampled 240 times with the durations `js/player.ts` gives the reload, and the hand's path goes through the same
  zones as yours. Change the clip and the page's comparison changes with it. Guns not reloaded by magazine (shotguns,
  revolvers, belts) have zones but no clip to compare.

`npm run test:mocap` checks the reckoning in node (`tools/mocap.test.mjs`).

## Limits

- One camera: depth is the weak axis. A hand that passes between the camera and another zone on its way can be read as in
  it; turning your support side to the camera spreads the zones out across the picture, where it sees well.
- The models lose a hand that is hidden (behind the other, behind your body, out of the picture). A lost hand is where it
  was for 0.3 s, then nowhere.
- An empty hand is not a rifle: there is nothing to stop your hand at the magazine well, so beats are a few centimetres
  and a few hundredths of a second loose. Holding something gun-shaped helps your hands; it can hide them from the camera.
- Only the support hand is timed. The grip hand places the gun.
- The head's turn comes from five points on the face: steady to a few degrees, no better. Read the bore's offset as a
  guide, not a zero.
- A hand seen edge-on or half hidden reads more closed or more open than it is; a grab can be missed or made up there.
