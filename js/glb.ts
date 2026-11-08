// glTF gun models: the CONTRACT a 3D model must meet to be supported, one validator generated from it, and the loader.
//
// Everything a model author (Blender export script, hand edit, a Rust/Bevy loader) needs to know is in THIS file's first
// half (GUN_MODEL_CONTRACT): the node names and what they're for, the `info` anchors with units and frames, the material
// names, the extras keys. From that one definition come:
//   - validate(): a plain function over a ModelDesc (no THREE, no DOM), so it runs in node and in the browser. Used by the
//     baker (tools/bake_models.mjs fails loudly), by `npm run check:models <file.glb...>`, and by the ?checkModels flag.
//   - infoSchema(): a JSON Schema for the `info` extras (docs/gun-model-info.schema.json, written by `check:models --write`).
//   - contractMarkdown(): the field tables in docs/models.md (between its contract markers; `check:models --selftest` fails
//     when the committed doc or schema drifts from this file, and TypeScript fails when GunModelInfo and INFO_FIELDS differ).
// The second half loads the baked models (tools/bake_models.mjs, docs/models.md): the platforms' indexes at boot, the packs as they are needed.

// ===================================================================================================================
//  THE CONTRACT
// ===================================================================================================================

// (Scripts share one global scope: all of it lives inside one function, so its short names don't collide with the others'.)
const G_Models = (() => {
/** The `slot` a mesh belongs to (glTF node extras `slot`): which gunsmith part it is, so the gunsmith can highlight and pick it. */
const SLOTS = {
  base: 'base', grip: 'grip', stock: 'stock', mag: 'mag', barrel: 'barrel', handguard: 'handguard', muzzle: 'muzzle', optic: 'optic',
  slide: 'slide', charging: 'charging', tube: 'tube', limbs: 'limbs', fg: 'fg', pump: 'pump', cap: 'cap', motor: 'motor',
  tac: 'tac', tacL: 'tacL', magnifier: 'magnifier', railmount: 'railmount', loader: 'loader',
} as const;
type SlotName = (typeof SLOTS)[keyof typeof SLOTS];

/** The key of an animated sub-assembly: its node is named `part_<key>` and is listed under `info.anim.<key>`. */
const PARTS = {
  mag: 'mag', slide: 'slide', bolt: 'bolt', ch: 'ch', handle: 'handle', pump: 'pump', lever: 'lever', cyl: 'cyl', brk: 'brk', barrel: 'barrel', cover: 'cover', magn: 'magn',
  spin: 'spin', carry: 'carry', dial: 'dial', catch: 'catch', bipod: 'bipod', quarrel: 'quarrel', quarrelHead: 'quarrelHead', quarrelNock: 'quarrelNock', stringCocked: 'stringCocked', stringSlack: 'stringSlack',
} as const;
type PartKey = (typeof PARTS)[keyof typeof PARTS];

/** Names the node tree uses besides slots and parts. */
const NAMES = {
  /** A node that animates: `part_<key>`. Its pivot (the node's origin) is the part's hinge/slide point, in gun space. */
  partPrefix: 'part_',
  /** A plain grouping node with no animation (a hinge frame, say): `group_<n>`. */
  groupPrefix: 'group_',
  /** Extras key of a mesh node: its SLOTS value. Extras key of a `part_` node: its PARTS key. Root extras: `info` and `gun`. */
  extras: { slot: 'slot', part: 'part', info: 'info', gun: 'gun', anchors: 'anchors', display: 'display', pack: 'pack', owner: 'owner', parent: 'parent', leg: 'leg' },
  /** A display surface: a mesh named `display_<name>` (e.g. display_ammo). */
  displayPrefix: 'display_',
  /** An anchor that is a mount point for a slot's part: `mount_<slot>` (e.g. mount_muzzle), in `extras.anchors` and `info.mounts`. */
  mountPrefix: 'mount_',
} as const;

/** One animated part: what it is, and which `info` field has to say where it sits (null: none). */
interface PartSpec { doc: string; /** this `info.<field>` is non-null exactly when the model has this part */ pairedWith: keyof GunModelInfo | null }
/** One mesh slot. */
interface SlotSpec { doc: string; /** a model must have at least one mesh in it */ required?: boolean }
/** A catalogue material (G.GunMaterials.M.<name>). */
interface MaterialSpec { doc: string; /** the relief map (js/gunmodels.ts `relief`) rebuilt at load: stp = stipple pits, chq = chequering diamonds */ bump?: 'stp' | 'chq' }

// ---- the info anchors ------------------------------------------------------------------------------------------------

/** A `[forward, up, right]` position in metres in the gun's own frame (see GUN_MODEL_CONTRACT.frame). */
type Vec3 = [number, number, number];
/** A `[forward, up]` position in metres: the same frame, for places with no sideways offset. */
type Vec2 = [number, number];

/** Where a round sits in the chamber, per `side` (how the round is shown). */
type ChamberAt =
  | { side: 'right'; f: number; y: number; x: number }
  | { side: 'port'; f: number; y: number; x: number }
  | { side: 'top'; f: number; y: number; x: number; w: number }
  | { side: 'cyl'; z: number; R: number; r: number; n: number }
  | { side: 'breech'; heads: Vec2[]; r: number; z: number; bore?: boolean }
  | { side: 'face'; f: number; heads: Vec2[]; r: number; bore?: boolean };

/** A cocking handle / operating lever. */
interface HandleInfo { f: number; y: number; x: number; travel: number; grab?: Vec3; recip?: boolean; style?: string; sz?: number; stem?: number; lock?: number }

/** What `extras.info` on the root node says about the gun. Fields marked required must be present (and non-null); the others may be absent or null. */
interface GunModelInfo {
  sy: number; fSight: number; relief: number; muzzles: Vec3[]; grip: Vec3; support: Vec3; anim: Record<string, string>;
  magAt?: Vec2 | null; handle?: HandleInfo | null; port?: Vec3 | null; chamberAt?: ChamberAt | null;
  breech?: { at: Vec2; pitch: number; long: string | null } | null; ch?: Vec3 | null; bolt?: Vec3 | null; boltTravel?: number | null; cheek?: number | null; recoilBarrel?: number | null;
  pistol?: boolean | null; slide?: Vec3 | null; cylAt?: Vec3 | null; load?: { at: Vec2[]; pitch: number } | null; cup?: Vec3 | null; block?: { drop: number; lever: number } | null; magTop?: boolean | null; magRake?: number | null;
  quarrelMats?: Record<string, unknown> | null; mounts?: Record<string, Vec3> | null;
  // first-person extras (js/viewmodel.ts), written by whoever makes the model:
  reflex?: { f: number; y: number; w: number; h: number; round?: boolean | null; kind: string } | null;
  pip?: { f: number; y: number; r: number; parent?: string | null; pos?: Vec3 | null } | null;
  magnOut?: number | null;
  // a gun with several barrels (GUN_MODEL_CONTRACT.multi)
  barrels?: { n: number; free_bore_mm?: number | null; stack_mm?: number | null; rounds: Record<string, { round_mm?: number[] | null; rounds_each: number; effective_mm: number[] }>; default: string } | null;
  barrelGroups?: Record<string, number[]> | null;
  modeDial?: { at: Vec3; axis: Vec3; modes: string[]; stepDeg: number } | null;
  hinge?: { sequence: { part: string; axis?: string | null; at?: Vec3 | null; rotate_deg?: number | null; move?: Vec3 | null; frame?: string | null; note?: string | null }[] } | null;
}

// ---- the shape language the info fields are written in (the validator and the JSON Schema both walk it) --------------

type Shape =
  | { t: 'num'; min?: number; max?: number }
  | { t: 'bool' }
  | { t: 'str'; enum?: readonly string[] }
  | { t: 'vec'; n: 2 | 3 }
  | { t: 'list'; of: Shape; min?: number }
  | { t: 'obj'; props: Record<string, Field>; extra?: boolean }
  | { t: 'tagged'; tag: string; variants: Record<string, Record<string, Field>> }
  | { t: 'map'; of: Shape }
  | { t: 'free' };
/** A field: its shape, what it means (with units and frame), and whether it may be left out. */
type Field = Shape & { doc: string; optional?: boolean };

const F = <S extends Shape>(doc: string, shape: S, optional = false): S & { doc: string; optional: boolean } => ({ ...shape, doc, optional });
const num = (doc: string, optional = false, o: { min?: number; max?: number } = {}) => F(doc, { t: 'num', ...o }, optional);
const vec3 = (doc: string, optional = false) => F(doc, { t: 'vec', n: 3 }, optional);
const vec2 = (doc: string, optional = false) => F(doc, { t: 'vec', n: 2 }, optional);

const HANDLE_PROPS: Record<string, Field> = {
  f: num('Forward position of the handle, metres.'), y: num('Height of the handle above the origin, metres.'), x: num('Sideways position, metres, right positive (a left-hand handle is negative).'),
  travel: num('How far it moves back when worked, metres.', false, { min: 0 }),
  grab: vec3('Where the hand takes it, [forward, up, right] metres (default: its own [f, y, x]).', true),
  recip: F('True if it reciprocates with the bolt (an AK, a Thompson: it moves with every shot).', { t: 'bool' }, true),
  style: F('Shape of the handle (free text, e.g. "fold", "tube", "pair", "top").', { t: 'str' }, true),
  sz: num('Size of the handle, metres (free, per style).', true), stem: num('Length of the handle stem, metres (free, per style).', true),
  lock: num('A handle that locks the bolt open by turning about its own pivot (the HK slap handle: part_handle\'s origin is on the tube\'s axis): how far it turns up from rest into the notch, radians, positive turning the left side up. Its reload is the slap: pulled back, turned up into the notch, the magazine changed, slapped down.', true, { min: 0.05, max: 1.5 }),
};

/**
 * The contract. Read this to make a model: glTF 2.0 binary (.glb), meters, right-handed Y-up (the glTF default), the gun's
 * muzzle pointing to -Z.
 */
const CONTRACT_CORE = {
  version: 1,
  /** The frame every position is in. */
  frame: 'Metres. The glTF frame (x = right, y = up, z = -forward) with the origin at the gun\'s own origin (the point the recipe builds around: roughly the back of the receiver on the bore line). Every anchor in `info` is written [forward, up, right] = [-z, y, x]; a node\'s transform is in the same frame, so a part is built "in place" and its node origin is only its pivot.',
  /** Node tree. */
  tree: {
    root: 'The scene has exactly ONE root node, named after the gun id (e.g. "m4"). Its extras are { info: <GunModelInfo>, gun: <the same id> }. It has no transform.',
    meshes: 'Every mesh node is named "<slot>_<n>" (n unique in the file), has extras.slot = a SLOTS value, and one material from the catalogue. Meshes sit directly under the root, or inside a part_ / group_ node; the baker welds and quantises but never joins meshes.',
    parts: 'Every animated sub-assembly is a node "part_<key>" (a PARTS key) with extras.part = <key>, holding its meshes; its origin is the pivot (hinge or slide point). Each is listed in info.anim.<key> by node name; a part_ node that isn\'t listed, or a listed one that\'s missing, is an error.',
    groups: 'Any other grouping node is named "group_<n>".',
  },
  slots: {
    base: { doc: 'The receiver / frame and everything fixed: what no part of the build replaces.', required: true },
    grip: { doc: 'The pistol grip (or a pistol\'s grip panels).' }, stock: { doc: 'The stock, brace or buffer tube behind the receiver.' },
    mag: { doc: 'The magazine (and its follower/rounds): meshes of the slot whose node is also part_mag.' }, barrel: { doc: 'The barrel and its fixed fittings.' },
    handguard: { doc: 'The handguard / forend, with its rails.' }, muzzle: { doc: 'A muzzle device or suppressor.' }, optic: { doc: 'A sight: scope, reflex, irons riser.' },
    slide: { doc: 'A pistol slide (the node part_slide moves it).' }, charging: { doc: 'A charging handle.' }, tube: { doc: 'A shotgun\'s magazine tube.' },
    limbs: { doc: 'A crossbow\'s limbs.' }, fg: { doc: 'A foregrip.' }, pump: { doc: 'A pump\'s forend.' }, cap: { doc: 'A cap on the tube or barrel end.' }, motor: { doc: 'A rotary gun\'s motor housing.' },
    tac: { doc: 'A light or laser on the right-hand rail.' }, tacL: { doc: 'A light or laser on the left-hand rail.' }, magnifier: { doc: 'A magnifier behind a reflex sight (the node part_magn flips it aside).' },
    railmount: { doc: 'A clamp-on rail mount (a collar round the barrel with a short rail).' }, loader: { doc: 'A shotgun\'s side-saddle or loader fittings.' },
  } as Record<SlotName, SlotSpec>,
  parts: {
    mag: { doc: 'The magazine: drops out and swaps on a reload.', pairedWith: 'magAt' }, slide: { doc: 'A pistol slide: cycles with each shot.', pairedWith: 'slide' },
    bolt: { doc: 'An exposed bolt / carrier.', pairedWith: null }, ch: { doc: 'A charging handle.', pairedWith: null },
    catch: { doc: 'The bolt catch (an AR\'s paddle on the left of the lower, behind the magazine well): its origin is its pivot pin, and it turns about x (up to 0.14 rad, the upper arm tipping back) when the bolt is held open on an empty magazine; the hand presses it to send the bolt home (js/vmanim.ts).', pairedWith: null },
    handle: { doc: 'A cocking handle that reciprocates or is worked by the hand.', pairedWith: 'handle' }, pump: { doc: 'A pump-action forend.', pairedWith: null },
    lever: { doc: 'A lever-action lever.', pairedWith: null }, cyl: { doc: 'A revolver cylinder: it rotates (z) by 1/n per shot.', pairedWith: null },
    brk: { doc: 'A break-action barrel group that tips open on its hinge.', pairedWith: null }, barrel: { doc: 'A long-recoil barrel (runs back by info.recoilBarrel).', pairedWith: null },
    cover: { doc: 'A belt-fed gun\'s feed cover.', pairedWith: null }, magn: { doc: 'A magnifier that flips aside.', pairedWith: null }, spin: { doc: 'A rotary barrel group that spins.', pairedWith: null }, carry: { doc: 'A carry handle that flips up when a barrel block is changed (one step of info.hinge).', pairedWith: null }, dial: { doc: 'A fire-mode dial: turned about info.modeDial.axis by stepDeg per position of the selected mode (without it the game puts a marker on the dial).', pairedWith: null }, bipod: { doc: 'A bipod: its node holds the legs, each a child group with extras.leg (see "Bipods" below).', pairedWith: null },
    quarrel: { doc: 'A crossbow bolt, the whole assembly.', pairedWith: null }, quarrelHead: { doc: 'The crossbow bolt\'s head.', pairedWith: null }, quarrelNock: { doc: 'The crossbow bolt\'s nock.', pairedWith: null },
    stringCocked: { doc: 'The crossbow string, drawn.', pairedWith: null }, stringSlack: { doc: 'The crossbow string, released.', pairedWith: null },
  } as Record<PartKey, PartSpec>,
  materials: {
    names: {
      black: { doc: 'Black anodised metal.' }, gunmetal: { doc: 'Grey phosphate metal.' }, steel: { doc: 'Bright steel.' }, blued: { doc: 'Blued steel.' }, park: { doc: 'Parkerised finish.' },
      polymer: { doc: 'Black polymer.' }, tan: { doc: 'Tan polymer.' }, od: { doc: 'Olive drab polymer.' }, green: { doc: 'Green paint.' }, wood: { doc: 'Wood.' }, woodDark: { doc: 'Dark wood.' },
      plum: { doc: 'Plum bakelite (an AK-74 grip).' }, woodRed: { doc: 'Red-brown wood.' }, brass: { doc: 'Brass.' }, rubber: { doc: 'Black rubber.' },
      stipple: { doc: 'Stippled polymer grip.', bump: 'stp' }, chequer: { doc: 'Chequered metal or polymer.', bump: 'chq' }, chequerWood: { doc: 'Chequered wood.', bump: 'chq' },
      rust: { doc: 'Rusted metal.' }, tape: { doc: 'Wrapped tape.' }, clear: { doc: 'Translucent plastic (a see-through magazine).' }, glass: { doc: 'Dark glass.' },
      tubeDS: { doc: 'Double-sided black (a tube you see inside).' }, lens: { doc: 'Blue-coated lens.' }, germanium: { doc: 'A thermal sight\'s germanium objective: dark grey, a purple sheen.' }, reflexLens: { doc: 'Reflex sight glass.' }, clearLens: { doc: 'Clear lens.' },
      dot: { doc: 'Red emissive dot.' }, amber: { doc: 'Amber emissive.' }, glow: { doc: 'Cyan emissive.' }, sightPaint: { doc: 'White sight paint.' }, tritium: { doc: 'Green night-sight glow.' },
      redInsert: { doc: 'Red revolver ramp insert.' }, string: { doc: 'String / cord.' }, fabric: { doc: 'Fabric.' }, glove: { doc: 'Glove leather.' },
    } as Record<string, MaterialSpec>,
    anonymous: 'A one-off colour that isn\'t in the catalogue is named `m_<rrggbb>` (hex colour) and is kept as exported: a standard PBR material, no bump.',
    anonymousPattern: '^m_[0-9a-f]{6}$',
    rule: 'The material NAME is what counts: at load the catalogue\'s material of that name replaces whatever the file carries (its colours, roughness, emissive, transparency and bump map come from the game), so the game keeps its shared materials and its look. Give meshes the catalogue name; colours in the file only matter for anonymous materials and for viewing the file elsewhere.',
  },
  /** extras keys. */
  extras: {
    root: { info: 'The GunModelInfo object (INFO_FIELDS).', gun: 'The gun id, equal to the root node\'s name.', anchors: 'An AUTHORED SOURCE only (GUN_MODEL_CONTRACT.authored): the mount anchors, { mount_<slot>: [forward, up, right] } in the gun\'s frame. (Also written as the JSON text `anchors_json`, and `info` as `info_json`, for a tool that stores only flat custom properties: Blender.)' },
    mesh: { slot: 'A SLOTS value.', display: 'Display surfaces only: { width, height } canvas pixels.', chk: 'A magazine-check mesh (under part_mag): { role, i, t?, u?, side? } (GUN_MODEL_CONTRACT.magCheck).' },
    part: { part: 'The PARTS key of this part_ node.', anchors: 'Anchors this part provides, in its own frame (GUN_MODEL_CONTRACT.anchors).', owner: 'Pack files only: false when this node\'s pivot belongs to another pack (GUN_MODEL_CONTRACT.packs.nodes).', parent: 'Pack files only: the name of the node this one nests under.', leg: 'A leg of the bipod (a group_ child of part_bipod): { deploy: [rx, ry, rz] } (GUN_MODEL_CONTRACT.bipod).', check: 'part_mag only: { w, spine? }, the magazine-check data (GUN_MODEL_CONTRACT.magCheck).' },
    pack: { pack: 'Pack files only, on the root: { platform, tag, key } (GUN_MODEL_CONTRACT.packs.root).' },
  },
};

/** The `info` fields: shape, meaning, units. One entry per GunModelInfo key (TypeScript checks it): this is what validate() and infoSchema() walk. */
const INFO_FIELDS: { [K in keyof GunModelInfo]-?: Field } = {
  sy: num('Height of the line of sight above the origin, metres up: where the sight picture sits.'),
  fSight: num('Forward position of the front sight (or the sight\'s front), metres: with sy and relief it places the aiming eye.'),
  relief: num('Eye relief, metres: how far behind the sight the eye sits when aiming.', false, { min: 0 }),
  muzzles: F('Where the bullet leaves, one [forward, up, right] metres entry per barrel (usually one; an over/under has two, a barrel block more): never assume [0] is the only one. The flash, tracers and shot start here. A part may provide them (GUN_MODEL_CONTRACT.anchors).', { t: 'list', of: { t: 'vec', n: 3 }, min: 1 }),
  grip: vec3('Where the firing hand\'s palm sits on the grip, [forward, up, right] metres.'),
  support: vec3('Where the support hand takes the gun (handguard, foregrip, magazine), [forward, up, right] metres.'),
  anim: F('Animated parts: key (a PARTS value) -> the NAME of its `part_<key>` node. Rebuilt into live node references at load.', { t: 'map', of: { t: 'str' } }),
  magAt: vec2('Where the magazine seats: [forward, up] metres of its top/centre in the well. Present exactly when the model has a part_mag.', true),
  handle: F('The cocking handle, when there is one (part_handle).', { t: 'obj', props: HANDLE_PROPS }, true),
  port: vec3('The ejection port, [forward, up, right] metres: where spent cases leave.', true),
  chamberAt: F('Where a round shows in the chamber, as `side` says (a tagged union).', {
    t: 'tagged', tag: 'side', variants: {
      right: { f: num('Forward, metres.'), y: num('Up, metres.'), x: num('Right, metres.') },
      port: { f: num('Forward of the case head, metres.'), y: num('Up, metres.'), x: num('Right, metres.') },
      top: { f: num('Forward, metres.'), y: num('Up, metres.'), x: num('Right, metres.'), w: num('Width of the open top, metres.') },
      cyl: { z: num('Half the cylinder\'s length, metres (the face the rounds show on).'), R: num('Radius of the ring of chambers, metres.'), r: num('Radius of one chamber, metres.'), n: num('Number of chambers.', false, { min: 1 }) },
      breech: { heads: F('Case heads at the open breech: [sideways, up] metres from the hinge, one per barrel.', { t: 'list', of: { t: 'vec', n: 2 } }), r: num('Case radius, metres.'), z: num('Back/forward offset in the hinge frame, metres.'), bore: F('True: the bore shows there when it is empty.', { t: 'bool' }, true) },
      face: { f: num('Forward of the mouths of the chambers (the rear face of the barrels), metres.'), heads: F('Case heads in the chambers, fixed to the frame (a falling block bares them): [right, up] metres, one per barrel, in the order they are loaded.', { t: 'list', of: { t: 'vec', n: 2 } }), r: num('Case radius, metres.'), bore: F('True: the bore shows there when it is empty.', { t: 'bool' }, true) },
    },
  }, true),
  breech: F('A tipping breech (the Thor): where it sits once open.', { t: 'obj', props: { at: vec2('[forward, up] metres of the open breech from the hinge pin.'), pitch: num('Opening angle, radians.'), long: F('Which long handguard it carries, "irons" or "rail", or null.', { t: 'str' }, true) } }, true),
  ch: vec3('The charging handle\'s grab point, [forward, up, right] metres.', true),
  bolt: vec3('The bolt\'s rear, where the hand pulls it, [forward, up, right] metres.', true),
  boltTravel: num('A bolt worked by hand (the pistol with part_bolt): how far the bolt comes back, metres (absent: 0.12).', true, { min: 0.005, max: 0.3 }),
  cheek: num('A bullpup: the forward position (metres) the eye rests at when aiming, whatever sight is on the rail.', true),
  recoilBarrel: num('A long-recoil barrel: how far it runs back each shot, metres (0 or absent: none).', true, { min: 0 }),
  pistol: F('True for a handgun: the hands, the ADS and the holster use the pistol pose.', { t: 'bool' }, true),
  slide: vec3('A pistol slide\'s grab point, [forward, up, right] metres. Present exactly when the model has a part_slide.', true),
  cylAt: vec3('A revolver cylinder\'s centre, [forward, up, right] metres.', true),
  load: F('A break-open gun: where the open breeches are and the angle the barrels tip to.', { t: 'obj', props: { at: F('[forward, up] metres of each open breech.', { t: 'list', of: { t: 'vec', n: 2 } }), pitch: num('Tip angle, radians.') } }, true),
  cup: vec3('Where the left hand cups the frame (a derringer), [forward, up, right] metres.', true),
  block: F('A falling-block breech (the Hailstorm): part_brk is the block, which slides straight down `drop` metres to bare the chambers, and part_lever its lever, which swings down `lever` radians (about x, at its pivot) as it does.', { t: 'obj', props: { drop: num('How far the block drops, metres.'), lever: num('How far the lever swings, radians.') } }, true),
  magTop: F('True when the hand takes the magazine from its top instead of its base.', { t: 'bool' }, true),
  magRake: num('A raked magazine well (a Glock-pattern one, its bottom back like a pistol grip\'s): how far the magazine\'s axis is turned back from straight down, radians. A reload draws it out and seats it along that axis, and a non-factory magazine is drawn at that angle. Absent or 0: straight down.', true, { min: 0, max: 0.6 }),
  quarrelMats: F('A crossbow\'s bolt materials as three.js Material JSON (free-form; viewmodel only).', { t: 'map', of: { t: 'free' } }, true),
  mounts: F('Mount points where a swappable part sits, `mount_<slot>` -> [forward, up, right] metres of the part\'s origin (e.g. mount_muzzle: where a muzzle device screws on). Normally assembled from the parts\' anchors (see GUN_MODEL_CONTRACT.anchors); a whole-gun bake may list them directly.', { t: 'map', of: { t: 'vec', n: 3 } }, true),
  // first-person extras (js/viewmodel.ts applies them; the third person ignores them)
  reflex: F('A reflex or holographic sight\'s window (js/viewmodel.ts): the game draws a collimated reticle behind it, masked to it. f, y: the window\'s centre, [forward, up] metres; w, h: its size, metres (round: a disc of diameter w); kind: the reticle drawn: dot, dotG, dotP (a small precision dot), cdot or holo.', { t: 'obj', props: { f: num('Forward position of the window, metres.'), y: num('Height of the window, metres.'), w: num('Width, metres.', false, { min: 0 }), h: num('Height, metres.', false, { min: 0 }), round: F('True: a disc of diameter w.', { t: 'bool' }, true), kind: F('The reticle: dot, dotG (green dot), cdot (circle-dot) or holo (a ring).', { t: 'str', enum: ['dot', 'dotG', 'cdot', 'holo'] }) } }, true),
  pip: F('A scope\'s ocular lens (js/viewmodel.ts): the game draws the world through the scope on a disc there (picture-in-picture) with the reticle over it. f, y: its centre, [forward, up] metres; r: its radius. parent + pos: a lens that swings on a hinge (a magnifier\'s): the NAME of the node it hangs on and its place in that node, [x, y, z] metres in the node\'s own frame.', { t: 'obj', props: { f: num('Forward position of the lens, metres.'), y: num('Height of the lens centre, metres.'), r: num('Lens radius, metres.', false, { min: 0 }), parent: F('Node name the lens hangs on.', { t: 'str' }, true), pos: F('Place in the parent, [x, y, z] metres in its own frame.', { t: 'vec', n: 3 }, true) } }, true),
  magnOut: num('A flip magnifier (part_magn): the angle it swings to when flipped out, radians, as the game turns the node: about its own z axis (three.js, the axis along the tube pointing back at the eye; negative is clockwise as the shooter sees it, out to the right). From an authored magnifier\'s model.json magnifier.flip.out_deg. Absent: -2.8 (the procedural magnifier\'s).', true, { min: -3.2, max: 3.2 }),
  // a gun with several barrels (a barrel block: the Tempest)
  barrels: F('A gun with several barrels, each holding a stack of rounds fired nose to tail: n barrels (info.muzzles has one entry each, in the same order). The ROUND LENGTH loaded decides how many rounds a barrel holds, so the model lists the round types it takes in `rounds`, keyed by name (standard, rifle...): each has rounds_each (the rounds a barrel holds of that type), effective_mm (the length the bullet has run down the bore for the 1st, 2nd... last round of a barrel: rounds_each entries, longest last: the more rounds are gone, the longer the run) and round_mm [diameter, length] of one round (informational). `default` names the type a gun starts with. stack_mm is the length of a barrel\'s stack (the same for every type: a longer round, fewer of them) and free_bore_mm the part of the bore a fresh barrel has before its first round (both informational). The game takes the speed of a shot from the effective length (GUN_MODEL_CONTRACT.multi).', { t: 'obj', props: { n: num('How many barrels.', false, { min: 2 }), free_bore_mm: num('The bore a fresh barrel has before its first round, millimetres.', true), stack_mm: num('The length of a barrel\'s stack of rounds, millimetres (the same for every round type).', true), rounds: F('The round types the block takes, by name: each { round_mm, rounds_each, effective_mm }.', { t: 'map', of: { t: 'obj', props: { round_mm: F('One round: [diameter, length], millimetres.', { t: 'list', of: { t: 'num' } }, true), rounds_each: num('Rounds a full barrel holds of this type.', false, { min: 1 }), effective_mm: F('The effective barrel length for each round of a barrel in turn, millimetres: shortest first.', { t: 'list', of: { t: 'num' }, min: 1 }) } } }), default: F('The round type a gun starts with (a key of rounds).', { t: 'str' }) } }, true),
  barrelGroups: F('Named groups of barrels (indices into info.muzzles): the game fires the "top" or "bottom" group for a three-barrel pull and "all" for every barrel.', { t: 'map', of: { t: 'list', of: { t: 'num' } } }, true),
  modeDial: F('A fire-mode dial on the model, turned with the selected mode: at its centre [forward, up, right] metres, axis the way it turns, modes the positions in order (the game\'s fire modes), stepDeg the angle between two positions. The mesh that turns is part of the model; the game only reports the angle.', { t: 'obj', props: { at: vec3('The dial\'s centre.'), axis: vec3('The axis it turns about (a unit vector).'), modes: F('The fire modes, in dial order.', { t: 'list', of: { t: 'str' }, min: 1 }), stepDeg: num('Degrees between two positions.') } }, true),
  hinge: F('A sequence of moves that takes the gun apart for a reload (the Tempest changes its whole barrel block): each step moves one part_ node, in order; the reload animation plays them forward (the old block comes out) and back (the new one goes in). part: the node (its key, "lever", or its name "part_lever"); rotate_deg turns it about axis x, y or z (three.js rotation, degrees) at its pivot; move slides it [forward, up, right] metres, in the frame of the part_ node named by frame (default: its own parent\'s). GUN_MODEL_CONTRACT.multi.', { t: 'obj', props: { sequence: F('The steps, in order.', { t: 'list', of: { t: 'obj', props: { part: F('The part_ node this step moves.', { t: 'str' }), axis: F('The axis a rotation turns about: x, y or z.', { t: 'str' }, true), at: vec3('Where the axis is (informational: the node\'s own pivot is used).', true), rotate_deg: num('Degrees about the axis.', true), move: vec3('A slide, [forward, up, right] metres.', true), frame: F('A part_ node whose frame the move is in.', { t: 'str' }, true), note: F('What it is (free text).', { t: 'str' }, true) } }, min: 1 }) } }, true),
};

/** Info fields a part may provide as anchors (the rest of info is the whole gun's). */
const ANCHOR_KEYS = ['muzzles', 'grip', 'support', 'magAt', 'port', 'ch', 'bolt', 'slide', 'cylAt', 'cup', 'cheek', 'chamberAt'] as const;

/** The whole contract: CONTRACT_CORE (frame, node tree, slots, parts, materials, extras) + display surfaces + part-provided anchors; `info` is INFO_FIELDS. */
const GUN_MODEL_CONTRACT = { ...CONTRACT_CORE, displays: {
  naming: 'A mesh node named `display_<name>` (name: lower-case letters/digits/underscores, e.g. `display_ammo`) is a display surface: the game paints it at runtime with a CanvasTexture (the way reflex reticles are drawn), so the model only says where and how big. It still needs extras.slot (the part it belongs to) like any mesh.',
  uvs: 'It MUST have UVs (TEXCOORD_0, covering the 0..1 square: the canvas is mapped across it, u right, v up). A display without UVs is an error.',
  size: 'extras.display = { width, height } in pixels: the canvas resolution the game should draw at (a hint, powers of two preferred); width / height is the intended aspect ratio of the surface, so author the UVs un-stretched for it. Required.',
  material: 'The loader does NOT swap its material for a catalogue one (any material name is accepted, `display` suggested): the game replaces it with the canvas texture\'s material. Everything the loader does to other meshes (catalogue materials, bump maps) is skipped for it.',
  example: { name: 'display_ammo', extras: { slot: 'barrel', display: { width: 128, height: 32 } } },
}, magCheck: {
  what: 'The magazine check (hold R: the magazine is pulled out and looked at) shows what is in it on the magazine\'s own body: the top round, witness holes stamped with a count, or the rounds themselves through a clear body. The model says which of its meshes are those (js/gunrig.ts reads it; a gun without it simply shows nothing).',
  part: '`part_mag` has extras.check = { w, spine? }: w the magazine\'s width in metres (the width of a hole\'s stamped count); spine (a clear magazine that has a follower and spring) the centreline samples [[t, f, y, tilt], ...] from t = 0 (the top round) down to the floor plate (the last sample\'s t): f and y the centre in metres in the gun\'s frame (forward, up), tilt the radians of a mesh rotation about x on the face there (the turn a round or hole has). t is the depth the rounds are read at.',
  meshes: 'Meshes under `part_mag` carry extras.chk = { role, i, t?, side? }: role "top" (the round on top: i 0 its case, i 1 its tip; the game colours them for the load), "hole" (a witness hole, i = its order from the top, t = 0..1 how far down the stack it reads, side = 1: holes go down the back face of the magazine only (toward the shooter, what you see checking it; the front has none), each its own mesh, and the game stamps the count beside each. The rotation of the mesh node is the tilt of the face there: on a curved magazine each hole, and the count beside it, follows the curve; a round of a clear magazine leans with it the same way), "round" (the i-th round drawn through a clear magazine, t = how far down), "tip" (the bullet tip of round i), "follower" (the follower plate: i 0, t = the depth it is drawn at) and "spring" (coil i of the spring: t = the depth it is drawn at, u = 0..1 how far from the follower to the floor plate it sits). The game slides the follower to just under the lowest round that is in (under the top round when none is below it) and spreads the coils evenly from it to the floor plate along check.spine, each moved by the spine\'s difference between the depth it is drawn at and its new one (position and tilt about x): the spring is extended when the magazine is empty, squeezed on the floor plate when full, and a curved magazine\'s follows the curve. They are drawn at any one pose (their node transforms are the rest pose); only clear magazines have them (an opaque body would hide them) and a model without them, such as a drum, simply shows none. Every mesh keeps a slot and a catalogue material like any other; the game replaces their materials as the rounds change. A gun with a magazine check has both top meshes.',
  example: { name: 'part_mag', extras: { part: 'mag', check: { w: 0.024 } }, child: { name: 'mag_91', extras: { slot: 'mag', chk: { role: 'hole', i: 0, t: 0.1567, side: 1 } } } },
}, multi: {
  what: 'MULTI-BARREL GUNS AND RELOAD SEQUENCES (any gun; the first is the Tempest). A gun with several barrels says so in info.barrels = { n, rounds: { <type>: { rounds_each, effective_mm: [...] }, ... }, default } (info.muzzles has n entries, barrel i at muzzles[i]); the game keeps rounds_each rounds per barrel (of the round type loaded in the block: a longer round, fewer of them in the same stack) and fires from the barrels the fire mode asks for. info.barrelGroups names sets of barrels by index (top, bottom, all).',
  speed: 'rounds.<type>.effective_mm[k] is the effective barrel length of the (k+1)-th round of that type fired from a fresh barrel: the more of a barrel\'s stack is gone, the longer the bore the next round runs down. The game sets the shot\'s muzzle velocity from it (js/data.ts G.shotDef: damage, which goes with the energy, and range run from a fraction, def.barrels.full = 0.8, of the full figures at the shortest length to 1.0 at the longest). The report is the synth\'s for that barrel length, with its pressure and charge scaled by it (js/parts.ts soundSpec) and the shot\'s gain by the square of the same factor, so a barrel sounds fuller and louder as it empties. A shot from several barrels plays one report per barrel, stacking.',
  display: 'A display surface named display_ammo (the contract\'s Display surfaces) is painted with the rounds left: one row per barrel in info.muzzles order, one pip per round (lit while the round remains); u runs left to right and v away from the shooter\'s end (js/viewmodel.ts).',
  dial: 'info.modeDial = { at, axis, modes, stepDeg }: the fire-mode dial, turned about its axis by stepDeg for each position of the selected mode in modes (js/player.ts). If the model has a `part_dial` node (PARTS key dial) holding the dial\'s meshes, that node turns about its pivot; without one the game puts a marker on the dial\'s face at `at` and turns that (the model\'s own pointer then stays where it was drawn).',
  hinge: 'info.hinge (root extras.hinge_json) = { sequence: [...] }: the steps of a reload that takes the gun apart, in order, each moving ONE part_ node by rotate_deg about axis x, y or z (three.js rotation about the node\'s own pivot) or by move [forward, up, right] metres in the frame of the part_ node named by frame (default: its parent\'s). Parts may nest (part_brk > part_pump > part_mag > part_carry): a pack stores each node under its parent (extras.parent) and the assembled gun nests them, so a step moves everything inside the node. The viewmodel plays the steps one after another over the first half of the reload (the old block comes out), then back (the new one goes in): js/vmanim.ts hingeClip. The sequence is data, not a gun: any model with a hinge_json gets the animation. Part keys used: lever, carry, pump, brk and mag keep their ordinary names but are driven only by the sequence on a gun that has one.',
  example: { barrels: { n: 6, rounds: { standard: { rounds_each: 7, effective_mm: [244, 288, 332, 376, 420, 464, 508] }, rifle: { rounds_each: 4, effective_mm: [310, 375, 440, 508] } }, default: 'standard' }, barrelGroups: { top: [0, 1, 2], bottom: [3, 4, 5], all: [0, 1, 2, 3, 4, 5] }, hinge: { sequence: [{ part: 'part_lever', axis: 'x', rotate_deg: 40 }, { part: 'part_mag', move: [0, 0.1, 0], frame: 'part_brk' }] } },
}, bipod: {
  what: 'A BIPOD is one node, `part_bipod` (PARTS key bipod, listed in info.anim.bipod), whose children are its LEGS: each leg is a `group_<n>` node with extras.leg = { deploy: [rx, ry, rz] } holding that leg\'s meshes. A leg\'s pivot (its node origin) is its hinge. The model is drawn FOLDED: every leg at rotation 0. part_bipod\'s own origin is only a reference point (the first hinge) and nothing turns it. The legs\' meshes are slot fg when the bipod is a foregrip option (the Kodiak) or slot base when it is part of the gun (a machine gun\'s, a sniper rifle\'s); one gun may have both, in the one part_bipod node.',
  pose: 'extras.leg.deploy is the leg\'s rotation when the bipod is DOWN: three numbers, radians, an XYZ Euler rotation about the leg\'s pivot in the gun\'s frame (x right, y up, z back), the legs pointing at the ground and splayed a little. A leg folded back along the gun (its foot behind the hinge) turns by +PI/2 about x, one folded forward by -PI/2. Folded is rotation 0 (how the meshes are drawn): the folded and the deployed pose are both data of the model.',
  drive: 'The game drives every leg with the same rule: rotation = deploy * smoothstep(k), k from 0 (folded) to 1 (down) over a quarter of a second, set by the player\'s stance and what is in front of the gun (js/player.ts bipodStep for the first person, a remote player\'s state in js/rig.ts for the third) and posed by G.GunRig.bipodPose(part_bipod node, k). The first-person model poses the live part_bipod node; the third-person (merged) model pulls each leg out on its own so it can turn.',
  packs: 'In a pack the part_bipod node holds no mesh itself (the base pack owns it); each leg is a group_<slot>_<n> node with extras.parent = "part_bipod" and extras.leg, directly under the pack root like every node.',
  example: { name: 'part_bipod', child: { name: 'group_7', extras: { leg: { deploy: [1.5708, 0.2, 0] } } } },
}, anchors: {
  where: 'A node may carry `extras.anchors`: positions it PROVIDES, in the node\'s OWN frame (the same [forward, up, right] metres, measured from the node\'s origin along its axes; a part\'s mesh positions are in that same frame). Allowed on `part_<key>` and `group_<n>` nodes, and on the root of a per-part pack (a .glb holding one swappable part). Keys are the info anchors a part can provide (' + ANCHOR_KEYS.join(', ') + ') or a mount point `mount_<slot>` (a [forward, up, right] vec3; e.g. mount_muzzle on a frame says where a muzzle device sits).',
  assembly: [
    'Assembly (the per-part pieces follow the same rules: GUN_MODEL_CONTRACT.packs; the rule applies to the node tree of a whole-gun file) starts from the receiver\'s `info` and visits the parts in the gunsmith\'s slot order.',
    'Every provided position is first moved into the gun\'s frame: the providing node\'s transform in the assembled gun applied to the position (the part\'s placement), then re-expressed as [forward, up, right] = [-z, y, x].',
    '`muzzles` is a LIST built from whichever parts provide it: if any part provides `muzzles`, the gun\'s `info.muzzles` is the concatenation of those parts\' lists (tree order) and the receiver\'s own default is dropped; if none does, the receiver\'s is kept. A barrel block with 6 barrels provides 6 muzzles.',
    '`mount_<slot>` anchors are OFFSETS: the displacement [forward, up, right] metres of the part in <slot> from where its piece sits when no part offsets it (no offset from the provider itself: GUN_MODEL_CONTRACT.packs offsets). Every provider\'s offsets for a slot ADD UP (a barrel and a handguard may both move a light); the sum is `info.mounts.mount_<slot>` and the whole part moves by it.',
    'Every other anchor (grip, support, magAt, port, ch, bolt, slide, cylAt, cup, cheek, chamberAt) is single-valued: a part\'s value overrides the receiver\'s and an earlier part\'s (the last provider in slot order wins; the validator warns when two parts of one gun both provide it).',
  ],
  muzzles: 'A gun can have MORE THAN ONE muzzle (an over/under, a Metal Storm-style barrel block): `info.muzzles` is always a list of at least one [forward, up, right]; consumers must iterate it and never assume entry [0] is the only one.',
  example: { name: 'part_barrel', extras: { part: 'barrel', anchors: { muzzles: [[0.4, 0.012, -0.012], [0.4, 0.012, 0.012]], mount_muzzle: [0.4, 0, 0] } } },
}, packs: {
  layout: 'assets/models/parts/<platform>/index.json and assets/models/parts/<platform>/<tag>/<file>.glb: one file per PIECE (a part\'s shape on that platform), never per combination of parts; a piece that is the same shape on several platforms (or at several places) is stored once, in assets/models/parts/_shared/<tag>/<file>.glb (see "shared"). The bake\'s output and its work grow with the number of parts and platforms: each part fitted once from each base build (the platform\'s default and loaded builds), nothing enumerated over combinations.',
  pack: 'A piece file is a glTF binary holding ONE tag\'s meshes (every mesh extras.slot = the tag\'s mesh slot) as ONE part draws them (its provider: "tags"), in the gun\'s frame as in the build it was taken from (or, shared, from its bounding box\'s corner); `at` in the index moves it to where it sits when no other part offsets it. A tag is a mesh slot, or `<slot>@<anchor>` for a piece placed by another part (optic@barrel: an iron sight\'s front post, on the barrel).',
  root: 'The file\'s one root node is named `<platform>.<tag>.<n>` and has extras.pack = { platform, tag, key: { <slot>: <partId> } (the provider; {} for the platform\'s own or a shared file) }. No transform, no info. Its children are meshes (`<slot>_<n>`), part_ nodes and group_ nodes, all flat directly under it.',
  nodes: 'part_ and group_ nodes sit directly under the root with their position = the pivot in the GUN\'S frame (not relative to a parent); extras.parent names the node they nest under in the assembled gun (absent: the gun\'s root). extras.owner = false means the pivot belongs to another piece (e.g. an optic\'s meshes inside the slide\'s part_slide: the slide\'s piece owns the node, the optic\'s repeats it so the meshes know where it is); the assembler takes the node from its owner (default: owner) and re-expresses every other piece\'s meshes against it. Group nodes are named `group_<slot>_<n>` so they are unique across pieces.',
  index: 'The platform index.json (version 3) is { version, platform, src, slots, tags, anchors, values, info }: tags: { <tag>: { from: [<build slot>...], pieces: { "<slot>=<partId>" | "" [+ "#<label>"]: { file, at: [f,u,r], nodes?, rear?, len?, len0?, tris, bytes } }, vary?, cond?, stretch?, show?, cap?, pair? } }; anchors: { "<slot>=<partId>": { mount_<tag>: [f,u,r], "mount_<tag>?<slot>": [f,u,r], len_<tag>, cap_<tag>, pair_<tag> } }; values: { "<slot>=<partId>" | "": { <spec key>: <JSON text> } }; info: { <leaf>: { from, skip?, own: { <provider>: value }, vary?, off?: { <slot>: { x: { "<slot>=<partId>": n }, y?: { <slot>: { ... } } } }, max?: { by, v } } }. A build slot is the gunsmith\'s slot id (barrel, handguard, optic, riserdot, tac...); "<slot>=" (nothing after the =) is the slot left empty, which may give offsets too. docs/gun-parts-index.schema.json is the JSON Schema.',
  tags: 'WHO DRAWS A TAG. Its provider is the first slot of `from` that is filled (a dot on a riser before the riser: riserdot before optic); its part\'s piece is pieces["<slot>=<partId>"]; with `from` empty, or none of its slots filled, the provider is "" (the platform\'s own piece). A provider with no piece draws nothing of the tag: the tag is absent (a red dot has no front sight post).',
  variants: 'VARIANTS (vary: { by, key }). Where a part draws a few shapes, the piece key gets "#<label>", the label being the deciding part\'s spec value: values["<by>=<partId>"][key], else values[""][key], else "null"; "none" when the slot `by` is empty. The variants found are listed in docs/models.md ("Per-part bake"): the railmount\'s collar by the bore it clamps round, the Thor\'s irons by its barrel\'s sight rise.',
  offsets: 'PLACEMENT. The piece moves by `at` plus the SUM over every build slot s other than the provider\'s own of anchors["<s>=<part in s>"].mount_<tag> ([forward, up, right] metres; an empty slot is "<s>="); plus, for each slot c of `cond` that is filled, the sum of anchors[...]["mount_<tag>?<c>"] (an offset a part gives only while another slot is filled: a barrel moves the sight forward only with a magnifier behind it). A CAP (cap: { axis, by, of, op }) replaces, on one axis, the sum over the `of` slots by min (op "min") or max of it and anchors["<by>=<part>"].cap_<tag> (when that part has one). A PAIR (pair: { axis, h, by, op }) makes the offset on one axis min (or max) of anchors["<h>=..."].pair_<tag> and anchors["<by>=..."].pair_<tag> (either alone when the other has none): a railmount at its handguard\'s end, no further than the barrel allows.',
  stretch: 'STRETCH (stretch: true; the piece has rear, len, len0). The piece is scaled along the bore about its rear: every point\'s forward position in the file f becomes rear + (f - rear) * L / len, then the piece is moved as any other; L = len0 plus the sum over the slots but the provider\'s of anchors[...]["len_<tag>"]. Exact for the boxes it is used on (a bead sight\'s rib, as long as the barrel runs: its normals are along the axes). A negative L (a barrel that ends behind where the rib starts) reverses it.',
  show: 'THRESHOLD (show: { a: [slot, key], b: [slot, key], gt }). The tag shows only while value(a) - value(b) > gt, value(s, key) being values["<s>=<part>"][key] else values[""][key] (parsed JSON): the G36\'s barrel sleeve, only where the barrel is longer than its handguard by more than the sleeve. The bake builds every pair of parts whose difference falls between the last absent and the first present one, so gt is exact for every pair the catalogue can make.',
  info: 'INFO. Each leaf of `info` (a/b/0 paths: infoLeaves) is PROVIDED: by the first filled slot of its `from` whose part is not in `skip`, else the platform (""); with `vary`, "#<label>" as a tag\'s. Its value is own[provider] ({ "del": 1 }: the leaf is absent), plus, when off[<provider\'s slot>] is given, the sum over the other slots of off[...].x["<slot>=<part>"] and, for each condition slot c filled, of off[...].y[c][...]: a part\'s value moves with the part (the sight line with the optic\'s riser and a magnifier, the support hand with the handguard a foregrip is on). With `max: { by, v }` the leaf is the larger of that and v[<the part in by>] (a pistol chassis\'s front, ahead of a short slide\'s muzzle). The offsets are solved exactly from the recipe\'s values. Then `info.anim` from the pieces\' nodes and `info.mounts` (mount_<tag>: each piece\'s offset) for reference.',
  assembly: 'ASSEMBLY (G.Models.assemble(def) in js/glb.ts, synchronous: the piece files must be loaded, G.Models.ensure(def) / preloadPlatform(id) load them; G.Models.planBuild(index, build) is the pure planner, no three.js). For each tag: the provider and its piece (or none), the offsets, the stretch; the owner nodes from the pieces, every piece\'s meshes placed against them. G.Models.infoOf(def) gives the build\'s info from the index alone (no piece files), synchronously. A build the index cannot plan (a part it has no piece or value for) is assembled from what it has and the result says `approx` (the tests count that as a failure).',
  shared: 'SHARED PIECES. A piece that is the same shape on several platforms (an optic, a magnifier, a light, a foregrip, a muzzle device) or at several places is stored once: in assets/models/parts/_shared/<tag>/<file>.glb, in its own frame (the origin at the corner of its bounding box: smallest forward, up and right), and each platform\'s piece entry names it with the `at` that places it. Two pieces are one when their triangles agree to 2 micrometres after the move.',
  mounts: 'MOUNT PIECES (optics and front sights). A sight is ONE object, the same file on every gun, built in its own frame: the origin on the TOP of the rail (the surface its foot rests on) at its mount point, centred; metres, [forward, up, right]; everything it tells the game (sy, fSight, relief, reflex, pip, mount_magnifier) is in that frame. What is specific to a gun between the gun and the sight is a MOUNT PIECE, a tag of its own: `optic@mount` (the rail section under the sight, a riser, an adapter, the fixtures of the gun\'s own sights, a pistol optic plate). An iron front sight is its HEAD `optic@barrel` (post, ears, hood: placed by the barrel, at the length its front sight stands) on its BASE `optic@sightbase` (the column from 4 mm over the bore up to the head); a bead `optic@barrelend` (at the barrel\'s end), its rib `optic@rib` (stretched) and the rib\'s posts `optic@ribpost<i>`; a front sight at the barrel\'s end of a gun\'s own irons `optic@barrelend` and its base `optic@endbase`. A recipe draws a piece of another part\'s with k.at(<anchor>).',
  verify: 'VERIFICATION. In the bake, per platform: every rule is solved from the builds and must explain each of them exactly (each piece against every build it is in, each offset across the parts it applies to, each info leaf to 1e-9); then every one of those builds and a random sample of others (MODELS_SAMPLE a platform, 5 by default: a few hundred) is planned from the index by the game\'s own planner and compared with the recipe vertex for vertex (to 0.01 mm) and leaf for leaf; the bake fails otherwise. `npm run test:models` assembles the edge cases and regressions through the real files (glb, decoder, assembler) against the recipe and the golden fingerprints; `npm run test:models:full` adds the whole sweep and 10,000 random held-out builds.',
}, authored: {
  what: 'AUTHORED SOURCE. A gun modelled in Blender is baked straight from its .glb with no recipe (tools/bake_authored.mjs, `npm run bake:models`). The source is models/<id>/<id>.glb plus models/<id>/model.json ({ "source": "authored", "sights": { "builtin": [<optic kinds that mean the gun\'s own sights>], "rail": [<of those, the ones that still sit on a rail piece: a riser>] } }); the model is the authority for everything it holds, and a gun without model.json keeps being built by its recipe. `npm run check:models -- models/<id>/<id>.glb` validates a source (validateAuthored).',
  nodes: 'The scene has one root node named after the gun. Its children are the base (receiver) and the gun\'s FACTORY parts, as meshes "<slot>_<n>" with extras.slot (the contract\'s slots) and a catalogue material: the base is every mesh of slot base that is not in a part_ node; the stock, grip, handguard, barrel, muzzle and optic (the irons) meshes are the parts the gun\'s default build fits, and the model must hold meshes for every slot the default build fills; the magazine is the node part_mag with its meshes (slot mag), the charging handle part_handle (slot base); every moving part is a part_<key> node (contract parts) with its pivot at the node origin and listed in info.anim. A factory part\'s id is the platform\'s (js/parts.ts), not written in the model.',
  info: 'Root extras.info (or the JSON text info_json): the factory build\'s info, exactly INFO_FIELDS (sy, fSight, relief, muzzles, grip, support, anim, magAt, handle, port, chamberAt, ...).',
  anchors: 'Root extras.anchors (or anchors_json): the gun\'s MOUNT ANCHORS, [forward, up, right] metres in the gun\'s frame, the places the gun\'s non-factory parts are seated on. Every part the gun accepts that is not one of the model\'s own is built at its own designed size and placed on these, never stretched: the table lists them. A `_end` anchor is the far end of a span. Further `mount_<slot>` anchors (a side rail: mount_tac, mount_tacL) are allowed and are carried into info.mounts.',
  required: {
    mount_optic: 'the START of the optic rail on the receiver: [forward, the receiver\'s top height, 0]. A rail piece is built over mount_optic .. mount_optic_end when a real optic (or one of sights.rail) is fitted; an optic sits on it by the platform\'s spec (optF).',
    mount_optic_end: 'the END of that rail: [forward, top, 0]. Same height as mount_optic.',
    mount_handguard: 'where a handguard starts (the barrel nut\'s front): [forward, up, 0]. The platform\'s spec L is this forward value.',
    mount_handguard_end: 'the furthest forward a handguard may reach (the gas block\'s rear): [forward, up, 0]. A handguard longer than mount_handguard_end - mount_handguard - 3 mm is not offered for the gun (the platform\'s spec hgMax in js/parts.ts says so; the baker checks they agree). Nothing is clamped.',
    mount_muzzle: 'where the factory barrel ends and a muzzle device screws on: [forward, up, 0]. Another barrel\'s end is this plus its length difference from the factory one; the factory muzzle device (slot muzzle) is modelled to start here.',
    mount_barrel: 'where the factory barrel begins (the start of the slot barrel meshes, ahead of the last fixed fitting): [forward, up, 0]. Slot barrel holds only the factory barrel itself, which any other barrel replaces whole: its fixed fittings (gas block, gas tube, sight base, bayonet collar) are slot base, and stay when another barrel is fitted. Another barrel is the shared one of its length and profile, ending where that length ends from mount_muzzle (nothing in the model is resized).',
    mount_stock: 'where a stock is seated: [0 or the receiver\'s back, the centre height of the wrist at the receiver\'s back, 0].',
    mount_grip: 'where a grip is seated: [forward of the grip\'s front, the height of the receiver\'s underside, 0]; the grip hangs from that height.',
    mount_mag: 'the magazine well: [forward, up, 0] of the top of a magazine seated in it (equal to info.magAt).',
  },
  optional: {
    mount_optic_rail: 'the START of the rail on the gun\'s own optic mount (opticMount below): [forward, the rail\'s top, 0]. Required with an optic mount, allowed only with one.',
    mount_optic_rail_end: 'the END of that rail: [forward, top, 0]. Same height as mount_optic_rail.',
  },
  opticMount: 'THE GUN\'S OWN OPTIC MOUNT. A receiver with no rail takes a rail sight on an adapter of its own (the MP5\'s claw mount: a Picatinny rail on clamps whose claws hook into recesses in the receiver). The model holds it as meshes of slot optic with extras.mount = true (outside any part_ node): they are drawn, as the optic\'s mount piece (optic@mount), whenever a real optic or one of sights.rail is fitted, INSTEAD of the generic rail piece over mount_optic .. mount_optic_end, and never with the gun\'s own irons (they are not the irons: nothing looks through them). The sight stands on the adapter\'s rail top at the platform\'s optF: mount_optic_rail .. mount_optic_rail_end is that rail, its height is the top the optic\'s foot rests on (so info.sy follows it), and optF must lie on it (the baker checks). mount_optic / mount_optic_end stay the receiver\'s top under it.',
  pistol: 'AUTHORED PISTOLS. A pistol (root extras.info.pistol = true) uses the pistol anchor set instead of the rifle one: REQUIRED mount_barrel (where the factory barrel/suppressor begins) and mount_mag (= info.magAt); mount_slide ([the slide\'s rear, the frame\'s slide seat height, 0]) when the pistol has a slide (info.anim.slide = part_slide); and, for each thing the platform lets you fit, the anchor the part is seated on: mount_optic (+ mount_optic_end, equal: the optic cut\'s centre on the slide\'s top, [forward of the slide\'s rear, the cut\'s floor, 0]; a pistol sight sits there), mount_tac (a light or laser under the frame: [forward, the underside, 0]), mount_grip, mount_stock (optional). The muzzle is info.muzzles[0]. The slots are the same as a rifle\'s: the frame is slot base (a slide, an action knob or a control that moves is a part_ node), the slide is slot slide in part_slide, the barrel slot holds the whole barrel/suppressor with its front sight, the grip slot (when the grip is a part), mag in part_mag, optic the rear sight and the optic cut\'s cover plate. A slideless pistol (a manually cycled one) moves its bolt in part_bolt (info.anim.bolt) and the model carries info.bolt, the knob the hand takes. The same rules as a rifle\'s otherwise: the platform in js/parts.ts says which of those anchors it uses and the baker checks they agree (mount_optic against the pistol\'s optic cut, mount_mag against its spec).',
  variants: 'AUTHORED VARIANTS. A per-gun part modelled beside the gun: models/<id>/<name>.glb (any other .glb in the gun\'s folder than <id>.glb), offered on that gun only. ONE root node named <id>_<name> whose extras.variant_json is { gun: <id>, slot: "barrel" | "mag", of: "factory", info?: { muzzles, mounts? }, anchors?: { mount_muzzle }, thread?: { size, shoulder, end, r }, cap?: <rounds>, note }: gun is the folder, slot the slot it replaces, of the part it replaces (the factory one); info.muzzles is the new muzzle position (a barrel), info.mounts.mount_optic ([forward, up, right] metres: the centre and floor of a pistol optic cut the barrel carries, where a pistol dot is seated; the platform variant part then PROVIDES the optic slot, which only this barrel opens), cap the new capacity (a magazine). A THREADED barrel variant has anchors.mount_muzzle ([forward, up, right] metres: the thread\'s end on the bore axis, where a muzzle device is seated, as a recipe pistol\'s threaded barrel seats it) and thread { size (its name, e.g. "1/2x28"), shoulder (forward of the shoulder it starts at), end (forward of its end: mount_muzzle\'s forward), r (its major radius) }, the two together; info.muzzles is then the bare thread\'s end (within 1 mm of mount_muzzle), and the platform variant part PROVIDES the muzzle slot (on its thread family\'s mount), which only this barrel opens. Whether the barrel is suppressed is the platform data on the part (js/parts.ts set.sup / device), not the model. The meshes are in the gun\'s own frame, all of slot <slot> with catalogue materials (a magazine is one part_mag node with the pivot of the factory one); nothing else. The platform in js/parts.ts adds the part (id <id>.br.<name> / <id>.mag.<name>, its figures proposed there) and the recipe draws these meshes while it is fitted; nothing is scaled.',
  seat: 'There is no seat: another barrel is drawn from its own part (a standard radius and profile). Root extras.seat and a mesh extras.role are no longer defined and are ignored if a file still has them.',
  mesh: 'Every mesh of slot barrel is the factory barrel, drawn only while the platform\'s own barrel is fitted; a fixed fitting on the barrel is a mesh of slot base.',
  rules: [
    'A gun\'s default build is its factory parts, taken from the model while they are fitted; every other part the gunsmith offers for the gun is the shared part for its slot, seated from the anchors above, so the same part is the same shape on every gun and on this one.',
    'The model\'s own sights: an optic kind listed in model.json sights.builtin means the gun\'s own irons (the optic slot of the model: the rear sight on the receiver and the front sight on the barrel). A kind also listed in sights.rail (a riser) puts a rail piece between mount_optic and mount_optic_end over them.',
    'A PISTOL (info.pistol) has the pistol anchor set (the pistol entry above) and no rail, handguard, stock or grip anchors beyond what the platform fits.',
    'Fit is data, not geometry: whether a part fits the gun is decided by js/parts.ts (fitsSlot, hgRoom with hgMax) from the platform\'s spec; the baker checks the platform\'s spec (L, hgMax, mag) against the anchors and fails when they disagree.',
  ],
  example: { name: 'fal', extras: { gun: 'fal', info_json: '{"sy":0.04,...}', anchors_json: '{"mount_optic":[0.0141,0.0232,0],"mount_optic_end":[0.1791,0.0232,0],"mount_handguard":[0.3012,0,0],"mount_handguard_end":[0.5357,0,0],"mount_muzzle":[0.7329,0,0],"mount_barrel":[0.6153,0,0],"mount_stock":[0,-0.01835,0],"mount_grip":[0.0661,-0.0452,0],"mount_mag":[0.2232,-0.0429,0]}' } },
}, authoredParts: {
  what: 'AUTHORED PART. A shared attachment modelled in Blender (a sight, a prism, a scope; or a piece of FURNITURE: a stock, a grip, a muzzle device, a handguard) is baked straight from its .glb: models/parts/<slot>/<id>/<id>.glb plus models/parts/<slot>/<id>/model.json. It is ONE object, the same file on every gun whose mount takes it; everything gun-specific under it (the rail section, a riser) is the gun\'s mount piece (tag `optic@mount`), never part of the model. `npm run check:models -- models/parts/<slot>/<id>/<id>.glb` validates one; `npm run check:models -- --write` regenerates its catalogue entry.',
  frame: 'THE PART\'S OWN FRAME. Metres, the glTF axes (x right, y up, z = -forward); anchors are written [forward, up, right] = [-z, y, x] like everywhere in the contract. Each slot has its own frame name and origin (furniture below); for an optic ("rail-top") the ORIGIN is on the top of the rail, at the optic\'s mount point, centred (right = 0): the plane the optic\'s foot rests on, so no vertex is below y = 0 (the rail, riser or adapter is the mount piece\'s). The recipe places it at the gun\'s rail top and the platform\'s optic position (spec optF) and the baker finds that it only translates.',
  model: 'The .glb has ONE root node named after the part (the folder name), no extras.info and no part_ nodes; its children are meshes "<slot>_<n>" (the slot\'s name: optic, stock, grip, muzzle, handguard) with extras.slot and a catalogue material name (or display surfaces, as in the contract). Triangles outside the sight: none. Geometry limits for an optic: within 0.12 m either side of the origin forward and 0.04 m left/right, up to 0.15 m high.',
  config: 'model.json: { "source": "authored", "kind": "part", "slot": "optic", "frame": "rail-top", "optic": { sy, fSight, relief, reflex?, pip?, magnifier?, height }, "part": { mount, brand, name, price, tier, zoom, st, desc?, scoped?, reticle?, px?, levels? } }. The catalogue id is derived: `op.auth.<id>`. A REPLACE-ONLY part has "replaces": [entry names] instead of "part" (see rules). FURNITURE (stock, grip, muzzle, handguard): { "source": "authored", "kind": "part", "slot", "frame": "<slot>-mount", "anchors": { ... }, "part": { the slot\'s data }, "replaces": [entry names or matches] }: always replace-only, "part" is the model\'s own data (not a catalogue entry) and the anchors are the slot\'s (furniture below).',
  optic: {
    sy: 'Height of the line of sight above the origin, metres (info.sy = the rail top + this). A reflex window\'s centre height must equal it.',
    fSight: 'Forward position of the sight\'s rear/eye reference, metres from the origin (info.fSight = the mount point + this); with relief it places the aiming eye.',
    relief: 'Eye relief, metres (0.03 to 0.4); on a rifle riser (a mount piece under the part) optic.reliefOnRiser instead, when given.',
    reliefOnRiser: 'Optional: the eye relief when the part sits on a riser (a pistol dot lifted to a rifle sight line), metres (0.03 to 0.4). Eye relief belongs to the mount, not the file: a pistol cut and a riser put the eye at different distances.',
    reflex: 'A reflex or holographic sight\'s window { f, y, w, h, round?, kind: dot|dotG|dotP|cdot|holo }, centre [forward, up] and size, in the part\'s frame (becomes info.reflex shifted to the gun). The game draws a collimated reticle behind it; it lies inside the model\'s bounds and y equals sy.',
    pip: 'A scope\'s ocular lens { f, y, r } in the part\'s frame (becomes info.pip): a magnified sight needs it and the part\'s zoom/reticle/px (set.scoped). y equals sy.',
    magnifier: 'true when a magnifier goes behind it (a reflex sight with a window); the gun gets the anchor mount_magnifier [fSight, sy, 0].',
    height: 'low, mid or high: how tall the sight stands, for ordering and tests.',
  },
  part: 'The catalogue entry (js/parts.ts takes it from a generated block, `check:models -- --write` rewrites it): mount (the rail interface: op:pic, a Picatinny top rail), brand (a key of the brands), name, price, tier, zoom (the ADS FOV multiplier), st (stat deltas), and for a magnified sight scoped: true with reticle (cross|chevron|lpvo|ring), px (magnification) and optionally levels. The part is fittable and buyable on every gun that has that mount, with no per-gun data.',
  rules: [
    'The same part is the same file on every gun: the model never depends on a gun. Nothing is stretched.',
    'Bounds, origin and window are checked on the file (tools/authored_parts.mjs): a vertex below the rail top, a window outside the model, a window not on the sight line and an unknown material are errors that name the mesh and the number.',
    'MOUNTS. op:pic: the origin is the top of the rail at the optic\'s mount point. op:pso (the pistol optic cut): the origin is the top of the slide at the optic\'s mount point, the plane the foot rests on, so the same file also sits on a riser (the pistol optic riser, or a riser dot on a rifle: the riser is the gun\'s mount piece `optic@mount`, the part sits on its top). A pistol takes the part at 0.32 x the factory slide length from the slide\'s rear on the factory slide\'s top, whatever slide is fitted.',
    'REPLACE-ONLY (`"replaces": ["<entry name>", ...]` instead of `"part"`): the file becomes the model of existing catalogue entries (matched by their exact name in js/parts.ts); ids, stats, prices, tiers, mounts, build codes and what they open stay as they are, the generated block adds no part. An entry that uses a riser keeps its riser as the mount piece. Entries that are not listed (another pistol dot that shares the old model) keep the old model.',
    'On a gun with TASK-3 mount pieces the rail under the part is `optic@mount`; the part\'s own meshes are the `optic` pack and are shared across guns by content.',
    'FURNITURE REPLACES BY NAME OR BY MATCH. A "replaces" item is an entry name, or a match { "mount"?: "<mount>", "model": { ... } } that takes every entry of the slot (on that mount) whose catalogue model has those values (nested objects compared key by key, null meaning absent, numbers to 1e-6; keys not given are free: a finish). (For a standard-issue part with no name of its own that is the same product as a named one.) A match that takes nothing, or a name not in the catalogue, fails js/parts.ts. A handguard\'s replaced entries must have a length within 1.5 mm of part.len (the catalogue\'s length decides the fit, hgRoom; the model is drawn at its own).',
    'FURNITURE FINISH. The meshes in the slot\'s finish material (stock and grip: polymer; handguard: black; a muzzle device has none) take the catalogue entry\'s finish as the procedural part would have (a stock\'s sm or the gun\'s furniture, a grip\'s gm, a handguard\'s hg.m or the receiver\'s colour); the other meshes keep their own materials.',
    'FURNITURE IN THE GUN. The recipe seats the part\'s origin at the gun\'s mount_<slot> (an authored gun\'s anchor; on a recipe gun the point its procedural part hangs from), with no rotation and no scaling, and the part\'s anchors replace what the procedural part gave info: muzzles (the device\'s front), grip, support (when no foregrip or other hold decides it). On an authored gun the factory part is still the model\'s own meshes while fitted.',
  ],
  furniture: {
    stock: 'frame "stock-mount": the ORIGIN on the buffer tube\'s axis at the receiver\'s rear (the gun\'s mount_stock), the stock reaching back from it (nothing more than 10 mm ahead of the origin, at least 50 mm behind); the buffer tube itself is the gun\'s mount piece (the recipe draws it), not the model. anchors butt (the butt plate\'s centre) and cheek (the top of the comb under the eye), both behind the origin. part { mount (the stock interface: tube), position? (how far it is drawn out, free text) }. Finish material: polymer.',
    grip: 'frame "grip-mount": the ORIGIN at the grip\'s front top, where it meets the receiver\'s underside (the gun\'s mount_grip); the grip hangs below and behind it (up to 30 mm above the origin, inside the receiver; at least 50 mm below; nothing more than 20 mm ahead). anchor grip (where the palm sits). part { mount (the grip interface: ar) }. Finish material: polymer.',
    muzzle: 'frame "muzzle-mount": the ORIGIN on the bore axis at the barrel\'s end, where the thread ends (the gun\'s mount_muzzle); the device reaches forward from it (at most 10 mm back over the thread, at least 10 mm forward), centred on the bore. anchor muzzles: [[forward, up, right], ...] where the bullet leaves it, at the device\'s front (within 5 mm). part { thread (the thread family, e.g. r556), kind (the device kind, e.g. flash) }. No finish.',
    handguard: 'frame "handguard-mount": the ORIGIN on the bore axis at the handguard\'s rear, against the receiver\'s front face (the gun\'s mount_handguard); the handguard runs forward from 0 to part.len (both ends within 3 mm), centred on the bore. anchor support (where the support hand holds it, between its ends). part { t (the handguard kind: rail), len (metres), rails? { top, bottom, left, right: [from, to] forward of the origin } }. Finish material: black.',
  },
  magnifier: {
    what: 'A FLIP MAGNIFIER behind a reflex sight (models/parts/magnifier/<id>/), replace-only: model.json { "source": "authored", "kind": "part", "slot": "magnifier", "frame": "magnifier-mount", "anchors": { pip, hinge, foot, foot_end }, "magnifier": { px, len, relief, pip: { f, r }, flip: { part, axis, out_deg } }, "replaces": [entry names] }. It replaces the procedural magnifier (tools/models/recipes.ts S.magnifier) for the entries it names; a magnifier with no authored model keeps the procedural one.',
    frame: 'frame "magnifier-mount": the ORIGIN is the red dot\'s eye point, the gun\'s mount_magnifier = [the sight\'s fSight, its sy, 0]: the sight line runs along forward at up 0, right 0. The tube runs back from forward -0.025 (a 25 mm gap behind the sight) to -0.025 - len; the rail clamp is at the tube\'s FRONT, forward -0.059 to -0.025, its foot 34 mm under the sight line (a red dot\'s height over its rail), so it needs only 34 mm of rail behind the sight. The recipe seats the origin at mount_magnifier with no rotation and no scaling.',
    nodes: 'The root (named after the part, extras.anchors_json = model.json\'s anchors) holds the fixed meshes (the clamp: "magnifier_<n>") and ONE node part_magn (extras.part "magn"), the swinging tube: its translation is on the hinge\'s axis (anchors.hinge), its meshes ("magnifier_<n>") under it. Nothing else is a node.',
    anchors: 'pip: the tube\'s rear lens (the picture-in-picture disc\'s centre; at forward magnifier.pip.f, up 0, right 0); hinge: a point on the hinge\'s axis, the part_magn node\'s place; foot and foot_end: the clamp\'s foot, its rear and front ends on the rail top (tools/check_magnifier_rails.mjs reads the span).',
    magnifier: 'px: the power (the catalogue\'s set.magnifier decides the zoom; the bake checks they agree); len: the tube\'s length, metres (the catalogue entry\'s model.magnifier.len to 1.5 mm); relief: the eye relief behind the tube\'s rear while aiming through it, metres (info.relief; info.fSight is the tube\'s rear, origin + pip.f); pip { f, r }: the rear lens, forward of the origin (-0.025 - len, within 1 mm) and its radius (info.pip, hung on part_magn so it swings with the tube); flip { part: "part_magn", axis: "y" (the tube\'s own forward axis, Blender Y: the only one), out_deg: the angle it swings to when flipped out, degrees as the game turns the node: about the axis pointing BACK at the eye, negative clockwise as the shooter sees it (S.magnifier\'s about -160, out to the right for a hinge on the right) } (info.magnOut, radians).',
    rules: 'Materials: black, steel, rubber, glass (catalogue names). The clamp is centred over the rail, the tube on the sight line; swung out by out_deg about the hinge, the tube clears the sight line to the side of the hinge (checked). No glass may be on the eye side of the pip disc (checkPipClear, as an optic\'s).',
  },
  example: { name: 'falcon', extras: {}, child: { name: 'optic_1', extras: { slot: 'optic' }, material: 'black' }, model_json: { source: 'authored', kind: 'part', slot: 'optic', frame: 'rail-top', optic: { sy: 0.0285, fSight: -0.026, relief: 0.09, reflex: { f: 0.0135, y: 0.0285, w: 0.026, h: 0.026, kind: 'dot' }, magnifier: true, height: 'low' } } },
} };

// ---- the validator ------------------------------------------------------------------------------------------------------

/** A node of a model, in a form both a glTF JSON and a loaded three.js scene can produce (describeGltfJson, describeScene). */
interface ModelNode { name: string; extras: Record<string, any>; mesh: boolean; /** a mesh's UVs are there (TEXCOORD_0) */ uv: boolean; materials: string[]; children: ModelNode[] }
/** A model: its scene's top-level nodes. */
interface ModelDesc { roots: ModelNode[] }
interface ModelReport { errors: string[]; warnings: string[] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A bipod leg's extras.leg: { deploy: [rx, ry, rz] } (GUN_MODEL_CONTRACT.bipod); the problems, if any. */
function legProblem(leg: unknown): string | null {
  if (!isObj(leg)) return `extras.leg must be { deploy: [rx, ry, rz] }, got ${JSON.stringify(leg)}`;
  const d = leg.deploy;
  if (!Array.isArray(d) || d.length !== 3 || !d.every(isNum)) return `extras.leg.deploy must be three numbers (radians, XYZ euler), got ${JSON.stringify(d)}`;
  if (d.some((x: number) => Math.abs(x) > Math.PI)) return `extras.leg.deploy ${JSON.stringify(d)}: an angle beyond +-PI radians (degrees?)`;
  return null;
}

/** Checks one value against a shape; pushes a message per problem, each starting with the path. */
function checkShape(v: any, s: Shape, path: string, out: string[]) {
  switch (s.t) {
    case 'num':
      if (!isNum(v)) out.push(`${path}: expected a number, got ${JSON.stringify(v)}`);
      else if ((s.min != null && v < s.min) || (s.max != null && v > s.max)) out.push(`${path}: ${v} is out of range${s.min != null ? ' (min ' + s.min + ')' : ''}${s.max != null ? ' (max ' + s.max + ')' : ''}`);
      return;
    case 'bool': if (typeof v !== 'boolean') out.push(`${path}: expected true/false, got ${JSON.stringify(v)}`); return;
    case 'str': if (typeof v !== 'string') out.push(`${path}: expected a string, got ${JSON.stringify(v)}`); else if (s.enum && !s.enum.includes(v)) out.push(`${path}: "${v}" is not one of ${s.enum.join(', ')}`); return;
    case 'vec': if (!Array.isArray(v) || v.length !== s.n || !v.every(isNum)) out.push(`${path}: expected ${s.n} numbers [${s.n === 3 ? 'forward, up, right' : 'forward, up'}] in metres, got ${JSON.stringify(v)}`); return;
    case 'list': if (!Array.isArray(v)) out.push(`${path}: expected a list, got ${JSON.stringify(v)}`); else { if (s.min != null && v.length < s.min) out.push(`${path}: needs at least ${s.min} entr${s.min === 1 ? 'y' : 'ies'}`); v.forEach((e, i) => checkShape(e, s.of, `${path}[${i}]`, out)); } return;
    case 'map': if (!isObj(v)) out.push(`${path}: expected an object, got ${JSON.stringify(v)}`); else for (const [k, e] of Object.entries(v)) checkShape(e, s.of, `${path}.${k}`, out); return;
    case 'free': return;
    case 'obj': checkProps(v, s.props, path, out, s.extra); return;
    case 'tagged': {
      if (!isObj(v)) { out.push(`${path}: expected an object, got ${JSON.stringify(v)}`); return; }
      const tag = v[s.tag], vr = s.variants[tag];
      if (!vr) out.push(`${path}.${s.tag}: "${tag}" is not one of ${Object.keys(s.variants).join(', ')}`); else checkProps(v, { [s.tag]: { t: 'str', doc: '' }, ...vr }, path, out, false);
    }
  }
}
function checkProps(v: any, props: Record<string, Field>, path: string, out: string[], extra = false) {
  if (!isObj(v)) { out.push(`${path}: expected an object, got ${JSON.stringify(v)}`); return; }
  for (const [k, f] of Object.entries(props)) {
    if (v[k] == null) { if (!f.optional) out.push(`${path}.${k}: missing (${f.doc})`); continue; }
    checkShape(v[k], f, `${path}.${k}`, out);
  }
  if (!extra) for (const k of Object.keys(v)) if (!props[k]) out.push(`${path}.${k}: unknown field (the contract has: ${Object.keys(props).join(', ')})`);
}

/** Checks a model against the contract: errors are what would break the game, warnings what's odd. */
function validate(model: ModelDesc, id?: string): ModelReport {
  const errors: string[] = [], warnings: string[] = [], C = GUN_MODEL_CONTRACT;
  const E = (m: string) => errors.push(m);
  if (model.roots.length !== 1) { E(`the scene has ${model.roots.length} root nodes; it needs exactly one, named after the gun (${C.tree.root})`); if (!model.roots.length) return { errors, warnings }; }
  const root = model.roots[0];
  if (!root.name) E('the root node has no name (it is the gun id)');
  if (id && root.name !== id) E(`the root node is named "${root.name}", expected the gun id "${id}"`);
  if (root.mesh) E('the root node is a mesh; it must be an empty node holding the gun');
  if (root.extras.gun !== root.name) E(`root extras.gun is ${JSON.stringify(root.extras.gun)}, expected "${root.name}" (the root node's name)`);
  const info = root.extras.info;
  if (!isObj(info)) E('root extras.info is missing: the anchors (muzzles, grip, support, sy, ...) the game aims and holds the gun by');
  // nodes
  const names = new Map<string, ModelNode>(), partNodes = new Map<string, ModelNode>(), slotCount: Record<string, number> = {};
  const matOk = new RegExp(C.materials.anonymousPattern), providers: Record<string, string[]> = {}; // (anchor key -> the nodes providing it)
  /** A node's extras.anchors: only the anchors a part can provide, or mount_<slot>, each of its shape. */
  const checkAnchors = (a: any, where: string, prov: Record<string, string[]>, node: string) => {
    if (!isObj(a)) { E(`${where}: expected an object { <anchor>: position }, got ${JSON.stringify(a)}`); return; }
    for (const [k, v] of Object.entries(a)) {
      (prov[k] = prov[k] || []).push(node);
      if (k.startsWith(NAMES.mountPrefix)) { const s = k.slice(NAMES.mountPrefix.length); if (!(s in C.slots)) E(`${where}.${k}: "${s}" is not a slot (${Object.keys(C.slots).join(', ')})`); checkShape(v, { t: 'vec', n: 3 }, `${where}.${k}`, errors); }
      else if ((ANCHOR_KEYS as readonly string[]).includes(k)) checkShape(v, (INFO_FIELDS as Record<string, Field>)[k], `${where}.${k}`, errors);
      else E(`${where}.${k}: not an anchor a part can provide (${ANCHOR_KEYS.join(', ')} or ${NAMES.mountPrefix}<slot>)`);
    }
  };
  const walk = (n: ModelNode, depth: number) => {
    for (const c of n.children) {
      if (names.has(c.name)) E(`two nodes are named "${c.name}"; names must be unique`);
      names.set(c.name, c);
      { // (a bipod's legs: the non-mesh children of part_bipod, each with extras.leg; nowhere else)
        const leg = c.extras[NAMES.extras.leg], under = n.name === NAMES.partPrefix + PARTS.bipod;
        if (leg !== undefined) { const pr = legProblem(leg); if (pr) E(`node "${c.name}": ${pr}`); if (c.mesh || !under) E(`node "${c.name}": extras.leg is only for the group_ children of ${NAMES.partPrefix}${PARTS.bipod} (GUN_MODEL_CONTRACT.bipod)`); }
        else if (under && !c.mesh) E(`node "${c.name}": a child of ${NAMES.partPrefix}${PARTS.bipod} that is not a mesh is a leg and needs extras.leg = { deploy: [rx, ry, rz] } (GUN_MODEL_CONTRACT.bipod)`);
      }
      if (c.extras[NAMES.extras.anchors] !== undefined) {
        if (c.mesh) E(`mesh "${c.name}": extras.anchors is for part_/group_ nodes, not meshes`);
        else checkAnchors(c.extras[NAMES.extras.anchors], `node "${c.name}" extras.anchors`, providers, c.name);
      }
      if (c.mesh) {
        const slot = c.extras[NAMES.extras.slot], display = c.name.startsWith(NAMES.displayPrefix);
        if (!slot) E(`mesh "${c.name}": extras.slot is missing (one of ${Object.keys(C.slots).join(', ')})`);
        else if (!(slot in C.slots)) E(`mesh "${c.name}": slot "${slot}" is not a known slot (${Object.keys(C.slots).join(', ')})`);
        else if (display) { /* a display surface: not counted as a part of the slot's art */ }
        else { slotCount[slot] = (slotCount[slot] || 0) + 1; if (!new RegExp('^' + slot + '_\\d+$').test(c.name)) E(`mesh "${c.name}": a mesh in slot "${slot}" must be named "${slot}_<n>" (or "${NAMES.displayPrefix}<name>" for a display surface)`); }
        if (display) {
          if (!/^display_[a-z0-9_]+$/.test(c.name)) E(`display "${c.name}": the name after "display_" is lower-case letters, digits and underscores`);
          if (!c.uv) E(`display "${c.name}": has no UVs (TEXCOORD_0); the game paints a canvas texture across it, so it needs them`);
          const d = c.extras[NAMES.extras.display];
          if (!isObj(d) || !(Number.isInteger(d.width) && d.width > 0 && Number.isInteger(d.height) && d.height > 0)) E(`display "${c.name}": extras.display must be { width, height } in whole pixels (the canvas size and aspect the game draws at), got ${JSON.stringify(d)}`);
          if (!c.materials.length) E(`display "${c.name}": has no material (any name: the game replaces it)`);
        } else if (c.extras[NAMES.extras.display] !== undefined) E(`mesh "${c.name}": extras.display is only for meshes named "${NAMES.displayPrefix}<name>"`);
        if (c.children.length) warnings.push(`mesh "${c.name}" has child nodes; they will be kept but the game does not expect them`);
        const chk = c.extras.chk;
        if (chk !== undefined) {
          if (!isObj(chk) || !['top', 'hole', 'round', 'tip', 'follower', 'spring'].includes(chk.role) || !Number.isInteger(chk.i) || chk.i < 0) E(`mesh "${c.name}": extras.chk must be { role: top|hole|round|tip|follower|spring, i: whole number, t?, u?, side? }, got ${JSON.stringify(chk)}`);
          else {
            if ((chk.role === 'follower' || chk.role === 'spring') && (typeof chk.t !== 'number' || chk.t < 0 || chk.t > 2)) E(`mesh "${c.name}": a follower or spring coil needs t (the depth it is drawn at, from the magazine spine's samples), got ${JSON.stringify(chk)}`);
            if (chk.role === 'spring' && (typeof chk.u !== 'number' || chk.u < 0 || chk.u > 1)) E(`mesh "${c.name}": a spring coil needs u in 0..1 (how far from the follower to the floor plate), got ${JSON.stringify(chk)}`);
            if (chk.role === 'hole' && (typeof chk.t !== 'number' || chk.t < 0 || chk.t > 1 || chk.side !== 1)) E(`mesh "${c.name}": a witness hole needs t in 0..1 and side 1 (holes go down the back face only, none on the front), got ${JSON.stringify(chk)}`);
            if (chk.role === 'round' && (typeof chk.t !== 'number' || chk.t < 0 || chk.t > 1)) E(`mesh "${c.name}": a drawn round needs t in 0..1, got ${JSON.stringify(chk)}`);
          }
        }
        if (!c.materials.length && !display) E(`mesh "${c.name}": has no material`);
        for (const m of display ? [] : c.materials) if (!m) E(`mesh "${c.name}": its material has no name (name it with a catalogue key: ${Object.keys(C.materials.names).slice(0, 6).join(', ')}, ...)`); else if (!(m in C.materials.names) && !matOk.test(m)) E(`mesh "${c.name}": material '${m}' is not in the catalogue (${Object.keys(C.materials.names).join(', ')}) and is not an anonymous colour (m_<rrggbb>)`);
      } else if (c.name.startsWith(NAMES.partPrefix)) {
        const key = c.name.slice(NAMES.partPrefix.length);
        if (!(key in C.parts)) E(`node "${c.name}": "${key}" is not a known part (${Object.keys(C.parts).join(', ')})`);
        else if (c.extras[NAMES.extras.part] !== key) E(`node "${c.name}": extras.part is ${JSON.stringify(c.extras[NAMES.extras.part])}, expected "${key}"`);
        partNodes.set(key, c);
        const ck = c.extras.check;
        if (key === 'mag' && ck && ck.spine !== undefined && !(Array.isArray(ck.spine) && ck.spine.length >= 2 && ck.spine.every((q: any) => Array.isArray(q) && q.length === 4 && q.every((v: any) => typeof v === 'number')) && ck.spine.every((q: number[], i: number) => i === 0 || q[0] > ck.spine[i - 1][0]))) E(`node "${c.name}": extras.check.spine must be at least two samples [t, f, y, tilt] with t rising, got ${JSON.stringify(ck.spine)}`);
        if (!c.children.length) warnings.push(`part node "${c.name}" has no meshes`);
      } else if (!c.name.startsWith(NAMES.groupPrefix)) E(`node "${c.name}": a node that isn't a mesh must be named "${NAMES.partPrefix}<key>" (an animated part) or "${NAMES.groupPrefix}<n>" (a plain group)`);
      walk(c, depth + 1);
    }
  };
  if (root.extras[NAMES.extras.anchors] !== undefined) checkAnchors(root.extras[NAMES.extras.anchors], 'root extras.anchors', providers, root.name);
  walk(root, 0);
  for (const [k, nodes] of Object.entries(providers)) if (nodes.length > 1 && k !== 'muzzles' && !k.startsWith(NAMES.mountPrefix)) warnings.push(`anchor ${k} is provided by ${nodes.length} nodes (${nodes.join(', ')}): the last one in slot order wins`);
  if (!slotCount[SLOTS.base]) E('no mesh in slot "base": the receiver (everything that is not a swappable part) is required');
  if (!isObj(info)) return { errors, warnings };
  // info fields
  checkProps(info, INFO_FIELDS as Record<string, Field>, 'info', errors, false);
  // anim <-> part nodes
  const anim: Record<string, any> = isObj(info.anim) ? info.anim : {};
  for (const [k, nm] of Object.entries(anim)) {
    if (!(k in C.parts)) { E(`info.anim.${k}: "${k}" is not a known part (${Object.keys(C.parts).join(', ')})`); continue; }
    const node = partNodes.get(k);
    if (!node) E(`info.anim.${k} names "${nm}" but there is no node ${NAMES.partPrefix}${k}`);
    else if (node.name !== nm) E(`info.anim.${k} names "${nm}" but the node is "${node.name}"`);
  }
  for (const k of partNodes.keys()) if (!(k in anim)) E(`node ${NAMES.partPrefix}${k} exists but info.anim.${k} does not list it`);
  { const bp = partNodes.get(PARTS.bipod); if (bp && !bp.children.some((c) => !c.mesh && c.extras[NAMES.extras.leg] !== undefined)) warnings.push(`${bp.name} has no legs (group_ children with extras.leg)`); }
  // the part <-> info pairings: "no node part_mag but the gun has a magazine"
  for (const [k, spec] of Object.entries(C.parts) as [PartKey, PartSpec][]) {
    if (!spec.pairedWith) continue;
    const has = partNodes.has(k), says = info[spec.pairedWith] != null;
    if (says && !has) E(`no node ${NAMES.partPrefix}${k} but info.${spec.pairedWith} says the gun has one (${spec.doc})`);
    if (has && !says) E(`node ${NAMES.partPrefix}${k} exists but info.${spec.pairedWith} is missing (${spec.doc})`);
  }
  if (info.pistol && !('slide' in anim) && info.cylAt == null && info.load == null && info.chamberAt && info.chamberAt.side !== 'breech') warnings.push('info.pistol is set but the gun has neither a slide, a cylinder (cylAt) nor a break-open load');
  if (isNum(info.sy) && (info.sy < -0.05 || info.sy > 0.5)) warnings.push(`info.sy = ${info.sy}: a line of sight ${info.sy} m above the origin looks wrong (units are metres)`);
  if (Array.isArray(info.muzzles) && info.muzzles.some((m: any) => Array.isArray(m) && isNum(m[0]) && (m[0] < 0.02 || m[0] > 2))) warnings.push('a muzzle is under 2 cm or over 2 m forward of the origin: units are metres, forward positive');
  return { errors, warnings };
}

// ---- per-part packs: the platform index and the pure planning (no three.js: the baker checks its work with this same code) --

/** One piece of a tag (the shape one provider part draws, in one variant): its file (`_shared/...`: stored once for every platform), `at` (the move [f, u, r] from
 *  the file's geometry to where the piece sits when no part offsets it), `nodes` (the part_ nodes it has meshes in), and for a STRETCHED piece `rear` (the forward
 *  position, in the file, of the end it is stretched from), `len` (its length in the file) and `len0` (its length when no part changes it). */
interface PieceEntry { file: string; at: Vec3; nodes?: string[]; rear?: number; len?: number; len0?: number; tris?: number | null; bytes?: number | null }
/** A tag: who draws it (`from`: the provider list), its pieces (by provider "<slot>=<part>", "" for the platform's own; "#<label>" a variant), and its rules. */
interface TagIndex {
  from: string[]; pieces: Record<string, PieceEntry>;
  vary?: { by: string; key: string }; cond?: string[]; stretch?: boolean;
  show?: { a: [string, string]; b: [string, string]; gt: number };
  cap?: { axis: number; by: string; of: string[]; op: 'min' | 'max' };
  pair?: { axis: number; h: string; by: string; op: 'min' | 'max' };
}
/** An info leaf: provided by the first filled slot of `from` whose part is not in `skip`; its value `own[provider]` plus, when the provider's slot has offsets (`off`), the
 *  sum of the other parts' offsets for it; `max`: the larger of that and one part's own. */
interface InfoRule {
  from: string[]; skip?: string[]; own: Record<string, any>; vary?: { by: string; key: string };
  off?: Record<string, { x: Record<string, number>; y?: Record<string, Record<string, number>> }>;
  max?: { by: string; v: Record<string, number> };
}
interface PartsIndex {
  version: number; platform: string; src: string; slots: string[]; tags: Record<string, TagIndex>; anchors: Record<string, Record<string, any>>;
  values: Record<string, Record<string, string>>; info: Record<string, InfoRule>; totals?: Record<string, number>;
}

const PARTS_INDEX_VERSION = 3;
/** The platform index (assets/models/parts/<platform>/index.json), as a shape: the validator, JSON Schema and docs come from it. */
const PARTS_INDEX_FIELDS: Record<string, Field> = {
  version: num('Index format version (' + PARTS_INDEX_VERSION + ').'), platform: F('The platform (gun id) the pieces are for.', { t: 'str' }), src: F('Hash of the recipe sources the pieces came from (stale-pack detection).', { t: 'str' }),
  slots: F('Every build slot seen in the platform\'s builds.', { t: 'list', of: { t: 'str' } }),
  tags: F('Per tag (a mesh slot, or slot@anchor for a piece another part places): who draws it and its pieces.', { t: 'map', of: { t: 'obj', props: {
    from: F('The provider list: the first of these build slots that is filled draws the tag (its part\'s piece; none: the tag is absent); empty: the platform draws it.', { t: 'list', of: { t: 'str' } }),
    pieces: F('The pieces: "<slot>=<part>" (or "" for the platform\'s own), with "#<label>" for a variant.', { t: 'map', of: { t: 'obj', props: {
      file: F('The piece\'s file under the platform folder (or `_shared/<tag>/<file>.glb` under the parts folder: stored once for every platform).', { t: 'str' }),
      at: F('The move [forward, up, right] metres from the file\'s geometry to where the piece sits when no part offsets it.', { t: 'vec', n: 3 }),
      nodes: F('The part_ nodes the piece has meshes in.', { t: 'list', of: { t: 'str' } }, true),
      rear: num('A stretched piece: the forward position (in the file) of the end it is stretched from.', true), len: num('A stretched piece: its length in the file, metres (signed).', true), len0: num('A stretched piece: its length when no part changes it, metres (signed).', true),
      tris: num('Triangles in the piece.', true), bytes: num('File size in bytes.', true),
    } } }),
    vary: F('Variants: the piece key gets "#<label>", the label being values["<by>=<part>"][key] (or values[""][key]; "none" when the slot is empty).', { t: 'obj', props: { by: F('The deciding slot.', { t: 'str' }), key: F('The spec key whose value decides.', { t: 'str' }) } }, true),
    cond: F('Condition slots: an offset `mount_<tag>?<slot>` applies only while that slot is filled.', { t: 'list', of: { t: 'str' } }, true),
    stretch: F('The piece is stretched along the bore: its length is len0 plus the parts\' `len_<tag>` offsets.', { t: 'bool' }, true),
    show: F('The tag shows only while values[a] - values[b] > gt (two parts\' spec values).', { t: 'free' }, true),
    cap: F('On one axis the `of` slots\' offsets give way to the `by` part\'s `cap_<tag>` (min or max).', { t: 'free' }, true),
    pair: F('On one axis the offset is the min (or max) of two parts\' `pair_<tag>` values (instead of the sum).', { t: 'free' }, true),
  } } }),
  anchors: F('What each part gives: "<slot>=<partId>" -> { mount_<tag>: [f, u, r] offset, mount_<tag>?<slot>: offset while that slot is filled, len_<tag>: length, cap_<tag> / pair_<tag>: value }.', { t: 'map', of: { t: 'map', of: { t: 'free' } } }),
  values: F('The spec values variants and thresholds go by: "<slot>=<partId>" (or "" for the platform\'s own) -> { key: JSON text }.', { t: 'map', of: { t: 'map', of: { t: 'str' } } }),
  info: F('The `info` leaves (a/b/0 paths): who provides each and how it moves.', { t: 'map', of: { t: 'obj', props: {
    from: F('The provider list: the first filled slot whose part is not in skip provides the leaf (else the platform).', { t: 'list', of: { t: 'str' } }),
    skip: F('Parts ("<slot>=<part>") that do not provide it: the next one down does.', { t: 'list', of: { t: 'str' } }, true),
    own: F('Each provider\'s own value ("" the platform\'s; { "del": 1 }: the leaf is absent).', { t: 'map', of: { t: 'free' } }),
    vary: F('The provider key gets "#<label>" as a tag\'s vary does.', { t: 'free' }, true),
    off: F('Per provider slot: the other parts\' offsets for the leaf, summed (x: "<slot>=<part>" -> number; y: condition slot -> those, while it is filled).', { t: 'map', of: { t: 'free' } }, true),
    max: F('The leaf is the larger of the value and v[the part in `by`].', { t: 'free' }, true),
  } } }),
  totals: F('Counts and bytes (informational).', { t: 'free' }, true),
};

const slotKey = (s: string, p?: string) => s + '=' + (p || '');
/** A build's stable text key: slot=part pairs sorted by slot, empty slots left out. */
const buildKeyOf = (b: Record<string, string>) => Object.keys(b).sort().filter((k) => b[k]).map((k) => k + '=' + b[k]).join(',');

/** An `info` object as flat leaves: path (segments joined by "/", array indices as numbers) -> value; an empty array or object is a leaf. */
function infoLeaves(v: any, out: Record<string, any> = {}, path = ''): Record<string, any> {
  if (Array.isArray(v)) { if (!v.length) out[path] = []; else v.forEach((x, i) => infoLeaves(x, out, path ? path + '/' + i : String(i))); }
  else if (isObj(v)) { const ks = Object.keys(v).filter((k) => v[k] !== undefined); if (!ks.length) out[path] = {}; else for (const k of ks) infoLeaves(v[k], out, path ? path + '/' + k : k); }
  else if (v !== undefined) out[path] = v;
  return out;
}
/** The inverse of infoLeaves. */
function infoFromLeaves(leaves: Record<string, any>): any {
  const root: any = {};
  for (const path of Object.keys(leaves).sort((a, b) => (a < b ? -1 : 1))) {
    const segs = path.split('/'); let o: any = root;
    for (let i = 0; i < segs.length - 1; i++) { const k = segs[i], nextIsIdx = /^\d+$/.test(segs[i + 1]); if (o[k] === undefined) o[k] = nextIsIdx ? [] : {}; o = o[k]; }
    o[segs[segs.length - 1]] = leaves[path];
  }
  return root;
}

/**
 * What assembling a build needs, from the index alone (THE RUNTIME RULES, docs/models.md "Assembly"): for each tag present, its piece and where it goes (`rigid`:
 * the parts' offsets summed, and the piece's own `at`; `scale`: a stretched piece's length over its file's, about `rear`), and the info. `approx` says what the index
 * did not cover (a part it has no value for: a bake bug; null: nothing).
 */
interface PlanTag { tag: string; entry: PieceEntry; rigid: Vec3; at: Vec3; scale?: number; rear?: number }
interface Plan { tags: PlanTag[]; info: any; approx: string | null }
function planBuild(ix: PartsIndex, build: Record<string, string>): Plan {
  let approx: string | null = null;
  const note = (s: string) => { if (!approx) approx = s; };
  const anchorsOf = (s: string) => ix.anchors[slotKey(s, build[s])] || {};
  const val = (s: string, key: string): string | undefined => { const v = (ix.values[slotKey(s, build[s])] || {})[key]; return v !== undefined ? v : (ix.values[''] || {})[key]; };
  const label = (v: { by: string; key: string }) => '#' + (build[v.by] ? (val(v.by, v.key) ?? 'null') : 'none');
  const first = (from: string[], skip?: string[]) => { for (const s of from) { const p = build[s]; if (p && !(skip && skip.includes(slotKey(s, p)))) return s; } return ''; };
  const tags: PlanTag[] = [], anim: Record<string, string> = {}, mounts: Record<string, Vec3> = {};
  for (const [tag, T] of Object.entries(ix.tags)) {
    const ps = first(T.from), q = ps ? slotKey(ps, build[ps]) : '';
    if (T.show) { const a = val(T.show.a[0], T.show.a[1]), b = val(T.show.b[0], T.show.b[1]); if (!(a !== undefined && b !== undefined && JSON.parse(a) - JSON.parse(b) > T.show.gt)) continue; }
    const entry = T.pieces[q + (T.vary ? label(T.vary) : '')];
    if (!entry) { if (T.pieces[q] || Object.keys(T.pieces).some((k) => k.split('#')[0] === q)) note(tag + ' (' + q + (T.vary ? label(T.vary) : '') + ')'); continue; } // (the provider draws nothing of it: absent)
    // the offset: every part's mount_<tag> but the provider's own, those that apply while a condition slot is filled, then a cap or a pair on its axis
    const r: Vec3 = [0, 0, 0], capped: Vec3 = [0, 0, 0], mk = NAMES.mountPrefix + tag;
    let len = entry.len0;
    for (const s of ix.slots) {
      if (s === ps) continue; // (an empty slot is a part too: 'slot=')
      const a = anchorsOf(s), v = a[mk] as Vec3 | undefined, inCap = T.cap && T.cap.of.includes(s);
      if (v) for (let k = 0; k < 3; k++) { if (inCap && k === T.cap!.axis) capped[k] += v[k]; else r[k] += v[k]; }
      for (const c of T.cond || []) { const w = build[c] && c !== s ? a[mk + '?' + c] as Vec3 | undefined : undefined; if (w) for (let k = 0; k < 3; k++) r[k] += w[k]; }
      if (len !== undefined && typeof a['len_' + tag] === 'number') len += a['len_' + tag];
    }
    if (T.cap) { const lim = anchorsOf(T.cap.by)['cap_' + tag], k = T.cap.axis; r[k] += lim === undefined ? capped[k] : T.cap.op === 'min' ? Math.min(capped[k], lim) : Math.max(capped[k], lim); }
    if (T.pair) { const x = anchorsOf(T.pair.h)['pair_' + tag], y = anchorsOf(T.pair.by)['pair_' + tag]; r[T.pair.axis] = x === undefined ? y ?? 0 : y === undefined ? x : T.pair.op === 'min' ? Math.min(x, y) : Math.max(x, y); }
    const t: PlanTag = { tag, entry, rigid: r, at: entry.at };
    if (T.stretch && entry.len) { t.scale = (len as number) / entry.len; t.rear = entry.rear; }
    tags.push(t);
    for (const n of entry.nodes || []) anim[n.slice(NAMES.partPrefix.length)] = n;
    if (r[0] || r[1] || r[2]) mounts[mk] = [r[0], r[1], r[2]];
  }
  // the info: each leaf's provider's own value, plus the other parts' offsets for it, or the max with one part's
  const leaves: Record<string, any> = {};
  for (const [leaf, R] of Object.entries(ix.info)) {
    const ps = first(R.from, R.skip), q = (ps ? slotKey(ps, build[ps]) : '') + (R.vary ? label(R.vary) : '');
    if (!(q in R.own)) { note('info ' + leaf + ' (' + q + ')'); continue; }
    let v = R.own[q];
    if (isObj(v) && v.del === 1) continue;
    const M = R.off && R.off[ps];
    if (M && typeof v === 'number') {
      for (const s of ix.slots) { if (s === ps) continue; const k = slotKey(s, build[s]); if (M.x[k] !== undefined) v += M.x[k]; for (const [c, ys] of Object.entries(M.y || {})) if (build[c] && c !== s && ys[k] !== undefined) v += ys[k]; }
    }
    if (R.max && typeof v === 'number') { const w = R.max.v[build[R.max.by] || '']; if (w !== undefined) v = Math.max(v, w); }
    leaves[leaf] = v;
  }
  const info = infoFromLeaves(leaves); info.anim = anim;
  if (Object.keys(mounts).length) info.mounts = mounts;
  return { tags, info, approx };
}

/** Checks a platform index: its shape, and that every rule names slots it has. */
function validatePartsIndex(ix: any): ModelReport {
  const errors: string[] = [], warnings: string[] = [];
  checkProps(ix, PARTS_INDEX_FIELDS, 'index', errors, false);
  if (!isObj(ix) || !isObj(ix.tags)) return { errors, warnings };
  if (ix.version !== PARTS_INDEX_VERSION) errors.push(`index.version is ${ix.version}, expected ${PARTS_INDEX_VERSION}`);
  const slots = new Set(Array.isArray(ix.slots) ? ix.slots : []);
  for (const [tag, ti] of Object.entries<any>(ix.tags)) {
    if (!(tag.split('@')[0] in GUN_MODEL_CONTRACT.slots)) errors.push(`index.tags.${tag}: not a slot`);
    if (!isObj(ti)) continue;
    for (const s of [...(ti.from || []), ...(ti.cond || []), ...(ti.vary ? [ti.vary.by] : [])]) if (!slots.has(s)) errors.push(`index.tags.${tag}: "${s}" is not one of the index's slots`);
    for (const k of Object.keys(ti.pieces || {})) { const s = k.split('=')[0]; if (k && !k.startsWith('#') && !(ti.from || []).includes(s)) errors.push(`index.tags.${tag}.pieces["${k}"]: ${s} is not in its from`); }
  }
  for (const [leaf, R] of Object.entries<any>(isObj(ix.info) ? ix.info : {})) if (isObj(R)) for (const s of R.from || []) if (!slots.has(s)) errors.push(`index.info["${leaf}"]: "${s}" is not one of the index's slots`);
  return { errors, warnings };
}
/** The three JSON-valued root extras of an authored source (info, anchors, seat): the object, or the text `<name>_json` (Blender stores only flat custom properties). */
function authoredRoot(ex: Record<string, any>, errors: string[]): { info: any; anchors: any; seat: any; hinge: any } {
  const get = (k: string) => {
    if (ex[k] !== undefined) return ex[k];
    const t = ex[k + '_json']; if (t === undefined) return undefined;
    if (typeof t !== 'string') { errors.push(`root extras.${k}_json: expected JSON text, got ${JSON.stringify(t)}`); return undefined; }
    try { return JSON.parse(t); } catch (e) { errors.push(`root extras.${k}_json is not valid JSON: ${(e as Error).message}`); return undefined; }
  };
  return { info: get('info'), anchors: get('anchors'), seat: get('seat'), hinge: get('hinge') };
}
/** model.json of an authored gun: { source: 'authored', sights: { builtin: [...], rail: [...] } }. */
function validateAuthoredConfig(cfg: any): string[] {
  const out: string[] = [];
  if (!isObj(cfg)) return ['model.json: expected an object { "source": "authored", "sights": { "builtin": [...], "rail": [...] } }'];
  if (cfg.source !== 'authored') out.push(`model.json: "source" is ${JSON.stringify(cfg.source)}, expected "authored"`);
  const sg = cfg.sights;
  if (!isObj(sg)) out.push('model.json: "sights" is missing ({ builtin: [the optic kinds that mean the gun\'s own sights], rail: [those that still sit on a rail piece] })');
  else {
    for (const k of ['builtin', 'rail']) if (!Array.isArray(sg[k]) || !sg[k].every((x: any) => typeof x === 'string')) out.push(`model.json: sights.${k} must be a list of optic kind names`);
    if (Array.isArray(sg.builtin) && Array.isArray(sg.rail)) for (const x of sg.rail) if (!sg.builtin.includes(x)) out.push(`model.json: sights.rail has "${x}", which is not in sights.builtin`);
    for (const k of ['meshless', 'railed']) if (sg[k] !== undefined && typeof sg[k] !== 'boolean') out.push(`model.json: sights.${k} must be true or false`);
    for (const k of Object.keys(sg)) if (!['builtin', 'rail', 'meshless', 'railed'].includes(k)) out.push(`model.json: unknown field "sights.${k}"`);
  }
  for (const k of Object.keys(cfg)) if (k !== 'source' && k !== 'sights') out.push(`model.json: unknown field "${k}"`);
  return out;
}
/**
 * Checks an AUTHORED SOURCE (a gun modelled in Blender, GUN_MODEL_CONTRACT.authored): the model contract (node tree, slots, parts, info) with the root's
 * extras read from info/anchors/seat (or their _json texts), plus the mount anchors and the factory slots. opts.factory: the mesh slots the platform's default
 * build fills (the model must hold meshes for each).
 */
function validateAuthored(model: ModelDesc, id?: string, opts: { factory?: string[] } = {}): ModelReport {
  const errors: string[] = [], warnings: string[] = [], C = GUN_MODEL_CONTRACT, E = (m: string) => errors.push(m);
  if (model.roots.length !== 1) { E(`the scene has ${model.roots.length} root nodes; it needs exactly one, named after the gun`); return { errors, warnings }; }
  const root = model.roots[0], a = authoredRoot(root.extras, errors);
  if (a.info === undefined) E('root extras.info (or info_json) is missing: the factory build\'s info (sy, fSight, relief, muzzles, grip, support, anim, magAt, ...)');
  // (the part_ nodes by key, wherever they nest; an authored source may name its info.anim entries as it likes: what counts is the node each names, and the node's own key)
  const partNodes = new Map<string, ModelNode>();
  { const find = (n: ModelNode) => { for (const c of n.children) { if (!c.mesh && c.name.startsWith(NAMES.partPrefix)) partNodes.set(c.name.slice(NAMES.partPrefix.length), c); find(c); } }; find(root); }
  let info0 = a.info;
  if (isObj(info0)) {
    info0 = { ...info0 };
    if (isObj(info0.anim)) { const an: Record<string, any> = {}; for (const [k, nm] of Object.entries(info0.anim)) { const hit = [...partNodes].find(([, nd]) => nd.name === nm); an[k in C.parts || !hit ? k : hit[0]] = nm; } info0.anim = an; }
    if (a.hinge !== undefined) info0.hinge = a.hinge; // (root extras.hinge / hinge_json is info.hinge)
  }
  const base = validate({ roots: [{ ...root, extras: { gun: root.extras.gun, info: info0 } }] }, id);
  errors.push(...base.errors.filter((e) => !e.startsWith('root extras.info is missing'))); warnings.push(...base.warnings);
  if (isObj(info0)) { // a gun with several barrels (GUN_MODEL_CONTRACT.multi) and a reload sequence
    const b = info0.barrels, mz = info0.muzzles;
    if (isObj(b)) {
      if (Array.isArray(mz) && b.n !== mz.length) E(`info.barrels.n is ${b.n} but info.muzzles has ${mz.length} entries: one muzzle per barrel, in the same order`);
      if (!isObj(b.rounds) || !Object.keys(b.rounds).length) E('info.barrels.rounds: at least one round type { rounds_each, effective_mm } by name');
      else {
        if (typeof b.default !== 'string' || !(b.default in b.rounds)) E(`info.barrels.default ${JSON.stringify(b.default)} is not one of info.barrels.rounds (${Object.keys(b.rounds).join(', ')})`);
        for (const [rn, r] of Object.entries(b.rounds) as [string, any][]) {
          if (!isObj(r)) continue;
          if (Array.isArray(r.effective_mm) && r.effective_mm.length !== r.rounds_each) E(`info.barrels.rounds.${rn}.effective_mm has ${r.effective_mm.length} entries, rounds_each is ${r.rounds_each}: one effective length for each round of a barrel`);
          if (Array.isArray(r.effective_mm) && r.effective_mm.some((x: any, i: number) => !(isNum(x) && x > 0 && (i === 0 || x > r.effective_mm[i - 1])))) E(`info.barrels.rounds.${rn}.effective_mm must be positive and increase: each round fired from a barrel runs down a longer bore`);
        }
      }
      if (isObj(info0.barrelGroups)) for (const [g, list] of Object.entries(info0.barrelGroups)) if (Array.isArray(list) && list.some((i: any) => !Number.isInteger(i) || i < 0 || i >= b.n)) E(`info.barrelGroups.${g}: indices into info.muzzles (0..${b.n - 1})`);
    } else if (info0.barrelGroups !== undefined || info0.modeDial !== undefined) E('info.barrelGroups / info.modeDial are for a gun with info.barrels');
    const h = info0.hinge;
    if (isObj(h) && Array.isArray(h.sequence)) h.sequence.forEach((st: any, i: number) => {
      if (!isObj(st)) return;
      const key = (x: any) => (typeof x === 'string' ? x.replace(/^part_/, '') : '');
      if (!partNodes.has(key(st.part))) E(`info.hinge.sequence[${i}].part: ${JSON.stringify(st.part)} is not a part_ node of the model`);
      if (st.frame != null && !partNodes.has(key(st.frame))) E(`info.hinge.sequence[${i}].frame: ${JSON.stringify(st.frame)} is not a part_ node of the model`);
      if (st.rotate_deg == null && st.move == null) E(`info.hinge.sequence[${i}]: a step turns (axis + rotate_deg) or slides (move) its part`);
      if (st.rotate_deg != null && !['x', 'y', 'z'].includes(st.axis)) E(`info.hinge.sequence[${i}].axis: x, y or z (a rotation needs one)`);
    });
    if (isObj(info0.modeDial) && isObj(b) === false) E('info.modeDial needs info.barrels');
  }
  // the mount anchors
  const pistol = isObj(a.info) && a.info.pistol === true;
  const R = (pistol ? Object.fromEntries(Object.entries(C.authored.required as Record<string, string>).filter(([k]) => k === 'mount_barrel' || k === 'mount_mag').concat(isObj(a.info.anim) && a.info.anim.slide ? [['mount_slide', 'the slide\'s rear: [forward, the frame\'s slide seat height, 0]']] : [])) : C.authored.required) as Record<string, string>, anchors = a.anchors;
  if (anchors === undefined) E('root extras.anchors (or anchors_json) is missing: the mount anchors (' + Object.keys(R).join(', ') + ')');
  else if (!isObj(anchors)) E(`root extras.anchors: expected an object { mount_<slot>: [forward, up, right] }, got ${JSON.stringify(anchors)}`);
  else {
    for (const [k, doc] of Object.entries(R)) if (anchors[k] === undefined) E(`anchors.${k} is missing: ${doc}`); else checkShape(anchors[k], { t: 'vec', n: 3 }, `anchors.${k}`, errors);
    for (const [k, v] of Object.entries(anchors)) {
      if (k in R) continue;
      if (!pistol && k in C.authored.optional) { checkShape(v, { t: 'vec', n: 3 }, `anchors.${k}`, errors); continue; }
      const slot = k.startsWith(NAMES.mountPrefix) ? k.slice(NAMES.mountPrefix.length).replace(/_end$/, '') : '';
      if (!(slot in C.slots)) E(`anchors.${k}: not an anchor (the required ones: ${Object.keys(R).join(', ')}; others are mount_<slot> or mount_<slot>_end with a contract slot)`);
      else checkShape(v, { t: 'vec', n: 3 }, `anchors.${k}`, errors);
    }
    const f = (k: string): number | null => (Array.isArray(anchors[k]) && isNum(anchors[k][0]) ? anchors[k][0] : null);
    const order = (lo: string, hi: string, why: string) => { const x = f(lo), y = f(hi); if (x != null && y != null && !(x < y)) E(`anchors: ${lo} (${x}) must be behind ${hi} (${y}): ${why}`); };
    if (!pistol) {
      order('mount_optic', 'mount_optic_end', 'the rail runs forward');
      order('mount_handguard', 'mount_handguard_end', 'a handguard has room');
      if (!(isObj(a.info) && isObj(a.info.barrels))) { // (a barrel block has no bare tube: its mount_barrel is where the block seats)
        order('mount_handguard_end', 'mount_barrel', 'the handguard ends before the bare tube');
        order('mount_barrel', 'mount_muzzle', 'the tube runs to the barrel\'s end');
      }
    } else {
      if (f('mount_optic') != null && f('mount_optic_end') != null && f('mount_optic') !== f('mount_optic_end')) E(`anchors: a pistol's optic cut is a point: mount_optic (${f('mount_optic')}) and mount_optic_end (${f('mount_optic_end')}) are the same`);
      if (f('mount_optic') != null && f('mount_optic_end') == null) E('anchors: mount_optic_end is missing (equal to mount_optic on a pistol)');
      if (isObj(a.info) && Array.isArray(a.info.muzzles) && Array.isArray(a.info.muzzles[0]) && f('mount_barrel') != null && !(f('mount_barrel')! < a.info.muzzles[0][0])) E('anchors: mount_barrel must be behind the muzzle (info.muzzles[0])');
      if (isObj(a.info) && isObj(a.info.anim) && a.info.anim.bolt && !Array.isArray(a.info.bolt)) warnings.push('info.bolt is missing: the knob the hand takes (a bolt pistol); the baker takes the middle of part_bolt');
    }
    const ro = anchors.mount_optic, re = anchors.mount_optic_end;
    if (Array.isArray(ro) && Array.isArray(re) && ro[1] !== re[1]) E(`anchors: mount_optic and mount_optic_end differ in height (${ro[1]} vs ${re[1]}): a rail is level`);
    // the gun's own optic mount (C.authored.opticMount): its meshes and its rail go together
    let mounts = 0;
    const seen = (n: ModelNode, inPart: boolean) => { for (const c of n.children) {
      const inP = inPart || (!c.mesh && c.name.startsWith(NAMES.partPrefix));
      if (c.mesh && c.extras.mount !== undefined) {
        mounts++;
        if (c.extras.mount !== true) E(`mesh "${c.name}": extras.mount must be true (a piece of the gun's own optic mount), got ${JSON.stringify(c.extras.mount)}`);
        if (c.extras[NAMES.extras.slot] !== 'optic') E(`mesh "${c.name}": a piece of the gun's optic mount (extras.mount) is slot optic, not ${JSON.stringify(c.extras[NAMES.extras.slot])}`);
        if (inP) E(`mesh "${c.name}": a piece of the gun's optic mount (extras.mount) is not in a part_ node`);
      }
      seen(c, inP);
    } };
    seen(root, false);
    const mr = anchors.mount_optic_rail, me = anchors.mount_optic_rail_end;
    if (mounts && (mr === undefined || me === undefined)) E('the model has an optic mount (meshes with extras.mount) but not its rail: anchors mount_optic_rail and mount_optic_rail_end (where the sight stands)');
    if (!mounts && (mr !== undefined || me !== undefined)) E('anchors.mount_optic_rail / mount_optic_rail_end are the rail of the gun\'s own optic mount, and the model has none (no mesh with extras.mount)');
    if (Array.isArray(mr) && Array.isArray(me)) {
      order('mount_optic_rail', 'mount_optic_rail_end', 'the rail runs forward');
      if (mr[1] !== me[1]) E(`anchors: mount_optic_rail and mount_optic_rail_end differ in height (${mr[1]} vs ${me[1]}): a rail is level`);
      if (Array.isArray(ro) && !(mr[1] > ro[1])) E(`anchors: mount_optic_rail (${mr[1]}) must be above the receiver's top, mount_optic (${ro[1]}): the mount stands on it`);
    }
    if (isObj(a.info) && Array.isArray(a.info.magAt) && Array.isArray(anchors.mount_mag) && (Math.abs(a.info.magAt[0] - anchors.mount_mag[0]) > 1e-6 || Math.abs(a.info.magAt[1] - anchors.mount_mag[1]) > 1e-6)) E(`anchors.mount_mag ${JSON.stringify(anchors.mount_mag.slice(0, 2))} is not info.magAt ${JSON.stringify(a.info.magAt)}`);
  }
  // meshes: the factory slots
  const count: Record<string, number> = {};
  const visit = (n: ModelNode) => { for (const c of n.children) { if (c.mesh) { const sl = c.extras[NAMES.extras.slot]; count[sl] = (count[sl] || 0) + 1; } visit(c); } };
  visit(root);
  for (const sl of opts.factory || []) if (!count[sl]) E(`the platform\'s default build fits a ${sl}, but the model has no mesh in slot "${sl}": a factory part is modelled in the file`);
  return { errors, warnings };
}

// ---- authored parts (GUN_MODEL_CONTRACT.authoredParts): a shared attachment modelled in Blender
// (each slot: its frame's name; an optic's rail mounts; a piece of furniture's anchors (in model.json "anchors" and the root's extras.anchors_json), the material
// its catalogue finish goes on (GUN_MODEL_CONTRACT.authoredParts.furniture), and the fields of its "part")
const AUTHORED_PART_SLOTS: Record<string, { frame: string; mounts?: string[]; anchors?: string[]; finish?: string | null; part?: Record<string, 'str' | 'str?' | 'num' | 'rails?'> }> = {
  optic: { frame: 'rail-top', mounts: ['op:pic', 'op:pso'] },
  stock: { frame: 'stock-mount', anchors: ['butt', 'cheek'], finish: 'polymer', part: { mount: 'str', position: 'str?' } },
  grip: { frame: 'grip-mount', anchors: ['grip'], finish: 'polymer', part: { mount: 'str' } },
  muzzle: { frame: 'muzzle-mount', anchors: ['muzzles'], finish: null, part: { thread: 'str', kind: 'str' } },
  handguard: { frame: 'handguard-mount', anchors: ['support'], finish: 'black', part: { t: 'str', len: 'num', rails: 'rails?' } },
  magnifier: { frame: 'magnifier-mount', anchors: ['pip', 'hinge', 'foot', 'foot_end'], finish: null, part: {} }, // (its data is model.json "magnifier", not "part": GUN_MODEL_CONTRACT.authoredParts.magnifier)
};
const RETICLES = ['dot', 'dotG', 'dotP', 'cdot', 'holo'], SCOPE_RETICLES = ['cross', 'chevron', 'lpvo', 'ring'];
const isPt = (v: any) => Array.isArray(v) && v.length === 3 && v.every(isNum);
/** model.json of an authored FLIP MAGNIFIER (GUN_MODEL_CONTRACT.authoredParts.magnifier): its anchors, its "magnifier" data (power, tube, relief, pip lens, flip) and what it replaces. */
function validateMagnifierConfig(cfg: any, spec: NonNullable<typeof AUTHORED_PART_SLOTS[string]>, E: (m: string) => void) {
  for (const k of Object.keys(cfg)) if (!['source', 'kind', 'slot', 'frame', 'anchors', 'magnifier', 'replaces'].includes(k)) E(`unknown field "${k}"${k === 'part' ? ' (a magnifier\'s data is "magnifier")' : ''}`);
  const a = cfg.anchors, m = cfg.magnifier, rep = cfg.replaces;
  if (!isObj(a)) E(`"anchors" is missing: { ${spec.anchors!.join(', ')} } as [forward, up, right] metres from the origin (the red dot's eye point)`);
  else {
    for (const k of spec.anchors!) if (a[k] === undefined) E(`anchors.${k} is missing (a magnifier has ${spec.anchors!.join(', ')})`); else if (!isPt(a[k])) E(`anchors.${k}: expected [forward, up, right] (finite numbers, metres), got ${JSON.stringify(a[k])}`);
    for (const k of Object.keys(a)) if (!spec.anchors!.includes(k)) E(`anchors.${k}: not an anchor of a magnifier (${spec.anchors!.join(', ')})`);
  }
  if (!isObj(m)) E('"magnifier" is missing: { px, len, relief, pip: { f, r }, flip: { part, axis, out_deg } }');
  else {
    if (!isNum(m.px) || m.px < 1.2 || m.px > 10) E(`magnifier.px: the power, 1.2 to 10, got ${JSON.stringify(m.px)}`);
    if (!isNum(m.len) || m.len < 0.03 || m.len > 0.15) E(`magnifier.len: the tube's length, 0.03 to 0.15 m, got ${JSON.stringify(m.len)}`);
    if (!isNum(m.relief) || m.relief < 0.03 || m.relief > 0.4) E(`magnifier.relief: the eye relief, 0.03 to 0.4 m, got ${JSON.stringify(m.relief)}`);
    const q = m.pip;
    if (!isObj(q) || !isNum(q.f) || !isNum(q.r)) E(`magnifier.pip: expected { f, r } (the tube's rear lens: forward of the origin, radius; metres), got ${JSON.stringify(q)}`);
    else {
      if (q.r < 0.004 || q.r > 0.03) E(`magnifier.pip.r: ${q.r} m is not a magnifier's lens`);
      if (isNum(m.len) && Math.abs(q.f - (-0.025 - m.len)) > 0.001) E(`magnifier.pip.f (${q.f}) is not the tube's rear (-0.025 - len = ${(-0.025 - m.len).toFixed(4)}): the tube runs back from 25 mm behind the sight`);
      if (isPt(a && a.pip) && (Math.abs(a.pip[0] - q.f) > 1e-4 || Math.abs(a.pip[1]) > 1e-4 || Math.abs(a.pip[2]) > 1e-4)) E(`anchors.pip [${a.pip}] is not [magnifier.pip.f, 0, 0]: the lens is on the sight line`);
      for (const k of Object.keys(q)) if (!['f', 'r'].includes(k)) E(`magnifier.pip: unknown field "${k}"`);
    }
    const fl = m.flip;
    if (!isObj(fl)) E('magnifier.flip: expected { part: "part_magn", axis: "y", out_deg }');
    else {
      if (fl.part !== 'part_magn') E(`magnifier.flip.part: ${JSON.stringify(fl.part)}, expected "part_magn" (the node the game swings)`);
      if (fl.axis !== 'y') E(`magnifier.flip.axis: ${JSON.stringify(fl.axis)}, expected "y" (the tube's own forward axis, through anchors.hinge: the only one the game turns it about)`);
      if (!isNum(fl.out_deg) || Math.abs(fl.out_deg) < 60 || Math.abs(fl.out_deg) > 180) E(`magnifier.flip.out_deg: the angle it swings out to, 60 to 180 degrees either way, got ${JSON.stringify(fl.out_deg)}`);
      for (const k of Object.keys(fl)) if (!['part', 'axis', 'out_deg'].includes(k)) E(`magnifier.flip: unknown field "${k}"`);
    }
    if (isPt(a && a.foot) && isPt(a && a.foot_end)) {
      if (!(a.foot[0] < a.foot_end[0])) E(`anchors.foot (${a.foot[0]}) must be behind anchors.foot_end (${a.foot_end[0]}): the clamp's rear and front`);
      if (Math.abs(a.foot[1] - a.foot_end[1]) > 1e-4) E('anchors.foot and foot_end are not at the same height: both on the rail top');
      if (a.foot_end[0] > -0.01) E(`anchors.foot_end (${a.foot_end[0]}) reaches under the sight: the clamp is behind it (at most -0.01)`);
      if (a.foot[1] > -0.02 || a.foot[1] < -0.06) E(`anchors.foot is ${a.foot[1]} m under the sight line: a red dot's height over its rail is about 0.034`);
    }
    for (const k of Object.keys(m)) if (!['px', 'len', 'relief', 'pip', 'flip'].includes(k)) E(`magnifier: unknown field "${k}"`);
  }
  if (!Array.isArray(rep) || !rep.length || !rep.every((n: any) => typeof n === 'string' && n.trim())) E('"replaces": expected a non-empty list of catalogue entry names (a magnifier is always replace-only: e.g. "Strix FTS 3× flip magnifier")');
  else if (new Set(rep).size !== rep.length) E('"replaces": an entry is named twice');
}
/** model.json of a piece of authored FURNITURE (a stock, grip, muzzle device, handguard): its anchors, its own data ("part") and what it replaces (names or matches). */
function validateFurnitureConfig(cfg: any, spec: NonNullable<typeof AUTHORED_PART_SLOTS[string]>, E: (m: string) => void) {
  for (const k of Object.keys(cfg)) if (!['source', 'kind', 'slot', 'frame', 'anchors', 'part', 'replaces', 'gun'].includes(k)) E(`unknown field "${k}"${k === 'optic' ? ' (a ' + cfg.slot + ' has no sight data)' : ''}`);
  if (cfg.gun !== undefined && (typeof cfg.gun !== 'string' || !/^[a-z][a-z0-9_]*$/.test(cfg.gun))) E(`"gun": expected a platform id (lower-case letters, digits and underscores), got ${JSON.stringify(cfg.gun)}`);
  const a = cfg.anchors, p = cfg.part, rep = cfg.replaces;
  if (!isObj(a)) E(`"anchors" is missing: { ${spec.anchors!.join(', ')} } as [forward, up, right] metres from the origin`);
  else {
    for (const k of spec.anchors!) {
      if (a[k] === undefined) E(`anchors.${k} is missing (a ${cfg.slot} has ${spec.anchors!.join(', ')})`);
      else if (k === 'muzzles' ? !(Array.isArray(a[k]) && a[k].length && a[k].every(isPt)) : !isPt(a[k])) E(`anchors.${k}: expected ${k === 'muzzles' ? '[[forward, up, right], ...]' : '[forward, up, right]'} (finite numbers, metres), got ${JSON.stringify(a[k])}`);
    }
    for (const k of Object.keys(a)) if (!spec.anchors!.includes(k)) E(`anchors.${k}: not an anchor of a ${cfg.slot} (${spec.anchors!.join(', ')})`);
  }
  if (!isObj(p)) E(`"part" is missing: the ${cfg.slot}'s own data { ${Object.keys(spec.part!).join(', ')} }`);
  else {
    for (const [k, t] of Object.entries(spec.part!)) {
      const v = p[k];
      if (v === undefined) { if (!t.endsWith('?')) E(`part.${k} is missing`); continue; }
      if (t.startsWith('str') && (typeof v !== 'string' || !v.trim())) E(`part.${k}: expected a non-empty string, got ${JSON.stringify(v)}`);
      if (t === 'num' && (!isNum(v) || v <= 0 || v > 1)) E(`part.${k}: expected a length in metres (0 to 1), got ${JSON.stringify(v)}`);
      if (t === 'rails?') {
        if (!isObj(v)) { E('part.rails: expected { top?, bottom?, left?, right?: [from, to], kind? }'); continue; }
        for (const [s, r] of Object.entries(v)) {
          if (s === 'kind') { if (r !== 'picatinny' && r !== 'mlok') E(`part.rails.kind: "picatinny" or "mlok" (what the side and bottom rails are: the top is always Picatinny), got ${JSON.stringify(r)}`); continue; }
          if (!['top', 'bottom', 'left', 'right'].includes(s)) E(`part.rails.${s}: not a side (top, bottom, left, right)`);
          else if (!(Array.isArray(r) && r.length === 2 && r.every(isNum) && r[0] < r[1])) E(`part.rails.${s}: expected [from, to] metres forward of the origin, from < to, got ${JSON.stringify(r)}`);
          else if (isNum(p.len) && (r[0] < -0.003 || r[1] > p.len + 0.003)) E(`part.rails.${s}: [${r}] runs off the handguard (0 to part.len ${p.len})`);
        }
      }
    }
    for (const k of Object.keys(p)) if (!(k in spec.part!)) E(`part: unknown field "${k}" (a ${cfg.slot}'s are ${Object.keys(spec.part!).join(', ')})`);
  }
  // what it replaces: a piece of furniture is always replace-only (it gives existing catalogue entries its model)
  const item = (r: any) => (typeof r === 'string' && !!r.trim()) || (isObj(r) && isObj(r.model) && (r.mount === undefined || typeof r.mount === 'string') && Object.keys(r).every((k) => k === 'mount' || k === 'model'));
  if (!Array.isArray(rep) || !rep.length || !rep.every(item)) E('"replaces": expected a non-empty list of catalogue entry names, or matches { "mount"?: "<mount>", "model": { ... } } (furniture is always replace-only)');
  else { const names = rep.filter((r: any) => typeof r === 'string'); if (new Set(names).size !== names.length) E('"replaces": an entry is named twice'); }
}
/** model.json of an authored part, checked: the shape, the ranges, and that the sight data agrees with itself (window on the sight line...). id: the folder name. */
function validateAuthoredPartConfig(cfg: any, id?: string): string[] {
  const out: string[] = [], E = (m: string) => out.push('model.json: ' + m);
  if (!isObj(cfg)) return ['model.json: expected an object { source, kind, slot, frame, optic, part }'];
  if (cfg.source !== 'authored') E(`"source" is ${JSON.stringify(cfg.source)}, expected "authored"`);
  if (cfg.kind !== 'part') E(`"kind" is ${JSON.stringify(cfg.kind)}, expected "part" (a gun is "sights" instead)`);
  if (!(cfg.slot in AUTHORED_PART_SLOTS)) E(`"slot" is ${JSON.stringify(cfg.slot)}, expected one of ${Object.keys(AUTHORED_PART_SLOTS).join(', ')}`);
  if (id !== undefined && !/^[a-z][a-z0-9_]*$/.test(id)) E(`the folder name "${id}" must be lower-case letters, digits and underscores (it makes the part id op.auth.${id})`);
  const fs0 = AUTHORED_PART_SLOTS[cfg.slot];
  if (fs0 && cfg.slot !== 'optic') { // furniture (and a magnifier): its own frame, anchors and data
    if (cfg.frame !== fs0.frame) E(`"frame" is ${JSON.stringify(cfg.frame)}, expected "${fs0.frame}" (the origin is the gun's mount_${cfg.slot}: GUN_MODEL_CONTRACT.authoredParts.${cfg.slot === 'magnifier' ? 'magnifier' : 'furniture'})`);
    if (cfg.slot === 'magnifier') validateMagnifierConfig(cfg, fs0, E); else validateFurnitureConfig(cfg, fs0, E);
    return out;
  }
  if (cfg.frame !== 'rail-top') E(`"frame" is ${JSON.stringify(cfg.frame)}, expected "rail-top" (the origin is the top of the rail at the optic's mount point)`);
  for (const k of Object.keys(cfg)) if (!['source', 'kind', 'slot', 'frame', 'optic', 'part', 'replaces'].includes(k)) E(`unknown field "${k}"`);
  const o = cfg.optic, p = cfg.part, rep = cfg.replaces;
  if (rep !== undefined) { // a REPLACE-ONLY part: it gives existing catalogue entries a new model and adds no part of its own
    if (p !== undefined) E('"replaces" and "part" are exclusive: a part either adds a catalogue entry ("part") or gives existing entries its model ("replaces")');
    if (!Array.isArray(rep) || !rep.length || !rep.every((n: any) => typeof n === 'string' && n.trim())) E('"replaces": expected a non-empty list of catalogue entry names (the names in js/parts.ts, e.g. "Halcyon Ember pistol dot")');
    else if (new Set(rep).size !== rep.length) E('"replaces": an entry is named twice');
  }
  if (!isObj(o)) E('"optic" is missing ({ sy, fSight, relief, reflex?, pip?, magnifier?, height })');
  else {
    const num = (k: string, lo: number, hi: number) => { if (!isNum(o[k])) E(`optic.${k}: expected a number (metres), got ${JSON.stringify(o[k])}`); else if (o[k] < lo || o[k] > hi) E(`optic.${k}: ${o[k]} is out of range (${lo} to ${hi} m)`); };
    num('sy', 0.005, 0.12); num('fSight', -0.2, 0.2); num('relief', 0.03, 0.4);
    if (o.reliefOnRiser !== undefined) num('reliefOnRiser', 0.03, 0.4);
    if (!['low', 'mid', 'high'].includes(o.height)) E(`optic.height: ${JSON.stringify(o.height)} must be low, mid or high`);
    if (o.magnifier !== undefined && typeof o.magnifier !== 'boolean') E('optic.magnifier: expected true/false');
    if (o.reflex === undefined && o.pip === undefined) E('optic needs a reflex window or a pip lens (it is the picture the sight shows)');
    if (o.reflex !== undefined) {
      const r = o.reflex;
      if (!isObj(r)) E('optic.reflex: expected { f, y, w, h, kind }');
      else {
        for (const k of ['f', 'y', 'w', 'h']) if (!isNum(r[k])) E(`optic.reflex.${k}: expected a number, got ${JSON.stringify(r[k])}`);
        if (isNum(r.w) && (r.w <= 0.004 || r.w > 0.08)) E(`optic.reflex.w: ${r.w} m is not a sight window`); if (isNum(r.h) && (r.h <= 0.004 || r.h > 0.08)) E(`optic.reflex.h: ${r.h} m is not a sight window`);
        if (!RETICLES.includes(r.kind)) E(`optic.reflex.kind: ${JSON.stringify(r.kind)} must be one of ${RETICLES.join(', ')}`);
        if (isNum(r.y) && isNum(o.sy) && Math.abs(r.y - o.sy) > 1e-4) E(`optic.reflex.y (${r.y}) is not optic.sy (${o.sy}): the window's centre is on the line of sight, or the reticle will not line up`);
        if (r.round !== undefined && typeof r.round !== 'boolean') E('optic.reflex.round: expected true/false');
        for (const k of Object.keys(r)) if (!['f', 'y', 'w', 'h', 'kind', 'round'].includes(k)) E(`optic.reflex: unknown field "${k}"`);
      }
    }
    if (o.pip !== undefined) {
      const q = o.pip;
      if (!isObj(q)) E('optic.pip: expected { f, y, r }');
      else {
        for (const k of ['f', 'y', 'r']) if (!isNum(q[k])) E(`optic.pip.${k}: expected a number, got ${JSON.stringify(q[k])}`);
        if (isNum(q.y) && isNum(o.sy) && Math.abs(q.y - o.sy) > 1e-4) E(`optic.pip.y (${q.y}) is not optic.sy (${o.sy}): the lens is on the line of sight`);
        if (isNum(q.r) && (q.r < 0.004 || q.r > 0.04)) E(`optic.pip.r: ${q.r} m is not a sight lens`);
        for (const k of Object.keys(q)) if (!['f', 'y', 'r'].includes(k)) E(`optic.pip: unknown field "${k}"`);
      }
    }
    if (o.magnifier === true && o.reflex === undefined) E('optic.magnifier is true but there is no reflex window: a magnifier goes behind a reflex sight');
    for (const k of Object.keys(o)) if (!['sy', 'fSight', 'relief', 'reliefOnRiser', 'reflex', 'pip', 'magnifier', 'height'].includes(k)) E(`optic: unknown field "${k}"`);
  }
  if (rep !== undefined) { /* replace-only: the entries keep their ids, stats, prices, tiers and mounts */ }
  else if (!isObj(p)) E('"part" is missing ({ mount, brand, name, price, tier, zoom, st }) (or "replaces": [entry names] to give existing entries this model)');
  else {
    const spec = AUTHORED_PART_SLOTS[cfg.slot];
    if (spec && spec.mounts && !spec.mounts.includes(p.mount)) E(`part.mount: ${JSON.stringify(p.mount)} must be one of ${spec.mounts.join(', ')}`);
    for (const k of ['brand', 'name']) if (typeof p[k] !== 'string' || !p[k].trim()) E(`part.${k}: expected a non-empty string`);
    if (!isNum(p.price) || p.price < 0) E('part.price: expected a number >= 0'); if (!Number.isInteger(p.tier) || p.tier < 1 || p.tier > 3) E('part.tier: expected 1, 2 or 3');
    if (!isNum(p.zoom) || p.zoom < 0.2 || p.zoom > 1) E(`part.zoom: expected the ADS FOV multiplier, 0.2 to 1, got ${JSON.stringify(p.zoom)}`);
    if (!isObj(p.st) || !Object.values(p.st).every(isNum)) E('part.st: expected an object of stat deltas (numbers)');
    if (p.desc !== undefined && typeof p.desc !== 'string') E('part.desc: expected text');
    if (isObj(o) && o.pip !== undefined) {
      if (p.scoped !== true) E('part.scoped must be true for a sight with a pip lens'); if (!SCOPE_RETICLES.includes(p.reticle)) E(`part.reticle: ${JSON.stringify(p.reticle)} must be one of ${SCOPE_RETICLES.join(', ')}`);
      if (!isNum(p.px) || p.px < 1.2) E('part.px: the magnification, a number of at least 1.2'); if (p.levels !== undefined && !(Array.isArray(p.levels) && p.levels.every(isNum))) E('part.levels: expected a list of powers');
    } else for (const k of ['scoped', 'reticle', 'px', 'levels']) if (p[k] !== undefined) E(`part.${k} is for a magnified sight (optic.pip); this one has none`);
    for (const k of Object.keys(p)) if (!['mount', 'brand', 'name', 'price', 'tier', 'zoom', 'st', 'desc', 'scoped', 'reticle', 'px', 'levels'].includes(k)) E(`part: unknown field "${k}"`);
  }
  return out;
}
/** Checks an authored part's .glb (as a ModelDesc): one root named after the part, only meshes of the part's slot (and display surfaces) with catalogue materials. */
/** Checks an authored VARIANT part (models/<id>/<name>.glb, GUN_MODEL_CONTRACT.authored.variants): one root <id>_<name> with extras.variant_json, only meshes of its slot, catalogue materials. */
function validateAuthoredVariant(model: ModelDesc, id: string, name: string): ModelReport {
  const errors: string[] = [], warnings: string[] = [], C = GUN_MODEL_CONTRACT, E = (m: string) => errors.push(m), matOk = new RegExp(C.materials.anonymousPattern);
  if (model.roots.length !== 1) { E(`the scene has ${model.roots.length} root nodes; it needs exactly one, named "${id}_${name}"`); return { errors, warnings }; }
  const root = model.roots[0];
  if (root.name !== `${id}_${name}`) E(`the root node is named "${root.name}", expected "${id}_${name}"`);
  let v: any = root.extras.variant;
  if (v === undefined && typeof root.extras.variant_json === 'string') { try { v = JSON.parse(root.extras.variant_json); } catch (e) { E(`root extras.variant_json is not valid JSON: ${(e as Error).message}`); } }
  if (!isObj(v)) { E('root extras.variant_json is missing: { gun, slot, of: "factory", info?, cap?, note }'); return { errors, warnings }; }
  if (v.gun !== id) E(`variant.gun is ${JSON.stringify(v.gun)}, expected "${id}" (the folder)`);
  if (v.slot !== 'barrel' && v.slot !== 'mag' && v.slot !== 'muzzle') E(`variant.slot is ${JSON.stringify(v.slot)}: "barrel", "muzzle" or "mag"`);
  if (v.of !== 'factory') E(`variant.of is ${JSON.stringify(v.of)}: "factory" (the part it replaces)`);
  if ((v.slot === 'barrel' || v.slot === 'muzzle') && !(isObj(v.info) && Array.isArray(v.info.muzzles) && v.info.muzzles.length && v.info.muzzles.every((m: any) => Array.isArray(m) && m.length === 3 && m.every(isNum)))) E('a barrel or muzzle variant needs variant.info.muzzles: [[forward, up, right], ...]');
  if (v.slot === 'mag' && !(Number.isInteger(v.cap) && v.cap > 0)) E('a magazine variant needs variant.cap, its capacity in rounds');
  if (v.info !== undefined) {
    if (!isObj(v.info)) E('variant.info is not an object');
    else {
      for (const k of Object.keys(v.info)) if (!['muzzles', 'mounts'].includes(k)) E(`variant.info.${k}: not a field (muzzles, mounts)`);
      if (v.slot !== 'barrel' && v.info.mounts !== undefined) E('only a barrel variant has variant.info.mounts');
      if (v.info.mounts !== undefined) {
        if (!isObj(v.info.mounts)) E('variant.info.mounts is not an object ({ mount_optic: [forward, up, right] })');
        else for (const [k, m] of Object.entries(v.info.mounts)) {
          if (k !== 'mount_optic') E(`variant.info.mounts.${k}: not a mount a variant provides (mount_optic)`);
          else if (!(Array.isArray(m) && m.length === 3 && m.every(isNum))) E(`variant.info.mounts.${k}: expected [forward, up, right] metres`);
        }
      }
    }
  }
  // a threaded barrel: its anchors.mount_muzzle (the thread's end, where a muzzle device is seated) and its thread go together
  if (v.anchors !== undefined || v.thread !== undefined) {
    const mm = isObj(v.anchors) ? v.anchors.mount_muzzle : undefined, t = v.thread;
    if (v.slot !== 'barrel') E('only a barrel variant has variant.anchors and variant.thread (a threaded barrel)');
    if (v.anchors !== undefined) {
      if (!isObj(v.anchors)) E('variant.anchors is not an object ({ mount_muzzle: [forward, up, right] })');
      else for (const k of Object.keys(v.anchors)) if (k !== 'mount_muzzle') E(`variant.anchors.${k}: not an anchor a variant provides (mount_muzzle)`);
      if (isObj(v.anchors) && !(Array.isArray(mm) && mm.length === 3 && mm.every(isNum))) E('variant.anchors.mount_muzzle: expected [forward, up, right] metres (the thread\'s end)');
    }
    if (v.thread === undefined) E('variant.anchors.mount_muzzle is a threaded barrel\'s: it needs variant.thread { size, shoulder, end, r }');
    else if (!isObj(t)) E('variant.thread is not an object ({ size, shoulder, end, r })');
    else {
      for (const k of Object.keys(t)) if (!['size', 'shoulder', 'end', 'r'].includes(k)) E(`variant.thread.${k}: not a field (size, shoulder, end, r)`);
      if (typeof t.size !== 'string' || !t.size) E('variant.thread.size: the thread\'s name, e.g. "1/2x28"');
      for (const k of ['shoulder', 'end', 'r']) if (!isNum(t[k])) E(`variant.thread.${k}: expected metres`);
      if (isNum(t.shoulder) && isNum(t.end) && !(t.end > t.shoulder)) E(`variant.thread: its end (${t.end}) is not forward of its shoulder (${t.shoulder})`);
      if (isNum(t.r) && !(t.r > 0 && t.r < 0.05)) E(`variant.thread.r is ${t.r}: its major radius in metres`);
      if (v.anchors === undefined) E('variant.thread needs variant.anchors.mount_muzzle (the thread\'s end, where a muzzle device is seated)');
      else if (Array.isArray(mm) && isNum(mm[0]) && isNum(t.end) && Math.abs(mm[0] - t.end) > 1e-4) E(`variant.anchors.mount_muzzle's forward (${mm[0]}) is not variant.thread.end (${t.end}): a device is seated at the thread's end`);
    }
    if (Array.isArray(mm) && mm.length === 3 && isObj(v.info) && Array.isArray(v.info.muzzles) && Array.isArray(v.info.muzzles[0]) && isNum(v.info.muzzles[0][0]) && Math.abs(v.info.muzzles[0][0] - mm[0]) > 0.001) E(`variant.info.muzzles[0] (${v.info.muzzles[0][0]}) is not at the thread's end (mount_muzzle ${mm[0]}): the bare threaded barrel's muzzle is its end`);
  }
  for (const k of Object.keys(v)) if (!['gun', 'slot', 'of', 'info', 'anchors', 'thread', 'cap', 'note'].includes(k)) E(`variant.${k}: not a field (gun, slot, of, info, anchors, thread, cap, note)`);
  let meshes = 0;
  const visit = (n: ModelNode, inPart: boolean) => {
    for (const c of n.children) {
      if (c.mesh) {
        meshes++;
        if (c.extras[NAMES.extras.slot] !== v.slot) E(`mesh "${c.name}": extras.slot is ${JSON.stringify(c.extras[NAMES.extras.slot])}, expected "${v.slot}"`);
        if (!c.materials.length) E(`mesh "${c.name}": has no material`);
        for (const m of c.materials) if (!m) E(`mesh "${c.name}": its material has no name`); else if (!(m in C.materials.names) && !matOk.test(m)) E(`mesh "${c.name}": material '${m}' is not in the catalogue`);
        if (v.slot === 'mag' && !inPart) E(`mesh "${c.name}": a magazine's meshes are in its part_mag node`);
      }
      if (c.name.startsWith(NAMES.partPrefix) && v.slot !== 'mag') E(`node "${c.name}": a barrel variant has no part_ nodes`);
      visit(c, inPart || c.name.startsWith(NAMES.partPrefix));
    }
  };
  visit(root, false);
  if (!meshes) E('the variant has no meshes');
  return { errors, warnings };
}
function validateAuthoredPart(model: ModelDesc, id: string, slot = 'optic'): ModelReport {
  const errors: string[] = [], warnings: string[] = [], C = GUN_MODEL_CONTRACT, E = (m: string) => errors.push(m), matOk = new RegExp(C.materials.anonymousPattern);
  if (model.roots.length !== 1) { E(`the scene has ${model.roots.length} root nodes; it needs exactly one, named after the part ("${id}")`); return { errors, warnings }; }
  const root = model.roots[0];
  if (root.name !== id) E(`the root node is named "${root.name}", expected "${id}" (the folder name)`);
  if (root.extras[NAMES.extras.info] !== undefined || root.extras[NAMES.extras.anchors] !== undefined) E('an authored part has no extras.info or extras.anchors on its root (its sight data is in model.json)');
  let meshes = 0, swing = 0; const names = new Set<string>();
  // (a magnifier: its fixed meshes under the root and ONE part_magn node, the swinging tube, its meshes under it: GUN_MODEL_CONTRACT.authoredParts.magnifier)
  const MAGN = NAMES.partPrefix + PARTS.magn, kids: { c: ModelNode; inSwing: boolean }[] = [];
  for (const c of root.children) {
    if (slot === 'magnifier' && c.name === MAGN && !c.mesh) {
      if (names.has(c.name)) E(`two nodes are named "${c.name}"`); names.add(c.name);
      swing++; if (c.extras[NAMES.extras.part] !== undefined && c.extras[NAMES.extras.part] !== PARTS.magn) E(`node "${MAGN}": extras.part is ${JSON.stringify(c.extras[NAMES.extras.part])}, expected "${PARTS.magn}"`);
      if (!c.children.length) E(`node "${MAGN}" has no meshes: the swinging tube is its children`);
      for (const cc of c.children) kids.push({ c: cc, inSwing: true });
    } else kids.push({ c, inSwing: false });
  }
  if (slot === 'magnifier' && swing !== 1) E(`a magnifier has one ${MAGN} node under its root (the tube that flips aside), this one has ${swing}`);
  for (const { c, inSwing } of kids) {
    if (names.has(c.name)) E(`two nodes are named "${c.name}"`); names.add(c.name);
    if (!c.mesh) { E(`node "${c.name}": an authored part is flat meshes under the root (no ${NAMES.partPrefix}/${NAMES.groupPrefix} nodes${slot === 'magnifier' ? ' but its one ' + MAGN : ''})${inSwing ? ' (under ' + MAGN + ')' : ''}`); continue; }
    const display = c.name.startsWith(NAMES.displayPrefix);
    if (c.extras[NAMES.extras.slot] !== slot) E(`mesh "${c.name}": extras.slot is ${JSON.stringify(c.extras[NAMES.extras.slot])}, expected "${slot}"`);
    if (display) {
      if (!c.uv) E(`display "${c.name}": has no UVs (TEXCOORD_0)`);
      const d = c.extras[NAMES.extras.display];
      if (!isObj(d) || !(Number.isInteger(d.width) && d.width > 0 && Number.isInteger(d.height) && d.height > 0)) E(`display "${c.name}": extras.display must be { width, height } in whole pixels`);
    } else {
      meshes++;
      if (!new RegExp('^' + slot + '_\\d+$').test(c.name)) E(`mesh "${c.name}": must be named "${slot}_<n>" (or "${NAMES.displayPrefix}<name>" for a display surface)`);
      if (!c.materials.length) E(`mesh "${c.name}": has no material`);
      for (const m of c.materials) if (!m) E(`mesh "${c.name}": its material has no name (use a catalogue name)`); else if (!(m in C.materials.names) && !matOk.test(m)) E(`mesh "${c.name}": material '${m}' is not in the catalogue (${Object.keys(C.materials.names).join(', ')}) and is not an anonymous colour (m_<rrggbb>)`);
    }
    if (c.children.length) E(`mesh "${c.name}" has child nodes`);
  }
  if (!meshes) E('the part has no meshes');
  return { errors, warnings };
}

/** Checks one pack file (a ModelDesc) against the pack rules: one root, flat part_/group_ nodes with a pivot, meshes of one slot, known materials. */
function validatePack(model: ModelDesc, tag?: string): ModelReport {
  const errors: string[] = [], warnings: string[] = [], C = GUN_MODEL_CONTRACT, E = (m: string) => errors.push(m);
  if (model.roots.length !== 1) { E(`the scene has ${model.roots.length} root nodes; a pack has exactly one`); return { errors, warnings }; }
  const root = model.roots[0], pk = root.extras[NAMES.extras.pack];
  if (!isObj(pk)) E('root extras.pack is missing ({ platform, tag, key })');
  else {
    if (typeof pk.platform !== 'string') E('extras.pack.platform: expected a string');
    if (typeof pk.tag !== 'string' || !(pk.tag.split('@')[0] in C.slots)) E(`extras.pack.tag: ${JSON.stringify(pk.tag)} is not a slot`);
    else if (tag && pk.tag !== tag) E(`extras.pack.tag is "${pk.tag}", expected "${tag}"`);
    if (!isObj(pk.key)) E('extras.pack.key: expected an object slot -> part id');
  }
  const t = (isObj(pk) ? pk.tag : tag || '').split('@')[0], names = new Set<string>(), matOk = new RegExp(C.materials.anonymousPattern);
  if (root.extras[NAMES.extras.info] !== undefined) E('a pack has no extras.info (the platform index carries the info)');
  let meshes = 0;
  for (const c of root.children) {
    if (names.has(c.name)) E(`two nodes are named "${c.name}"`); names.add(c.name);
    const own = c.extras[NAMES.extras.parent];
    if (c.mesh) {
      meshes++;
      const slot = c.extras[NAMES.extras.slot];
      if (slot !== t) E(`mesh "${c.name}": extras.slot is ${JSON.stringify(slot)}, a pack of "${t}" holds only that slot's meshes`);
      for (const m of c.materials) if (!m || (!(m in C.materials.names) && !matOk.test(m) && !c.name.startsWith(NAMES.displayPrefix))) E(`mesh "${c.name}": material '${m}' is not in the catalogue`);
    } else {
      if (!c.name.startsWith(NAMES.partPrefix) && !c.name.startsWith(NAMES.groupPrefix)) E(`node "${c.name}": a non-mesh node in a pack must be part_<key> or group_<name>`);
      if (c.name.startsWith(NAMES.partPrefix) && !(c.name.slice(NAMES.partPrefix.length) in C.parts)) E(`node "${c.name}": not a known part`);
      if (own !== undefined && typeof own !== 'string') E(`node "${c.name}": extras.parent must be a node name`);
      { // (a bipod's legs nest in part_bipod)
        const leg = c.extras[NAMES.extras.leg], bp = NAMES.partPrefix + PARTS.bipod;
        if (leg !== undefined) { const pr = legProblem(leg); if (pr) E(`node "${c.name}": ${pr}`); if (own !== bp) E(`node "${c.name}": extras.leg needs extras.parent "${bp}"`); }
        else if (own === bp) E(`node "${c.name}": a node nested in ${bp} is a leg and needs extras.leg`);
      }
      if (c.extras[NAMES.extras.owner] !== undefined && typeof c.extras[NAMES.extras.owner] !== 'boolean') E(`node "${c.name}": extras.owner must be true/false`);
      for (const m of c.children) { meshes++; if (!m.mesh) E(`node "${c.name}" holds "${m.name}", which is not a mesh`); else if (m.extras[NAMES.extras.slot] !== t) E(`mesh "${m.name}": extras.slot is ${JSON.stringify(m.extras[NAMES.extras.slot])}, expected "${t}"`); }
    }
    if (c.extras[NAMES.extras.anchors] !== undefined) E(`node "${c.name}": a pack carries no extras.anchors (the platform index does)`);
  }
  if (!meshes) warnings.push('the pack holds no meshes');
  return { errors, warnings };
}
/** The JSON Schema (draft 2020-12) of a platform's index.json. */
function partsIndexSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'gun-parts-index.schema.json', title: 'Per-part packs: a platform\'s index.json',
    description: 'Generated from js/glb.ts PARTS_INDEX_FIELDS: do not edit (npm run check:models -- --write). See docs/models.md.', ...propsSchema(PARTS_INDEX_FIELDS, false),
  };
}

// ---- describing a model for the validator -------------------------------------------------------------------------------

/** A ModelDesc from a glTF's parsed JSON (the .glb's JSON chunk): node tree, extras, material names. No three.js needed. */
function describeGltfJson(j: any): ModelDesc {
  const nodes: any[] = j.nodes || [], meshes: any[] = j.meshes || [], mats: any[] = j.materials || [];
  const conv = (i: number): ModelNode => {
    const n = nodes[i], me = n.mesh != null ? meshes[n.mesh] : null;
    const ms = me ? (me.primitives || []).map((p: any) => (p.material != null ? (mats[p.material] || {}).name || '' : '')) : [];
    const uv = !!me && (me.primitives || []).length > 0 && me.primitives.every((p: any) => p.attributes && p.attributes.TEXCOORD_0 != null);
    return { name: n.name || '', extras: n.extras || {}, mesh: !!me, uv, materials: ms, children: (n.children || []).map(conv) };
  };
  const sc = (j.scenes || [])[j.scene || 0];
  return { roots: ((sc && sc.nodes) || []).map(conv) };
}
/** A ModelDesc from a loaded three.js scene (the GLTFLoader's `scene`). */
function describeScene(scene: any): ModelDesc {
  const conv = (o: any): ModelNode => ({
    name: o.name, extras: o.userData || {}, mesh: !!o.isMesh, uv: !!(o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.uv),
    materials: o.isMesh ? [].concat(o.material).map((m: any) => (m ? m.name : '')) : [], children: o.children.map(conv),
  });
  return { roots: scene.children.map(conv) };
}
/** The parsed JSON chunk of a .glb (an ArrayBuffer / Uint8Array): a minimal reader, enough for validate(). */
function glbJson(buf: ArrayBuffer | Uint8Array): any {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a .glb (bad magic)');
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + len)));
}

