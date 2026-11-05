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
  spin: 'spin', bipod: 'bipod', quarrel: 'quarrel', quarrelHead: 'quarrelHead', quarrelNock: 'quarrelNock', stringCocked: 'stringCocked', stringSlack: 'stringSlack',
} as const;
type PartKey = (typeof PARTS)[keyof typeof PARTS];

/** Names the node tree uses besides slots and parts. */
const NAMES = {
  /** A node that animates: `part_<key>`. Its pivot (the node's origin) is the part's hinge/slide point, in gun space. */
  partPrefix: 'part_',
  /** A plain grouping node with no animation (a hinge frame, say): `group_<n>`. */
  groupPrefix: 'group_',
  /** Extras key of a mesh node: its SLOTS value. Extras key of a `part_` node: its PARTS key. Root extras: `info` and `gun`. */
  extras: { slot: 'slot', part: 'part', info: 'info', gun: 'gun', anchors: 'anchors', display: 'display', pack: 'pack', owner: 'owner', parent: 'parent' },
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
  | { side: 'breech'; heads: Vec2[]; r: number; z: number; bore?: boolean };

/** A cocking handle / operating lever. */
interface HandleInfo { f: number; y: number; x: number; travel: number; grab?: Vec3; recip?: boolean; style?: string; sz?: number; stem?: number }

/** What `extras.info` on the root node says about the gun. Fields marked required must be present (and non-null); the others may be absent or null. */
interface GunModelInfo {
  sy: number; fSight: number; relief: number; muzzles: Vec3[]; grip: Vec3; support: Vec3; anim: Record<string, string>;
  magAt?: Vec2 | null; handle?: HandleInfo | null; port?: Vec3 | null; chamberAt?: ChamberAt | null;
  breech?: { at: Vec2; pitch: number; long: string | null } | null; ch?: Vec3 | null; bolt?: Vec3 | null; cheek?: number | null; recoilBarrel?: number | null;
  pistol?: boolean | null; slide?: Vec3 | null; cylAt?: Vec3 | null; load?: { at: Vec2[]; pitch: number } | null; cup?: Vec3 | null; magTop?: boolean | null;
  quarrelMats?: Record<string, unknown> | null; mounts?: Record<string, Vec3> | null;
  // first-person extras (js/viewmodel.ts), written by whoever makes the model:
  reflex?: { f: number; y: number; w: number; h: number; round?: boolean | null; kind: string } | null;
  pip?: { f: number; y: number; r: number; parent?: string | null; pos?: Vec3 | null } | null;
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
    handle: { doc: 'A cocking handle that reciprocates or is worked by the hand.', pairedWith: 'handle' }, pump: { doc: 'A pump-action forend.', pairedWith: null },
    lever: { doc: 'A lever-action lever.', pairedWith: null }, cyl: { doc: 'A revolver cylinder: it rotates (z) by 1/n per shot.', pairedWith: null },
    brk: { doc: 'A break-action barrel group that tips open on its hinge.', pairedWith: null }, barrel: { doc: 'A long-recoil barrel (runs back by info.recoilBarrel).', pairedWith: null },
    cover: { doc: 'A belt-fed gun\'s feed cover.', pairedWith: null }, magn: { doc: 'A magnifier that flips aside.', pairedWith: null }, spin: { doc: 'A rotary barrel group that spins.', pairedWith: null }, bipod: { doc: 'Reserved: a bipod\'s legs.', pairedWith: null },
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
      tubeDS: { doc: 'Double-sided black (a tube you see inside).' }, lens: { doc: 'Blue-coated lens.' }, reflexLens: { doc: 'Reflex sight glass.' }, clearLens: { doc: 'Clear lens.' },
      dot: { doc: 'Red emissive dot.' }, amber: { doc: 'Amber emissive.' }, glow: { doc: 'Cyan emissive.' }, sightPaint: { doc: 'White sight paint.' }, tritium: { doc: 'Green night-sight glow.' },
      redInsert: { doc: 'Red revolver ramp insert.' }, string: { doc: 'String / cord.' }, fabric: { doc: 'Fabric.' }, glove: { doc: 'Glove leather.' },
    } as Record<string, MaterialSpec>,
    anonymous: 'A one-off colour that isn\'t in the catalogue is named `m_<rrggbb>` (hex colour) and is kept as exported: a standard PBR material, no bump.',
    anonymousPattern: '^m_[0-9a-f]{6}$',
    rule: 'The material NAME is what counts: at load the catalogue\'s material of that name replaces whatever the file carries (its colours, roughness, emissive, transparency and bump map come from the game), so the game keeps its shared materials and its look. Give meshes the catalogue name; colours in the file only matter for anonymous materials and for viewing the file elsewhere.',
  },
  /** extras keys. */
  extras: {
    root: { info: 'The GunModelInfo object (INFO_FIELDS).', gun: 'The gun id, equal to the root node\'s name.' },
    mesh: { slot: 'A SLOTS value.', display: 'Display surfaces only: { width, height } canvas pixels.', chk: 'A magazine-check mesh (under part_mag): { role, i, t? } (GUN_MODEL_CONTRACT.magCheck).' },
    part: { part: 'The PARTS key of this part_ node.', anchors: 'Anchors this part provides, in its own frame (GUN_MODEL_CONTRACT.anchors).', owner: 'Pack files only: false when this node\'s pivot belongs to another pack (GUN_MODEL_CONTRACT.packs.nodes).', parent: 'Pack files only: the name of the node this one nests under.', check: 'part_mag only: { w }, the magazine-check data (GUN_MODEL_CONTRACT.magCheck).' },
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
    },
  }, true),
  breech: F('A tipping breech (the Thor): where it sits once open.', { t: 'obj', props: { at: vec2('[forward, up] metres of the open breech from the hinge pin.'), pitch: num('Opening angle, radians.'), long: F('Which long handguard it carries, "irons" or "rail", or null.', { t: 'str' }, true) } }, true),
  ch: vec3('The charging handle\'s grab point, [forward, up, right] metres.', true),
  bolt: vec3('The bolt\'s rear, where the hand pulls it, [forward, up, right] metres.', true),
  cheek: num('A bullpup: the forward position (metres) the eye rests at when aiming, whatever sight is on the rail.', true),
  recoilBarrel: num('A long-recoil barrel: how far it runs back each shot, metres (0 or absent: none).', true, { min: 0 }),
  pistol: F('True for a handgun: the hands, the ADS and the holster use the pistol pose.', { t: 'bool' }, true),
  slide: vec3('A pistol slide\'s grab point, [forward, up, right] metres. Present exactly when the model has a part_slide.', true),
  cylAt: vec3('A revolver cylinder\'s centre, [forward, up, right] metres.', true),
  load: F('A break-open gun: where the open breeches are and the angle the barrels tip to.', { t: 'obj', props: { at: F('[forward, up] metres of each open breech.', { t: 'list', of: { t: 'vec', n: 2 } }), pitch: num('Tip angle, radians.') } }, true),
  cup: vec3('Where the left hand cups the frame (a derringer), [forward, up, right] metres.', true),
  magTop: F('True when the hand takes the magazine from its top instead of its base.', { t: 'bool' }, true),
  quarrelMats: F('A crossbow\'s bolt materials as three.js Material JSON (free-form; viewmodel only).', { t: 'map', of: { t: 'free' } }, true),
  mounts: F('Mount points where a swappable part sits, `mount_<slot>` -> [forward, up, right] metres of the part\'s origin (e.g. mount_muzzle: where a muzzle device screws on). Normally assembled from the parts\' anchors (see GUN_MODEL_CONTRACT.anchors); a whole-gun bake may list them directly.', { t: 'map', of: { t: 'vec', n: 3 } }, true),
  // first-person extras (js/viewmodel.ts applies them; the third person ignores them)
  reflex: F('A reflex or holographic sight\'s window (js/viewmodel.ts): the game draws a collimated reticle behind it, masked to it. f, y: the window\'s centre, [forward, up] metres; w, h: its size, metres (round: a disc of diameter w); kind: the reticle drawn: dot, dotG, cdot or holo.', { t: 'obj', props: { f: num('Forward position of the window, metres.'), y: num('Height of the window, metres.'), w: num('Width, metres.', false, { min: 0 }), h: num('Height, metres.', false, { min: 0 }), round: F('True: a disc of diameter w.', { t: 'bool' }, true), kind: F('The reticle: dot, dotG (green dot), cdot (circle-dot) or holo (a ring).', { t: 'str', enum: ['dot', 'dotG', 'cdot', 'holo'] }) } }, true),
  pip: F('A scope\'s ocular lens (js/viewmodel.ts): the game draws the world through the scope on a disc there (picture-in-picture) with the reticle over it. f, y: its centre, [forward, up] metres; r: its radius. parent + pos: a lens that swings on a hinge (a magnifier\'s): the NAME of the node it hangs on and its place in that node, [x, y, z] metres in the node\'s own frame.', { t: 'obj', props: { f: num('Forward position of the lens, metres.'), y: num('Height of the lens centre, metres.'), r: num('Lens radius, metres.', false, { min: 0 }), parent: F('Node name the lens hangs on.', { t: 'str' }, true), pos: F('Place in the parent, [x, y, z] metres in its own frame.', { t: 'vec', n: 3 }, true) } }, true),
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
  part: '`part_mag` has extras.check = { w }: the magazine\'s width in metres (the width of a hole\'s stamped count).',
  meshes: 'Meshes under `part_mag` carry extras.chk = { role, i, t? }: role "top" (the round on top: i 0 its case, i 1 its tip; the game colours them for the load), "hole" (a witness hole, i = its order from the top, t = 0..1 how far down the stack it reads), "round" (the i-th round drawn through a clear magazine, t = how far down) and "tip" (the bullet tip of round i). Every mesh keeps a slot and a catalogue material like any other; the game replaces their materials as the rounds change. A gun with a magazine check has both top meshes.',
  example: { name: 'part_mag', extras: { part: 'mag', check: { w: 0.024 } }, child: { name: 'mag_91', extras: { slot: 'mag', chk: { role: 'hole', i: 0, t: 0.1567 } } } },
}, anchors: {
  where: 'A node may carry `extras.anchors`: positions it PROVIDES, in the node\'s OWN frame (the same [forward, up, right] metres, measured from the node\'s origin along its axes; a part\'s mesh positions are in that same frame). Allowed on `part_<key>` and `group_<n>` nodes, and on the root of a per-part pack (a .glb holding one swappable part). Keys are the info anchors a part can provide (' + ANCHOR_KEYS.join(', ') + ') or a mount point `mount_<slot>` (a [forward, up, right] vec3; e.g. mount_muzzle on a frame says where a muzzle device sits).',
  assembly: [
    'Assembly (runtime assembly of per-part packs, milestone 2; the same rule applies to the node tree of a whole-gun file) starts from the receiver\'s `info` and visits the parts in the gunsmith\'s slot order.',
    'Every provided position is first moved into the gun\'s frame: the providing node\'s transform in the assembled gun applied to the position (the part\'s placement), then re-expressed as [forward, up, right] = [-z, y, x].',
    '`muzzles` is a LIST built from whichever parts provide it: if any part provides `muzzles`, the gun\'s `info.muzzles` is the concatenation of those parts\' lists (tree order) and the receiver\'s own default is dropped; if none does, the receiver\'s is kept. A barrel block with 6 barrels provides 6 muzzles.',
    '`mount_<slot>` anchors are OFFSETS: the displacement [forward, up, right] metres of the part in <slot> from where its pack stores it (a pack stores a part where it sits when every other part is the platform\'s reference one). Every provider\'s offsets for a slot ADD UP (a barrel and a handguard may both move a light); the sum is `info.mounts.mount_<slot>` and the whole part moves by it.',
    'Every other anchor (grip, support, magAt, port, ch, bolt, slide, cylAt, cup, cheek, chamberAt) is single-valued: a part\'s value overrides the receiver\'s and an earlier part\'s (the last provider in slot order wins; the validator warns when two parts of one gun both provide it).',
  ],
  muzzles: 'A gun can have MORE THAN ONE muzzle (an over/under, a Metal Storm-style barrel block): `info.muzzles` is always a list of at least one [forward, up, right]; consumers must iterate it and never assume entry [0] is the only one.',
  example: { name: 'part_barrel', extras: { part: 'barrel', anchors: { muzzles: [[0.4, 0.012, -0.012], [0.4, 0.012, 0.012]], mount_muzzle: [0.4, 0, 0] } } },
}, packs: {
  layout: 'assets/models/parts/<platform>/index.json and assets/models/parts/<platform>/<slot>/<file>.glb. One pack per (platform, slot) and combination of the parts that shape it; the platform\'s whole-gun files (assets/models/guns/<id>.glb) stay the fast path for the default build. One file per pack and not one per platform: a swap costs one small request, and a platform\'s packs together are many times what any one build needs.',
  pack: 'A pack is a glTF binary holding ONE slot\'s meshes (every mesh extras.slot = that slot) as the slot looks on that platform with the parts named in its key fitted, in the gun\'s frame (mesh positions as in a whole-gun file). The slot "base" is the receiver and everything fixed (it also carries the animated parts nothing else owns: part_handle, part_bolt, ...). A pack may hold no meshes at all only if the index says its file is null (the slot is empty then).',
  root: 'The pack\'s one root node is named `<platform>.<slot>.<n>` and has extras.pack = { platform, tag (the slot), key: { <slotOfBuild>: <partId> } }. No transform, no info. Its children are meshes (`<slot>_<n>`), part_ nodes and group_ nodes, all flat directly under it.',
  nodes: 'part_ and group_ nodes sit directly under the root with their position = the pivot in the GUN\'S frame (not relative to a parent); extras.parent names the node they nest under in the assembled gun (absent: the gun\'s root). extras.owner = false means the pivot belongs to another pack (e.g. an optic\'s meshes inside the slide\'s part_slide: the slide pack owns the node, the optic pack repeats it so the meshes know where it is); the assembler takes the node from its owner (default: owner) and re-expresses every other pack\'s meshes against it. Group nodes are named `group_<slot>_<n>` so they are unique across packs.',
  index: 'The platform index.json is { version, platform, src, tags: { <slot>: { dep: [<build slot>...], packs: [{ key: [<partId or "*">...], file: <file or null>, tris, bytes }] } }, anchors: { "<buildSlot>=<partId>": { mount_<slot>: [f,u,r] } }, bases: [3 reference builds with their info], deltas: { "<buildSlot>=<partId>": [per base: { <info leaf path>: number (add) | { set } | { del } } | null] }, exact: { <build key>: { <leaf path>: value } } }. `dep` lists the build slots whose parts shape the tag; a pack\'s `key` lists those parts in the same order ("*" = any; the most specific matching pack is used); file null = the slot is empty for that key. A build slot is the gunsmith\'s slot id (barrel, handguard, optic, tac...) which is not always the mesh slot (a laser in `tac` is mesh slot tac).',
  joint: 'COUPLED SLOTS. Where changing one part reshapes another slot\'s geometry (a pistol\'s grip changes its frame, magazine well and optic cut, a handguard changes the rail a light clamps to), the baker finds it by sweeping and the slot\'s pack is a JOINT pack: its key names every part that shapes it, one pack per combination seen, e.g. optic on a P9 = (optic, slide, grip). A coupling that is only a translation is NOT joint: it becomes an anchor (below).',
  anchors: 'TRANSLATIONS. Where a part only MOVES another slot\'s geometry (a muzzle device follows its barrel\'s length, a light follows its handguard) the provider\'s part has `mount_<slot>` in the index\'s `anchors` table, an offset to add to that slot\'s whole pack. The reference part of each slot (the one in the platform\'s fullest reference build) has none.',
  info: 'INFO. The assembled info is the nearest of the index\'s three reference builds (fewest differing slots) with each differing slot\'s `deltas` applied to its leaves (numbers add; others are replaced), then `info.anim` from the nodes and `info.mounts` from the anchors. `exact` holds the few builds the sums get wrong, as leaf corrections.',
  assembly: 'ASSEMBLY (G.Models.assemble(def) in js/glb.ts, synchronous: the packs must be loaded, G.Models.ensure(def) / preloadPlatform(id) load them; it returns null otherwise or for a build the packs do not cover, and the procedural model is built). For each tag: pick the most specific pack for the build\'s parts; add up the anchors of every part in the build; take the owner nodes from the packs, and place every pack\'s meshes (translated) against them. The result is the whole-gun structure of docs/models.md: slot-tagged meshes, part_ nodes with their pivots, info.',
  verify: 'VERIFICATION. The baker assembles every build of its sweep (each platform\'s default, two "loaded" builds and every single-part swap from each: ~9,000 builds) from the packs in memory and compares the triangles with the procedural model (the baker fails otherwise); `npm run test:models` does the same through the real files (glb, decoder, assembler) with a tolerance for compression.',
} };

