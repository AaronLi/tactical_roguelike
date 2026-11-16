# The body armour made on the base figure (kit_armour.py), worn in a few poses: a contact sheet to look at.
#   blender -b models/characters/human/human.blend -P models/characters/kit_sheet.py
# Writes the tiles (human/_kit_*.png, listed in human/_kit_<set>.txt); then  python models/characters/kit_sheet.py  makes human/kit_<set>.png of them.
# (was: kit_<set>.png (each set: rest, arms down, aiming, crouched; front three-quarter and side).
import math, os, sys
try:
    import bpy
except ImportError:  # (outside Blender: the sheets, from the tiles it wrote)
    from PIL import Image
    H_ = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'human')
    for key in ('soft', 'pc', 'heavy', 'wrap'):
        lst = os.path.join(H_, '_kit_%s.txt' % key)
        if not os.path.exists(lst): continue
        tiles = open(lst).read().split(chr(10)); ims = [Image.open(f) for f in tiles]; W, H = ims[0].size; sheet = Image.new('RGB', (W * 4, H * 2))
        for i, im in enumerate(ims): sheet.paste(im, ((i // 2) * W, (i % 2) * H))
        sheet.save(os.path.join(H_, 'kit_%s.png' % key))
        for f in tiles: os.remove(f)
        os.remove(lst)
    sys.exit(0)
from mathutils import Vector as V, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'human')
sc = bpy.context.scene; arm = bpy.data.objects['human']
BONES = [b.name for b in arm.data.bones]
def pose(dirs, hips=(0, 0, 0)):
    for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    arm.pose.bones['hips'].location = arm.pose.bones['hips'].bone.matrix_local.to_3x3().inverted() @ V(hips)
    for name in BONES:
        if name not in dirs: continue
        bpy.context.view_layer.update(); pb = arm.pose.bones[name]; cur = pb.matrix.copy(); h = cur.to_translation()
        q = (cur.to_3x3() @ V((0, 1, 0))).rotation_difference(V(dirs[name]).normalized())
        pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ cur
    bpy.context.view_layer.update()
both = lambda k, x, y, z: {k + '.R': (x, y, z), k + '.L': (-x, y, z)}
POSES = [('rest', {}, (0, 0, 0)), ('arms down', {**both('upperarm', 0.12, 0, -1), **both('forearm', 0.08, -0.12, -1)}, (0, 0, 0)),
         ('aiming', {'upperarm.R': (0.25, -0.7, -0.66), 'forearm.R': (-0.62, -0.75, 0.25), 'upperarm.L': (-0.1, -0.92, -0.38), 'forearm.L': (0.3, -0.94, 0.16), 'chest': (0, -0.1, 1), 'neck': (0, -0.2, 1)}, (0, 0, 0)),
         ('crouch', {**both('thigh', 0.12, -0.9, -0.42), **both('shin', 0, 0.5, -0.87), 'spine': (0, -0.25, 0.97), 'chest': (0, -0.35, 0.94), 'neck': (0, 0.1, 1), 'upperarm.R': (0.2, -0.75, -0.6), 'forearm.R': (-0.6, -0.75, 0.3), 'upperarm.L': (-0.1, -0.9, -0.4), 'forearm.L': (0.3, -0.94, 0.16)}, (0, 0.1, -0.36))]
SETS = {'soft': ['kitsoft', 'kitdelt', 'kitthigh'], 'pc': ['kitpc', 'kitplatepc', 'kitpelvis', 'kitaxil', 'kitdelt'],
        'heavy': ['kitheavy', 'kitplateheavy', 'kitbeltwide', 'kitshcap', 'kitgflap', 'kitgplate', 'kitlegwrap', 'kitshin'],
        'wrap': ['kitwrap', 'kitplatewrap', 'kitbelt']}
COL = {'soft': (0.3, 0.3, 0.27), 'pc': (0.22, 0.25, 0.16), 'heavy': (0.26, 0.23, 0.17), 'wrap': (0.2, 0.21, 0.22)}
for e in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try: sc.render.engine = e; break
    except TypeError: pass
cd = sc.camera.data; cam = sc.camera
sc.render.resolution_x, sc.render.resolution_y = 360, 460
for key, objs in SETS.items():
    for o in bpy.data.objects:
        if o.name.startswith('kit'): o.hide_render = o.name not in objs
        if o.name in objs:
            for m in o.data.materials: m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*([0.05, 0.05, 0.05] if 'pouch' in o.name else COL[key]), 1)
    tiles = []
    for name, dirs, hp in POSES:
        pose(dirs, hp)
        for az in (35, 90):
            a = math.radians(az); c = V((0, -0.05, 1.2 + hp[2] * 0.6)); cd.type = 'ORTHO'; cd.ortho_scale = 1.0
            cam.location = c + V((math.sin(a) * 6, -math.cos(a) * 6, 0.6)); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
            f = os.path.join(OUT, '_kit_%s_%s_%d.png' % (key, name.replace(' ', '_'), az)); sc.render.filepath = f; bpy.ops.render.render(write_still=True); tiles.append(f)
    open(os.path.join(OUT, '_kit_%s.txt' % key), 'w').write(chr(10).join(tiles))  # (the sheet's made from them outside Blender: no PIL in it)
print('DONE')

