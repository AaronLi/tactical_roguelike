# The AN-94's factory furniture as AUTHORED PARTS (models/parts/<slot>/<id>/), the way models/ak_parts.py cuts the AK family's out of its builds. Each is REPLACE-ONLY: it
# is the model of a catalogue entry of the AN-94's own (the AN-94 side-folding stock, pistol grip, forend and muzzle device: js/parts.ts adds them, as the AN-94's defaults),
# so the AK family's standard stocks, grips, handguards and muzzles (the catalogue parts the AK-74 takes) stay what they were and fit the AN-94 at its anchors:
#      stock/an94_folding     "AN-94 side-folding stock"   the solid polymer side-folder, 258 mm, drawn unfolded, with its rubber pad
#      grip/an94_grip         "AN-94 pistol grip"          the raked polymer grip with its stippled panels and finger grooves
#      handguard/an94_forend  "AN-94 forend"               0.198 m: the ribbed upper over the grooved lower guard
#      muzzle/an94_device     "AN-94 muzzle device"        the two-lobe device on the AK's 14 x 1 LH thread
#   blender -b -P models/an94_parts.py
# It builds the AN-94 with its own builder (models/an94/build_an94.py, nothing exported), moves each slot's meshes into a collection of its own (origin the gun's mount anchor)
# and writes <id>.glb, <id>.blend and model.json.
import bpy, json, os
from mathutils import Matrix
MODELS = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else globals()['MODELS_DIR']
os.environ['GUN_EXPORT'] = '0'
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for me in list(bpy.data.meshes):
    if not me.users: bpy.data.meshes.remove(me)
d = {'GUN_DIR': os.path.join(MODELS, 'an94'), 'CFG': {}}
exec(open(os.path.join(MODELS, 'an94', 'build_an94.py'), encoding='utf-8').read(), d)
k = d['g']
mm, FX, UY = k['mm'], k['FX'], k['UY']
r4 = lambda v: [round(x, 4) for x in v]

def slot_meshes(slot):
    return {o for o in k['coll'].all_objects if o.type == 'MESH' and o.get('slot') == slot}

def write_part(slot, pid, objs, origin, anchors, cfg):
    """Move objs into the part's own collection and root (named pid), origin (forward, up) to the root's, and write the files."""
    dd = os.path.join(MODELS, 'parts', slot, pid); os.makedirs(dd, exist_ok=True)
    coll, root = k['kit_collection'](pid)
    root['part'] = pid; root['anchors_json'] = json.dumps(anchors)
    T = Matrix.Translation((0, -origin[0], -origin[1]))
    for o in objs:
        W = o.matrix_world.copy()
        for c in list(o.users_collection): c.objects.unlink(o)
        coll.objects.link(o); o.parent = root; o.matrix_parent_inverse = Matrix.Identity(4); o.matrix_world = T @ W
    bpy.context.view_layer.update()
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    size = k['save_and_export'](coll, root, dd, pid, True)
    json.dump(dict({'source': 'authored', 'kind': 'part', 'slot': slot, 'frame': slot + '-mount', 'anchors': anchors}, **cfg),
              open(os.path.join(dd, 'model.json'), 'w', encoding='utf-8'), indent=2)
    print('PART', json.dumps({'key': slot + '/' + pid, 'meshes': len(meshes), 'tris': k['tris_of'](meshes), 'glb': size}))

# the stock: origin the gun's mount_stock [0, UY(578) - 3 mm]
so = (0.0, UY(578) * mm - 0.003)
write_part('stock', 'an94_folding', slot_meshes('stock'), so,
           {'butt': r4([FX(20) * mm - so[0], UY(720) * mm - so[1], 0]), 'cheek': r4([FX(300) * mm - so[0], UY(578) * mm - so[1], 0])},
           {'part': {'mount': 'ak', 'position': 'unfolded (the AN-94 side-folder, 258 mm, solid polymer)'}, 'replaces': ['AN-94 side-folding stock']})
# the grip: origin the gun's mount_grip
go = (FX(590) * mm, k['SHELF'] * mm)
write_part('grip', 'an94_grip', slot_meshes('grip'), go, {'grip': r4([0.0024, -0.060, 0])},
           {'part': {'mount': 'ak'}, 'replaces': ['AN-94 pistol grip']})
# the forend: origin the bore at mount_handguard
HG0, HG1 = k['HG0'], k['HG1']
L = round((HG1 + 2.5 - HG0) * mm, 4)
write_part('handguard', 'an94_forend', slot_meshes('handguard'), (HG0 * mm, 0.0), {'support': r4([L / 2 + 0.02, -0.012, 0])},
           {'part': {'t': 'wood', 'len': L}, 'replaces': ['AN-94 forend']})
# the muzzle device: origin the bore at mount_muzzle
mo = k['BORE_END'] * mm
write_part('muzzle', 'an94_device', slot_meshes('muzzle'), (mo, 0.0), {'muzzles': [r4([k['MUZ_END'] * mm - mo, 0, 0])]},
           {'part': {'thread': 'rak', 'kind': 'brake'}, 'replaces': ['AN-94 muzzle device']})
print('FOREND LEN', L)
