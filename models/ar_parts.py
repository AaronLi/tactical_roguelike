# The AR family's furniture as AUTHORED PARTS (models/parts/<slot>/<id>/): the M4 (Mk 18) model's own stock, grip, quad rail and
# birdcage, each cut out of the gun and written in its own frame, so the game can fit the same model on every gun that takes the part
# it replaces ("replaces": the catalogue names in js/parts.ts).
#   blender -b -P models/ar_parts.py
# It builds the M4 with the shared AR builder (models/ar_kit.py, nothing exported), then for each part below moves that part's meshes
# into a collection of its own, origin at its mount point, and writes <id>.glb, <id>.blend and model.json.
#
# Frames (the gun's convention: Blender X right, Y forward, Z up, metres; anchors [forward, up, right] from the part's origin):
#   stock      origin on the buffer tube's axis at the receiver's rear (the gun's mount_stock); anchors butt (the butt plate's centre),
#              cheek (the top of the comb under the eye); modelled drawn out one position from fully collapsed
#   grip       origin at the gun's mount_grip (the grip's front top, where it meets the lower); anchor grip (where the palm sits)
#   handguard  origin on the bore axis at the gun's mount_handguard (the rail's rear, against the upper's front); anchor support;
#              part.rails: each rail's [from, to] forward of the origin; part.len
#   muzzle     origin on the bore axis at the gun's mount_muzzle (the barrel's end, where the thread ends); anchor muzzles (where the
#              bullet leaves it); part.thread, part.kind
import bpy, json, os
from mathutils import Matrix
MODELS = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else globals()['MODELS_DIR']
os.environ['GUN_EXPORT'] = '0'
g = {'GUN_DIR': os.path.join(MODELS, 'm4'), 'CFG': {}}
exec(open(os.path.join(MODELS, 'ar_kit.py'), encoding='utf-8').read(), g)
mm = g['mm']
gun_coll = g['coll']

def slot_meshes(slot):
    return {o for o in gun_coll.all_objects if o.type == 'MESH' and o.get('slot') == slot}

def write_part(slot, pid, objs, origin, anchors, cfg):
    """Move objs into the part's own collection and root (named pid), origin (forward, up) to the root's, and write the files."""
    d = os.path.join(MODELS, 'parts', slot, pid); os.makedirs(d, exist_ok=True)
    coll, root = g['kit_collection'](pid)
    root['part'] = pid; root['anchors_json'] = json.dumps(anchors)
    T = Matrix.Translation((0, -origin[0], -origin[1]))
    for o in objs:
        W = o.matrix_world.copy()
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o); o.parent = root; o.matrix_parent_inverse = Matrix.Identity(4); o.matrix_world = T @ W
    bpy.context.view_layer.update()
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    size = g['save_and_export'](coll, root, d, pid, True)
    json.dump(dict({'source': 'authored', 'kind': 'part', 'slot': slot, 'frame': slot + '-mount', 'anchors': anchors}, **cfg),
              open(os.path.join(d, 'model.json'), 'w', encoding='utf-8'), indent=2)
    print('PART', json.dumps({'key': slot + '/' + pid, 'meshes': len(meshes), 'tris': g['tris_of'](meshes), 'glb': size}))

r4 = lambda v: [round(x, 4) for x in v]

# ---- the carbine stock (the Kestrel CS-4): its origin is the gun's mount_stock, [0, 0]
S2, X2, Y2, DX = 0.965 * mm, 247, 159.5, -0.024
write_part('stock', 'kestrel_cs4', slot_meshes('stock'), (0.0, 0.0),
           {'butt': r4([(36 - X2) * S2 + DX, (Y2 - 222) * S2, 0]), 'cheek': r4([(80 - X2) * S2 + DX, (Y2 - 139) * S2, 0])},
           {'part': {'mount': 'tube', 'position': 'one out from collapsed'}, 'replaces': ['Kestrel CS-4 carbine stock']})

# ---- the grip (the modern polymer one): its origin is the gun's mount_grip
GA = g['la']['grip']
write_part('grip', 'paragon_pg23', slot_meshes('grip'), GA, {'grip': [-0.04, -0.04, 0]},
           {'part': {'mount': 'ar'}, 'replaces': ['Paragon PG-23 ergonomic grip',
                                                   # (and the standard-issue AR grip "that matches the furniture": on an AR grip mount it is drawn in
                                                   # polymer, the same grip, so the model; docs/models.md "replaces by match")
                                                   {'mount': 'gr:ar', 'model': {'gripT': 'ar', 'gm': None}}]})

# ---- the birdcage: its origin is the gun's mount_muzzle
MZ0, MUZ = g['MZ0'], g['MUZ']
write_part('muzzle', 'ironvale_a2_556', slot_meshes('muzzle'), (MZ0, 0.0), {'muzzles': [r4([MUZ - MZ0, 0, 0])]},
           {'part': {'thread': 'r556', 'kind': 'flash'}, 'replaces': ['Ironvale A2 5.56 birdcage']})

# ---- the quad rails: the factory 9.5" (the Mk 18's) and the 12" Ironvale IR-12; origin the gun's mount_handguard
HG0, HB_B = g['HG0'], g['HB_B']
def rails(L): return {'top': r4([0, L - 2 * mm]), 'bottom': r4([0.010, L - 2 * mm]), 'left': r4([0.012, L - 2 * mm]), 'right': r4([0.012, L - 2 * mm])}
L = g['HG1'] - HG0
write_part('handguard', 'quad_rail_240', slot_meshes('handguard'), (HG0, 0.0), {'support': r4([L / 2 + 0.03, HB_B - 6 * mm, 0])},
           {'part': {'t': 'rail', 'len': round(L, 4), 'rails': rails(L)}, 'replaces': [
               # (the factory rail, no catalogue name: every AR-mount handguard that is a 0.24 m quad rail, in black or the SCAR's FDE)
               {'mount': 'hg:ar', 'model': {'hg': {'t': 'rail', 'len': 0.24}}}]})
before = slot_meshes('handguard')
L = 0.300
g['handguard_quad'](HG0, HG0 + L)
write_part('handguard', 'ironvale_ir12', slot_meshes('handguard') - before, (HG0, 0.0), {'support': r4([L / 2 + 0.03, HB_B - 6 * mm, 0])},
           {'part': {'t': 'rail', 'len': L, 'rails': rails(L)}, 'replaces': ['Ironvale IR-12 quad rail']})
print('PARTS DONE')
