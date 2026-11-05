# glTF gun models

Every gun the game shows (first person, third person, the gunsmith, the hangar, icons, loot) is a baked glTF: per-part packs, assembled for any build at run time (`js/glb.ts`), behind the synchronous facade `js/gunmodels.ts`. The procedural **recipes** that make them are bake-time code only (`tools/models/*.ts`, compiled by `tsconfig.tools.json`); the game loads none of them and has no fallback to them: a build the packs do not cover just stays empty (a baker bug, not something to patch at run time). Milestone 1: whole default guns (no longer used by the game). Milestone 2: per-part packs and runtime assembly of any build (below).

## Commands

| | |
| --- | --- |
| `npm install` | installs three@0.149.0 (exporter, node only), gltf-transform and meshoptimizer (dev dependencies) |
| `npm run bake:models` | `tsc`, then bakes every platform's default build to `assets/models/guns/<id>.glb` + `index.json` and every platform's per-part packs to `assets/models/parts/<id>/` (verifying that every build of the sweep assembles from them), validates each against the contract, and writes `assets/vendor/three-global.js`; then the props (`tools/bake_props.mjs`, unless `--no-props`) and, last, the bundles the game loads (`tools/bundle_models.mjs`, below; unless `--no-bundle`). `--guns` / `--parts` for one half, ids restrict both, `--check` lists stale ones, `-j N` (or `MODEL_BAKE_JOBS`; default min(cores - 1, 8)) runs the per-platform work and the pack writing in N worker threads with byte-identical output (`node tools/hash_tree.mjs assets/models` to compare), `--verbose` for detail and gltf-transform logs; ends with the props bake and a per-phase time summary |
| `npm run bundle:models` | just the bundling step (`node tools/bundle_models.mjs`; `--check` checks the bundles against the loose tree and the indexes) |
| `node tools/bake_models.mjs m4 g19` | bakes just those guns; `--check` lists the bakes that are stale against the current code |
| `npm run check:models -- <file.glb ...>` | validates hand-made or edited models and prints what is missing or wrong (a `models/<id>/<id>.glb` with a `model.json` beside it is checked as an authored source) |
| `npm run check:models -- --write` | regenerates `docs/gun-model-info.schema.json` and the contract tables below |
| `npm run test:models` | `tsc` + `check:models --selftest` (schemas and docs current, material names are the catalogue, every baked gun, platform index and pack file passes) + `check_models.test.mjs` (negative tests) + `check_models_assembly.mjs` (assembles every sweep build from the real pack files and compares with the recipe: below) |

`assets/models/` is git-ignored for now: bake locally.

## Loading (no flags)

