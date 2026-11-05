# glTF gun models

The guns are built procedurally (`js/gunmodels.ts`). This pipeline bakes them to `.glb` files and loads those back, behind a flag, so that (later) models can be made in Blender or assembled from per-part packs. Milestone 1: whole default guns. Milestone 2: per-part packs and runtime assembly of any build (below).

## Commands

| | |
| --- | --- |
| `npm install` | installs three@0.149.0 (exporter, node only), gltf-transform and meshoptimizer (dev dependencies) |
| `npm run bake:models` | `tsc`, then bakes every platform's default build to `assets/models/guns/<id>.glb` + `index.json` and every platform's per-part packs to `assets/models/parts/<id>/` (verifying that every build of the sweep assembles from them), validates each against the contract, and writes `assets/vendor/three-global.js`. `--guns` / `--parts` for one half, ids restrict both, `--check` lists stale ones |
| `node tools/bake_models.mjs m4 g19` | bakes just those guns; `--check` lists the bakes that are stale against the current code |
| `npm run check:models -- <file.glb ...>` | validates hand-made or edited models and prints what is missing or wrong |
| `npm run check:models -- --write` | regenerates `docs/gun-model-info.schema.json` and the contract tables below |
| `npm run test:models` | `tsc` + `check:models --selftest` (schemas and docs current, material names are the catalogue, every baked gun, platform index and pack file passes) + `check_models.test.mjs` (negative tests) + `check_models_assembly.mjs` (assembles every sweep build from the real pack files and compares with the recipe: below) |

`assets/models/` is git-ignored for now: bake locally.

## The flags

