# The Strix Falcon open reflex, in Blender, from shapes.json (the same shapes tools/build_authored_optic.mjs builds in node).
#   Blender: exec(open(r'<repo>/models/parts/optic/falcon/build_falcon.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/falcon'})
#   or:      blender -b -P models/parts/optic/falcon/build_falcon.py
# Frame (docs/models.md "Authored parts"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the top of the rail at the optic's mount point.
# Rules: one root empty named after the part; meshes named optic_<n> with custom property slot = 'optic'; material names are the game's catalogue's
# ('black', 'rubber', 'reflexLens'...); nothing below Z = 0. Sight data (sy, window...) lives in model.json, not here.
import bpy, json, os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
ID = os.path.basename(HERE)
spec = json.load(open(os.path.join(HERE, 'shapes.json')))
for o in list(bpy.data.objects):
    if o.name == ID or o.name.startswith('optic_'): bpy.data.objects.remove(o, do_unlink=True)
root = bpy.data.objects.new(ID, None); bpy.context.scene.collection.objects.link(root)
def mat(n):
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n); return m
for i, s in enumerate(spec['shapes']):
    f, u, r = s['at']
    if 'box' in s:
        w, h, l = s['box']; bpy.ops.mesh.primitive_cube_add(location=(r, f, u)); o = bpy.context.object; o.scale = (w / 2, l / 2, h / 2)
    else:
        c = s['cyl']; bpy.ops.mesh.primitive_cylinder_add(radius=c['r'], depth=c['len'], location=(r, f, u)); o = bpy.context.object
        o.rotation_euler = {'x': (0, 1.5707963, 0), 'y': (0, 0, 0), 'z': (1.5707963, 0, 0)}[c['axis']]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.name = 'optic_%d' % (i + 1); o['slot'] = 'optic'; o.parent = root
    o.data.materials.clear(); o.data.materials.append(mat(s['mat']))
bpy.ops.object.select_all(action='DESELECT')
for o in [root] + list(root.children): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, ID + '.glb'), export_format='GLB', use_selection=True, export_extras=True, export_yup=True,
                          export_apply=True, export_texcoords=False, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_animations=False)