- **Classic GLTF loader.** `assets/vendor/gltf-classic.js` (committed, built by `npm run build:vendor` = `tools/build_gltf_classic.mjs`, esbuild) is three r149's `GLTFLoader` and the meshopt decoder bundled as ONE classic script on the page's global `THREE` (it does not contain three: `import 'three'` is mapped to `globalThis.THREE`). It sets `GLTFClassic`; js/glb.ts makes `G.GLB = { ready, load(url) }` from it. No importmap, no module script, no `three-global.js`. The highlights export worker `importScripts` the same file; `G.Models.setRoot('../../')` tells it where the game's folder is from `dist/js/`.
- **Bundles.** The game never fetches a loose model file: `js/modelbundles.ts` (`G.Bundles`) fetches whole bundles (see "Bundles" below) and `js/glb.ts` slices the pack, index or prop out of them.
- **Boot** (`G.GunModels.boot()`, js/game.ts `init`): the `_boot` bundle (every platform's `parts/<id>/index.json`, ~0.5 MB gzipped for all 79, and the props (below)): one request. With the index a gun's `info` (anchors, muzzles, sight windows, mounts) is known without any pack: `G.Models.infoFromIndex(def)`.
- **Preload and the load queue.** Pack loads go through one priority queue (`js/glb.ts`): 0 = needed now (a gun on screen, the squad's kits), 1 = wanted soon (the level's enemy pool as default builds, the gunsmith's platform), 2 = background. Up to 8 load at once; the background has at most 4 in flight, starts only when nothing more urgent waits, yields to the browser (`requestIdleCallback`) between files, and is paused while a level loads (`G.Models.pauseBackground`, `js/game.ts` `enterLevel`). The hangar entry starts the background preload of every pack of every platform (`G.GunModels.preloadAll()`); it is skipped on `saveData` / 2g connections. The gunsmith opens a gun's whole platform; a level's start loads the squad's builds and the enemy pool's default builds (no whole platforms); anything else is fetched when first asked for (`G.Models.ensure(def)`). A missing pack never throws.
- `?checkModels`: validates each model in the browser as it loads (console errors and warnings).

### The facade: synchronous, filling in

`G.GunModels.display(def, skin)` / `world(def, skin)` / `viewmodel(def, skin)` (js/gunmodels.ts) are synchronous for their callers. If the build's packs are loaded the model is whole. If not, `display` and `world` return an EMPTY group with `userData.pending = true` and the right `info` (from the platform's index), and the meshes arrive in it when the packs do (`world`'s merged meshes, magazine, a crossbow's bolt and strings, a bipod's legs too). `G.GunModels.whenReady(group, fn)` calls `fn(ok)` then (at once if it is not pending): icons (the `gunicons` window event redraws the screens that showed an empty cell), the gunsmith's framing, the hangar's part stands, loot's resting place, a highlight's gear stage and the evidence outline all use it. `viewmodel()` cannot be empty (the hands are bound to the gun's parts): it returns `null` until the build is loaded (and asks for it); `js/player.ts` sets the view model each frame it is not the right one, so it appears the frame it can.

### Props: cartridges and the crossbow bolt

`npm run bake:props` (`tools/bake_props.mjs`, also run by `bake:models`) writes `assets/models/props/round_<caliber>x<case>.glb` (a cartridge: `body`, `rim`, `bullet`, or `case`, `bullet` for the .50 BMG's real profile), `round_shotshell.glb` (`hull`, `base`), `quarrel.glb` (the crossbow bolt, centred: `nock`, `shaft`, `vanes`, `head`) and `index.json` (`rounds`: gun id -> round key; `keys`: file, `dims` (head, case length, bullet length/diameter, shell, pistol) and, for the BMG, `shape`). The game reads them: `G.GunModels.roundDims(def)`, `roundShape(def)`, `roundProp(def, 'shell' | 'case')`, `quarrel()`.

## Layers: geometry, rig, first-person extras

A gun model is three separate things, each working on the model (nodes + extras), not on how it was made:

| layer | where | what it does |
| --- | --- | --- |
| geometry | a `.glb` (`js/glb.ts`; the recipes in `tools/models/recipes.ts` make them, at bake time) | slot-tagged meshes, `part_<key>` nodes with their pivots, `info` |
| rig | `js/gunrig.ts` | `G.GunRig.bind(group, info, { def, side })`: finds the moving parts (`info.anim`: nodes, or the node names of a loaded file), the hand anchors in the gun's space, where the parts rest, the magazine-check data. `js/vmanim.ts` (the clips) reads nothing else off the gun |
| first-person extras | `js/viewmodel.ts` | `G.Viewmodel.assemble(def, models)`: a reflex sight's reticle (`info.reflex`), a scope's lens (`info.pip`), muzzle flashes (one per `info.muzzles`), `display_<name>` surfaces (a CanvasTexture each: `G.Viewmodel.surfaces(group)`), then the rig and arms. And `worldProto` / `worldInstance`: the third-person model, merged one mesh per material, with the magazine, a crossbow's bolt and strings and a bipod's legs pulled out |

`G.GunModels.viewmodel(def)` / `world(def)` / `display(def)` only fetch geometry (assembled from the packs) and hand it over; the first person's stock is clipped near the eye at render time (js/render.ts). A bipod is a `part_bipod` node whose child groups are its legs, with the folded and the deployed pose as data (`extras.leg.deploy`; the contract's "Bipods"): `G.GunRig.bipodPose(node, k)` turns them, for the first person (the live node, `an.bipod`) and the third (`worldProto` pulls each leg out; `worldInstance` gives a node `userData.bipod` of the legs). The first person's reflex and scope windows are `info.reflex` / `info.pip`; a magnifier's lens hangs on its `part_magn` node and a crossbow's lit nock gets a material of its own, both done by `viewmodel()`.

`bake_models.mjs` calls `G.GunRig.describe(group)` first: a recipe's magazine-check data is meshes held by reference, which a file can't carry, so it is written down as tags on the nodes (see "Magazine check" in the contract).

## The contract

**The contract is code**: `GUN_MODEL_CONTRACT` and `INFO_FIELDS` in `js/glb.ts`. Everything else is generated from it, or checked against it:

- `validate()` (the same function in node and the browser; it works on a plain description of the node tree, `describeGltfJson` for a `.glb`'s JSON, `describeScene` for a loaded scene) is used by the baker, by `check:models`, and by `?checkModels`;
- `docs/gun-model-info.schema.json` is the JSON Schema (draft 2020-12) of the root `extras.info`, for a loader or exporter written in anything else (a Rust/Bevy loader can read this plus the tables below without reading TypeScript). It is generated, and `test:models` fails when it differs from `INFO_FIELDS`;
- the tables below are generated between the markers (`check:models -- --write`), and `test:models` fails when they drift;
- the TypeScript interface `GunModelInfo` and `INFO_FIELDS` are tied by a mapped type: a field in one and not the other does not compile; the material list is compared with `G.GunMaterials.M` (js/gunmaterials.ts) by `test:models`.

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
| `part_bipod` | A bipod: its node holds the legs, each a child group with extras.leg (see "Bipods" below). |  |
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

**Authored sources** (a gun modelled in Blender, baked with no recipe):

- what: AUTHORED SOURCE. A gun modelled in Blender is baked straight from its .glb with no recipe (tools/bake_authored.mjs, `npm run bake:models`). The source is models/<id>/<id>.glb plus models/<id>/model.json ({ "source": "authored", "sights": { "builtin": [<optic kinds that mean the gun's own sights>], "rail": [<of those, the ones that still sit on a rail piece: a riser>] } }); the model is the authority for everything it holds, and a gun without model.json keeps being built by its recipe. `npm run check:models -- models/<id>/<id>.glb` validates a source (validateAuthored).
- nodes: The scene has one root node named after the gun. Its children are the base (receiver) and the gun's FACTORY parts, as meshes "<slot>_<n>" with extras.slot (the contract's slots) and a catalogue material: the base is every mesh of slot base that is not in a part_ node; the stock, grip, handguard, barrel, muzzle and optic (the irons) meshes are the parts the gun's default build fits, and the model must hold meshes for every slot the default build fills; the magazine is the node part_mag with its meshes (slot mag), the charging handle part_handle (slot base); every moving part is a part_<key> node (contract parts) with its pivot at the node origin and listed in info.anim. A factory part's id is the platform's (js/parts.ts), not written in the model.
- info: Root extras.info (or the JSON text info_json): the factory build's info, exactly INFO_FIELDS (sy, fSight, relief, muzzles, grip, support, anim, magAt, handle, port, chamberAt, ...).
- anchors: Root extras.anchors (or anchors_json): the gun's MOUNT ANCHORS, [forward, up, right] metres in the gun's frame, the places the gun's non-factory parts are seated on. Every part the gun accepts that is not one of the model's own is built at its own designed size and placed on these, never stretched: the table lists them. A `_end` anchor is the far end of a span. Further `mount_<slot>` anchors (a side rail: mount_tac, mount_tacL) are allowed and are carried into info.mounts.

| anchor (extras.anchors) | meaning |
| --- | --- |
| `mount_optic` (required) | the START of the optic rail on the receiver: [forward, the receiver's top height, 0]. A rail piece is built over mount_optic .. mount_optic_end when a real optic (or one of sights.rail) is fitted; an optic sits on it by the platform's spec (optF). |
| `mount_optic_end` (required) | the END of that rail: [forward, top, 0]. Same height as mount_optic. |
| `mount_handguard` (required) | where a handguard starts (the barrel nut's front): [forward, up, 0]. The platform's spec L is this forward value. |
| `mount_handguard_end` (required) | the furthest forward a handguard may reach (the gas block's rear): [forward, up, 0]. A handguard longer than mount_handguard_end - mount_handguard - 3 mm is not offered for the gun (the platform's spec hgMax in js/parts.ts says so; the baker checks they agree). Nothing is clamped. |
| `mount_muzzle` (required) | where the factory barrel ends and a muzzle device screws on: [forward, up, 0]. Another barrel's end is this plus its length difference from the factory one; the factory muzzle device (slot muzzle) is modelled to start here. |
| `mount_barrel` (required) | where the factory barrel begins (the start of the slot barrel meshes, ahead of the last fixed fitting): [forward, up, 0]. Slot barrel holds only the factory barrel itself, which any other barrel replaces whole: its fixed fittings (gas block, gas tube, sight base, bayonet collar) are slot base, and stay when another barrel is fitted. Another barrel is the shared one of its length and profile, ending where that length ends from mount_muzzle (nothing in the model is resized). |
| `mount_stock` (required) | where a stock is seated: [0 or the receiver's back, the centre height of the wrist at the receiver's back, 0]. |
| `mount_grip` (required) | where a grip is seated: [forward of the grip's front, the height of the receiver's underside, 0]; the grip hangs from that height. |
| `mount_mag` (required) | the magazine well: [forward, up, 0] of the top of a magazine seated in it (equal to info.magAt). |

- seat: There is no seat: another barrel is drawn from its own part (a standard radius and profile). Root extras.seat and a mesh extras.role are no longer defined and are ignored if a file still has them.
- mesh: Every mesh of slot barrel is the factory barrel, drawn only while the platform's own barrel is fitted; a fixed fitting on the barrel is a mesh of slot base.
- A gun's default build is its factory parts, taken from the model while they are fitted; every other part the gunsmith offers for the gun is the shared part for its slot, seated from the anchors above, so the same part is the same shape on every gun and on this one.
- The model's own sights: an optic kind listed in model.json sights.builtin means the gun's own irons (the optic slot of the model: the rear sight on the receiver and the front sight on the barrel). A kind also listed in sights.rail (a riser) puts a rail piece between mount_optic and mount_optic_end over them.
- Fit is data, not geometry: whether a part fits the gun is decided by js/parts.ts (fitsSlot, hgRoom with hgMax) from the platform's spec; the baker checks the platform's spec (L, hgMax, mag) against the anchors and fails when they disagree.
- example: `{"name":"fal","extras":{"gun":"fal","info_json":"{\"sy\":0.04,...}","anchors_json":"{\"mount_optic\":[0.0141,0.0232,0],\"mount_optic_end\":[0.1791,0.0232,0],\"mount_handguard\":[0.3012,0,0],\"mount_handguard_end\":[0.5357,0,0],\"mount_muzzle\":[0.7329,0,0],\"mount_barrel\":[0.6153,0,0],\"mount_stock\":[0,-0.01835,0],\"mount_grip\":[0.0661,-0.0452,0],\"mount_mag\":[0.2232,-0.0429,0]}"}}`

**Authored parts** (a shared attachment modelled in Blender: sights, prisms, scopes):

- what: AUTHORED PART. A shared attachment modelled in Blender (a sight, a prism, a scope; other slots are reserved) is baked straight from its .glb: models/parts/<slot>/<id>/<id>.glb plus models/parts/<slot>/<id>/model.json. It is ONE object, the same file on every gun whose mount takes it; everything gun-specific under it (the rail section, a riser) is the gun's mount piece (tag `optic@mount`), never part of the model. `npm run check:models -- models/parts/<slot>/<id>/<id>.glb` validates one; `npm run check:models -- --write` regenerates its catalogue entry.
- frame: THE PART'S OWN FRAME. Metres, the glTF axes (x right, y up, z = -forward); anchors are written [forward, up, right] = [-z, y, x] like everywhere in the contract. For an optic (the only slot defined) the ORIGIN is on the top of the rail, at the optic's mount point, centred (right = 0): the plane the optic's foot rests on, so no vertex is below y = 0 (the rail, riser or adapter is the mount piece's). The recipe places it at the gun's rail top and the platform's optic position (spec optF) and the baker finds that it only translates.
- model: The .glb has ONE root node named after the part (the folder name), no extras.info and no part_ nodes; its children are meshes "<slot>_<n>" (the slot's name: optic) with extras.slot and a catalogue material name (or display surfaces, as in the contract). Triangles outside the sight: none. Geometry limits for an optic: within 0.12 m either side of the origin forward and 0.04 m left/right, up to 0.15 m high.
- config: model.json: { "source": "authored", "kind": "part", "slot": "optic", "frame": "rail-top", "optic": { sy, fSight, relief, reflex?, pip?, magnifier?, height }, "part": { mount, brand, name, price, tier, zoom, st, desc?, scoped?, reticle?, px?, levels? } }. The catalogue id is derived: `op.auth.<id>`.
- optic.sy: Height of the line of sight above the origin, metres (info.sy = the rail top + this). A reflex window's centre height must equal it.
- optic.fSight: Forward position of the sight's rear/eye reference, metres from the origin (info.fSight = the mount point + this); with relief it places the aiming eye.
- optic.relief: Eye relief, metres (0.03 to 0.4).
- optic.reflex: A reflex or holographic sight's window { f, y, w, h, round?, kind: dot|dotG|cdot|holo }, centre [forward, up] and size, in the part's frame (becomes info.reflex shifted to the gun). The game draws a collimated reticle behind it; it lies inside the model's bounds and y equals sy.
- optic.pip: A scope's ocular lens { f, y, r } in the part's frame (becomes info.pip): a magnified sight needs it and the part's zoom/reticle/px (set.scoped). y equals sy.
- optic.magnifier: true when a magnifier goes behind it (a reflex sight with a window); the gun gets the anchor mount_magnifier [fSight, sy, 0].
- optic.height: low, mid or high: how tall the sight stands, for ordering and tests.
- part: The catalogue entry (js/parts.ts takes it from a generated block, `check:models -- --write` rewrites it): mount (the rail interface: op:pic, a Picatinny top rail), brand (a key of the brands), name, price, tier, zoom (the ADS FOV multiplier), st (stat deltas), and for a magnified sight scoped: true with reticle (cross|chevron|lpvo|ring), px (magnification) and optionally levels. The part is fittable and buyable on every gun that has that mount, with no per-gun data.
- The same part is the same file on every gun: the model never depends on a gun. Nothing is stretched.
- Bounds, origin and window are checked on the file (tools/authored_parts.mjs): a vertex below the rail top, a window outside the model, a window not on the sight line and an unknown material are errors that name the mesh and the number.
- On a gun with TASK-3 mount pieces the rail under the part is `optic@mount`; the part's own meshes are the `optic` pack and are shared across guns by content.
- example: `{"name":"falcon","extras":{},"child":{"name":"optic_1","extras":{"slot":"optic"},"material":"black"},"model_json":{"source":"authored","kind":"part","slot":"optic","frame":"rail-top","optic":{"sy":0.0285,"fSight":-0.026,"relief":0.09,"reflex":{"f":0.0135,"y":0.0285,"w":0.026,"h":0.026,"kind":"dot"},"magnifier":true,"height":"low"}}}`

**Magazine check** (`part_mag.extras.check`, meshes' `extras.chk`):

- what: The magazine check (hold R: the magazine is pulled out and looked at) shows what is in it on the magazine's own body: the top round, witness holes stamped with a count, or the rounds themselves through a clear body. The model says which of its meshes are those (js/gunrig.ts reads it; a gun without it simply shows nothing).
- part: `part_mag` has extras.check = { w }: the magazine's width in metres (the width of a hole's stamped count).
- meshes: Meshes under `part_mag` carry extras.chk = { role, i, t?, side? }: role "top" (the round on top: i 0 its case, i 1 its tip; the game colours them for the load), "hole" (a witness hole, i = its order from the top, t = 0..1 how far down the stack it reads, side = 1 on the back face of the magazine (toward the shooter) or -1 on its front: a magazine has the same holes, same i and t, on BOTH faces, each its own mesh, and the game stamps the count beside each reading from its own side. The rotation of the mesh node is the tilt of the face there: on a curved magazine each hole, and the count beside it, follows the curve; a round of a clear magazine leans with it the same way), "round" (the i-th round drawn through a clear magazine, t = how far down) and "tip" (the bullet tip of round i). Every mesh keeps a slot and a catalogue material like any other; the game replaces their materials as the rounds change. A gun with a magazine check has both top meshes.
- example: `{"name":"part_mag","extras":{"part":"mag","check":{"w":0.024}},"child":{"name":"mag_91","extras":{"slot":"mag","chk":{"role":"hole","i":0,"t":0.1567,"side":1}}}}`

**Bipods** (`part_bipod`, its legs' `extras.leg`):

- what: A BIPOD is one node, `part_bipod` (PARTS key bipod, listed in info.anim.bipod), whose children are its LEGS: each leg is a `group_<n>` node with extras.leg = { deploy: [rx, ry, rz] } holding that leg's meshes. A leg's pivot (its node origin) is its hinge. The model is drawn FOLDED: every leg at rotation 0. part_bipod's own origin is only a reference point (the first hinge) and nothing turns it. The legs' meshes are slot fg when the bipod is a foregrip option (the Kodiak) or slot base when it is part of the gun (a machine gun's, a sniper rifle's); one gun may have both, in the one part_bipod node.
- pose: extras.leg.deploy is the leg's rotation when the bipod is DOWN: three numbers, radians, an XYZ Euler rotation about the leg's pivot in the gun's frame (x right, y up, z back), the legs pointing at the ground and splayed a little. A leg folded back along the gun (its foot behind the hinge) turns by +PI/2 about x, one folded forward by -PI/2. Folded is rotation 0 (how the meshes are drawn): the folded and the deployed pose are both data of the model.
- drive: The game drives every leg with the same rule: rotation = deploy * smoothstep(k), k from 0 (folded) to 1 (down) over a quarter of a second, set by the player's stance and what is in front of the gun (js/player.ts bipodStep for the first person, a remote player's state in js/rig.ts for the third) and posed by G.GunRig.bipodPose(part_bipod node, k). The first-person model poses the live part_bipod node; the third-person (merged) model pulls each leg out on its own so it can turn.
- packs: In a pack the part_bipod node holds no mesh itself (the base pack owns it); each leg is a group_<slot>_<n> node with extras.parent = "part_bipod" and extras.leg, directly under the pack root like every node.
- example: `{"name":"part_bipod","child":{"name":"group_7","extras":{"leg":{"deploy":[1.5708,0.2,0]}}}}`

**Per-part packs** (assets/models/parts, milestone 2):

- layout: assets/models/parts/<platform>/index.json and assets/models/parts/<platform>/<slot>/<file>.glb; parts that do not depend on the platform are stored once, in assets/models/parts/_shared/<slot>/<file>.glb (see "shared"). One pack per (platform, slot) and combination of the parts that shape it; the platform's whole-gun files (assets/models/guns/<id>.glb) stay the fast path for the default build. One file per pack and not one per platform: a swap costs one small request, and a platform's packs together are many times what any one build needs.
- pack: A pack is a glTF binary holding ONE slot's meshes (every mesh extras.slot = that slot) as the slot looks on that platform with the parts named in its key fitted, in the gun's frame (mesh positions as in a whole-gun file). The slot "base" is the receiver and everything fixed (it also carries the animated parts nothing else owns: part_handle, part_bolt, ...). A pack may hold no meshes at all only if the index says its file is null (the slot is empty then).
- root: The pack's one root node is named `<platform>.<slot>.<n>` and has extras.pack = { platform, tag (the slot), key: { <slotOfBuild>: <partId> } }. No transform, no info. Its children are meshes (`<slot>_<n>`), part_ nodes and group_ nodes, all flat directly under it. A shared pack's root says platform "_shared" and an empty key.
- nodes: part_ and group_ nodes sit directly under the root with their position = the pivot in the GUN'S frame (not relative to a parent); extras.parent names the node they nest under in the assembled gun (absent: the gun's root). extras.owner = false means the pivot belongs to another pack (e.g. an optic's meshes inside the slide's part_slide: the slide pack owns the node, the optic pack repeats it so the meshes know where it is); the assembler takes the node from its owner (default: owner) and re-expresses every other pack's meshes against it. Group nodes are named `group_<slot>_<n>` so they are unique across packs.
- index: The platform index.json is { version, platform, src, slots, tags, anchors, info }. tags: { <slot>: { dep: [<build slot>...], packs: [{ key: [<partId or "*">...], file: <file or null>, at: [f,u,r], nodes: [<part_ node names>], tris, bytes }] } }: `dep` lists the build slots whose parts shape the tag; a pack's `key` lists those parts in the same order ("*" = any; the most specific matching pack is used); file null = the slot is empty for that key; `at` (shared packs) is the offset the stored geometry moves by on this platform; `nodes` the part_ nodes the pack has meshes in. A build slot is the gunsmith's slot id (barrel, handguard, optic, tac...) which is not always the mesh slot (a laser in `tac` is mesh slot tac). anchors: { "<buildSlot>=<partId>": { mount_<slot>: [f,u,r] } }. info: [{ dep: [<build slot>...], leaves: [<info leaf path>...], rows: [{ key: [<partId or "*">...], v: [<one value per leaf>] }] }].
- joint: COUPLED SLOTS. Where changing one part reshapes another slot's geometry (a pistol's grip changes its frame, magazine well and optic cut, a handguard changes the rail a light clamps to), the slot's pack is a JOINT pack: its key names every part that shapes it, one pack per combination the parts can make, e.g. optic on a P9 = (optic, slide, grip). A coupling that is only a translation is NOT joint: it becomes an anchor (below). The baker finds which slots shape which by sweeping and by building random builds, then makes a pack for EVERY valid combination of the parts in a tag's dep slots (coverage by construction), not only the ones it saw.
- anchors: TRANSLATIONS. Where a part only MOVES another slot's geometry (a muzzle device follows its barrel's length, a light follows its handguard) the provider's part has `mount_<slot>` in the index's `anchors` table, an offset to add to that slot's whole pack. The reference part of each slot (the one in the platform's fullest reference build) has none.
- info: INFO. `info` is tabulated, not computed: each leaf (sy, fSight, relief, support, muzzles, reflex/f...) is a function of the parts in some build slots, and leaves with the same slots are one table (`info` in the index) with a row for every valid combination of the parts in those slots (the most specific matching row is used: "*" = any part). So a min, a max or a clamp over several parts (the support hand: a foregrip if one is fitted, else the handguard, limited by the barrel; the sight line with a magnifier) is one lookup and nothing is added up. Then `info.anim` from the nodes (G.Models.infoOf: from the index, the node names) and `info.mounts` from the anchors.
- assembly: ASSEMBLY (G.Models.assemble(def) in js/glb.ts, synchronous: the packs must be loaded, G.Models.ensure(def) / preloadPlatform(id) load them). For each tag: pick the most specific pack for the build's parts; add up the anchors of every part in the build (and the pack's own `at`); take the owner nodes from the packs, and place every pack's meshes (translated) against them. It never returns null for a platform whose index is loaded: a build the packs do not cover (a combination of parts no build of the baker held) is assembled from the nearest pack of each tag and the result says `approx` (the tests count that as a failure). G.Models.infoOf(def) gives the build's info from the index alone (no pack files, no three.js), synchronously, so a caller can use it before the meshes load. The result is the whole-gun structure of docs/models.md: slot-tagged meshes, part_ nodes with their pivots, info.
- shared: SHARED PACKS. A part that looks the same on every platform (an optic, a magnifier, a light, a foregrip, a muzzle device) is stored once: in assets/models/parts/_shared/<slot>/<file>.glb, in its own frame (the origin at the corner of its bounding box: smallest forward, up and right), and each platform's index entry names it (`file: "_shared/<slot>/<file>.glb"`) with the offset `at` that places it on that platform. Two packs are one when their triangles agree to 2 micrometres after the move.
- mounts: MOUNT PIECES (optics and front sights). A sight is ONE object, the same file on every gun, built in its own frame: the origin on the TOP of the rail (the surface its foot rests on) at its mount point, centred; metres, [forward, up, right]; everything it tells the game (sy, fSight, relief, reflex, pip, mount_magnifier) is in that frame. What is specific to a gun between the gun and the sight is a MOUNT PIECE, a pack of its own: tag `optic@mount` (the rail section under the sight, a riser dot, an adapter, the fixtures of the gun own sights, a pistol optic plate), placed by the gun rail anchors `mount_optic` / `mount_optic_end`. An iron front sight standing on the barrel is the HEAD `optic@barrel` (post, ears, hood, bead: the same on every gun, placed at the barrel anchor mount_frontsight) and its BASE `optic@sightbase` (the column from 4 mm over the bore up to the head, or a bead rib: it follows the sight height of the gun, and a rib the barrel). A recipe builds a mount piece with k.at(mount) or k.at(sightbase) (S.rail does it by itself under the optic tag); the baker keys each tag by what shapes it, so the pack of a sight does not depend on the gun.
- verify: VERIFICATION. The baker assembles every build it made (the sweep: each platform's default, two "loaded" builds and every single-part swap from each; random builds with 2 to 6 parts changed; and one build for every valid combination of parts in every pack's and table's dep slots: tens of thousands) from the packs in memory and compares triangles and info with the recipe (the baker fails otherwise); `npm run test:models` does the same through the real files (glb, decoder, assembler) with a tolerance for compression and the moves, on the sweep and on 10,000 random held-out builds with 3 to 6 parts changed.

A one-off colour that isn't in the catalogue is named `m_<rrggbb>` (hex colour) and is kept as exported: a standard PBR material, no bump.

**Extras keys:** root: `info`, `gun`, `anchors`; mesh: `slot`, `display`, `chk`; part: `part`, `anchors`, `owner`, `parent`, `leg`, `check`; pack: `pack`.
<!-- contract:end -->

## Barrels, grips and box handguards (one object on every gun)

- **A shared barrel is cartridge x length x profile** (`br.<cartridge>.<inches>` is the standard profile, `.light`, `.tapered`, `.heavy` the others): ONE object on every gun that takes it. It is a tube as long as the barrel (inches x 25.4 mm + a 6 mm shank) at its profile's radius, drawn ending where that length ends on the gun: the gun gives only the place of its factory barrel's end, so the part is never scaled and the same file is on every gun (the part inside the receiver is hidden by it). `js/parts.ts` `BARREL_PROFILES`: standard 9.5 mm, light 7.0 mm, tapered 9.5 mm to 7.6 mm at the muzzle, heavy 12 mm (14 mm on the .50 BMG). A profile carries figures (weight, handling, recoil, accuracy) against the profile of the gun's own barrel (zero for that one), so a gun's own barrel keeps its exact figures and two barrels of one gun never read the same.
- **Fit.** A barrel of 0.6x to 1.6x the factory length that leaves at least 60 % of what the gun's own barrel shows (visible length = the model's own + the length's difference from the factory one); the FAL takes none ending before its gas block (17" up).
- **The FAL's own barrel** is its model's mesh (`fal.barrel`); every other FAL barrel is the shared one.
- **AR grips** are one shape in one colour (the M4's): the exceptions are the F2, the GM6 and the FAL's own grip. **Box handguards** (mount `hg:box`) likewise: the AA-12's draw in the standard colours; the FAL's own wooden handguard is its model's.

## Authored models (Blender)

A gun modelled in Blender is **baked straight from its .glb with no recipe**. The source is two files:

- `models/<id>/<id>.glb`: the model (below);
- `models/<id>/model.json`: `{ "source": "authored", "sights": { "builtin": [...], "rail": [...] } }`. It marks the .glb as the authority for the gun (a gun without it is built by its recipe in `tools/models/recipes.ts`), and says which optic kinds mean the gun's own iron sights (`builtin`: irons, notch, bead, riser...) and which of those still put a rail piece on the receiver (`rail`: a riser).

The format and its rules are the contract's **Authored sources** section (generated above from `js/glb.ts`: root `extras.info`, `extras.anchors`, the required `mount_<slot>` anchors with what each means). In short:

- **The model holds the factory gun**: the base (receiver: every slot `base` mesh outside a `part_` node) and the factory parts as meshes by slot (`stock`, `grip`, `handguard`, `barrel`, `muzzle`, `optic` = the gun's own irons), one catalogue material per mesh; the magazine is `part_mag` (slot `mag`), the charging handle `part_handle`, any moving part a `part_<key>` node with its pivot at the node origin. Which slots must be modelled is the platform's default build (js/parts.ts); a missing one is an error naming it. Part ids are the platform's: the model does not repeat them.
- **Info anchors** (`sy`, `fSight`, `relief`, `muzzles`, `grip`, `support`, `magAt`, `handle`, `port`, `chamberAt`...): the contract's `info`, in root `extras.info` (or the text `info_json`: Blender stores only flat properties).
- **Mount anchors** (root `extras.anchors` / `anchors_json`, [forward, up, right] metres in the gun's frame): `mount_optic` + `mount_optic_end` (the optic rail's span on the receiver, at the receiver's top), `mount_handguard` + `mount_handguard_end` (where a handguard starts and the furthest forward one reaches), `mount_barrel` (where the factory barrel starts), `mount_muzzle` (the factory barrel's end, where a muzzle device screws on), `mount_stock`, `mount_grip`, `mount_mag`. Extra `mount_<slot>` anchors (a side rail: `mount_tac`) are allowed. The barrel is the model's own while the platform's own barrel is fitted (slot `barrel` holds just that barrel); the gas block, gas tube, bayonet collar and any other fitting that stays when another barrel is fitted are slot `base`.
- **Every part the gun accepts that is not the model's own is seated from those anchors**, at its own designed size and never stretched: the optic rail piece over the optic span, a handguard from `mount_handguard`, a stock centred on `mount_stock`, a grip hung from `mount_grip`, another magazine in the well at `mount_mag` (the platform's `magFit` fits it), a muzzle device and the front sight on the barrel's end, the optics (the shared optics, riser dots, magnifiers) on the rail by the platform's spec (`optF`). Another barrel is the shared barrel of its length and profile (see "Barrels" below), ending where that length ends from `mount_muzzle`: nothing in the model is resized.
- **Fit is data, not geometry**: which handguards, barrels and optics the gun takes is decided by `js/parts.ts` (`fitsSlot`, `hgRoom`/`hgMax`), not by the model. A handguard longer than `mount_handguard_end - mount_handguard - 3 mm` is not offered (spec `hgMax`), nothing is clamped. The platform's spec in `js/parts.ts` must say `rcv: 'authored', authored: '<id>'` and agree with the anchors (`L` = `mount_handguard`, `hgMax`, `mag` = `mount_mag`): the baker fails otherwise, naming the disagreement.

**Checking.** `npm run check:models -- models/<id>/<id>.glb` validates a source (the contract's authored rules, then the platform's spec); `test:models` does it for every authored gun, with negative tests for each rule (`tools/check_models.test.mjs`) and `tools/check_authored_golden.mjs` (the golden fingerprints, `tests/model-golden-<id>.json`: the sweep and edge builds, `--update` rewrites them).

**Baking.** `tools/bake_authored.mjs` is the baker's authored side: it finds the sources (`models/*/model.json`), checks each (a missing anchor or slot fails the bake with its name), reads the .glb into `G.Authored` (geometry in the gun's frame, the anchors as the seat frame, the sights rules, the info) and `tools/model_env.mjs` loads it next to the game. The generic seating (`rcv: 'authored'` in `rifle()`, `tools/models/recipes.ts`: nothing in it names a gun) builds the whole gun from it, and then the one pipeline every platform goes through splits it into the per-slot packs, writes the platform index with its anchors and info tables, and shares the parts that are the same shape as other guns' (an optic is one file wherever it sits). A change to the .glb or `model.json` marks the bake stale. `npm run bake:models -- --parts fal`.

**The FAL** (`models/fal/`) is the first: `build_fal.py` builds the gun in Blender from `trace.json` (outlines and column profiles traced off a side-on photo, source and licence inside), writes the anchors above, saves `fal.blend` and exports `fal.glb`. Run it in Blender (`exec(open(r'<repo>/models/fal/build_fal.py').read(), {'FAL_DIR': r'<repo>/models/fal'})`, or `blender -b -P models/fal/build_fal.py`), then `npm run check:models -- models/fal/fal.glb` and `npm run bake:models -- --parts fal`. In Blender: X = right, Y = forward, Z = up, metres; objects carry custom properties that become node extras: `slot` on meshes, `part` on `part_<key>` empties, `gun`, `info_json`, `anchors_json` on the root empty named after the gun; material names are the catalogue's. The FAL has no recipe: `rcv 'fal'` and `tools/models/authored.ts`'s generated data and `authored_pack.mjs` are gone; `tests/model-golden-fal.json` holds its fingerprints.

## Authored parts (Blender): shared sights, prisms, scopes

The Blender path is not only for whole guns: a shared ATTACHMENT can be modelled the same way and joins the game as a buyable, fittable part with no recipe. The rules are the contract's **Authored parts** (generated above from `js/glb.ts`); in short:

- **Files**: `models/parts/<slot>/<id>/<id>.glb` and `model.json` beside it. `optic` is the slot defined so far (sights, prisms, scopes); muzzle devices, stocks and others are reserved for the same shape of thing (their own frame: a thread origin, a tube/lug seat), not built.
- **The part's own frame** (an optic): metres, glTF axes, the ORIGIN on the top of the rail at the optic's mount point (the plane the foot rests on), centred. Nothing below y = 0: the rail section, riser or adapter under it is the gun's **mount piece** (`optic@mount`, placed at the gun's `mount_optic`), which the recipe emits; an authored optic never contains it. This is the optic/mount interface the optic builders (`S.reddot`, `S.prism`...) use too, so an authored optic is the same kind of object as a recipe's, and is one shared file on every gun (the baker finds that it only translates with the gun's rail top and optic position).
- **model.json** gives what a model cannot hold: `optic` = `{ sy, fSight, relief, reflex?, pip?, magnifier?, height }` in the part's frame (the baker shifts them by the gun's rail top and mount point into each platform's `info.sy`, `fSight`, `relief`, `reflex`, `pip` tables; a magnifier goes behind a `reflex` optic with `magnifier: true`: the gun gets `mount_magnifier`), and `part` = the catalogue entry (`mount`, `brand`, `name`, `price`, `tier`, `zoom`, `st`; for a magnified sight `scoped`, `reticle`, `px`, `levels`). The part id is derived: `op.auth.<id>`.
- **Joining the catalogue**: `npm run check:models -- --write` regenerates the block between the `authored-parts` markers in `js/parts.ts` (one entry per model.json; `test:models` fails when it differs), which `add()`s each part at the END of the list (a part's id in a code is its place in it) on its mount, so it is buyable and fittable on every gun that has that mount, with no per-gun data. The recipe sees it as `optic: 'authored'`, `apart: '<slot>/<id>'` (`sightOf` in `tools/models/recipes.ts` calls `G.AuthoredParts.place`, `tools/models/authoredparts.ts`, which places the model's meshes at the gun's rail top and optic position and records the window / lens).
- **Reticles**: a `reflex` window is drawn like any reflex sight's (a collimated reticle behind it, masked to the window); the window's centre height must equal `sy`, so the reticle is on the line of sight. A `display_<name>` mesh in the file is carried as in the contract (painted by name).
- **Building one**: `node tools/build_authored_optic.mjs <id>` builds `<id>.glb` from `models/parts/optic/<id>/shapes.json` in node with three (no Blender needed); `models/parts/optic/falcon/build_falcon.py` does the same from the same `shapes.json` in Blender (a modelling session starts from either, or from scratch: any glb that follows the contract works).
- **Checking**: `npm run check:models -- models/parts/optic/<id>/<id>.glb` runs the config rules, the node-tree rules and the GEOMETRY rules (`tools/authored_parts.mjs`: the lowest vertex on the rail top, not under it; centred; within the size limits; the window inside the model and on the sight line); `test:models` does it for every part, with `tools/check_authored_parts.test.mjs` (43 negative tests). The bake refuses an invalid part, names the mesh or number, and hashes the sources into its staleness check. `model_cases` adds a case for every authored part on every gun that takes it (and a magnifier behind it).
- **The first part**: `op.auth.falcon`, the Strix Falcon open reflex (`models/parts/optic/falcon/`): 10 meshes, sight line 28.5 mm above the rail, a 26 x 26 mm window, takes a magnifier.

## Baked files

```
assets/models/guns/<id>.glb                      a whole default gun (compressed: weld, quantize, meshopt; parts stay separate nodes)
assets/models/guns/index.json                    { version, three, src, guns: { <id>: { file, code, hash, bytes, gz, meshes, tris } }, totals }
assets/models/parts/<platform>/index.json        the platform index (docs/gun-parts-index.schema.json)
assets/models/parts/<platform>/<slot>/<key>.glb  one pack
assets/models/parts/index.json                   { version, src, platforms: { <id>: totals }, totals }
assets/models/props/*.glb, index.json              the cartridges and the crossbow bolt (tools/bake_props.mjs)
assets/models/bundles/<name>.rtb, index.json     the same files, bundled: what the game loads (below; tools/bundle_models.mjs)
assets/vendor/gltf-classic.js                    three's GLTFLoader + meshopt decoder, one classic script (npm run build:vendor; committed)
```

`code` is the default build's code: the browser serves the whole bake only for a gun whose build is that. `hash` is a hash of the baked triangles and `src` of the sources they come from; `node tools/bake_models.mjs --check` lists stale bakes (guns and packs). Lost in the round trip, rebuilt at load: bump maps (by material name), the shared material cache, `userData.chk`. The stipple/chequer meshes keep their UVs (the bump map tiles on them).

## Bundles

The bake leaves ~2,480 small files (parts/ and props/: 33 MB raw with the indexes, ~8 KB a pack). The game would need hundreds of requests for a level, so the last step of `npm run bake:models`, `tools/bundle_models.mjs` (library `tools/model_bundles.mjs`), packs them into 81 container files in `assets/models/bundles/`, **which are the only form of the models the game loads**; the loose files stay on disk for the tools and tests only.

| bundle | holds | fetched |
| --- | --- | --- |
| `_boot.rtb` | every platform's `parts/<id>/index.json` and all of `props/` | at boot (`G.GunModels.boot()`): one request |
| `_shared.rtb` | `parts/_shared/**`: the packs shared between platforms | the first time any platform needs a shared pack |
| `<platform>.rtb` | that platform's own packs, `parts/<id>/<slot>/*.glb` (its index is in `_boot`) | the first time a build of that platform is asked for, or its platform is preloaded |

- **Which bundle holds a path** is a rule, not a table (`G.Bundles.bundleOf(path)`, js/modelbundles.ts): `props/**` and `parts/<id>/index.json` are `_boot`, `parts/_shared/**` is `_shared`, any other `parts/<id>/**` is `<id>`; whole-gun files (`guns/*.glb`, which the game does not load) and the bake reports (`parts/index.json`, `coverage.json`...) are in no bundle. A bundle holds each file under its path relative to `assets/models/`, paths in byte order.
- **Container** (`.rtb`, "RTB1"): the bytes `RTB1`, u32le `tocLength`, the table of contents as UTF-8 JSON `{ "files": [[path, offset, length], ...] }`, zero padding to a multiple of 4, then the files back to back (offsets count from the start of that data). The file on disk is that container **gzipped** (level 9, header OS byte fixed to 255), because a static host cannot be trusted to compress an unknown type; the reader recognises gzip by its magic bytes (`DecompressionStream`) and also takes a raw container. Deterministic: the same files give byte-identical bundles, whatever order or parallelism the bake ran in (`bundle_models.test.mjs` checks it).
- **Manifests**: `bundles/manifest.json` is what the game fetches: `{ "v": 1, "bundles": { <name>: <hash> } }`, the hash being the first 16 hex digits of the sha256 of the `.rtb` file's bytes (deterministic: the same bundles give the same manifest, and only a bundle whose content changed gets a new hash). `bundles/index.json` (`{ version: 1, bundles: { <name>: { files, bytes, gz, sha1 } }, totals }`) is for the tools. Both are written by `tools/bundle_models.mjs`; `--check` fails if the manifest is missing, malformed, lists a bundle with no files, or has a hash that does not match the file.
- **Local bundle store** (js/modelbundles.ts): GitHub Pages serves everything with `max-age=600` and an ETag that changes on every deploy, so plain HTTP caching would revalidate every bundle on every visit and re-download all of them after every deploy. Instead, at boot the game fetches `manifest.json` with `cache: 'no-cache'` (the one request that is always made, ~3 KB). For each bundle it needs: if IndexedDB (`rt-model-bundles`, store `bundles`) holds that name **with the same hash**, it uses it with no network request; otherwise it fetches `<name>.rtb?h=<hash>` (the hash in the URL, so no stale browser or CDN copy can answer for a new hash; ordinary caching applies), stores the bytes as downloaded (gzipped) with the hash, replacing the old record. Stored bundles whose name is no longer in the manifest are deleted. It asks `navigator.storage.persist()` (no prompt) and, under `?checkModels`, logs the store decisions and `navigator.storage.estimate()` to the console (`[bundles] ...`).
- **Failure modes** (all silent, none fatal): no IndexedDB, private mode, quota exceeded, eviction, or any IndexedDB error -> the bundle comes from the network (a failed write just means it is fetched again next visit); a stored bundle that fails to parse (bad magic, truncated, bad gzip) -> dropped and fetched again; manifest fetch failure, malformed manifest, or a bundle the manifest does not list -> fetched from the network as before (`<name>.rtb`, `no-cache`, nothing stored).
- **Runtime** (`G.Bundles`): `getFile(path)` -> `Promise<ArrayBuffer>` (takes the bundle from the local store or the network once, caches it in memory for the life of the page, slices the file out; `stats()` says per bundle whether it came from `store` or `net`), `getJson(path)`, `prefetchBundle(name)` -> `Promise<boolean>` (the unit a preload scheduler works in), `bundleOf(path)`, `platformBundle(id)` / `sharedBundle()` / `bootBundle()`, `loaded(name)`, `pending(name)`, `stats()`. A failed bundle fetch is not cached (the next request retries). `js/glb.ts` asks it for every pack (`G.GLB.load(url)` parses the ArrayBuffer with `GLTFLoader.parseAsync`), for each platform index and for the props; `G.Models.ensure(def)` / `assemble(def)` and the facade are unchanged for their callers. There is no fallback to loose files: a path that belongs to a bundle comes from it or fails.
- **Check** (`node tools/bundle_models.mjs --check`, part of `npm run test:models`): every loose file that belongs to a bundle is in it with the same bytes; no entry without a loose file (orphan); every pack of every platform index and every prop resolves in the bundle the game would ask; every bundled pack is named by an index; the manifest describes the files; no unwanted bundle. `tools/bundle_models.test.mjs` has a negative test for each, and the determinism test. The model tests (`tools/model_env.mjs` `loadGameWithModels`) load through `G.Bundles` as the game does.
- **Deploy**: `.github/workflows/pages.yml` bakes (cached on everything a bake or `js/modelbundles.ts` reads), tests, and publishes the site WITHOUT `assets/models/{guns,parts,props}`: only `assets/models/bundles/` ships (4.5 MB gzipped).
- **Measured, cold vs warm** (browser pane, local server, local store): all 79 platforms' bundles plus `_boot` and `_shared`, cold store: 82 requests, 3.25 MB, 1.8 s; reloaded with a warm store: 1 request (`manifest.json`), 2.4 KB. Boot + the M4, AK and MP5 platforms: cold 6 requests / 1.12 MB, warm 1 / 2.4 KB. After changing ONE platform (m4) and re-bundling: a reload fetched `manifest.json` and `m4.rtb?h=<new hash>` (2 requests, 8.7 KB); every other bundle came from the store. A corrupted stored bundle was refetched, and a stored name the manifest does not list was deleted.
- **Measured** (local server, no cache; requests / transferred): hangar preload of all 79 platforms 2,480 requests and 33.2 MB raw (about 10.1 MB gzipped file by file) before; 81 requests and 4.5 MB (gzipped bundles) after. A level start (squad of four, the level's 44-gun enemy pool): 1,641 requests / 23.3 MB raw before, 47 / 3.1 MB after. The gunsmith opening the M4: 205 requests / 6.6 MB raw before, 3 / 1.2 MB after (the `_boot` bundle is the one request at boot).

## Per-part packs and assembly (milestone 2)

Code: `js/glb.ts` (contract, validator, planner, assembler), `tools/model_sweep.mjs` (the build sets), `model_diff.mjs`, `model_packs.mjs` (dependency analysis, coverage), `model_emit.mjs` / `bake_parts.mjs` (writing, sharing), `check_models_assembly.mjs` + `model_report.mjs` (tests, report images). The contract text is above (**Per-part packs**); this is how it works.

**The game loads guns only from baked glTF**, so `G.Models.assemble(def)` has to produce every valid build and `infoOf(def)` its info. A wrong-looking model is a bug here, not something the recipe papers over.

**What is declared and what is measured.** The recipes declare nothing new for the baker (the `userData.bake` anchors and `mesh.userData.at` they already carried are used: `at` pieces become their own tags). The pipeline does not reproduce the recipe's rules (the support hand = foregrip, else handguard limited by the barrel; the sight line with a magnifier; min / max / clamp): it **tabulates** them. For each platform it finds, by experiment on the recipe, which build slots each mesh slot's geometry and each `info` leaf depend on, then bakes a pack / table row for EVERY valid combination of the parts in those slots. A rule is then a lookup, exact for every combination. What stays empirical is the dependency set itself (below).

**Finding the dependencies** (`model_packs.mjs`, per platform):
1. the build set: the default, "loaded A", "loaded B" and every single swap from each (9,100 builds over all platforms), "provider builds" (a part that opens slots is fitted, then every slot it opened is swapped to every part, other slots to two random ones: an optic that takes a riser dot, a handguard that takes lights, a pistol chassis), and 600 random builds with 2 to 6 parts changed;
2. geometry: per mesh slot, a swap that reshapes it puts the swapped slot in its dep (a JOINT pack); one that only moves it becomes an anchor (`mount_<tag>`, a translation, summed over providers). The model is closed over every build: where a pack plus offsets does not predict a build, the slots that differ are blamed by delta debugging (the smallest set of slots whose change reproduces it) and join dep;
3. info: each leaf's dep is the slots whose swap changed it, closed the same way (two builds with the same parts in dep must agree); leaves with the same dep are one table;
4. coverage: for every tag and table, the product of what each dep slot can hold is enumerated and a real build made (parts set, `prune`d, kept if every part stayed) for every combination not shown yet. Analysis and coverage repeat until a round of 700 NEW random builds (2 to 10 parts changed, a different seed each time) teaches nothing and needs nothing, twice running. The baker then assembles every build it made (about 7,100 per platform: 323,000 in all, 23,900 of them made only to cover a combination) from the packs in memory and fails unless every triangle and every info leaf matches.

**Pieces that stand on another part** (`mesh.userData.at`, e.g. the iron front sight and a bead's rib on the barrel) are their own tag, `optic@barrel`: keyed by (barrel, optic, riserdot) with their own anchor, so the optic's pack no longer depends on the barrel (`optic` is keyed by optic and riser dot on the rail guns).

**Mount pieces** (optics and front sights; the contract's `mounts` entry above). An optic is one file on every gun: built in its own frame (origin on the rail top at its mount point), the gun-specific rail section, riser dot, adapter and the gun's own sight fixtures are the separate tag `optic@mount`; an iron front sight is a head `optic@barrel` (the same on every gun) on a base `optic@sightbase` (the column to the barrel, or a bead's rib). Result on the 79 platforms: tag `optic` 769 -> 287 files (what is left is the guns' own irons and traced sights), `optic@barrel` 333 -> 35, new `optic@mount` 42 and `optic@sightbase` 320; each real optic (op.pic.1-16, oem.op.pic.*) is ONE shape on all guns. Default guns' geometry is unchanged (the pieces only changed tag).

**Sharing.** After all platforms, packs that are the same shape up to a move (triangles within 2 micrometres of each other measured from the corner of the bounding box) are one file whether they are on two platforms or on one at two places: `assets/models/parts/_shared/<tag>/<hash>.glb`, in its own frame; each index entry carries `at`. This is by content, for every slot, with no list of what may be shared. The same part on a different gun is the same file unless the recipe draws it differently there (`assets/models/parts/inconsistent.json` lists, per part keyed by its own slot alone, the distinct shapes across guns; most of the optic entries are the same optic on guns whose iron-sight or rail frame differ and the entries that name the optic by itself list its no-riser-dot pack; real shape differences: the AR grip on the F2, the GM6 and the FAL (its own), the FAL's own wooden handguard `oem.hg.box.4`, the GM6's long-recoil barrel, the F2's barrel rings, the AKS-74U's gas block on its barrel).

**Index** (`assets/models/parts/<platform>/index.json`, version 2; `docs/gun-parts-index.schema.json`): `tags` (dep, packs: key, file, `at`, `nodes`), `anchors`, `info` (tables: dep, leaves, rows: key, v). Keys use `*` for any part, the most specific match wins; where collapsing keys to `*` would make two entries of the same specificity cover one build, the entries stay apart. A build with no exact entry is assembled from the nearest and `assemble` returns `approx` (never null once the platform's index and packs are loaded).

**API** (`G.Models`): `assemble(def, skin?)` -> `{ group, info[, approx] }`, `infoOf(def)` -> the info from the index alone (no pack files; `anim` holds node names; null until `loadIndex(id)` has loaded the index), `ensure(def)`, `preloadPlatform(id)`, `loadIndex(id)`, and the pure planner `planBuild(index, build)`, `pickPack`, `infoLeaves` / `infoFromLeaves`.

**Tests** (`npm run test:models`): `check_models_assembly.mjs` assembles the whole sweep (9,100 builds) and a held-out set of 10,000 random builds (3 to 6 parts changed, seed 99001, never learned) from the real files and compares each with the recipe: every difference per build is listed (slot triangles to 0.05 mm, every info leaf, animated parts and pivots, cached bounds), counts by kind, and `--report <dir>` writes `wrong.json` and a side view PNG (assembled | recipe | difference, markers at `info.support` and the sight point) for each wrong build. It fails on any wrong or not covered build.

**Results**: sweep 9,100 builds: 1,149 exact, 7,951 within tolerance (largest deviation 0.0001 mm), 0 wrong, 0 not covered. Held-out 10,033 builds: 1,892 exact, 8,141 within tolerance, 0 wrong, 0 not covered.

**Sizes** (gz): before (per platform packs only) 4,470 files, 17.1 MB; now 1,895 platform files (8.05 MB) + 485 shared files (1.47 MB) = 2,380 files, 9.52 MB, plus 79 indexes (0.52 MB gz; they carry the info tables and an entry per valid combination). Raw bytes by tag: optic 13.1 MB (773 files), grip 3.0, mag 2.3, optic@barrel 2.2, barrel 1.6, base 1.5, handguard 1.2, slide 0.8, stock 0.7.

**Bake time** is about 35 minutes for everything (a pistol platform takes about a minute: its optic is keyed by grip, slide, magnifier and riser dot, 67,000 combinations of which a few hundred are builds), `node tools/bake_models.mjs --parts <ids>` for some (sharing then only sees those platforms).

## Testing

Two separate steps, so CI can bake once and test separately, and a failed test never throws away a bake.

| step | command | does | never |
| --- | --- | --- | --- |
| GENERATE | `npm run bake:models` | runs the recipes and authored sources, measures which slots each pack depends on (the invariance sweep and a set of learning builds), writes packs, indexes, props; lists every coupling as a warning | assemble-and-compare validation, random validation rounds, the edge cases as checks |
| VALIDATE | `npm run test:models` (= `node tools/check_model_cases.mjs`) | the contract and schema checks, the bundle check (`bundle_models.mjs --check`, `bundle_models.test.mjs`), then the edge-case suite, the regression cases and the golden fingerprints, on the baked files | write models (only `--update-golden` writes tests/) |

**The edge-case suite** (`tools/model_cases.mjs`, committed as `tests/model-builds.json`: platform, `why`, build). The cases are GENERATED by rules from the parts data (`G.Gunsmith`: `slotsOf`, `compatible`, `fitsSlot` with the build so the barrel/handguard length rule `fitsLen` applies, `prune`, `defaultBuild`), so a new gun or part gets cases without anyone writing them. About 13 per platform (pistols about 25), 1,059 in all. Per platform:
- `default`; `bare` (every optional slot empty); `loaded` (every slot filled with its first part: both tac rails, a foregrip, a red dot and a magnifier where they fit); `loaded-last` (the last part of each slot);
- the shortest barrel with the longest handguard that fits it, and the longest barrel with the shortest handguard;
- every part that OPENS slots (railmounts, buttstock adapters, riser dots, a pistol chassis, handguards that give rails, barrels that give a handguard or muzzle mount), fitted, with the slots it opens filled (an optic that only opens the magnifier slot is left to the sight stack);
- the sight stack: the lowest and the tallest optic alone, a magnifier behind the lowest and behind the tallest optic that takes one (height is ranked by sight type and its riser / dot / scope size);
- pistols: each slide on the gun's own grip and on the pistol chassis, each grip under the gun's own slide, every one with a red dot (not the full cross, ~50 builds a gun);
- specials: integral suppressors, the biggest, the smallest and a drum magazine, a bipod, a suppressor on the muzzle.
Builds two rules give are one case carrying both labels. When the rules give something else (new part, new gun) the test fails with "tests/model-builds.json is not what the rules give": run `node tools/check_model_cases.mjs --update-golden` and review the diff of tests/. `node tools/model_cases.mjs` prints the cases per platform (`--list` with the labels).

**Regression cases** (`tests/model-regressions.json`, hand-maintained): every build that has ever assembled wrong, with a `why`. Add one whenever a model bug is found (a full build; the platform and `why`). A part id that no longer exists, or a build the gunsmith would prune, fails the test as STALE: map it to the current equivalent in the file and say so in `note` (the SR-25's handguard hg.ar.1 is now oem.hg.ar.10, for that reason).

**What is compared.** Each case is assembled from the packs (the real files, `G.Models.assemble`) and compared with the recipe; EVERY difference of a build is listed: triangles per slot, every info leaf, the animated parts and pivots, stale bounds. exact / within 0.05 mm / WRONG / NOT COVERED as before; any WRONG or NOT COVERED fails.

**Golden fingerprints** (`tests/model-golden.json`, committed): per case, per slot `{ tris, hash, box, area }` (hash of the triangles to 0.1 mm; box in mm; area in cm2) and every info leaf rounded, taken from the gun as assembled. They say what the gun IS whatever made it: once a gun is authored in Blender with no recipe to compare with, its cases are checked against the fingerprints approved before (a slot matches if its hash is equal, or its triangle count is equal, box within 0.15 mm and area within 0.2 %). `node tools/check_model_cases.mjs --update-golden` rewrites them (and the case list); the diff is reviewed in the commit. A case with no golden, or a golden with no case, is reported.

**The invariance sweep.** The default and two loaded builds x every single part swap (about 9,100 builds, `model_sweep.mjs`) shows, for each slot's geometry, whether a change in another slot only MOVES it (an anchor) or RESHAPES it (a coupling, kept as a joint pack). The baker reports every coupling as a warning, `pack<-slot` with the platforms. `tools/model_policy.mjs` holds `COUPLING_IS_ERROR` and `COUPLING_EXCEPTIONS`: flip the flag to make any coupling outside the list fail the bake. `node tools/check_model_cases.mjs --sweep` assembles the whole sweep from the packs and compares with the recipe.

**Held-out random set.** `node tools/check_model_cases.mjs --held 10000` (`npm run test:models:full` with `--sweep`; `node tools/check_models_assembly.mjs` is the same with the cases off): random builds, 3 to 6 parts changed, seed 99001, never seen by the baker. Not part of the default test.

**Contact sheets.** `node tools/model_cases.mjs --sheet <dir>` writes `<dir>/index.html` and one page per gun: every case and regression, a side view of the assembled gun (one colour per slot, one scale per gun) labelled with its `why` and its build.

**Adding a case.** A new KIND of case: add a rule in `generate()` in tools/model_cases.mjs. A build that went wrong: add it to tests/model-regressions.json. Either way, `--update-golden` and review.

**Timings** (24-core Windows machine, other bakes running alongside: contended). Bake alone (`node tools/bake_models.mjs`, guns + all 79 platforms' packs): about 7 minutes now; the same parts-only bake before this change took 21 minutes (it assembled and compared 323,000 builds; now 114,000 are built for the analysis). `npm run test:models` (tsc, schema and contract checks, then the suite): about 20 s, the suite itself 13 to 17 s for 1,048 cases + 7 regressions + golden. `--held 10000`: about 2 minutes, the sweep (`--sweep`) a little more. The last held-out run on the current bake had 10,033 builds and 1 wrong (a mac10 build with a railmount and a left-rail light, `tacL` shaped by an interaction the single-swap sweep and the learning builds do not show): the held-out set is a periodic check, not part of the default test, and the answer to a failure is a regression case plus a bake.