- `?bakedGuns`: `G.Models.displayBaked(def, skin)` (js/glb.ts, called first thing in `G.GunModels.display`) returns the baked whole gun for a **default build**, else the model **assembled from the platform's packs** (`G.Models.assemble`) when they are loaded, else `null` and the procedural one is built (and the platform's packs are fetched in the background so the next one is). Whole guns: the cached glTF scene is cloned, the catalogue's material put back by name (so the shared materials and the stipple/chequer bump maps are the game's own), `info.anim` rebuilt from node names, stickers applied. All 79 whole guns are preloaded once the loader is up (`G.Models.preload(ids)`; `G.Models.loaded(id)`). Packs: `G.Models.ensure(def)` loads one build's, `G.Models.preloadPlatform(id)` all of a platform's.
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
| `tac` | A light or laser on the right-hand rail. |
| `tacL` | A light or laser on the left-hand rail. |
| `magnifier` | A magnifier behind a reflex sight (the node part_magn flips it aside). |
| `railmount` | A clamp-on rail mount (a collar round the barrel with a short rail). |
| `loader` | A shotgun's side-saddle or loader fittings. |

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
| `part_magn` | A magnifier that flips aside. |  |
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
- `mount_<slot>` anchors are OFFSETS: the displacement [forward, up, right] metres of the part in <slot> from where its pack stores it (a pack stores a part where it sits when every other part is the platform's reference one). Every provider's offsets for a slot ADD UP (a barrel and a handguard may both move a light); the sum is `info.mounts.mount_<slot>` and the whole part moves by it.
- Every other anchor (grip, support, magAt, port, ch, bolt, slide, cylAt, cup, cheek, chamberAt) is single-valued: a part's value overrides the receiver's and an earlier part's (the last provider in slot order wins; the validator warns when two parts of one gun both provide it).
- muzzles: A gun can have MORE THAN ONE muzzle (an over/under, a Metal Storm-style barrel block): `info.muzzles` is always a list of at least one [forward, up, right]; consumers must iterate it and never assume entry [0] is the only one.
- example: `{"name":"part_barrel","extras":{"part":"barrel","anchors":{"muzzles":[[0.4,0.012,-0.012],[0.4,0.012,0.012]],"mount_muzzle":[0.4,0,0]}}}`

**Magazine check** (`part_mag.extras.check`, meshes' `extras.chk`):

- what: The magazine check (hold R: the magazine is pulled out and looked at) shows what is in it on the magazine's own body: the top round, witness holes stamped with a count, or the rounds themselves through a clear body. The model says which of its meshes are those (js/gunrig.ts reads it; a gun without it simply shows nothing).
- part: `part_mag` has extras.check = { w }: the magazine's width in metres (the width of a hole's stamped count).
- meshes: Meshes under `part_mag` carry extras.chk = { role, i, t? }: role "top" (the round on top: i 0 its case, i 1 its tip; the game colours them for the load), "hole" (a witness hole, i = its order from the top, t = 0..1 how far down the stack it reads), "round" (the i-th round drawn through a clear magazine, t = how far down) and "tip" (the bullet tip of round i). Every mesh keeps a slot and a catalogue material like any other; the game replaces their materials as the rounds change. A gun with a magazine check has both top meshes.
- example: `{"name":"part_mag","extras":{"part":"mag","check":{"w":0.024}},"child":{"name":"mag_91","extras":{"slot":"mag","chk":{"role":"hole","i":0,"t":0.1567}}}}`

**Per-part packs** (assets/models/parts, milestone 2):

- layout: assets/models/parts/<platform>/index.json and assets/models/parts/<platform>/<slot>/<file>.glb. One pack per (platform, slot) and combination of the parts that shape it; the platform's whole-gun files (assets/models/guns/<id>.glb) stay the fast path for the default build. One file per pack and not one per platform: a swap costs one small request, and a platform's packs together are many times what any one build needs.
- pack: A pack is a glTF binary holding ONE slot's meshes (every mesh extras.slot = that slot) as the slot looks on that platform with the parts named in its key fitted, in the gun's frame (mesh positions as in a whole-gun file). The slot "base" is the receiver and everything fixed (it also carries the animated parts nothing else owns: part_handle, part_bolt, ...). A pack may hold no meshes at all only if the index says its file is null (the slot is empty then).
- root: The pack's one root node is named `<platform>.<slot>.<n>` and has extras.pack = { platform, tag (the slot), key: { <slotOfBuild>: <partId> } }. No transform, no info. Its children are meshes (`<slot>_<n>`), part_ nodes and group_ nodes, all flat directly under it.
- nodes: part_ and group_ nodes sit directly under the root with their position = the pivot in the GUN'S frame (not relative to a parent); extras.parent names the node they nest under in the assembled gun (absent: the gun's root). extras.owner = false means the pivot belongs to another pack (e.g. an optic's meshes inside the slide's part_slide: the slide pack owns the node, the optic pack repeats it so the meshes know where it is); the assembler takes the node from its owner (default: owner) and re-expresses every other pack's meshes against it. Group nodes are named `group_<slot>_<n>` so they are unique across packs.
- index: The platform index.json is { version, platform, src, tags: { <slot>: { dep: [<build slot>...], packs: [{ key: [<partId or "*">...], file: <file or null>, tris, bytes }] } }, anchors: { "<buildSlot>=<partId>": { mount_<slot>: [f,u,r] } }, bases: [3 reference builds with their info], deltas: { "<buildSlot>=<partId>": [per base: { <info leaf path>: number (add) | { set } | { del } } | null] }, exact: { <build key>: { <leaf path>: value } } }. `dep` lists the build slots whose parts shape the tag; a pack's `key` lists those parts in the same order ("*" = any; the most specific matching pack is used); file null = the slot is empty for that key. A build slot is the gunsmith's slot id (barrel, handguard, optic, tac...) which is not always the mesh slot (a laser in `tac` is mesh slot tac).
- joint: COUPLED SLOTS. Where changing one part reshapes another slot's geometry (a pistol's grip changes its frame, magazine well and optic cut, a handguard changes the rail a light clamps to), the baker finds it by sweeping and the slot's pack is a JOINT pack: its key names every part that shapes it, one pack per combination seen, e.g. optic on a P9 = (optic, slide, grip). A coupling that is only a translation is NOT joint: it becomes an anchor (below).
- anchors: TRANSLATIONS. Where a part only MOVES another slot's geometry (a muzzle device follows its barrel's length, a light follows its handguard) the provider's part has `mount_<slot>` in the index's `anchors` table, an offset to add to that slot's whole pack. The reference part of each slot (the one in the platform's fullest reference build) has none.
- info: INFO. The assembled info is the nearest of the index's three reference builds (fewest differing slots) with each differing slot's `deltas` applied to its leaves (numbers add; others are replaced), then `info.anim` from the nodes and `info.mounts` from the anchors. `exact` holds the few builds the sums get wrong, as leaf corrections.
- assembly: ASSEMBLY (G.Models.assemble(def) in js/glb.ts, synchronous: the packs must be loaded, G.Models.ensure(def) / preloadPlatform(id) load them; it returns null otherwise or for a build the packs do not cover, and the procedural model is built). For each tag: pick the most specific pack for the build's parts; add up the anchors of every part in the build; take the owner nodes from the packs, and place every pack's meshes (translated) against them. The result is the whole-gun structure of docs/models.md: slot-tagged meshes, part_ nodes with their pivots, info.
- verify: VERIFICATION. The baker assembles every build of its sweep (each platform's default, two "loaded" builds and every single-part swap from each: ~9,000 builds) from the packs in memory and compares the triangles with the procedural model (the baker fails otherwise); `npm run test:models` does the same through the real files (glb, decoder, assembler) with a tolerance for compression.

A one-off colour that isn't in the catalogue is named `m_<rrggbb>` (hex colour) and is kept as exported: a standard PBR material, no bump.

**Extras keys:** root: `info`, `gun`; mesh: `slot`, `display`, `chk`; part: `part`, `anchors`, `owner`, `parent`, `check`; pack: `pack`.
<!-- contract:end -->

## Authored models (Blender)

A gun with `models/<id>/<id>.glb` is baked from that file instead of its recipe (for its **default build**; other builds still come from the recipe until per-part packs exist). The baker turns the root's `extras.info_json` (a string: Blender custom properties can't hold nested lists) into `extras.info`, drops extras on mesh data, compresses it like the others and validates it against the same contract; `index.json` marks it `authored`.

