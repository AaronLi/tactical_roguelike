# The MP5's handguards as AUTHORED PARTS (models/parts/handguard/<id>/): the slim forend in the FDE finish and the Northmark railed front (a clamp-on tri-rail), built
# by the MP5 kit (models/mp5_kit.py) and written in their own frame, so the game draws them on the MP5 where it would otherwise have the recipe's plain tube or
# nothing. Both are the MP5's only ("gun": "mp5" in model.json: the catalogue entry they replace is shared, the Vector's railed front is the same entry).
#   blender -b --factory-startup -P models/mp5_parts.py
# Frame (docs/models.md "Authored furniture"): origin on the bore axis at the receiver's front face (the gun's mount_handguard); forward 0 to part.len; the anchor
# support is where the hand takes it. The shell is in the handguard finish material ('black'), so the catalogue entry's finish (the FDE tan) shows on it.
import bpy, json, os
from mathutils import Matrix
MODELS = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else globals()['MODELS_DIR']
os.environ['GUN_EXPORT'] = '0'
g = {'GUN_DIR': os.path.join(MODELS, 'mp5'), 'CFG': {'sd': False}}
exec(open(os.path.join(MODELS, 'mp5_kit.py'), encoding='utf-8').read(), g)
mm, HG0, HG1 = g['mm'], g['HG0'], g['HG1']
gun_coll = g['coll']
r4 = lambda v: [round(x, 4) for x in v]

def slot_meshes(slot):
    return {o for o in gun_coll.all_objects if o.type == 'MESH' and o.get('slot') == slot}

def write_part(slot, pid, objs, origin, anchors, cfg):
    """Move objs into the part's own collection and root (named pid), origin (forward) to the root's, and write the files."""
    d = os.path.join(MODELS, 'parts', slot, pid); os.makedirs(d, exist_ok=True)
    coll, root = g['kit_collection'](pid)
    root['part'] = pid; root['anchors_json'] = json.dumps(anchors)
    T = Matrix.Translation((0, -origin, 0))
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

L = round(HG1 - HG0, 4)
SUPPORT = r4([0.055, -0.028, 0])

# ---- the slim forend, FDE: the same one the factory MP5 has, its shell in the finish material
before = slot_meshes('handguard')
g['handguard_slim']('handguard', 'black')
write_part('handguard', 'mp5_slim', slot_meshes('handguard') - before, HG0, {'support': SUPPORT},
           {'part': {'t': 'slim', 'len': L}, 'gun': 'mp5', 'replaces': ['Halcyon 3.3" slim forend (FDE)']})

# ---- the railed front: the clamp-on tri-rail, a Picatinny rail under it and each side
before = slot_meshes('handguard')
g['handguard_trirail']('handguard')
rail = [0.012, round(L - 0.005, 4)]
write_part('handguard', 'mp5_trirail', slot_meshes('handguard') - before, HG0, {'support': SUPPORT},
           {'part': {'t': 'rail', 'len': L, 'rails': {'bottom': rail, 'left': rail, 'right': rail}}, 'gun': 'mp5', 'replaces': ['Northmark railed front (under and each side)']})
print('PARTS DONE')