// ---- JSON Schema and docs, generated from the contract -----------------------------------------------------------------

function shapeSchema(s: Field | Shape): any {
  const d: any = 'doc' in s && s.doc ? { description: s.doc } : {};
  switch (s.t) {
    case 'num': return { type: 'number', ...(s.min != null ? { minimum: s.min } : {}), ...(s.max != null ? { maximum: s.max } : {}), ...d };
    case 'bool': return { type: 'boolean', ...d };
    case 'str': return { type: 'string', ...(s.enum ? { enum: s.enum } : {}), ...d };
    case 'vec': return { type: 'array', items: { type: 'number' }, minItems: s.n, maxItems: s.n, ...d };
    case 'list': return { type: 'array', items: shapeSchema(s.of), ...(s.min ? { minItems: s.min } : {}), ...d };
    case 'map': return { type: 'object', additionalProperties: shapeSchema(s.of), ...d };
    case 'free': return d;
    case 'obj': return { ...propsSchema(s.props, !!s.extra), ...d };
    case 'tagged': return { oneOf: Object.entries(s.variants).map(([tag, props]) => propsSchema({ [s.tag]: { t: 'str', enum: [tag], doc: `${s.tag} = ${tag}` } as Field, ...props }, false)), ...d };
  }
}
function propsSchema(props: Record<string, Field>, extra: boolean) {
  return {
    type: 'object', properties: Object.fromEntries(Object.entries(props).map(([k, f]) => [k, f.optional ? { oneOf: [shapeSchema(f), { type: 'null' }] , ...(f.doc ? { description: f.doc } : {}) } : shapeSchema(f)])),
    required: Object.entries(props).filter(([, f]) => !f.optional).map(([k]) => k), additionalProperties: extra,
  };
}
/** The JSON Schema (draft 2020-12) of the root node's `extras.info`. */
function infoSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'gun-model-info.schema.json', title: 'Gun model info (glTF root node extras.info)',
    description: `${GUN_MODEL_CONTRACT.frame} Generated from js/glb.ts INFO_FIELDS: do not edit (npm run check:models -- --write).`,
    ...propsSchema(INFO_FIELDS as Record<string, Field>, false),
  };
}
/** The contract's tables as Markdown, for docs/models.md (between its `contract:begin` / `contract:end` comments). */
function contractMarkdown(): string {
  const C = GUN_MODEL_CONTRACT, esc = (s: string) => s.replace(/\|/g, '\\|');
  const typ = (f: Field): string => (f.t === 'vec' ? `[${f.n === 3 ? 'forward, up, right' : 'forward, up'}] m` : f.t === 'num' ? 'number' : f.t === 'list' ? 'list' : f.t === 'tagged' ? 'object (by `' + f.tag + '`)' : f.t === 'map' ? 'object' : f.t === 'obj' ? 'object' : f.t === 'str' ? 'string' : f.t === 'bool' ? 'boolean' : 'any');
  const L: string[] = [];
  L.push(`**Frame.** ${C.frame}`, '', '**Node tree.**', '', ...Object.entries(C.tree).map(([k, v]) => `- ${k}: ${v}`), '', '**Slots** (mesh extras.slot):', '', '| slot | meaning |', '| --- | --- |');
  for (const [k, s] of Object.entries(C.slots)) L.push(`| \`${k}\`${s.required ? ' (required)' : ''} | ${esc(s.doc)} |`);
  L.push('', '**Animated parts** (`part_<key>`, listed in `info.anim`):', '', '| key | meaning | paired info field |', '| --- | --- | --- |');
  for (const [k, p] of Object.entries(C.parts)) L.push(`| \`part_${k}\` | ${esc(p.doc)} | ${p.pairedWith ? '`info.' + p.pairedWith + '` (present exactly when the part is)' : ''} |`);
  L.push('', '**`info` fields** (root node extras):', '', '| field | required | type | meaning |', '| --- | --- | --- | --- |');
  for (const [k, f] of Object.entries(INFO_FIELDS)) L.push(`| \`${k}\` | ${f.optional ? 'no' : 'yes'} | ${typ(f)} | ${esc(f.doc)} |`);
  L.push('', '**Materials** (the mesh\'s material NAME): ' + C.materials.rule, '', '| name | meaning | bump |', '| --- | --- | --- |');
  for (const [k, m] of Object.entries(C.materials.names)) L.push(`| \`${k}\` | ${esc(m.doc)} | ${m.bump ? 'rebuilt at load (' + m.bump + ')' : ''} |`);
  L.push('', '**Display surfaces** (`display_<name>`):', '', `- naming: ${C.displays.naming}`, `- UVs: ${C.displays.uvs}`, `- size: ${C.displays.size}`, `- material: ${C.displays.material}`, '- example: `' + JSON.stringify(C.displays.example) + '`');
  L.push('', '**Anchors a part provides** (`extras.anchors`):', '', `- where: ${C.anchors.where}`, ...C.anchors.assembly.map((a) => `- ${a}`), `- muzzles: ${C.anchors.muzzles}`, '- example: `' + JSON.stringify(C.anchors.example) + '`');
  L.push('', '**Authored sources** (a gun modelled in Blender, baked with no recipe):', '', `- what: ${C.authored.what}`, `- nodes: ${C.authored.nodes}`, `- info: ${C.authored.info}`, `- anchors: ${C.authored.anchors}`, '', '| anchor (extras.anchors) | meaning |', '| --- | --- |');
  for (const [k, v] of Object.entries(C.authored.required)) L.push(`| \`${k}\` (required) | ${esc(v as string)} |`);
  for (const [k, v] of Object.entries(C.authored.optional)) L.push(`| \`${k}\` (optional) | ${esc(v as string)} |`);
  L.push('', `- opticMount: ${C.authored.opticMount}`, `- pistol: ${C.authored.pistol}`, `- variants: ${C.authored.variants}`, `- seat: ${C.authored.seat}`, `- mesh: ${C.authored.mesh}`, ...C.authored.rules.map((r) => `- ${r}`), '- example: \`' + JSON.stringify(C.authored.example) + '\`');
  const AP = C.authoredParts;
  L.push('', '**Authored parts** (a shared attachment modelled in Blender: sights, prisms, scopes; furniture: stocks, grips, muzzle devices, handguards; and flip magnifiers):', '', `- what: ${AP.what}`, `- frame: ${AP.frame}`, `- model: ${AP.model}`, `- config: ${AP.config}`, ...Object.entries(AP.optic).map(([k, v]) => `- optic.${k}: ${v}`), `- part: ${AP.part}`, ...AP.rules.map((r) => `- ${r}`), ...Object.entries(AP.furniture).map(([k, v]) => `- furniture ${k}: ${v}`), ...Object.entries(AP.magnifier).map(([k, v]) => `- magnifier ${k}: ${v}`),'- example: \`' + JSON.stringify(AP.example) + '\`');
  L.push('', '**Magazine check** (`part_mag.extras.check`, meshes\' `extras.chk`):', '', `- what: ${C.magCheck.what}`, `- part: ${C.magCheck.part}`, `- meshes: ${C.magCheck.meshes}`, '- example: `' + JSON.stringify(C.magCheck.example) + '`');
  L.push('', '**Multi-barrel guns and reload sequences** (`info.barrels`, `info.hinge`):', '', `- what: ${C.multi.what}`, `- speed: ${C.multi.speed}`, `- display: ${C.multi.display}`, `- dial: ${C.multi.dial}`, `- hinge: ${C.multi.hinge}`, '- example: `' + JSON.stringify(C.multi.example) + '`');
  L.push('', '**Bipods** (`part_bipod`, its legs\' `extras.leg`):', '', `- what: ${C.bipod.what}`, `- pose: ${C.bipod.pose}`, `- drive: ${C.bipod.drive}`, `- packs: ${C.bipod.packs}`, '- example: `' + JSON.stringify(C.bipod.example) + '`');
  L.push('', '**Per-part pieces** (assets/models/parts: one file per part, assembled by rules):', '', ...Object.entries(C.packs).map(([k, v]) => `- ${k}: ${v}`));
  L.push('', C.materials.anonymous, '', '**Extras keys:** ' + Object.entries(C.extras).map(([where, o]) => `${where}: ${Object.keys(o).map((k) => '`' + k + '`').join(', ')}`).join('; ') + '.');
  return L.join('\n');
}

