# New weapon checklist

Work through it top to bottom. Every box is something that has broken before or is easy to forget. Test with
the game muted (`G.Game.setMuted(true)`) unless you're checking sound.

## 1. Stats: `js/data.js`

- [ ] **`W({...})` entry in `G.WEAPON_LIST`**, with these fields:
  - `id`: short, unique, used everywhere
  - `slot`: `'p'` primary or `'s'` sidearm
  - `cls`: class (AR, BR, SMG, PST, SG, DMR, SNP, LMG, GL, BOW, RAIL)
  - `tier`: 1–4
  - `price`, `name`, `desc`
  - Rounds: `rpm`, `mode` (`auto`/`semi`/`burst`/`hyper`), `mag`, `reserve`, `reload`
  - Handling: `spread`, `ads`, `recoil`, `range`, `zoom`, `speed`, `falloff`, `pen`
- [ ] **Special flags, if they apply:**
  - `pellets` + `choke` (shotguns: pattern half-angle, separate from aim error)
  - `shell: true` (loads a round at a time: tube, cylinder, lever, bolt with no detachable magazine)
  - `enbloc` (pings when empty, reload only when empty)
  - `integral` (built-in suppressor: subsonic, quiet)
  - `akimbo` (no ADS)
  - `explosive: { r, dmg }` (launchers)
  - `aimTime` (marksman-style aimed shots, for enemy use)
  - `burst` / `hyper` + `hyperRpm`
- [ ] **Fire selector:** a select-fire gun gets `['semi', <its mode>]` automatically (it starts on semi). If it
  has no semi (a cheap open-bolt gun, a belt-fed), add its id to `G.AUTO_ONLY`. For a different set or
  order, give it an entry in `G.FIRE_MODES`. Check X cycles it and the HUD shows the mode.
- [ ] **`GS(...)` entry in `G.GUN_SPECS`** (barrel inches, caliber, muzzle device, pressure, grain, bullet
  weight, bolt mass/loudness, action, case material/length, shot count). This drives:
  - the synthesized gunshot (`js/gunshot-synth.js`)
  - the caliber (`G.calOf`)
  - the casings
  - the muzzle velocity (supersonic crack or subsonic zip)
- [ ] **Caliber exists in `G.CALIBERS`** (name, group `rifle`/`pistol`/`shotgun`/…, `box` size, `per`
  price). New calibers also need:
  - `G.MUZZLE_V[cal] = [velocity m/s, reference barrel in, drag length m]`
  - its group's ammo types in `G.AMMO_TYPES` (and `G.AMMO_RARITY` if the group is new)
- [ ] **Supersonic or not:** `G.roundSpeed(def, 'ball', 5)` above 343 m/s cracks past you, below zips.
  Subsonic loads and `integral` guns are capped at 310.
- [ ] **Enemy use (optional):** add the id to a pool in `G.ENEMY_GEAR.weapons` (type → tier 1–4 lists).
  Enemies then carry its real magazine and reload time (`js/server.js` `startReload`), so check `mag` and
  `reload` are sensible for an AI.

## 2. Platform, parts and attachments: `js/parts.js`

- [ ] **`P(id, archetype, spec, slots)` platform**, or `pst(...)` for pistols:
  - **Archetype:** `rifle`, `revolver`, `derringer`, `launcher`, `minigun`, `railgun`, `crossbow`, …
  - **`spec`** (the receiver and its model options):
    - `rcv` (`ar`/`ak`/`box`/`round`/`bullpup`/`break`), `L`, `H`, `W`
    - `rm`/`fm` (materials)
    - `optF` (where an optic sits)
    - `carry` (handle position) + `carrySide` if it folds to the side
    - `feed`, `bipod`, `pump`/`bolt`/`lever`
- [ ] **Slots:**
  - `barrel` (`len`; `integral` for built-in cans)
  - `thread` (muzzle interface)
  - `muzzle`, `handguard` (`[family, { t, len, m }]`), `stock`, `grip`
  - `mag` (`{ t: straight/curved/drum/…, len, d, w }`)
  - `optic` (`[family, { optic: 'irons'|'notch'|'bead'|…, irons: 'ar'|'ak'|'hk'|'buckhorn' }]`)
  - `fg`, `tac`
