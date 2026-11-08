# The flip-to-side magnifiers (the catalogue's three), as authored parts: a tube on the sight line behind a red dot, its mount at the tube's
# FRONT end, right behind the dot (a short rail clamp, so it fits short rails: the MP5's claw mount), the tube swinging out to the right on a
# hinge along the mount's right side.
#   blender -b -P models/parts/magnifier/magnifier_kit.py
# Frame "magnifier-mount" (proposed; the game's magnifier is drawn by S.magnifier in tools/models/recipes.ts, which this follows): Blender X
# right, Y forward, Z up, metres; the ORIGIN is the red dot's eye point, mount_magnifier = [its fSight, its sy]: the sight line runs along Y
# at Z 0. The tube runs back from Y -0.025 (a 25 mm gap behind the dot) to -0.025 - len; the clamp from -0.059 to -0.025, its foot 34 mm under
# the sight line (a red dot's height over its rail). part_magn: the swinging tube, its node on the hinge's axis (X 0.024, Z -0.020, along Y).
import bpy, json, math, os
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
mm = 0.001
def xs(a, b): return tuple(sorted((a, b)))

MAGS = [   # id, catalogue name, power, tube length, tube radius, objective bell radius, style
    ('brightline_2x', 'Brightline 2× micro magnifier', 2, 0.060, 15.0 * mm, None, 'micro'),
    ('strix_fts3', 'Strix FTS 3× flip magnifier', 3, 0.075, 16.5 * mm, 17.8 * mm, 'fts'),
    ('meridian_5x', 'Meridian 5× flip magnifier', 5, 0.090, 16.5 * mm, 19.0 * mm, 'long'),
]
GAP, FOOT = 0.025, 0.034                         # (the gap behind the dot; the clamp's length)
F1, F0 = -GAP, -GAP - FOOT                        # (the clamp: from -0.059 to -0.025)
TOP = -0.034                                     # (its foot: the rail's top, 34 mm under the sight line)
HX, HZ = 0.024, -0.020                           # (the hinge's axis)

