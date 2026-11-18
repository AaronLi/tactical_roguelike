# The SCAR family's furniture as AUTHORED PARTS (models/parts/<slot>/<id>/), the way models/ak_parts.py cuts the AK's out of its build:
#  - stock/factory_scar_stock: the SCAR's folding, telescoping stock ("SCAR folding stock", stk.heavy.scar: both SCARs' factory stock), drawn
#    extended, its hinge block on the upper's back; the origin is the gun's mount_stock (the hinge's height at the receiver's rear), it reaches
#    back 0.24 m. Its body takes the gun's furniture finish (material polymer: the SCARs' is FDE), the butt pad its rubber.
#  - muzzle/ironvale_a2_762: the A2 birdcage of the 7.62 ("Ironvale A2 7.62 birdcage": the SCAR-H's factory flash hider; the SR-25's too), the
#    same shape as the 5.56's (models/parts/muzzle/ironvale_a2_556: the SCAR-L's) a tenth larger. Its origin is the gun's mount_muzzle.
#   blender -b -P models/scar_parts.py
# It builds the SCAR-H and the SCAR-L with the shared builder (models/scar_kit.py, nothing exported), moves each part's meshes into a collection
# of its own and writes <id>.glb, <id>.blend and model.json.
import bpy, json, os
from mathutils import Matrix
MODELS = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else globals()['MODELS_DIR']
os.environ['GUN_EXPORT'] = '0'
def build(gid):
    """Runs models/<gid>/build_<gid>.py (nothing exported) and returns the builder's globals; the session's objects go first (the meshes are
    named <slot>_<n> by each build, and a name Blender has to suffix breaks the contract)."""
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
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

# ---- the SCAR-L: the folding stock (the same on the H: the same builder) and, from the SCAR-H, the 7.62's birdcage
k = build('scarl')
mm, Fp, Up, SU = k['mm'], k['Fp'], k['Up'], k['STOCK_UP']
stk = slot_meshes(k, 'stock')
for o in stk:   # (the body takes the gun's furniture finish: material polymer; the pad, the pins and the hinge's pin keep theirs)
    for i, m in enumerate(o.data.materials):
        if m and m.name == 'tan': o.data.materials[i] = k['kit_mat']('polymer')
write_part(k, 'stock', 'factory_scar_stock', stk, (0.0, SU),
           {'butt': r4([k['STOCK_ANCH']['butt'][0], k['STOCK_ANCH']['butt'][1] - SU, 0]), 'cheek': r4([k['STOCK_ANCH']['cheek'][0], k['STOCK_ANCH']['cheek'][1] - SU, 0])},
           {'part': {'mount': 'hinge', 'position': 'extended (the SCAR\'s folding stock, drawn at its longest: the hinge block against the upper\'s back)'},
            'replaces': ['SCAR folding stock']})
k = build('scar')
MZ0, MUZ = k['MZ0'], k['MUZ']
write_part(k, 'muzzle', 'ironvale_a2_762', slot_meshes(k, 'muzzle'), (MZ0, 0.0), {'muzzles': [r4([MUZ - MZ0, 0, 0])]},
           {'part': {'thread': 'r762', 'kind': 'flash'}, 'replaces': ['Ironvale A2 7.62 birdcage']})
print('PARTS DONE')
