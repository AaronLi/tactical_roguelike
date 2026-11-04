# glTF gun models

The guns are built procedurally (`js/gunmodels.ts`). This pipeline bakes them to `.glb` files and loads those back, behind a flag, so that (later) models can be made in Blender or assembled from per-part packs. First milestone: whole default guns, `display()` only.

## Commands

| | |
| --- | --- |
| `npm install` | installs three@0.149.0 (exporter, node only), gltf-transform and meshoptimizer (dev dependencies) |
| `npm run bake:models` | `tsc`, then bakes every platform's default build to `assets/models/guns/<id>.glb` + `index.json`, validates each against the contract, and writes `assets/vendor/three-global.js` |
| `node tools/bake_models.mjs m4 g19` | bakes just those guns; `--check` lists the bakes that are stale against the current code |
| `npm run check:models -- <file.glb ...>` | validates hand-made or edited models and prints what is missing or wrong |
| `npm run check:models -- --write` | regenerates `docs/gun-model-info.schema.json` and the contract tables below |
| `npm run test:models` | `tsc` + `check:models --selftest`: schema and docs are current, the material names are the game's catalogue, every baked gun passes |

`assets/models/` is git-ignored for now: bake locally.

## The flags

- `?bakedGuns`: `G.Models.displayBaked(def, skin)` (js/glb.ts, called first thing in `G.GunModels.display`) returns the baked model for a gun's **default build**, else `null` and the procedural one is built. Clones the cached glTF scene, puts the catalogue's material back by name (so the shared materials and the stipple/chequer bump maps are the game's own), rebuilds `info.anim` node references from node names and applies stickers. All 79 are preloaded in the background once the loader is up (`G.Models.preload(ids)`; `G.Models.loaded(id)`).
- `?checkModels`: validates each model in the browser as it loads (console errors and warnings).
- `index.html` has an importmap mapping `three` to `assets/vendor/three-global.js`, a generated shim re-exporting the page's global `THREE` (the CDN's r149), so the ES-module `GLTFLoader` builds the game's own classes (two copies of three break `instanceof`). A module script loads `GLTFLoader` and the meshopt decoder from jsDelivr and exposes `G.GLB = { ready, load(url) }` (cached). Classic scripts never need it at parse time.

## Layers: geometry, rig, first-person extras

A gun model is three separate things, each working on the model (nodes + extras), not on how it was made:

| layer | where | what it does |
| --- | --- | --- |
| geometry | `js/gunmodels.ts` recipes, or a `.glb` (`js/glb.ts`) | slot-tagged meshes, `part_<key>` nodes with their pivots, `info` |
| rig | `js/gunrig.ts` | `G.GunRig.bind(group, info, { def, side })`: finds the moving parts (`info.anim`: nodes, or the node names of a loaded file), the hand anchors in the gun's space, where the parts rest, the magazine-check data. `js/vmanim.ts` (the clips) reads nothing else off the gun |
| first-person extras | `js/viewmodel.ts` | `G.Viewmodel.assemble(def, models)`: a reflex sight's reticle (`info.reflex`), a scope's lens (`info.pip`), muzzle flashes (one per `info.muzzles`), `display_<name>` surfaces (a CanvasTexture each: `G.Viewmodel.surfaces(group)`), then the rig and arms. And `worldProto` / `worldInstance`: the third-person model, merged one mesh per material, with the magazine, a crossbow's bolt and strings and a bipod's legs pulled out |