def build(pid, name, px, L, R, RB, style):
    coll, root = kit_collection(pid)
    root['part'] = pid
    K = Kit(coll, root)
    fR = F1 - L                                  # (the tube's rear: the eyepiece, the picture-in-picture lens)
    # ---- the clamp (fixed on the rail): a block on the rail, the rail's channel under it, the cross bolt's head (right) and the
    # throw lever (left), the hinge knuckle along its right side
    cl = K.tmp(box(-15 * mm, 15 * mm, F0, F1, TOP, TOP + 12 * mm))
    cut(cl, prism([(-10.6 * mm, TOP - 0.001), (10.6 * mm, TOP - 0.001), (8.0 * mm, TOP + 2.6 * mm), (-8.0 * mm, TOP + 2.6 * mm)], 'y', F0 - 0.01, F1 + 0.01))
    bevel(cl, 0.8 * mm, 1, 30); smooth(cl); K.adopt(cl, 'magnifier', 'black')
    o = K.obj(cyl(3.2 * mm, 15 * mm, 16.6 * mm, 'x', ((F0 + F1) / 2, TOP + 4 * mm), 6), 'magnifier', 'steel'); smooth(o)
    lv = K.tmp(prism([(F0 + 3 * mm, TOP + 2 * mm), (F1 - 3 * mm, TOP + 2 * mm), (F1 - 1 * mm, TOP + 9 * mm), (F0 + 6 * mm, TOP + 10 * mm)], 'x', -18.5 * mm, -15 * mm))
    bevel(lv, 0.6 * mm, 1); smooth(lv); K.adopt(lv, 'magnifier', 'black')
    o = K.obj(cyl(4.2 * mm, F0 + 12.5 * mm, F1 - 12.5 * mm, 'y', (HX, HZ), 20), 'magnifier', 'black'); smooth(o)        # (the fixed knuckle: the middle third)
    o = K.obj(cyl(1.4 * mm, F0 + 1.5 * mm, F1 - 1.5 * mm, 'y', (HX, HZ), 10), 'magnifier', 'steel'); smooth(o)          # (the hinge pin through all three)
    o = K.tmp(box(14 * mm, HX, F0 + 2 * mm, F1 - 2 * mm, TOP + 6 * mm, HZ)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'magnifier', 'black')
    # ---- the swinging part (part_magn), its node on the hinge's axis: the arm from the knuckle up to the ring round the tube's front, the tube
    pm = K.part('magn', (HX, (F0 + F1) / 2, HZ))
    # the flip mount's ring: a machined loop round the tube's front (3 mm wall), a web running from its lower right out to the hinge, and the
    # two moving knuckles on the web's end, either side of the fixed one; a relief groove round the loop's middle
    Ro = R + 3.0 * mm
    ring = K.tmp(cyl(Ro, F0 + 2 * mm, F1 - 1 * mm, 'y', (0, 0), 48))
    ca, sa = math.cos(math.radians(-25)), math.sin(math.radians(-25)); cb, sb = math.cos(math.radians(-70)), math.sin(math.radians(-70))
    web = [(Ro * ca * 0.9, Ro * sa * 0.9), (HX + 1.5 * mm, HZ + 3.6 * mm), (HX + 0.5 * mm, HZ - 4.0 * mm), (Ro * cb * 0.9, Ro * sb * 0.9)]
    for f0_, f1_ in ((F0 + 2 * mm, F0 + 12 * mm), (F1 - 12 * mm, F1 - 1 * mm)):     # (the web only where the moving knuckles are)
        boolean(ring, prism(web, 'y', f0_, f1_), 'UNION')
        boolean(ring, cyl(4.2 * mm, f0_, f1_, 'y', (HX, HZ), 20), 'UNION')
    cut(ring, cyl(R - 0.2 * mm, F0, F1 + 0.01, 'y', (0, 0), 48))
    gr = cyl(Ro + 1 * mm, F0 + 14 * mm, F1 - 13 * mm, 'y', (0, 0), 48); gk = bpy.data.objects.new('gk', gr); coll.objects.link(gk)
    boolean(gk, cyl(Ro - 0.8 * mm, F0, F1, 'y', (0, 0), 48), 'DIFFERENCE'); g2 = gk.data.copy(); bpy.data.objects.remove(gk, do_unlink=True)
    cut(ring, g2)                                                                                              # (the relief groove: an annulus)
    bevel(ring, 0.5 * mm, 1, 30); smooth(ring); K.adopt(ring, 'magnifier', 'black', pm)
    bs = K.tmp(box(-Ro - 2.2 * mm, -Ro + 1.5 * mm, (F0 + F1) / 2 - 5 * mm, (F0 + F1) / 2 + 5 * mm, -5 * mm, 5 * mm)); bevel(bs, 0.6 * mm, 1); smooth(bs); K.adopt(bs, 'magnifier', 'black', pm)   # (the loop's pinch boss, left)
    o = K.obj(cyl(2.0 * mm, -Ro - 3.0 * mm, -Ro - 2.0 * mm, 'x', ((F0 + F1) / 2, 0), 12), 'magnifier', 'steel', pm); smooth(o)   # (its screw head)
    # the tube: the body, the objective's bell at the front, the diopter ring (knurled) near the rear, the eyepiece and its rubber eyecup
    prof = [(fR + 12 * mm, R), (F1 - (8 * mm if RB else 0), R)]
    if RB: prof += [(F1 - 6 * mm, RB), (F1, RB)]
    tb = K.tmp(lathe([(fR + 12 * mm, 0.0005)] + prof + [(F1, 0.0005)], 36))
    cut(tb, cyl((RB or R) - 1.4 * mm, F1 - 1.5 * mm, F1 + 0.01, 'y', (0, 0), 32))                                  # (the objective's recess)
    smooth(tb); K.adopt(tb, 'magnifier', 'black', pm)
    kn = K.tmp(lathe([(fR + 12 * mm, R + 0.8 * mm), (fR + 22 * mm, R + 0.8 * mm)], 36, (0, 0, 0)))
    cut(kn, cyl(R - 0.5 * mm, fR, F1, 'y', (0, 0), 32))
    for k in range(24):
        g = box(-0.6 * mm, 0.6 * mm, fR + 12.5 * mm, fR + 21.5 * mm, R + 0.3 * mm, R + 2 * mm); g.transform(Matrix.Rotation(k * math.pi / 12, 4, 'Y')); cut(kn, g)
    smooth(kn); K.adopt(kn, 'magnifier', 'black', pm)                                                          # (the diopter ring)
    ec = K.tmp(lathe([(fR, R + 1.6 * mm), (fR + 12 * mm, R + 1.0 * mm)], 36))
    cut(ec, cyl(R - 2.5 * mm, fR - 0.01, fR + 0.011, 'y', (0, 0), 32))
    smooth(ec); K.adopt(ec, 'magnifier', 'rubber', pm)                                                         # (the eyecup)
    o = K.obj(cyl(R - 2.6 * mm, fR + 3 * mm, fR + 3.6 * mm, 'y', (0, 0), 32), 'magnifier', 'glass', pm)             # (the eyepiece lens)
    o = K.obj(cyl((RB or R) - 1.5 * mm, F1 - 1.6 * mm, F1 - 1.2 * mm, 'y', (0, 0), 32), 'magnifier', 'glass', pm)    # (the objective)
    if style == 'long':   # the 5x: a power marking band and a second, wider ring at the eyepiece
        o = K.obj(lathe([(fR + 30 * mm, R + 0.3 * mm), (fR + 34 * mm, R + 0.3 * mm)], 36), 'magnifier', 'steel', pm); smooth(o)
    if style == 'micro':  # the 2x: a flat-topped housing, a push button on its top
        o = K.obj(cyl(2.4 * mm, R - 0.5 * mm, R + 1.6 * mm, 'z', (0, (fR + F1) / 2), 12), 'magnifier', 'steel', pm); smooth(o)
    # ---- the files
    anchors = {'pip': [round(fR, 4), 0, 0], 'hinge': [round((F0 + F1) / 2, 4), HZ, HX], 'foot': [round(F0, 4), TOP, 0], 'foot_end': [round(F1, 4), TOP, 0]}
    root['anchors_json'] = json.dumps(anchors)
    d = os.path.join(HERE, pid); os.makedirs(d, exist_ok=True)
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    size = save_and_export(coll, root, d, pid, True)
    json.dump({'source': 'authored', 'kind': 'part', 'slot': 'magnifier', 'frame': 'magnifier-mount', 'anchors': anchors,
               'magnifier': {'px': px, 'len': L, 'relief': 0.075, 'pip': {'f': round(fR, 4), 'r': round(R - 2.6 * mm, 4)}, 'flip': {'part': 'part_magn', 'axis': 'y', 'out_deg': -160}},
               'replaces': [name]}, open(os.path.join(d, 'model.json'), 'w', encoding='utf-8'), indent=2)
    print('PART', json.dumps({'key': 'magnifier/' + pid, 'meshes': len(meshes), 'tris': tris_of(meshes), 'glb': size}))
    # (each its own scene contents: clear for the next)
    for o in list(coll.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(coll)

for m in MAGS: build(*m)