- [ ] **Factory sights:** everything leaves the factory with irons except SNP/RAIL (scoped). Check the
  default with `G.Gunsmith.defaultBuild(id)`.
- [ ] **Magazine variants** (compact/extended/drum) show in the Magazines section, not as attachments: the
  platform's `magVariants` is set automatically for detachable magazines. Check `visibleSlots` hides `mag`.
- [ ] **Shared magazines:** if the real gun takes a common pattern's magazines (STANAG, MP5, AK), add it to
  `G.MAG_FAMILY` (`js/data.js`). Its platform then uses the pattern's magazines (`parts.js` `MAG_FAMS`)
  instead of making its own, and its default is the one matching `def.mag`. Check `G.magFits` both ways
  with another gun of the pattern, and that its magazine still sits in the well (the pattern's model
  is used, not the gun's `mag`). A new pattern needs an entry in `MAG_FAMS` (capacities, model, brand).
- [ ] **Conversions:** if it's the same core as another gun with a different kit (a 9mm AR, an RPK), add it to
  a group in `parts.js` `RCV` (brand, kit name, price, tier, description). Both guns get a required Receiver
  group slot. Check `G.Gunsmith.convert` both ways: everything stays on, core parts made for the other gun
  show as not fitting (it won't fire), the gunsmith sells the right ones, `convParts` lists what a case kit
  needs, and a magazine of the wrong pattern comes out.
- [ ] **Optional fittings:** machine pistols can join `PSTOCK` (a pistol stock lug), tube shotguns `SGLOAD`
  (side saddle and speed loaders).
- [ ] **Required slots:** removing a core part (barrel, receiver bits) must make it "WON'T FIRE"
  (`def.missing`).
- [ ] **Compile check:** `G.Gunsmith.compile(id, G.Gunsmith.defaultBuild(id))` returns a def with
  `soundKey`, `code`, a magazine capacity, and no NaN stats.

## 3. Model and sights: `js/gunmodels.js`

To rebuild a gun from photographs, use the `rework-gun` skill (`.claude/skills/rework-gun/SKILL.md`); `docs/gun-reworks.md` logs what's been done.

- [ ] It builds without errors in both the world model (`G.GunModels.world(code)`) and the viewmodel. Check
  the console.
- [ ] Proportions look right next to the officer's hands: grip under the hand (`grip`), support hand on the
  handguard (`support`), magazine in the well (`magAt`).
- [ ] **Sight quality (ADS)**, every default sight, then each optic you expect people to fit:
  - [ ] **Line of sight clear:** nothing between the eye and the target, including:
    - carry handles (keep them under `top + 0.03`, or `carrySide`)
    - feed covers
    - rails
    - optic housings (a red dot's front must be a frame round the lens, never a solid plate)
    - scope bells
  - [ ] **Irons:** the front post sits centred in the rear aperture or notch. The tops of the front post
    and rear notch are level with `sy`.
  - [ ] **Shotgun bead:** the bead sits on the rib at the far end, with the barrel(s) below and the receiver
    not hiding it.
  - [ ] **Reflex sights:** the dot shows through the window (stencil mask `k.reflex`), and the window isn't
    covered by the housing.
  - [ ] **Magnified sights:** the picture-in-picture is live and the reticle is centred. The eyebox crescent
    appears off-axis.
  - [ ] `relief` (eye distance) puts the sight at a natural distance: not clipping the camera, not tiny.
  - [ ] **Variable scopes and magnifiers:** with an LPVO, scroll while aiming steps every power and the picture
    changes; with a red dot plus a magnifier, the magnifier flips in (dot centred in the picture) and swings
    clear of the view at 1×.
  - [ ] **No pistol grip** (`gripT: 'none'`): the stock is the wrist, so it must show in first person.
  - [ ] **Lights and lasers:** with a light and a laser on the side rail, the back / forward mouse buttons
    switch them; the dot lands where rounds go.
  - [ ] Quick test in a level:
    ```js
    const M = G.Me; M.weapons.p = M.makeWeapon('ID'); M.mouse.r = false; M.swap('p');
    for (let i = 0; i < 60; i++) M.update(0.05); M.mouse.r = true; for (let i = 0; i < 40; i++) M.update(0.05);
    ```
    then screenshot. Front the browser tab first, or the frame may be stale.
- [ ] **Recoil looks right:** the camera takes most of the kick (`RECOIL.VIEW`), the gun rotates a little,
  and it doesn't clip the camera at full auto.
- [ ] **Animations:**
  - slide/bolt cycles (`anim.slide`, `anim.bolt`, pump/lever)
  - cylinder turns (revolvers: `cylAt`; `chambers` in the platform's spec if it doesn't hold 6, matching the gun's `mag`)
  - feed cover lifts (belt-fed)
  - the magazine leaves and returns on reload
- [ ] **Muzzle flash** position matches the muzzle (`muzzles`), including with suppressors, brakes and short
  or long barrels.

## 4. Sound

- [ ] **Gunshot:** `GUN_SPECS` gives it a synthesized shot. Check it has a `soundKey`, that
  `G.GunAudio.buildDry(def.soundKey)` succeeds, and that the level prewarm includes it (`game.js` `enemyGuns`
  for enemy guns). Weapons without a spec fall back to `G.CLASS_SND[cls]`.
- [ ] **Suppressed/integral:** much quieter, and the device is `suppressor`. Enemies hear it at a shorter
  range.
- [ ] **Reload foley:**
  - magazine guns use the samples (`pull_magazine`, `insert_magazine`, `rack_slide`/`drop_slide`)
  - shell-fed guns play one insert per round
  - en-bloc guns ping when empty
- [ ] **Casings:** `js/casings.js` `mode(def)`:
  - `shot`: ejected per shot
  - `cycle`: on the pump, bolt or lever stroke
  - `reload`: dumped on reload (revolvers, break-actions)
  - `null`: none
  Check the case material and length from `GUN_SPECS`.
- [ ] **Flyby:** a round past your head cracks if supersonic, zips if not. Fire it as an enemy near the
  camera: `G.Audio.flyby(from, to, def, am)`.

## 5. Ammo, magazines and inventory

- [ ] **Magazine item:**
  - draws an icon (`js/icons.js`: style by gun or variant; drums detected)
  - its size fits a rifle pouch (1×2) or pistol slot (1×1) as intended
  - loads from boxes of its caliber
- [ ] **Shell-fed guns:** load from boxes round by round (field job timing in `invui.js` `PER`). A
  part-loaded tube can fire.
- [ ] **Mixed rounds:** loading two ammo types fires them in order. HUD and tile show `+MIX`.
- [ ] **Dropping it in your inventory:**
  - the gun icon renders from the model (`gunImage`)
  - it stows in a big enough backpack (`G.Gear.gunSize`)
  - it opens to show its parts
- [ ] **Weapon case:** if it's a primary or sidearm at a case tier, it can roll there (`CASE_RARITY`). It
  comes with two spare loaded magazines and an ammo type rolled by rarity.
- [ ] **Shop:**
  - its magazines can appear in stock (`shop.js` `mags`: about half standard, half variants)
  - its parts appear at the gunsmith (`rollStock`)

## 6. Behaviour in play

- [ ] **Hip and ADS spread** feel right. Shotgun patterns stay sensible: 25–90 cm at 10 m. Slugs fly as one
  projectile with twice the range.
- [ ] **Damage, penetration and armour:** check it against vests and plates (`G.armorStop`). AP rounds beat
  steel; buckshot doesn't beat rifle plates.
- [ ] **Reload modes:**
  - R is a retention reload (slower)
  - R R is a dump reload (to the dump pouch or the floor)
  - partial magazines are picked by rounds, then inventory order
- [ ] **Empty gun:** dry click only, no auto reload.
- [ ] **Enemy with it:**
  - fires bursts with its `rof`/`burst`
  - reloads after `mag` rounds (shell by shell if `shell`)
  - drops it as evidence
  - tracers and flyby come from their muzzle

## 7. Wrap up

- [ ] README: add it to the weapons list or table (and any new mechanic).
- [ ] Console clean in a level with it fired, reloaded, dropped, picked up and opened in the inventory.
- [ ] Multiplayer: a teammate sees its model, hears its shot, and gets its tracers (`remoteShot` uses
  `w: def.code` and `am`).