// ===================================================================================================================
//  THE LOADER
// ===================================================================================================================


  const qs = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  /** ?checkModels: validate each model as it loads. (Every gun the game shows comes from these files: there is no flag and no procedural fallback.) */
  const on = true, checking = qs.has('checkModels');
  const R = { base: '' }; // (R.base: where the page's folder is from here: '' on the page, '../../' in the export worker, js/exportworker.ts)
  const glbReady = (): Promise<boolean> => (G.GLB ? G.GLB.ready.then((x) => x, () => false) : Promise.resolve(false));

  // ---- per-part packs: loading, and assembling any build from them ----
  const PARTS_BASE = 'assets/models/parts/', SHARED_DIR = '_shared/';
  const platIx = new Map<string, PartsIndex>(), platPending = new Map<string, Promise<PartsIndex | null>>();
  const packRoots = new Map<string, any>();
  const platformIndex = (id: string): Promise<PartsIndex | null> => {
    let p = platPending.get(id);
    if (!p) platPending.set(id, (p = G.Bundles.getJson(PARTS_BASE + id + '/index.json').then((ix: PartsIndex | null) => { // (from the '_boot' bundle: js/modelbundles.ts)
      if (ix && checking) { const r = validatePartsIndex(ix); for (const e of r.errors) console.error(`[checkModels] parts/${id}/index.json: ${e}`); }
      if (ix) platIx.set(id, ix); return ix;
    })));
    return p;
  };
  const packUrl = (id: string, file: string) => PARTS_BASE + (file.startsWith(SHARED_DIR) ? '' : id + '/') + file; // (a shared pack is one file for every platform)
  // ---- the parse queue: what is needed now jumps what is only wanted soon ----
  // Every file is already in memory (the one model bundle, js/modelbundles.ts), so nothing here waits on the network: the queue only schedules glTF PARSING,
  // which is main-thread work. Priorities: 0 = needed now (a gun on screen, the squad's kits), 1 = wanted soon (the level's enemy pool, the gunsmith's
  // platform). At most PARSE_MAX packs are in flight at once.
  type Job = { url: string; pri: number; start: () => Promise<boolean>; done: Promise<boolean>; resolve: (ok: boolean) => void; started: boolean };
  const PARSE_MAX = 8;
  const jobs = new Map<string, Job>(), queue: Job[] = [];
  let running = 0, pumping = false;
  function pump() {
    if (pumping) return; pumping = true;
    try {
      queue.sort((a, b) => a.pri - b.pri); // (stable: the order asked within a priority)
      while (queue.length && running < PARSE_MAX) { const j = queue.shift()!; running++; run(j, () => { running--; pump(); }); }
    } finally { pumping = false; }
  }
  function run(j: Job, after: () => void) { j.started = true; j.start().then((ok) => { jobs.delete(j.url); j.resolve(ok); after(); }); }
  /** Queues a load at a priority (a lower number is sooner); a job already waiting at a lower priority is moved up. */
  function enqueue(url: string, pri: number, start: () => Promise<boolean>): Promise<boolean> {
    let j = jobs.get(url);
    if (j) { if (!j.started && pri < j.pri) { j.pri = pri; pump(); } return j.done; }
    let resolve!: (ok: boolean) => void; const done = new Promise<boolean>((r) => { resolve = r; });
    j = { url, pri, start, done, resolve, started: false }; jobs.set(url, j); queue.push(j); pump();
    return done;
  }
  const loadPack = (id: string, file: string, pri = 0): Promise<boolean> => {
    const url = packUrl(id, file); if (packRoots.has(url)) return Promise.resolve(true);
    return enqueue(url, pri, () => G.GLB!.load(url).then((scene) => {
      if (checking) { const r = validatePack(describeScene(scene)); for (const e of r.errors) console.error(`[checkModels] ${url}: ${e}`); for (const w of r.warnings) console.warn(`[checkModels] ${url}: ${w}`); }
      const root = scene.children[0]; if (root) packRoots.set(url, root); return !!root;
    }, (e: any) => { console.warn('[baked guns] ' + url + ': ' + (e && e.message || e)); return false; }));
  };
  const buildOf = (def: any): Record<string, string> => def.build || G.Gunsmith.defaultBuild(def.id);
  const pool = async <X,>(items: X[], n: number, fn: (x: X) => Promise<unknown>) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); };
  /** Loads the platform's index and the packs this build needs; resolves to whether `assemble(def)` can now work. */
  async function ensure(def: any, pri = 0): Promise<boolean> {
    if (!on || !def) return false;
    const ok = await glbReady(); if (!ok) return false;
    const ix = await platformIndex(def.id); if (!ix) return false;
    const plan = planBuild(ix, buildOf(def));
    const r = await Promise.all(plan.tags.filter((t) => t.entry).map((t) => loadPack(def.id, t.entry!.file!, pri)));
    return r.every((x) => x);
  }
  /** Loads the platform's index and EVERY pack of it (or only those of the given builds' tags if `builds` is given); resolves to the number of packs loaded. */
  async function preloadPlatform(id: string, builds?: Record<string, string>[], pri = 1): Promise<number> {
    if (!on) return 0;
    const ok = await glbReady(); if (!ok) return 0;
    const ix = await platformIndex(id); if (!ix) return 0;
    const files = new Set<string>();
    if (builds) { for (const b of builds) for (const t of planBuild(ix, b).tags) if (t.entry) files.add(t.entry.file!); }
    else for (const t of Object.values(ix.tags)) for (const e of Object.values(t.pieces)) if (e.file) files.add(e.file);
    let n = 0; await Promise.all([...files].map(async (f) => { if (await loadPack(id, f, pri)) n++; }));
    return n;
  }
  /** Own geometry for a mesh and the catalogue's material by name: what the whole-gun path does to every mesh (the gunsmith and icons dispose geometry; the game's materials are shared). */
  function finishMeshes(group: THREE.Object3D) {
    const M = G.GunMaterials.M as Record<string, () => THREE.Material>;
    group.traverse((o: any) => {
      if (!o.isMesh) return;
      if (!o.userData.own) o.geometry = o.geometry.clone();
      const name = o.material && o.material.name;
      if (M[name] && !o.name.startsWith(NAMES.displayPrefix)) o.material = M[name](); // (a display surface keeps its own: the game paints it)
    });
  }
  /**
   * The gun for ANY build from the loaded packs: { group, info } as G.GunModels.display gives (slot-tagged meshes, part_ nodes with their
   * pivots, info with the muzzles list, the mounts and info.anim), or null if the platform's index or a pack it needs is not loaded
   * (ensure / preloadPlatform) or the packs do not cover the build (a combination the baker never saw).
   */
  function assemble(def: any, skin?: any): { group: THREE.Group; info: any; approx?: string } | null {
    const ix = def && platIx.get(def.id); if (!ix) return null;
    const plan = planBuild(ix, buildOf(def));
    const T = THREE, group = new T.Group();
    interface Src { root: THREE.Object3D; rigid: Vec3; scale?: number; rear?: number }
    const srcs: Src[] = [];
    for (const t of plan.tags) { const root = packRoots.get(packUrl(def.id, t.entry.file)); if (!root) return null; srcs.push({ root, rigid: [t.rigid[0] + t.at[0], t.rigid[1] + t.at[1], t.rigid[2] + t.at[2]], scale: t.scale, rear: t.rear }); }
    /** A point of the pack's frame (glTF axes) moved to where it sits in this build. */
    const op = (s: Src, x: number, y: number, z: number, out: THREE.Vector3) => out.set(x + s.rigid[2], y + s.rigid[1], z - s.rigid[0]);
    const fin = new Map<string, THREE.Vector3>(), nodes = new Map<string, THREE.Group>(), parentOf = new Map<string, string>(), tmp = new T.Vector3();
    // the nodes: pivots from their owners
    for (const pass of [0, 1]) for (const s of srcs) for (const c of s.root.children) {
      if ((c as any).isMesh) continue;
      const own = c.userData[NAMES.extras.owner] !== false;
      if (pass === 0 ? !own : fin.has(c.name)) continue;
      fin.set(c.name, op(s, c.position.x, c.position.y, c.position.z, new T.Vector3()));
      const g = new T.Group(); g.name = c.name; g.userData = Object.fromEntries(Object.entries(c.userData).filter(([k]) => k !== NAMES.extras.owner && k !== NAMES.extras.parent));
      nodes.set(c.name, g); if (c.userData[NAMES.extras.parent]) parentOf.set(c.name, c.userData[NAMES.extras.parent]);
    }
    /** Puts a pack mesh into `into`, a node whose final pivot is `pivot` (the gun's root: none), the mesh sitting under `from` (its pack node's pivot, or none). */
    const place = (s: Src, m: THREE.Mesh, from: THREE.Vector3 | null, pivot: THREE.Vector3 | null, into: THREE.Object3D) => {
      const c = m.clone(); c.userData = { ...m.userData };
      if (s.scale !== undefined && s.scale !== 1 && !from) { // (a STRETCHED piece: its geometry scaled along the bore by s.scale about its rear (glTF z = -rear), then moved like any other: docs/models.md "Assembly")
        const g = c.geometry.clone(); c.updateMatrix(); g.applyMatrix4(c.matrix); c.position.set(0, 0, 0); c.quaternion.identity(); c.scale.set(1, 1, 1);
        const zr = -(s.rear as number); g.applyMatrix4(new T.Matrix4().makeTranslation(0, 0, zr).multiply(new T.Matrix4().makeScale(1, 1, s.scale)).multiply(new T.Matrix4().makeTranslation(0, 0, -zr)));
        g.computeBoundingBox(); g.computeBoundingSphere(); c.geometry = g; c.userData.own = true;
      }
      const d = op(s, from ? from.x : 0, from ? from.y : 0, from ? from.z : 0, new T.Vector3()).sub(pivot || tmp.set(0, 0, 0)); // (the pack node's pivot, moved, against the final pivot)
      c.position.add(d);
      into.add(c);
    };
    for (const s of srcs) for (const c of s.root.children) {
      if ((c as any).isMesh) { place(s, c as THREE.Mesh, null, null, group); continue; }
      const node = nodes.get(c.name)!, pivot = fin.get(c.name)!, from = c.position;
      for (const m of c.children) if ((m as any).isMesh) place(s, m as THREE.Mesh, from, pivot, node);
    }
    for (const [name, node] of nodes) { // nest, with positions relative to the parent's pivot
      const par = parentOf.get(name), pn = par ? nodes.get(par) : null;
      node.position.copy(fin.get(name)!); if (pn) { node.position.sub(fin.get(par!)!); pn.add(node); } else group.add(node);
    }
    finishMeshes(group);
    const info = plan.info; info.anim = {}; // (the tables' and the anchors' info: the same as infoOf(def) gives, with the live nodes in anim)
    for (const [name, node] of nodes) if (name.startsWith(NAMES.partPrefix) && node.userData[NAMES.extras.part]) info.anim[node.userData[NAMES.extras.part]] = node;
    if (skin && skin.length) G.Stickers.decorate(group, skin);
    return plan.approx ? { group, info, approx: plan.approx } : { group, info };
  }
  /**
   * The build's `info` from the platform's index alone: no pack files, no meshes, synchronous (once the platform's index.json is loaded:
   * G.Models.platformIndex(id) / ensure / preloadPlatform load it). The same numbers assemble(def) gives; `anim` holds the NAMES of the part_
   * nodes (key -> "part_<key>") instead of the live nodes. null while the index is not loaded.
   */
  function infoOf(def: any): any | null {
    const ix = def && platIx.get(def.id); if (!ix) return null;
    return planBuild(ix, buildOf(def)).info;
  }

  /**
   * The baked version of display(def): { group, info } assembled from the platform's pieces, or null (not loaded yet: the platform's pieces are parsed in
   * the background so that the next ask is answered). Every build, the default one too, is assembled: there is no whole-gun file to clone (assembling a
   * default build takes about as long as cloning one did, ~1 ms).
   */
  function displayBaked(def: any, skin?: any): { group: THREE.Group; info: any } | null {
    if (!on || !def) return null;
    const a = assemble(def, skin); if (a) return a;
    if (!platPending.has(def.id)) preloadPlatform(def.id);
    return null;
  }
  // ===================================================================================================================
  //  LOADING AT RUN TIME: the classic GLTFLoader, the boot's indexes, the preloads, what is ready (js/gunmodels.ts is the facade over these)
  // ===================================================================================================================

  // three's own GLTFLoader and meshopt decoder, from the same three as the global THREE (js/threeboot.ts: a global ThreeAddons, on the page and in the
  // highlights' export worker alike)
  /**
   * Undoes the bake's position quantisation as a file loads (tools/model_emit.mjs quantizePositions): a mesh node with extras.dq = [ox, oy, oz, s] holds int16
   * positions in its own box, p = o + s * q, the node's transform carrying translate(o) scale(s). The positions come back as float32 in the node's frame and the node
   * gets its own transform again (scale / s, the translation less the rotated, scaled o), so everything after the loader sees what an uncompressed file gave: no
   * scaled mesh nodes, no integer positions. (Within half a step of the recipe: s / 65534, 3.8 um for a 0.5 m mesh.) Returns the scene.
   */
  function dequantize(scene: any): any {
    const done = new Set<any>(), v = new THREE.Vector3(), snap = (x: number) => Math.round(x * 1e12) / 1e12;
    scene.traverse((o: any) => {
      const dq = o.userData && o.userData.dq; if (!dq) return;
      delete o.userData.dq;
      const [ox, oy, oz, s] = dq as number[];
      // (a mesh of several primitives loads as a group of meshes, the node's extras on the group)
      for (const g of (o.isMesh ? [o] : o.children.filter((c: any) => c.isMesh)).map((m: any) => m.geometry)) {
        if (done.has(g)) continue;
        done.add(g);
        // (int16 xyz padded to 8 bytes: the loader gives an interleaved attribute, stride 4)
        const a = g.attributes.position, il = !!a.isInterleavedBufferAttribute, q = (il ? a.data.array : a.array) as Int16Array, st = il ? a.data.stride : a.itemSize, o0 = il ? a.offset : 0;
        if (!(q instanceof Int16Array) || !a.normalized) throw new Error('dequantize: positions are not normalised int16'); // (what the bake writes: tools/model_emit.mjs)
        const n = a.count, f = new Float32Array(n * 3), k = s / 32767;
        for (let i = 0, j = o0; i < n * 3; i += 3, j += st) { f[i] = ox + k * q[j]; f[i + 1] = oy + k * q[j + 1]; f[i + 2] = oz + k * q[j + 2]; }
        g.setAttribute('position', new THREE.BufferAttribute(f, 3));
        // (the loader's bounds, from the accessor's min / max in the box's units, moved the same way: no pass over the vertices)
        const o3 = new THREE.Vector3(ox, oy, oz);
        if (g.boundingBox) { g.boundingBox.min.multiplyScalar(s).add(o3); g.boundingBox.max.multiplyScalar(s).add(o3); } else g.computeBoundingBox();
        if (g.boundingSphere) { g.boundingSphere.center.multiplyScalar(s).add(o3); g.boundingSphere.radius *= s; } else g.computeBoundingSphere();
      }
      o.scale.set(snap(o.scale.x / s), snap(o.scale.y / s), snap(o.scale.z / s));
      v.set(ox * o.scale.x, oy * o.scale.y, oz * o.scale.z).applyQuaternion(o.quaternion);
      o.position.set(snap(o.position.x - v.x), snap(o.position.y - v.y), snap(o.position.z - v.z));
    });
    return scene;
  }
  const GL = (globalThis as any).ThreeAddons;
  if (GL && !G.GLB) {
    const loader = new GL.GLTFLoader().setMeshoptDecoder(GL.MeshoptDecoder), cache = new Map<string, Promise<any>>();
    G.GLB = {
      ready: Promise.resolve(GL.MeshoptDecoder.ready).then(() => true, () => false),
      load: (url: string) => { const hit = cache.get(url); if (hit) return hit; const p: Promise<any> = (G.Bundles.bundleOf(url) ? G.Bundles.getFile(url).then((b) => loader.parseAsync(b, '')) : loader.loadAsync(R.base + url)).then((g: any) => dequantize(g.scene), (e: any) => { cache.delete(url); throw e; }); cache.set(url, p); return p; },
    };
  }
  /** Where the page's folder is from here (the export worker's scripts are two folders down: js/exportworker.ts sets '../../'). */
  const setRoot = (base: string) => { R.base = base; G.Bundles.setRoot(base); };
  /** A .glb or JSON of the game's assets (assets/models/...), by the loader above: for the props (js/gunmodels.ts). */
  const loadFile = (url: string): Promise<any> => glbReady().then((ok) => { if (!ok) throw new Error('no glTF loader'); return G.GLB!.load(url); });
  const fetchJson = (url: string): Promise<any> => (G.Bundles.bundleOf(url) ? G.Bundles.getJson(url) : fetch(R.base + url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null), () => null));

  /** Every platform's index (assets/models/parts/<id>/index.json: ~0.24 MB gzipped for all): what boot() waits on. */
  let booting: Promise<number> | null = null;
  function boot(): Promise<number> {
    return booting || (booting = glbReady().then(async (ok) => {
      if (!ok) return 0;
      const ids = Object.keys(G.Gunsmith.PLATFORMS); let n = 0;
      await pool(ids, 8, async (id) => { if (await platformIndex(id)) n++; });
      return n;
    }));
  }
  /** The info of a gun from its platform's index alone (anchors, muzzles, sight windows, mounts; info.anim empty: the nodes come with the packs); null while the index is not loaded or the build is not covered. */
  function infoFromIndex(def: any): any | null {
    return infoOf(def); // (the baker's: from the index's info tables, no packs needed)
  }
  /** Whether assemble(def) can work now: the platform's index and every pack the build needs are loaded. */
  function ready(def: any): boolean {
    const ix = def && platIx.get(def.id); if (!ix) return false;
    const plan = planBuild(ix, buildOf(def)); // (every valid build has a plan: an inexact one is plan.approx, shown as it is)
    return plan.tags.every((t) => !t.entry || packRoots.has(packUrl(def.id, t.entry.file!)));
  }
  return {
    boot, ready, infoFromIndex, setRoot, loadFile, dequantize, fetchJson, on, checking, preloadPlatform, ensure, assemble, infoOf, loadIndex: async (id: string) => !!(await platformIndex(id)), displayBaked, contract: GUN_MODEL_CONTRACT, infoFields: INFO_FIELDS, partsIndexFields: PARTS_INDEX_FIELDS, validate, validateAuthored, validateAuthoredConfig, validateAuthoredVariant, validateAuthoredPart, validateAuthoredPartConfig, authoredPartSlots: AUTHORED_PART_SLOTS, validatePack, validatePartsIndex, describeGltfJson, describeScene, glbJson,
    infoSchema, partsIndexSchema, contractMarkdown, platformLoaded: (id: string) => platIx.has(id), SLOTS, PARTS, NAMES,
    // the pure side of the packs (no three.js): the baker and the tests check the packs with the same code the game plans with
    planBuild, infoLeaves, infoFromLeaves, buildKeyOf, slotKey, PARTS_INDEX_VERSION,
  };
})();
G.Models = G_Models;
/** G.GLB: the glTF loader (made from three's GLTFLoader in js/glb.ts; tools replace it with their own). */
interface GlbModuleApi { ready: Promise<boolean>; load(url: string): Promise<any> }
interface GameModules { Models: typeof G_Models; GLB?: GlbModuleApi }