`models/fal/` is the first: `build_fal.py` builds the gun in Blender from `trace.json` (outlines and column profiles traced off a side-on photo, source and licence inside), then saves `fal.blend` and exports `fal.glb`. Run it in Blender (`exec(open(r'<repo>/models/fal/build_fal.py').read(), {'FAL_DIR': r'<repo>/models/fal'})`, or `blender -b -P models/fal/build_fal.py`), then `node tools/bake_models.mjs fal`. In Blender: X = right, Y = forward, Z = up, metres; objects carry the contract's extras as custom properties (`slot` on meshes, `part` on `part_<key>` empties, `gun` and `info_json` on the root empty named after the gun); material names are the catalogue's.

## Baked files

```
assets/models/guns/<id>.glb                      a whole default gun (compressed: weld, quantize, meshopt; parts stay separate nodes)
assets/models/guns/index.json                    { version, three, src, guns: { <id>: { file, code, hash, bytes, gz, meshes, tris } }, totals }
assets/models/parts/<platform>/index.json        the platform index (docs/gun-parts-index.schema.json)
assets/models/parts/<platform>/<slot>/<key>.glb  one pack
assets/models/parts/index.json                   { version, src, platforms: { <id>: totals }, totals }
assets/vendor/three-global.js                    the importmap shim (generated)
```

`code` is the default build's code: the browser serves the whole bake only for a gun whose build is that. `hash` is a hash of the baked triangles and `src` of the sources they come from; `node tools/bake_models.mjs --check` lists stale bakes (guns and packs). Lost in the round trip, rebuilt at load: bump maps (by material name), the shared material cache, `userData.chk`. The stipple/chequer meshes keep their UVs (the bump map tiles on them).

## Per-part packs and assembly (milestone 2)

Code: `js/glb.ts` (contract, validator, planner, assembler), `tools/model_sweep.mjs` (the build set), `model_diff.mjs`, `model_packs.mjs` (coupling analysis), `model_emit.mjs` / `bake_parts.mjs` (writing), `check_models_assembly.mjs` (test). The contract text is above (**Per-part packs**); this is how it was decided and what it gives.

**Layout: one file per pack.** A swap in the gunsmith costs one small request and a platform's packs together are many times what one build needs (a platform: 24 to 372 KB gzipped for ALL its packs, about 9 packs / 35 KB for one build). The index is one request per platform (3 KB gzipped). Packs are per mesh slot, not per part: a slot's geometry sometimes depends on other slots (below), so "the muzzle device" is not always one file. The whole-gun files stay the fast path for the 79 default builds.

