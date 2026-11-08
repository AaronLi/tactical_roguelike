# The AK family's furniture as AUTHORED PARTS (models/parts/<slot>/<id>/), the way models/hk_parts.py cuts the HK416's out of its build:
#  - the catalogue's longer AK handguards, remodelled to fit the room the KV-47, AK-74M and RPK have between the receiver's front and the
#    gas block (mount_handguard 0.277 to mount_handguard_end 0.488: hgMax 0.208), each replacing its catalogue entry (whose length is to
#    be corrected to the part's: the catalogue fits by its length, the model is drawn at its own):
#      handguard/lynx_ak_204       "Lynx 8.0\" handguard"               0.204 m  the factory two-piece in black polymer, both halves longer
#      handguard/northmark_ak_quad "Northmark 8.0\" quad rail handguard" 0.204 m  an AK quad rail round the barrel and the gas tube
#      handguard/valkyr_ak_208     "Valkyr 8.2\" handguard"             0.208 m  the two-piece in wood, the longest the room takes
#    and two drop-in aluminium lowers for a foregrip, in the factory lower's place under the issue gas tube cover (the general shape of
#    the Polish-made drop-in rails; no markings), the factory handguard's 0.158 m with its retainer band:
#      handguard/ak_dropin_quad    "Ironvale AK quad rail"              0.158 m  Picatinny at 3, 6 and 9 o'clock (part.rails)
#      handguard/ak_dropin_mlok    "Vantage AKX M-LOK"                  0.158 m  M-LOK slots at 3, 6 and 9 o'clock (part.rails, kind mlok)
#  - the AKM's and the AK-74M's stocks as two parts (they are different lengths): stock/northmark_akm (the KV-47's laminated fixed
#    stock, 246 mm) and stock/kodiak_ak74m (the AK-74M's polymer side-folder, 259 mm).
#   blender -b -P models/ak_parts.py
# It builds the KV-47 and the AK-74M with the shared AK builder (models/ak_kit.py, nothing exported), adds the long handguards to the
# KV-47's build, moves each part's meshes into a collection of its own (origin the gun's mount anchor) and writes <id>.glb, <id>.blend
# and model.json.
#
# Frames (docs/models.md "Authored furniture"): stock: origin mount_stock ([0, -0.002]), reaching back; anchors butt (the butt plate's
# centre) and cheek (the top of the comb under the eye). handguard: origin on the bore at mount_handguard; anchor support; part.len,
# part.rails each rail's [from, to]. [forward, up, right] metres.
import bpy, json, os
from mathutils import Matrix
MODELS = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else globals()['MODELS_DIR']
os.environ['GUN_EXPORT'] = '0'
def build(gid):
    """Runs models/<gid>/build_<gid>.py (nothing exported) and returns the builder's globals; the session's objects go first (the meshes
    are named <slot>_<n> by each build, and a name Blender has to suffix breaks the contract)."""
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if not me.users: bpy.data.meshes.remove(me)
    d = {'GUN_DIR': os.path.join(MODELS, gid), 'CFG': {}}
    exec(open(os.path.join(MODELS, gid, 'build_' + gid + '.py'), encoding='utf-8').read(), d)
    return d['g']

def slot_meshes(k, slot):
    return {o for o in k['coll'].all_objects if o.type == 'MESH' and o.get('slot') == slot}

def write_part(k, slot, pid, objs, origin, anchors, cfg):
    """Move objs into the part's own collection and root (named pid), origin (forward, up) to the root's, and write the files."""
    d = os.path.join(MODELS, 'parts', slot, pid); os.makedirs(d, exist_ok=True)
    coll, root = k['kit_collection'](pid)
    root['part'] = pid; root['anchors_json'] = json.dumps(anchors)
    T = Matrix.Translation((0, -origin[0], -origin[1]))
    for o in objs:
        W = o.matrix_world.copy()
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o); o.parent = root; o.matrix_parent_inverse = Matrix.Identity(4); o.matrix_world = T @ W
    bpy.context.view_layer.update()
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    size = k['save_and_export'](coll, root, d, pid, True)
    json.dump(dict({'source': 'authored', 'kind': 'part', 'slot': slot, 'frame': slot + '-mount', 'anchors': anchors}, **cfg),
              open(os.path.join(d, 'model.json'), 'w', encoding='utf-8'), indent=2)
    print('PART', json.dumps({'key': slot + '/' + pid, 'meshes': len(meshes), 'tris': k['tris_of'](meshes), 'glb': size}))

r4 = lambda v: [round(x, 4) for x in v]

def stock_part(k, pid, replaces, note):
    B = k['V']['butt'] * k['mm']
    write_part(k, 'stock', pid, slot_meshes(k, 'stock'), (0.0, -0.002),
               {'butt': r4([B + 0.002, -0.054 + 0.002, 0]), 'cheek': r4([-0.15, -0.006 + 0.002, 0])},
               {'part': {'mount': 'ak', 'position': note}, 'replaces': replaces})

def handguard_part(k, pid, L, make, t, replaces):
    mm, RF = k['mm'], k['RF']
    before = slot_meshes(k, 'handguard')
    rails = make()
    part = {'t': t, 'len': L}
    if rails: part['rails'] = rails
    write_part(k, 'handguard', pid, slot_meshes(k, 'handguard') - before, (RF * mm, 0.0), {'support': r4([L / 2 + 0.02, -0.026, 0])},
               {'part': part, 'replaces': replaces})

# ---- the KV-47 (AKM): its laminated stock; the long handguards built on its receiver
k = build('ak')
stock_part(k, 'northmark_akm', ['Northmark stock', 'Northmark stock (Laminate)'], 'fixed (the AKM laminate, 246 mm)')
RF = k['RF']
# a two-piece handguard L long (the lower's rear 1 mm ahead of the receiver's face, the retainer band its last 7 mm)
def two_piece(L, m, poly):
    return lambda: k['handguards'](a=RF + 1.0, b=RF + L * 1000 - 7.0, m=m, poly=poly)
handguard_part(k, 'lynx_ak_204', 0.204, two_piece(0.204, 'polymer', True), 'wood', ['Lynx 8.0" handguard'])
handguard_part(k, 'valkyr_ak_208', 0.208, two_piece(0.208, 'wood', False), 'wood', ['Valkyr 8.2" handguard'])
handguard_part(k, 'northmark_ak_quad', 0.204, lambda: k['handguard_quad_ak'](0.204), 'rail', ['Northmark 8.0" quad rail handguard'])
# the drop-in lower handguards for a foregrip (the factory lower's length, 0.158 m with its retainer band; the issue gas tube cover on top)
DL = round((k['HG_LO'][1] + 7.0 - RF) * k['mm'], 4)
handguard_part(k, 'ak_dropin_quad', DL, lambda: k['handguard_dropin']('rail'), 'rail', ['Ironvale AK quad rail'])
handguard_part(k, 'ak_dropin_mlok', DL, lambda: k['handguard_dropin']('mlok'), 'mlok', ['Vantage AKX M-LOK'])

# ---- the AK-74M: its polymer side-folding stock
k = build('ak74')
stock_part(k, 'kodiak_ak74m', ['Kodiak AK-74M side-folding stock (Polymer)'], 'unfolded (the AK-74M side-folder, 259 mm)')
