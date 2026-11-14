# The helmets and face pieces made on the base figure's head (kit_head.py): a contact sheet to look at.
#   blender -b models/characters/human/human.blend -P models/characters/head_sheet.py   then   python models/characters/head_sheet.py
import math, os, sys
try:
    import bpy
except ImportError:
    from PIL import Image, ImageDraw
    H_ = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'human')
    for key in ('real', 'scifi'):
        lst = os.path.join(H_, '_head_%s.txt' % key)
        if not os.path.exists(lst): continue
        rows = [l.split('|') for l in open(lst).read().split(chr(10)) if l]
        ims = [(lab, Image.open(f)) for lab, f in rows]; W, H = ims[0][1].size; n = len(ims) // 2
        sheet = Image.new('RGB', (W * n, H * 2)); d = ImageDraw.Draw(sheet)
        for i, (lab, im) in enumerate(ims): sheet.paste(im, ((i // 2) * W, (i % 2) * H))
        for i in range(n): d.text(((i * W) + 8, 6), ims[i * 2][0], fill=(255, 255, 255))
        sheet.save(os.path.join(H_, 'head_%s.png' % key))
        for _, f in rows: os.remove(f)
        os.remove(lst)
    sys.exit(0)
from mathutils import Vector as V
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'human')
sc = bpy.context.scene
SETS = {'real': [('Bump', ['kithelmbump']), ('High-cut', ['kithelmfast']), ('Full-cut', ['kithelmach']), ('Rifle-rated', ['kithelmrifle']),
                 ('High-cut + mandible', ['kithelmfast', 'kitmandible', 'kitmandarmshigh']), ('Full-cut + mandible', ['kithelmach', 'kitmandible', 'kitmandarmsmid']), ('Full-cut + shield', ['kithelmach', 'kitshield', 'kitshieldframe']), ('Rifle + rifle shield', ['kithelmrifle', 'kitshieldrifle', 'kitshieldframe'])]}
COL = {'kitmandarmshigh': (0.24, 0.26, 0.28), 'kitmandarmsmid': (0.24, 0.26, 0.28), 'kithelmbump': (0.24, 0.25, 0.26), 'kithelmfast': (0.42, 0.37, 0.27), 'kithelmach': (0.29, 0.31, 0.25), 'kithelmrifle': (0.18, 0.2, 0.21), 'kitmandible': (0.31, 0.34, 0.37),
       'kitshield': (0.54, 0.67, 0.73), 'kitshieldrifle': (0.24, 0.31, 0.34), 'kitshieldframe': (0.1, 0.1, 0.11), 'kitscihelm': (0.23, 0.25, 0.28), 'kitscibrow': (0.2, 0.9, 1.0), 'kitscijaw': (0.16, 0.17, 0.19), 'kitscivisor': (0.15, 0.12, 0.05)}
GLASS = {'kitshield': 0.4, 'kitshieldrifle': 0.7, 'kitscivisor': 0.6}
for e in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try: sc.render.engine = e; break
    except TypeError: pass
for o in bpy.data.objects:  # (the hair under a helmet: not drawn, as in the game)
    if o.type == 'MESH':
        for m in o.data.materials:
            if m and m.name.split('.')[0] == 'hair':
                b = m.node_tree.nodes['Principled BSDF']; b.inputs['Alpha'].default_value = 0.0
                try: m.surface_render_method = 'BLENDED'
                except Exception: m.blend_method = 'BLEND'
for o in bpy.data.objects:
    if o.name in COL:
        for m in o.data.materials:
            b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*COL[o.name], 1); b.inputs['Roughness'].default_value = 0.45 if o.name.startswith('kitsci') else 0.75
            if o.name == 'kitscibrow': b.inputs['Emission Color'].default_value = (*COL[o.name], 1); b.inputs['Emission Strength'].default_value = 4.0
            if o.name in GLASS:
                b.inputs['Alpha'].default_value = GLASS[o.name]; b.inputs['Roughness'].default_value = 0.05
                try: m.surface_render_method = 'BLENDED'
                except Exception: m.blend_method = 'BLEND'
cam = sc.camera; cd = cam.data; cd.type = 'ORTHO'; cd.ortho_scale = 0.42
sc.render.resolution_x, sc.render.resolution_y = 300, 300
hd = bpy.data.objects['human'].data.bones['head'].head_local
c = V((0, -0.01, hd.z + 0.1))
for key, cfgs in SETS.items():
    lines = []
    for lab, objs in cfgs:
        for o in bpy.data.objects:
            if o.name.startswith('kit'): o.hide_render = o.name not in objs
        for az in (30, 100):
            a = math.radians(az); cam.location = c + V((math.sin(a) * 4, -math.cos(a) * 4, 0.6)); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
            f = os.path.join(OUT, '_head_%s_%s_%d.png' % (key, lab.replace(' ', '_').replace('+', 'p'), az)); sc.render.filepath = f; bpy.ops.render.render(write_still=True); lines.append(lab + '|' + f)
    open(os.path.join(OUT, '_head_%s.txt' % key), 'w').write(chr(10).join(lines))
print('DONE')