**Nothing stretches.** Every part is modelled at a size of its own: a part is a shape, and a different length is a different part. A handguard is a part of a length (`js/parts.ts`: the rail-less types come in 2 to 4 lengths per mount, the railed ones a part per length as before, every gun's own among them; its stats follow its length against the gun's own handguard's, and are the gun's own at that length), and it fits a gun when its barrel leaves it its length (its length, the gap behind it, 15 mm before the muzzle, within the barrel's visible length): the gunsmith does not offer one that does not fit, and a barrel swap that leaves the handguard too long takes it off (to the stash, as any pruned part) and puts the gun's own back if that fits, else the longest that does. A barrel is one pack per barrel (a platform's pack set holds each length), and what stands on it (the front sight, a bead's rib) is keyed by the barrel.

**The build set.** For each platform: the default build, "loaded A" (every empty slot filled with its first part, no sights) and "loaded B" (with a red dot and a magnifier), and from each every single swap (every slot to every part that fits it, every optional slot emptied, then pruned): 9,031 distinct builds. Plus, for learning only, 240 random builds per platform with two or three parts changed at once.

**Coupling detection** (the baker, `model_packs.mjs`; no recipe knowledge). Each swap is compared with its base slot by slot (mesh slot = tag), in world space: *same*, a *rigid move*, or a *different shape*. (What a swap changed besides its own slot, by pruning, is not attributed to it: a barrel swap that took the handguard off changed the handguard's tag because the handguard changed, and its info deltas have the handguard's own swap's taken out.) A slot whose swap reshapes a tag is in that tag's `dep`: the tag's packs are keyed by its part, and by every other dep slot's (a **joint pack**: e.g. a P9's optic is keyed by (optic, slide, grip)). A slot that only moves a tag gives its parts an **anchor** (`mount_<tag>`, an offset, summed over providers; measured off the reference build "loaded B" and filled out through the others). Then the model is closed over every build we have: each pack is captured from one build, its offsets undone, and every other build predicted from it; wherever that fails (offsets that do not add up, interactions between two parts changed at once) the slots that differ join `dep` (blame is found by changing them one at a time, then two) and everything repeats until all builds, sweep and random, are reproduced. Packs for combinations only a random build showed are not written: the game builds those from the recipe. Where one pack file serves every part of a dep slot the key says `*`.

**The info** is not geometry and is not a function of one slot: `sy`, `fSight`, `relief`, the muzzles, `support`, the magazine well... change with the barrel, the optic, the grip. It is modelled as the nearest of three reference builds' flat leaves plus the leaf deltas of every differing slot's part (additive for numbers), with the few builds that sum wrongly listed as exact corrections. A leaf that two slots shape together (the support hand: the handguard's length, and whether a foregrip is on it) is taken from the reference build whose parts in the slots that shape that leaf are nearest the build's, so that a build with a foregrip comes from a base with one. `info.anim` and the pivots come from the assembled nodes.

**Assembly API** (js/glb.ts, `G.Models`): `assemble(def, skin?)` -> `{ group, info }` (the structure display() gives: slot-tagged meshes, `part_<key>` nodes with their pivots, `info` with the muzzles list, `info.mounts`, `info.anim`), synchronous, or `null` if the platform or a pack is not loaded or the build is a combination the packs do not cover; `ensure(def)` / `preloadPlatform(id)` load; `planBuild(index, build)`, `pickPack`, `infoLeaves`, `leafDelta` are the pure planner (no three.js) the baker verifies with. `display()` goes through `displayBaked` and so uses it with `?bakedGuns`.

**Verification.** The baker assembles all 9,031 sweep builds in memory with the same planner and refuses to write unless every triangle and every info leaf matches (`bake:models` fails otherwise). `tools/check_models_assembly.mjs` then does it for real (GLTFLoader, meshopt decoder, `G.Models.assemble`) against the recipe: a build is **exact** when an order-independent hash of every triangle (world position to 0.1 mm, corners rotated to start at the least, material) is equal; **within tolerance** when the triangles match one to one within 0.05 mm (the files keep positions as float32, so only the recipe's own float rounding at different positions show up); a vertex further off, a missing slot, other info, other part pivots is a **FAIL** and fails `test:models`. It also builds 30 random multi-part builds per platform with a seed the baker did not learn from, as a held-out measure.

**Results** (no stretch, handguards of fixed lengths): 9,100 sweep builds: **4,861 exact, 4,239 within tolerance (largest deviation 0.0001 mm), 0 fail.** Held-out: 2,370 random builds with two or three parts changed: 552 (23%) are combinations the packs do not cover (built from the recipe), 1,814 assemble (911 exact, 903 within tolerance) and 4 (about 0.2% of the covered) come out wrong: interactions between two simultaneous changes the learning set did not show (an index cannot know which; this is the price of accepting builds nobody baked). (With stretch: 9,031 sweep builds, 574 not covered, 17 wrong.)

**Sizes.** 4,478 pack files from 6,679 index entries (identical packs are one file): 49.2 MB raw, **17.0 MB gzipped** for all 79 platforms (indexes +0.23 MB gz) against 1.2 MB gz for the 79 whole guns; per platform 32 KB to 372 KB (f2) gz, median 228 KB; a build needs about 9 packs. By slot (gz): optic 9.6 MB, grip 1.4, mag 1.2, stock 0.9, barrel 0.66, handguard 0.62, base 0.6, muzzle 0.6, tac/tacL 0.7. (With stretch: 4,265 files, 49.8 MB raw, 16.6 MB gz: a barrel and a handguard were one pack for every length, now one each, and there are more handguard parts.) Optics are over half and the lever is not coupling but duplication: the same optic part is written once per platform (and per barrel/slide/grip where the iron sights follow those). Storing parts that do not depend on the platform once, in their own frame, with a per-platform mount offset (an anchor), would cut that to a small fraction: not done.

**What is left coupled** (from the sweep, after the recipe work): pistols, as planned (grip x slide x optic, mag, stock, tac: joint packs); the optic keyed by barrel (the iron front sight and a bead's rib stand on the barrel, built for its length); tac/fg/tacL x handguard on the rail guns (the handguard decides what a light clamps to); railmount x barrel (vss, mp5sd); magnifier x optic everywhere (the magnifier is built from the optic). The recipe notes `userData.bake`, `mesh.userData.at` and `info.reflex`/`info.pip` are accepted (`reflex` and `pip` are in the contract; `bake` and `at` are not consumed yet: the baker derives the anchors from the geometry).