// ---- the validator ------------------------------------------------------------------------------------------------------

/** A node of a model, in a form both a glTF JSON and a loaded three.js scene can produce (describeGltfJson, describeScene). */
interface ModelNode { name: string; extras: Record<string, any>; mesh: boolean; /** a mesh's UVs are there (TEXCOORD_0) */ uv: boolean; materials: string[]; children: ModelNode[] }
/** A model: its scene's top-level nodes. */
interface ModelDesc { roots: ModelNode[] }
interface ModelReport { errors: string[]; warnings: string[] }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

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
        if (!c.materials.length && !display) E(`mesh "${c.name}": has no material`);
        for (const m of display ? [] : c.materials) if (!m) E(`mesh "${c.name}": its material has no name (name it with a catalogue key: ${Object.keys(C.materials.names).slice(0, 6).join(', ')}, ...)`); else if (!(m in C.materials.names) && !matOk.test(m)) E(`mesh "${c.name}": material '${m}' is not in the catalogue (${Object.keys(C.materials.names).join(', ')}) and is not an anonymous colour (m_<rrggbb>)`);
      } else if (c.name.startsWith(NAMES.partPrefix)) {
        const key = c.name.slice(NAMES.partPrefix.length);
        if (!(key in C.parts)) E(`node "${c.name}": "${key}" is not a known part (${Object.keys(C.parts).join(', ')})`);
        else if (c.extras[NAMES.extras.part] !== key) E(`node "${c.name}": extras.part is ${JSON.stringify(c.extras[NAMES.extras.part])}, expected "${key}"`);
        partNodes.set(key, c);
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

/** One pack of a tag: its key (the parts, aligned with the tag's `dep`; "*" = any), its file (null: the tag is empty there). */
interface PackEntry { key: string[]; file: string | null; tris?: number | null; bytes?: number | null }
interface TagIndex { dep: string[]; packs: PackEntry[] }
/** How a leaf of `info` changes when a part replaces the reference build's: a number is added; { set } replaces; { del } removes. */
type LeafDelta = number | { set: any } | { del: number };
interface PartsIndex {
  version: number; platform: string; src: string; slots: string[]; tags: Record<string, TagIndex>; anchors: Record<string, Record<string, Vec3>>;
  bases: { build: Record<string, string>; info: Record<string, any> }[]; deltas: Record<string, (Record<string, LeafDelta> | null)[]>; exact: Record<string, Record<string, any>>;
  totals?: Record<string, number>;
}

const PARTS_INDEX_VERSION = 1;
/** The platform index (assets/models/parts/<platform>/index.json), as a shape: the validator, JSON Schema and docs come from it. */
const PARTS_INDEX_FIELDS: Record<string, Field> = {
  version: num('Index format version (' + PARTS_INDEX_VERSION + ').'), platform: F('The platform (gun id) the packs are for.', { t: 'str' }), src: F('Hash of the recipe sources the packs came from (stale-pack detection).', { t: 'str' }),
  slots: F('Every build slot seen in the platform\'s sweep: the ones `anchors` and `deltas` are keyed by.', { t: 'list', of: { t: 'str' } }),
  tags: F('Per mesh slot (tag): which build slots shape it and its packs.', { t: 'map', of: { t: 'obj', props: {
    dep: F('The build slots whose parts shape this tag: a pack\'s `key` lists a part for each, in this order.', { t: 'list', of: { t: 'str' } }),
    packs: F('The packs: the most specific matching key is used.', { t: 'list', of: { t: 'obj', props: {
      key: F('A part id per `dep` slot ("" = the slot is empty; "*" = any part).', { t: 'list', of: { t: 'str' } }), file: F('The pack\'s file under the platform folder; null when the tag is empty for this key.', { t: 'str' }, true),
      tris: num('Triangles in the pack.', true), bytes: num('File size in bytes.', true),
    } } }),
  } } }),
  anchors: F('Offsets parts give other slots: "<buildSlot>=<partId>" -> { mount_<tag>: [forward, up, right] } (metres, added up over the build).', { t: 'map', of: { t: 'map', of: { t: 'vec', n: 3 } } }),
  bases: F('The three reference builds (default, loaded, loaded with sights) and their `info` as flat leaves (path -> value).', { t: 'list', of: { t: 'obj', props: { build: F('slot -> part id.', { t: 'map', of: { t: 'str' } }), info: F('Leaf path (a/b/0) -> value.', { t: 'free' }) } } }),
  deltas: F('"<buildSlot>=<partId>" -> per reference build: the info leaves that change (number: add; { set: v }; { del: 1 }), or null where not observed.', { t: 'map', of: { t: 'list', of: { t: 'free' } } }),
  exact: F('Builds the delta sums get wrong: build key -> leaf -> value.', { t: 'map', of: { t: 'free' } }),
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
/** How `b`'s leaves differ from `a`'s: numbers as differences, anything else as { set }, a missing one as { del }. */
function leafDelta(a: Record<string, any>, b: Record<string, any>): Record<string, LeafDelta> {
  const d: Record<string, LeafDelta> = {};
  for (const k of Object.keys(b)) { const x = a[k], y = b[k]; if (isNum(x) && isNum(y)) { if (x !== y) d[k] = y - x; } else if (JSON.stringify(x) !== JSON.stringify(y)) d[k] = { set: y }; }
  for (const k of Object.keys(a)) if (!(k in b)) d[k] = { del: 1 };
  return d;
}
function applyLeafDelta(leaves: Record<string, any>, d: Record<string, LeafDelta>) {
  for (const [k, v] of Object.entries(d)) { if (typeof v === 'number') leaves[k] = (isNum(leaves[k]) ? leaves[k] : 0) + v; else if ('set' in v) leaves[k] = v.set; else delete leaves[k]; }
}

/** The pack of `tag` for this build (the most specific matching key), or undefined. */
function pickPack(tag: TagIndex, build: Record<string, string>): PackEntry | undefined {
  let best: PackEntry | undefined, bestStar = 1e9;
  for (const e of tag.packs) {
    let star = 0, ok = true;
    for (let i = 0; i < tag.dep.length; i++) { const k = e.key[i]; if (k === '*') { star++; continue; } if (k !== (build[tag.dep[i]] || '')) { ok = false; break; } }
    if (ok && star < bestStar) { best = e; bestStar = star; }
  }
  return best;
}

/** For each info leaf, the build slots a swap was seen to change it by (from the index's deltas): what the leaf depends on. */
const leafSlots = new WeakMap<PartsIndex, Map<string, Set<string>>>();
function leafSlotsOf(ix: PartsIndex): Map<string, Set<string>> {
  let m = leafSlots.get(ix);
  if (!m) {
    m = new Map();
    for (const [key, ds] of Object.entries(ix.deltas)) {
      const slot = key.slice(0, key.indexOf('='));
      for (const d of ds) if (d) for (const leaf of Object.keys(d)) { let s = m.get(leaf); if (!s) m.set(leaf, (s = new Set())); s.add(slot); }
    }
    leafSlots.set(ix, m);
  }
  return m;
}

/** What assembling a build needs: which pack for each tag, the summed offsets, and the info. `missing` names the first tag no pack covers. */
interface Plan { tags: { tag: string; entry: PackEntry | null; rigid: Vec3 }[]; info: any; missing: string | null; approx: boolean }
function planBuild(ix: PartsIndex, build: Record<string, string>): Plan {
  const tags: Plan['tags'] = []; let missing: string | null = null;
  const rigid: Record<string, Vec3> = {};
  for (const s of ix.slots) {
    const a = ix.anchors[slotKey(s, build[s])]; if (!a) continue;
    for (const [k, v] of Object.entries(a)) {
      if (k.startsWith(NAMES.mountPrefix)) { const t = k.slice(NAMES.mountPrefix.length), r = rigid[t] || (rigid[t] = [0, 0, 0]); r[0] += v[0]; r[1] += v[1]; r[2] += v[2]; }
    }
  }
  for (const [tag, ti] of Object.entries(ix.tags)) {
    const entry = pickPack(ti, build);
    if (!entry) { if (!missing) missing = tag + ' (' + ti.dep.map((s) => slotKey(s, build[s])).join(' ') + ')'; continue; }
    tags.push({ tag, entry: entry.file ? entry : null, rigid: rigid[tag] || [0, 0, 0] });
  }
  // info: the nearest reference build with the differing slots' deltas applied
  let bi = 0, bestScore = 1e9, approx = false;
  ix.bases.forEach((b, i) => {
    let diff = 0, miss = 0;
    for (const s of ix.slots) if ((b.build[s] || '') !== (build[s] || '')) { diff++; const d = ix.deltas[slotKey(s, build[s])]; if (!d || !d[i]) miss++; }
    const score = miss * 1000 + diff; if (score < bestScore) { bestScore = score; bi = i; }
  });
  const leaves: Record<string, any> = { ...ix.bases[bi].info };
  for (const s of ix.slots) if ((ix.bases[bi].build[s] || '') !== (build[s] || '')) {
    const ds = ix.deltas[slotKey(s, build[s])]; const d = ds && (ds[bi] || ds.find((x) => x));
    if (!d) { approx = true; continue; } if (!ds![bi]) approx = true;
    applyLeafDelta(leaves, d);
  }
  // A leaf that two slots shape together (the support hand: the handguard's length and whether a foregrip is on it) does not add up from just
  // any reference build: take it from the one whose parts in the slots that shape that leaf are nearest the build's (a build with a foregrip,
  // from a base with one), the differing slots' deltas from that base on top.
  const dist = (j: number, slots: Set<string>) => { let n = 0; for (const s of slots) if ((ix.bases[j].build[s] || '') !== (build[s] || '')) { const ds = ix.deltas[slotKey(s, build[s])]; if (!ds || !ds[j]) return Infinity; n++; } return n; };
  if (bi >= 0) for (const [leaf, slots] of leafSlotsOf(ix)) {
    const d0 = dist(bi, slots); let best = bi, bd = d0;
    for (let j = 0; j < ix.bases.length; j++) { const d = dist(j, slots); if (d < bd) { best = j; bd = d; } }
    if (best === bi) continue;
    const tmp: Record<string, any> = {}; if (leaf in ix.bases[best].info) tmp[leaf] = ix.bases[best].info[leaf];
    for (const s of slots) if ((ix.bases[best].build[s] || '') !== (build[s] || '')) { const d = ix.deltas[slotKey(s, build[s])][best]!; if (leaf in d) applyLeafDelta(tmp, { [leaf]: d[leaf] }); }
    if (leaf in tmp) leaves[leaf] = tmp[leaf]; else delete leaves[leaf];
  }
  const ex = ix.exact[buildKeyOf(build)]; if (ex) applyLeafDelta(leaves, ex as Record<string, LeafDelta>);
  return { tags, info: infoFromLeaves(leaves), missing, approx };
}

/** Checks a platform index: its shape, and that every pack's key lines up with its tag's `dep`. */
function validatePartsIndex(ix: any): ModelReport {
  const errors: string[] = [], warnings: string[] = [];
  checkProps(ix, PARTS_INDEX_FIELDS, 'index', errors, false);
  if (!isObj(ix) || !isObj(ix.tags)) return { errors, warnings };
  for (const [tag, ti] of Object.entries<any>(ix.tags)) {
    if (!(tag in GUN_MODEL_CONTRACT.slots)) errors.push(`index.tags.${tag}: not a slot`);
    if (!isObj(ti) || !Array.isArray(ti.dep) || !Array.isArray(ti.packs)) continue;
    ti.packs.forEach((p: any, i: number) => {
      if (isObj(p) && Array.isArray(p.key) && p.key.length !== ti.dep.length) errors.push(`index.tags.${tag}.packs[${i}].key has ${p.key.length} parts for ${ti.dep.length} dep slots`);
    });
  }
  if (Array.isArray(ix.bases) && ix.bases.length !== 3) errors.push('index.bases: expected the three reference builds');
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
    if (typeof pk.tag !== 'string' || !(pk.tag in C.slots)) E(`extras.pack.tag: ${JSON.stringify(pk.tag)} is not a slot`);
    else if (tag && pk.tag !== tag) E(`extras.pack.tag is "${pk.tag}", expected "${tag}"`);
    if (!isObj(pk.key)) E('extras.pack.key: expected an object slot -> part id');
  }
  const t = isObj(pk) ? pk.tag : tag, names = new Set<string>(), matOk = new RegExp(C.materials.anonymousPattern);
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
  L.push('', '**Magazine check** (`part_mag.extras.check`, meshes\' `extras.chk`):', '', `- what: ${C.magCheck.what}`, `- part: ${C.magCheck.part}`, `- meshes: ${C.magCheck.meshes}`, '- example: `' + JSON.stringify(C.magCheck.example) + '`');
  L.push('', '**Per-part packs** (assets/models/parts, milestone 2):', '', ...Object.entries(C.packs).map(([k, v]) => `- ${k}: ${v}`));
  L.push('', C.materials.anonymous, '', '**Extras keys:** ' + Object.entries(C.extras).map(([where, o]) => `${where}: ${Object.keys(o).map((k) => '`' + k + '`').join(', ')}`).join('; ') + '.');
  return L.join('\n');
}

// ===================================================================================================================
//  THE LOADER
// ===================================================================================================================

interface BakedIndex { version: number; three: string; src: string; guns: Record<string, { file: string; code: string; hash: string; bytes: number; gz: number; meshes: number; tris: number }> }

  const qs = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  /** ?checkModels: validate each model as it loads. (Every gun the game shows comes from these files: there is no flag and no procedural fallback.) */
  const on = true, checking = qs.has('checkModels');
  const BASE = 'assets/models/guns/', R = { base: '' }; // (R.base: where the page's folder is from here: '' on the page, '../../' in the export worker, js/exportworker.ts)
  let index: Promise<BakedIndex | null> | null = null, indexData: BakedIndex | null = null;
  const loaded = new Map<string, any>(); // gun id -> its loaded root node (the glTF scene's child)
  const pending = new Map<string, Promise<boolean>>();
  const glbReady = (): Promise<boolean> => (G.GLB ? G.GLB.ready.then((x) => x, () => false) : Promise.resolve(false));
  const getIndex = () => index || (index = fetch(R.base + BASE + 'index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null), () => null).then((ix) => (indexData = ix)));

  /** Loads the baked models of these gun ids (all of them if none are named); resolves to how many are ready. */
  async function preload(ids?: string[]): Promise<number> {
    if (!on) return 0;
    const [ix, ok] = await Promise.all([getIndex(), glbReady()]);
    if (!ix || !ok) return 0;
    const want = (ids && ids.length ? ids : Object.keys(ix.guns)).filter((id) => ix.guns[id]);
    let n = 0, i = 0;
    const one = async (id: string) => {
      if (loaded.has(id)) { n++; return; }
      let p = pending.get(id);
      if (!p) pending.set(id, (p = G.GLB!.load(BASE + ix.guns[id].file).then((scene) => {
        if (checking) { const r = validate(describeScene(scene), id); for (const e of r.errors) console.error(`[checkModels] ${id}: ${e}`); for (const w of r.warnings) console.warn(`[checkModels] ${id}: ${w}`); }
        const root = scene.children.find((c: any) => c.name === id) || scene.children[0];
        if (root) loaded.set(id, root);
        return !!root;
      }, (e: any) => { console.warn('[baked guns] ' + id + ': ' + (e && e.message || e)); return false; })));
      if (await p) n++;
    };
    await Promise.all(Array.from({ length: Math.min(6, want.length) }, async () => { while (i < want.length) await one(want[i++]); }));
    return n;
  }

  // ---- per-part packs: loading, and assembling any build from them ----
  const PARTS_BASE = 'assets/models/parts/';
  const platIx = new Map<string, PartsIndex>(), platPending = new Map<string, Promise<PartsIndex | null>>();
  const packRoots = new Map<string, any>(), packPending = new Map<string, Promise<boolean>>();
  const platformIndex = (id: string): Promise<PartsIndex | null> => {
    let p = platPending.get(id);
    if (!p) platPending.set(id, (p = fetch(R.base + PARTS_BASE + id + '/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null), () => null).then((ix: PartsIndex | null) => {
      if (ix && checking) { const r = validatePartsIndex(ix); for (const e of r.errors) console.error(`[checkModels] parts/${id}/index.json: ${e}`); }
      if (ix) platIx.set(id, ix); return ix;
    })));
    return p;
  };
  const packUrl = (id: string, file: string) => PARTS_BASE + id + '/' + file;
  const loadPack = (id: string, file: string): Promise<boolean> => {
    const url = packUrl(id, file); if (packRoots.has(url)) return Promise.resolve(true);
    let p = packPending.get(url);
    if (!p) packPending.set(url, (p = G.GLB!.load(url).then((scene) => {
      if (checking) { const r = validatePack(describeScene(scene)); for (const e of r.errors) console.error(`[checkModels] ${url}: ${e}`); for (const w of r.warnings) console.warn(`[checkModels] ${url}: ${w}`); }
      const root = scene.children[0]; if (root) packRoots.set(url, root); return !!root;
    }, (e: any) => { console.warn('[baked guns] ' + url + ': ' + (e && e.message || e)); return false; })));
    return p;
  };
  const buildOf = (def: any): Record<string, string> => def.build || G.Gunsmith.defaultBuild(def.id);
  const pool = async <X,>(items: X[], n: number, fn: (x: X) => Promise<unknown>) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); };
  /** Loads the platform's index and the packs this build needs; resolves to whether `assemble(def)` can now work. */
  async function ensure(def: any): Promise<boolean> {
    if (!on || !def) return false;
    const ok = await glbReady(); if (!ok) return false;
    const ix = await platformIndex(def.id); if (!ix) return false;
    const plan = planBuild(ix, buildOf(def)); if (plan.missing) return false;
    const r = await Promise.all(plan.tags.filter((t) => t.entry).map((t) => loadPack(def.id, t.entry!.file!)));
    return r.every((x) => x);
  }
  /** Loads the platform's index and EVERY pack of it (or only those of the given builds' tags if `builds` is given); resolves to the number of packs loaded. */
  async function preloadPlatform(id: string, builds?: Record<string, string>[]): Promise<number> {
    if (!on) return 0;
    const ok = await glbReady(); if (!ok) return 0;
    const ix = await platformIndex(id); if (!ix) return 0;
    const files = new Set<string>();
    if (builds) { for (const b of builds) for (const t of planBuild(ix, b).tags) if (t.entry) files.add(t.entry.file!); }
    else for (const t of Object.values(ix.tags)) for (const e of t.packs) if (e.file) files.add(e.file);
    let n = 0; await pool([...files], 6, async (f) => { if (await loadPack(id, f)) n++; });
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
  function assemble(def: any, skin?: any): { group: THREE.Group; info: any } | null {
    const ix = def && platIx.get(def.id); if (!ix) return null;
    const plan = planBuild(ix, buildOf(def)); if (plan.missing) return null;
    const T = THREE, group = new T.Group();
    interface Src { root: THREE.Object3D; rigid: Vec3 }
    const srcs: Src[] = [];
    for (const t of plan.tags) { if (!t.entry) continue; const root = packRoots.get(packUrl(def.id, t.entry.file!)); if (!root) return null; srcs.push({ root, rigid: t.rigid }); }
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
    const info = plan.info; info.anim = {};
    for (const [name, node] of nodes) if (name.startsWith(NAMES.partPrefix) && node.userData[NAMES.extras.part]) info.anim[node.userData[NAMES.extras.part]] = node;
    const mounts: Record<string, Vec3> = {};
    for (const t of plan.tags) if (t.rigid[0] || t.rigid[1] || t.rigid[2]) mounts[NAMES.mountPrefix + t.tag] = [t.rigid[0], t.rigid[1], t.rigid[2]];
    if (Object.keys(mounts).length) info.mounts = mounts;
    if (skin && skin.length) G.Stickers.decorate(group, skin);
    return { group, info };
  }

  /**
   * The baked version of display(def): { group, info } built from the loaded glTF (the whole default gun) or assembled from the
   * platform's packs (any other build), or null (not on, not loaded yet, or not covered: the procedural model is used then; the
   * platform's packs are fetched in the background so that the next one is).
   */
  function displayBaked(def: any, skin?: any): { group: THREE.Group; info: any } | null {
    if (!on || !def) return null;
    const whole = displayWhole(def, skin); if (whole) return whole;
    const a = assemble(def, skin); if (a) return a;
    if (!platPending.has(def.id)) preloadPlatform(def.id);
    return null;
  }
  function displayWhole(def: any, skin?: any): { group: THREE.Group; info: any } | null {
    const src = loaded.get(def.id), ix = indexData;
    if (!src) return null;
    const code = def.code || G.Gunsmith.defaultCode(def.id);
    if (code !== G.Gunsmith.defaultCode(def.id) || (ix && ix.guns[def.id] && ix.guns[def.id].code !== code)) return null; // (a custom build, or a default that has moved on since the bake)
    const group = src.clone(true) as THREE.Group, M = G.GunMaterials.M as Record<string, () => THREE.Material>;
    const ex = src.userData[NAMES.extras.info] || {};
    group.name = ''; group.userData = {};
    group.traverse((o: any) => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone(); // (own geometry, as a procedural gun's: the gunsmith and icons dispose it)
      const name = o.material && o.material.name;
      if (M[name] && !o.name.startsWith(NAMES.displayPrefix)) o.material = M[name](); // (a display surface keeps its own: the game paints it)
    });
    const info = JSON.parse(JSON.stringify(ex)); info.anim = {};
    for (const [k, nm] of Object.entries(ex.anim || {})) { const n = group.getObjectByName(nm as string); if (n) info.anim[k] = n; }
    if (ex.quarrelMats) delete info.quarrelMats; // (viewmodel only; the viewmodel isn't baked)
    if (skin && skin.length) G.Stickers.decorate(group, skin);
    return { group, info };
  }
  // ===================================================================================================================
  //  LOADING AT RUN TIME: the classic GLTFLoader, the boot's indexes, the preloads, what is ready (js/gunmodels.ts is the facade over these)
  // ===================================================================================================================

  // three's GLTFLoader and the meshopt decoder as a classic script (assets/vendor/gltf-classic.js, built by tools/build_gltf_classic.mjs from the r149
  // examples, on the page's own global THREE): a global GLTFClassic, so the page and the highlights' export worker load glTF the same way, no importmap
  const GL = (globalThis as any).GLTFClassic;
  if (GL && !G.GLB) {
    const loader = new GL.GLTFLoader().setMeshoptDecoder(GL.MeshoptDecoder), cache = new Map<string, Promise<any>>();
    G.GLB = {
      ready: Promise.resolve(GL.MeshoptDecoder.ready).then(() => true, () => false),
      load: (url: string) => { const hit = cache.get(url); if (hit) return hit; const p: Promise<any> = loader.loadAsync(R.base + url).then((g: any) => g.scene, (e: any) => { cache.delete(url); throw e; }); cache.set(url, p); return p; },
    };
  }
  /** Where the page's folder is from here (the export worker's scripts are two folders down: js/exportworker.ts sets '../../'). */
  const setRoot = (base: string) => { R.base = base; };
  /** A .glb or JSON of the game's assets (assets/models/...), by the loader above: for the props (js/gunmodels.ts). */
  const loadFile = (url: string): Promise<any> => glbReady().then((ok) => { if (!ok) throw new Error('no glTF loader'); return G.GLB!.load(url); });
  const fetchJson = (url: string): Promise<any> => fetch(R.base + url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null), () => null);

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
    const ix = def && platIx.get(def.id); if (!ix) return null;
    const plan = planBuild(ix, buildOf(def)); if (plan.missing) return null;
    const info = plan.info; info.anim = {};
    return info;
  }
  /** Whether assemble(def) can work now: the platform's index and every pack the build needs are loaded. */
  function ready(def: any): boolean {
    const ix = def && platIx.get(def.id); if (!ix) return false;
    const plan = planBuild(ix, buildOf(def)); if (plan.missing) return false;
    return plan.tags.every((t) => !t.entry || packRoots.has(packUrl(def.id, t.entry.file!)));
  }
  /** Loads every platform's packs in the background, the ones named first, a few at a time (the hangar: all the guns it can show). */
  let allPending: Promise<void> | null = null;
  function preloadAll(first: string[] = []): Promise<void> {
    return allPending || (allPending = boot().then(async () => {
      const ids = [...new Set([...first, ...Object.keys(G.Gunsmith.PLATFORMS)])];
      for (const id of ids) await preloadPlatform(id);
    }));
  }

  return {
    boot, preloadAll, ready, infoFromIndex, setRoot, loadFile, fetchJson, on, checking, preload, preloadPlatform, ensure, assemble, displayBaked, contract: GUN_MODEL_CONTRACT, infoFields: INFO_FIELDS, partsIndexFields: PARTS_INDEX_FIELDS, validate, validatePack, validatePartsIndex, describeGltfJson, describeScene, glbJson,
    infoSchema, partsIndexSchema, contractMarkdown, loaded: (id: string) => loaded.has(id), platformLoaded: (id: string) => platIx.has(id), SLOTS, PARTS, NAMES,
    // the pure side of the packs (no three.js): the baker and the tests check the packs with the same code the game plans with
    planBuild, pickPack, infoLeaves, infoFromLeaves, leafDelta, applyLeafDelta, buildKeyOf, slotKey, PARTS_INDEX_VERSION,
  };
})();
G.Models = G_Models;
/** G.GLB: the glTF loader (made from assets/vendor/gltf-classic.js in js/glb.ts; tools replace it with their own). */
interface GlbModuleApi { ready: Promise<boolean>; load(url: string): Promise<any> }
interface GameModules { Models: typeof G_Models; GLB?: GlbModuleApi }