`G.GunModels.viewmodel(def)` / `world(def)` only fetch geometry and hand it over. `world()` takes the baked model with `?bakedGuns` (a default build, loaded, no bipod: the bipod's legs are not parts of a baked model yet), else the recipe's. `viewmodel()` is built from the recipes in both cases: the first-person build leaves the stock off, which the baked (display) model doesn't, and a baked model doesn't carry `info.reflex` / `info.pip` yet. A model that has them goes straight to `G.Viewmodel.assemble`.

`bake_models.mjs` calls `G.GunRig.describe(group)` first: a recipe's magazine-check data is meshes held by reference, which a file can't carry, so it is written down as tags on the nodes (see "Magazine check" in the contract).

## The contract

**The contract is code**: `GUN_MODEL_CONTRACT` and `INFO_FIELDS` in `js/glb.ts`. Everything else is generated from it, or checked against it:

- `validate()` (the same function in node and the browser; it works on a plain description of the node tree, `describeGltfJson` for a `.glb`'s JSON, `describeScene` for a loaded scene) is used by the baker, by `check:models`, and by `?checkModels`;
- `docs/gun-model-info.schema.json` is the JSON Schema (draft 2020-12) of the root `extras.info`, for a loader or exporter written in anything else (a Rust/Bevy loader can read this plus the tables below without reading TypeScript). It is generated, and `test:models` fails when it differs from `INFO_FIELDS`;
- the tables below are generated between the markers (`check:models -- --write`), and `test:models` fails when they drift;
- the TypeScript interface `GunModelInfo` and `INFO_FIELDS` are tied by a mapped type: a field in one and not the other does not compile; the material list is compared with `G.GunModels.M` by `test:models`.

### An example node tree (an M4, abridged)

```
scene
└─ m4                         extras { gun: "m4", info: { sy, fSight, relief, muzzles: [[0.595,0,0]], grip, support, anim: { mag: "part_mag", ch: "part_ch" }, magAt, ... } }
   ├─ base_1 ... base_80      meshes, extras { slot: "base" }, material "black" / "polymer" / ...
   ├─ grip_81 ...             meshes, extras { slot: "grip" }, material "stipple"
   ├─ part_ch                 extras { part: "ch" }: the charging handle, pivot at its node origin
   │   └─ charging_90         extras { slot: "charging" }
   ├─ part_mag                extras { part: "mag" }: the magazine, drops out on a reload
   │   └─ mag_91 ...          extras { slot: "mag" }
   └─ optic_100 ...           extras { slot: "optic" }
```

### Display surfaces and part-provided anchors, in short

A mesh `display_ammo` (extras `{ slot, display: { width: 128, height: 32 } }`, **with UVs**) is a surface the game paints with a CanvasTexture; its material is left alone by the loader. A `part_<key>` node (or the root of a per-part pack) may carry `extras.anchors` (`{ muzzles: [...], mount_muzzle: [...] }`) in its own frame; assembly moves them into the gun's frame and merges them into `info`: `muzzles` is the concatenation of every providing part's list (a barrel block provides N), a frame's `mount_<slot>` lands in `info.mounts`, any other anchor is overridden by the later provider. `muzzles` may have several entries: consumers must never assume `[0]` is the only one. The full rules are in the tables.

### The contract, generated

<!-- contract:begin (generated by npm run check:models -- --write: edit js/glb.ts, not this) -->
**Frame.** Metres. The glTF frame (x = right, y = up, z = -forward) with the origin at the gun's own origin (the point the recipe builds around: roughly the back of the receiver on the bore line). Every anchor in `info` is written [forward, up, right] = [-z, y, x]; a node's transform is in the same frame, so a part is built "in place" and its node origin is only its pivot.

**Node tree.**

- root: The scene has exactly ONE root node, named after the gun id (e.g. "m4"). Its extras are { info: <GunModelInfo>, gun: <the same id> }. It has no transform.
- meshes: Every mesh node is named "<slot>_<n>" (n unique in the file), has extras.slot = a SLOTS value, and one material from the catalogue. Meshes sit directly under the root, or inside a part_ / group_ node; the baker welds and quantises but never joins meshes.
- parts: Every animated sub-assembly is a node "part_<key>" (a PARTS key) with extras.part = <key>, holding its meshes; its origin is the pivot (hinge or slide point). Each is listed in info.anim.<key> by node name; a part_ node that isn't listed, or a listed one that's missing, is an error.
- groups: Any other grouping node is named "group_<n>".

**Slots** (mesh extras.slot):

| slot | meaning |
| --- | --- |
| `base` (required) | The receiver / frame and everything fixed: what no part of the build replaces. |
| `grip` | The pistol grip (or a pistol's grip panels). |
| `stock` | The stock, brace or buffer tube behind the receiver. |
| `mag` | The magazine (and its follower/rounds): meshes of the slot whose node is also part_mag. |
| `barrel` | The barrel and its fixed fittings. |
| `handguard` | The handguard / forend, with its rails. |
| `muzzle` | A muzzle device or suppressor. |
| `optic` | A sight: scope, reflex, irons riser. |
| `slide` | A pistol slide (the node part_slide moves it). |
| `charging` | A charging handle. |
| `tube` | A shotgun's magazine tube. |
| `limbs` | A crossbow's limbs. |
| `fg` | A foregrip. |
| `pump` | A pump's forend. |
| `cap` | A cap on the tube or barrel end. |
| `motor` | A rotary gun's motor housing. |

**Animated parts** (`part_<key>`, listed in `info.anim`):

| key | meaning | paired info field |
| --- | --- | --- |
| `part_mag` | The magazine: drops out and swaps on a reload. | `info.magAt` (present exactly when the part is) |
| `part_slide` | A pistol slide: cycles with each shot. | `info.slide` (present exactly when the part is) |
| `part_bolt` | An exposed bolt / carrier. |  |
| `part_ch` | A charging handle. |  |
| `part_handle` | A cocking handle that reciprocates or is worked by the hand. | `info.handle` (present exactly when the part is) |
| `part_pump` | A pump-action forend. |  |
| `part_lever` | A lever-action lever. |  |
| `part_cyl` | A revolver cylinder: it rotates (z) by 1/n per shot. |  |
| `part_brk` | A break-action barrel group that tips open on its hinge. |  |
| `part_barrel` | A long-recoil barrel (runs back by info.recoilBarrel). |  |
| `part_cover` | A belt-fed gun's feed cover. |  |
| `part_spin` | A rotary barrel group that spins. |  |
| `part_bipod` | Reserved: a bipod's legs. |  |
| `part_quarrel` | A crossbow bolt, the whole assembly. |  |
| `part_quarrelHead` | The crossbow bolt's head. |  |
| `part_quarrelNock` | The crossbow bolt's nock. |  |
| `part_stringCocked` | The crossbow string, drawn. |  |
| `part_stringSlack` | The crossbow string, released. |  |

**`info` fields** (root node extras):

| field | required | type | meaning |
| --- | --- | --- | --- |
| `sy` | yes | number | Height of the line of sight above the origin, metres up: where the sight picture sits. |
| `fSight` | yes | number | Forward position of the front sight (or the sight's front), metres: with sy and relief it places the aiming eye. |
| `relief` | yes | number | Eye relief, metres: how far behind the sight the eye sits when aiming. |
| `muzzles` | yes | list | Where the bullet leaves, one [forward, up, right] metres entry per barrel (usually one; an over/under has two, a barrel block more): never assume [0] is the only one. The flash, tracers and shot start here. A part may provide them (GUN_MODEL_CONTRACT.anchors). |
| `grip` | yes | [forward, up, right] m | Where the firing hand's palm sits on the grip, [forward, up, right] metres. |
| `support` | yes | [forward, up, right] m | Where the support hand takes the gun (handguard, foregrip, magazine), [forward, up, right] metres. |
| `anim` | yes | object | Animated parts: key (a PARTS value) -> the NAME of its `part_<key>` node. Rebuilt into live node references at load. |
| `magAt` | no | [forward, up] m | Where the magazine seats: [forward, up] metres of its top/centre in the well. Present exactly when the model has a part_mag. |
| `handle` | no | object | The cocking handle, when there is one (part_handle). |
| `port` | no | [forward, up, right] m | The ejection port, [forward, up, right] metres: where spent cases leave. |
| `chamberAt` | no | object (by `side`) | Where a round shows in the chamber, as `side` says (a tagged union). |
| `breech` | no | object | A tipping breech (the Thor): where it sits once open. |
| `ch` | no | [forward, up, right] m | The charging handle's grab point, [forward, up, right] metres. |
| `bolt` | no | [forward, up, right] m | The bolt's rear, where the hand pulls it, [forward, up, right] metres. |
| `cheek` | no | number | A bullpup: the forward position (metres) the eye rests at when aiming, whatever sight is on the rail. |
| `recoilBarrel` | no | number | A long-recoil barrel: how far it runs back each shot, metres (0 or absent: none). |
| `pistol` | no | boolean | True for a handgun: the hands, the ADS and the holster use the pistol pose. |
| `slide` | no | [forward, up, right] m | A pistol slide's grab point, [forward, up, right] metres. Present exactly when the model has a part_slide. |
| `cylAt` | no | [forward, up, right] m | A revolver cylinder's centre, [forward, up, right] metres. |
| `load` | no | object | A break-open gun: where the open breeches are and the angle the barrels tip to. |
| `cup` | no | [forward, up, right] m | Where the left hand cups the frame (a derringer), [forward, up, right] metres. |
| `magTop` | no | boolean | True when the hand takes the magazine from its top instead of its base. |
| `quarrelMats` | no | object | A crossbow's bolt materials as three.js Material JSON (free-form; viewmodel only). |
| `mounts` | no | object | Mount points where a swappable part sits, `mount_<slot>` -> [forward, up, right] metres of the part's origin (e.g. mount_muzzle: where a muzzle device screws on). Normally assembled from the parts' anchors (see GUN_MODEL_CONTRACT.anchors); a whole-gun bake may list them directly. |
| `reflex` | no | object | A reflex or holographic sight's window (js/viewmodel.ts): the game draws a collimated reticle behind it, masked to it. f, y: the window's centre, [forward, up] metres; w, h: its size, metres (round: a disc of diameter w); kind: the reticle drawn: dot, dotG, cdot or holo. |
| `pip` | no | object | A scope's ocular lens (js/viewmodel.ts): the game draws the world through the scope on a disc there (picture-in-picture) with the reticle over it. f, y: its centre, [forward, up] metres; r: its radius. parent + pos: a lens that swings on a hinge (a magnifier's): the NAME of the node it hangs on and its place in that node, [x, y, z] metres in the node's own frame. |

**Materials** (the mesh's material NAME): The material NAME is what counts: at load the catalogue's material of that name replaces whatever the file carries (its colours, roughness, emissive, transparency and bump map come from the game), so the game keeps its shared materials and its look. Give meshes the catalogue name; colours in the file only matter for anonymous materials and for viewing the file elsewhere.

| name | meaning | bump |
| --- | --- | --- |
| `black` | Black anodised metal. |  |
| `gunmetal` | Grey phosphate metal. |  |
| `steel` | Bright steel. |  |
| `blued` | Blued steel. |  |
| `park` | Parkerised finish. |  |
| `polymer` | Black polymer. |  |
| `tan` | Tan polymer. |  |
| `od` | Olive drab polymer. |  |
| `green` | Green paint. |  |
| `wood` | Wood. |  |
| `woodDark` | Dark wood. |  |
| `plum` | Plum bakelite (an AK-74 grip). |  |
| `woodRed` | Red-brown wood. |  |
| `brass` | Brass. |  |
| `rubber` | Black rubber. |  |
| `stipple` | Stippled polymer grip. | rebuilt at load (stp) |
| `chequer` | Chequered metal or polymer. | rebuilt at load (chq) |
| `chequerWood` | Chequered wood. | rebuilt at load (chq) |
| `rust` | Rusted metal. |  |
| `tape` | Wrapped tape. |  |
| `clear` | Translucent plastic (a see-through magazine). |  |
| `glass` | Dark glass. |  |
| `tubeDS` | Double-sided black (a tube you see inside). |  |
| `lens` | Blue-coated lens. |  |
| `reflexLens` | Reflex sight glass. |  |
| `clearLens` | Clear lens. |  |
| `dot` | Red emissive dot. |  |
| `amber` | Amber emissive. |  |
| `glow` | Cyan emissive. |  |
| `sightPaint` | White sight paint. |  |
| `tritium` | Green night-sight glow. |  |
| `redInsert` | Red revolver ramp insert. |  |
| `string` | String / cord. |  |
| `fabric` | Fabric. |  |
| `glove` | Glove leather. |  |

**Display surfaces** (`display_<name>`):

- naming: A mesh node named `display_<name>` (name: lower-case letters/digits/underscores, e.g. `display_ammo`) is a display surface: the game paints it at runtime with a CanvasTexture (the way reflex reticles are drawn), so the model only says where and how big. It still needs extras.slot (the part it belongs to) like any mesh.
- UVs: It MUST have UVs (TEXCOORD_0, covering the 0..1 square: the canvas is mapped across it, u right, v up). A display without UVs is an error.
- size: extras.display = { width, height } in pixels: the canvas resolution the game should draw at (a hint, powers of two preferred); width / height is the intended aspect ratio of the surface, so author the UVs un-stretched for it. Required.
- material: The loader does NOT swap its material for a catalogue one (any material name is accepted, `display` suggested): the game replaces it with the canvas texture's material. Everything the loader does to other meshes (catalogue materials, bump maps) is skipped for it.
- example: `{"name":"display_ammo","extras":{"slot":"barrel","display":{"width":128,"height":32}}}`

**Anchors a part provides** (`extras.anchors`):

- where: A node may carry `extras.anchors`: positions it PROVIDES, in the node's OWN frame (the same [forward, up, right] metres, measured from the node's origin along its axes; a part's mesh positions are in that same frame). Allowed on `part_<key>` and `group_<n>` nodes, and on the root of a per-part pack (a .glb holding one swappable part). Keys are the info anchors a part can provide (muzzles, grip, support, magAt, port, ch, bolt, slide, cylAt, cup, cheek, chamberAt) or a mount point `mount_<slot>` (a [forward, up, right] vec3; e.g. mount_muzzle on a frame says where a muzzle device sits).
- Assembly (runtime assembly of per-part packs, milestone 2; the same rule applies to the node tree of a whole-gun file) starts from the receiver's `info` and visits the parts in the gunsmith's slot order.
- Every provided position is first moved into the gun's frame: the providing node's transform in the assembled gun applied to the position (the part's placement), then re-expressed as [forward, up, right] = [-z, y, x].
- `muzzles` is a LIST built from whichever parts provide it: if any part provides `muzzles`, the gun's `info.muzzles` is the concatenation of those parts' lists (tree order) and the receiver's own default is dropped; if none does, the receiver's is kept. A barrel block with 6 barrels provides 6 muzzles.
- `mount_<slot>` anchors are collected into `info.mounts` (key `mount_<slot>`); a part that sits in <slot> has its origin placed at that mount. A later provider of the same mount overrides the earlier.
- Every other anchor (grip, support, magAt, port, ch, bolt, slide, cylAt, cup, cheek, chamberAt) is single-valued: a part's value overrides the receiver's and an earlier part's (the last provider in slot order wins; the validator warns when two parts of one gun both provide it).
- muzzles: A gun can have MORE THAN ONE muzzle (an over/under, a Metal Storm-style barrel block): `info.muzzles` is always a list of at least one [forward, up, right]; consumers must iterate it and never assume entry [0] is the only one.
- example: `{"name":"part_barrel","extras":{"part":"barrel","anchors":{"muzzles":[[0.4,0.012,-0.012],[0.4,0.012,0.012]],"mount_muzzle":[0.4,0,0]}}}`

**Magazine check** (`part_mag.extras.check`, meshes' `extras.chk`):

- what: The magazine check (hold R: the magazine is pulled out and looked at) shows what is in it on the magazine's own body: the top round, witness holes stamped with a count, or the rounds themselves through a clear body. The model says which of its meshes are those (js/gunrig.ts reads it; a gun without it simply shows nothing).
- part: `part_mag` has extras.check = { w }: the magazine's width in metres (the width of a hole's stamped count).
- meshes: Meshes under `part_mag` carry extras.chk = { role, i, t? }: role "top" (the round on top: i 0 its case, i 1 its tip; the game colours them for the load), "hole" (a witness hole, i = its order from the top, t = 0..1 how far down the stack it reads), "round" (the i-th round drawn through a clear magazine, t = how far down) and "tip" (the bullet tip of round i). Every mesh keeps a slot and a catalogue material like any other; the game replaces their materials as the rounds change. A gun with a magazine check has both top meshes.
- example: `{"name":"part_mag","extras":{"part":"mag","check":{"w":0.024}},"child":{"name":"mag_91","extras":{"slot":"mag","chk":{"role":"hole","i":0,"t":0.1567}}}}`

A one-off colour that isn't in the catalogue is named `m_<rrggbb>` (hex colour) and is kept as exported: a standard PBR material, no bump.

**Extras keys:** root: `info`, `gun`; mesh: `slot`, `display`, `chk`; part: `part`, `anchors`, `check`.
<!-- contract:end -->

## Baked files

```
assets/models/guns/<id>.glb     a whole default gun (compressed: weld, quantize, meshopt; parts stay separate nodes)
assets/models/guns/index.json   { version, three, src, guns: { <id>: { file, code, hash, bytes, gz, meshes, tris } }, totals }
assets/vendor/three-global.js   the importmap shim (generated)
```

`code` is the default build's code: the browser serves the bake only for a gun whose build is that, and not when the game's default build has since moved on. `hash` is a hash of the baked triangles (slot, material, positions) and `src` of the sources they come from; `node tools/bake_models.mjs --check` rebuilds and lists stale bakes. Lost in the round trip, rebuilt at load: bump maps (by material name), the shared material cache, `userData.chk` (viewmodel-only; the viewmodel is not baked).

## Layout plan: per-part packs (milestone 2)

```
assets/models/parts/<platform>/base.glb                 the receiver and fixed furniture, every slot empty (+ its anchors)
assets/models/parts/<platform>/<slot>/<partId>.glb      one part as it sits on that platform in that slot: meshes in the
                                                        gun's own frame (assembly is just adding the groups); root extras
                                                        { part: partId, platform, slot, anchors }
assets/models/parts/<platform>/index.json               slot -> partId -> { file, hash }, and which slots depend on which
                                                        (a handguard length moves the muzzle, a magwell moves the mag)
```

`guns/<id>.glb` stays as the default-build fast path and the reference the packs are verified against: an assembled default gun's triangles must hash-equal the whole bake. Assembly merges the parts' `extras.anchors` into `info` by the rules above.

**What runtime assembly needs from the recipe side** (`js/gunmodels.ts` / `js/parts.ts`): each part's meshes tagged with their slot (already) *and* buildable on its own given the dependencies (the barrel's length from the handguard, the magwell's position), the anchors a part derives (muzzles from barrel + muzzle device, `magAt` from the mag part, `mount_muzzle` from the barrel end) returned per part instead of for the whole gun, and a stable per-(platform, slot, part) key to hash.
