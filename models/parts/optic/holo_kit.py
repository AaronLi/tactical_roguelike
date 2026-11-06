# The shared builder of the HOLOGRAPHIC sights (models/parts/optic/<id>/build_<id>.py set CFG and exec this): the remaster of the recipe's
# S.holo (tools/models/recipes.ts), same sizes: the window 33 x 27 mm on a sight line 33 mm over the rail, the hood from 22 mm behind the
# mount point to 30 mm ahead of it, the base 40 mm wide.
# Frame (docs/models.md "Authored parts"): Blender X = right, Y = forward, Z = up, metres; ORIGIN = the rail's top at the mount point, centred.
# CFG: replaces, and the family's look:
#   battery 'side' (a transverse battery cap on the base's front, the right side: the EXPS kind) or 'cross' (a battery tube across the base's
#   front, its cap on the left); buttons 'rear' (on the base's back face) or 'side' (on the base's left); hood 'square' or 'round' (the
#   hood's top corners); open: the hood's sides cut away (a frame); qd: a throw lever on the right.
import bpy, json, math, os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = os.path.basename(HERE)
C = globals()['CFG']
EXPORT = os.environ.get('PART_EXPORT', '1') == '1'
_bevel = bevel
def bevel(o, w, seg=2, angle=40): return _bevel(o, w, 1, angle)
coll, root = kit_collection(ID)
K = Kit(coll, root)
SY, WW, WH = 0.033, 0.033, 0.027             # the sight line; the window
F0, F1 = -0.034, 0.030                        # the base's rear and front
HF0 = F0 + 0.012                              # the hood's rear (the eye end)
YB = 0.012                                    # the base's top
YT = SY + WH / 2 + 0.003                      # the hood's inner top
SW = 2.0 * mm                                 # the hood's wall (thin: as little frame in the picture as can be)
RC = 7 * mm if C.get('hood') == 'round' else 2.5 * mm

# ---- the base: the electronics box, a clamp channel under it ----
bp = [(F0, 0.0), (F1, 0.0), (F1, YB - 2 * mm), (F1 - 2 * mm, YB), (F0 + 2 * mm, YB), (F0, YB - 2 * mm)]
b = K.tmp(prism(bp, 'x', -0.020, 0.020))
cut(b, box(-0.0108, 0.0108, -0.1, 0.1, -0.001, 0.0015))
cut(b, box(-0.03, 0.03, F0 + 6 * mm, F1 - 6 * mm, -0.001, 2.2 * mm))                          # (relief between the clamp's jaws)
bevel(b, 0.9 * mm, 1, 30); smooth(b); K.adopt(b, 'optic', 'black')
# ---- the hood: a loop round the windows, on the base ----
outer = rounded(0, (YB - 1 * mm + YT + SW) / 2, WW / 2 + SW, (YT + SW - YB + 1 * mm) / 2, RC, 3)
h = K.tmp(prism(outer, 'y', HF0, F1))
cut(h, prism(rounded(0, (YB + 1.5 * mm + YT) / 2, WW / 2, (YT - YB - 1.5 * mm) / 2, max(1.5 * mm, RC - SW), 3), 'y', HF0 - 0.01, F1 + 0.01))
cut(h, box(-0.03, 0.03, HF0 + 6 * mm, F1 - 6 * mm, YT + SW - 1.2 * mm, YT + SW + 1 * mm))   # a flat recess along the top (the hood's spine)
if C.get('open'):   # an open frame: the hood's sides cut away between its front and rear posts (you see past it)
    cut(h, prism(rounded((HF0 + F1) / 2, (YB + YT) / 2 + 1 * mm, (F1 - HF0) / 2 - 6 * mm, (YT - YB) / 2 - 3.5 * mm, 3 * mm, 3), 'x', -0.04, 0.04))
bevel(h, 0.7 * mm, 1, 30); smooth(h); K.adopt(h, 'optic', 'black')
# the windows: the rear clear one at the eye end, the front holographic one (the window the reticle is drawn in)
o = K.obj(box(-WW / 2, WW / 2, HF0 + 1.25 * mm, HF0 + 2.75 * mm, SY - WH / 2, SY + WH / 2), 'optic', 'clearLens')
WF = F1 - 0.007
o = K.obj(box(-WW / 2, WW / 2, WF - 0.75 * mm, WF + 0.75 * mm, SY - WH / 2, SY + WH / 2), 'optic', 'reflexLens')
# a window frame lip at each end
for f0, f1 in ((HF0, HF0 + 1.2 * mm), (F1 - 1.2 * mm, F1)):
    fr = K.tmp(prism(rounded(0, (YB + 1.5 * mm + YT) / 2, WW / 2 + 0.2 * mm, (YT - YB - 1.5 * mm) / 2 + 0.2 * mm, 2 * mm, 3), 'y', f0, f1))
    cut(fr, prism(rounded(0, SY, WW / 2 - 0.5 * mm, WH / 2 - 0.4 * mm, 1.5 * mm, 3), 'y', f0 - 0.01, f1 + 0.01)); smooth(fr); K.adopt(fr, 'optic', 'black')

# ---- the battery ----
if C.get('battery', 'side') == 'side':     # transverse: a cap on the right, the compartment through the base's front
    o = K.tmp(prism(rounded(F1 - 9 * mm, YB / 2 + 0.5 * mm, 8 * mm, YB / 2 + 0.5 * mm, 2.5 * mm, 3), 'x', -0.0195, 0.0195)); bevel(o, 0.8 * mm, 1, 30); smooth(o); K.adopt(o, 'optic', 'black')
    o = K.obj(cyl(5.5 * mm, 0.0195, 0.0225, 'x', (F1 - 9 * mm, YB / 2 + 1 * mm), 16), 'optic', 'black'); smooth(o)
    for i in range(6):
        g = box(0.0215, 0.0235, -0.6 * mm, 0.6 * mm, 4.8 * mm, 6.2 * mm); g.transform(Matrix.Translation((0, F1 - 9 * mm, YB / 2 + 1 * mm)) @ Matrix.Rotation(i * math.pi / 3, 4, 'X')); cut(o, g)
else:                                      # 'cross': a battery tube lying across the base's front, its knurled cap on the left
    BZ, BF = YB / 2 + 0.5 * mm, F1 - 6.5 * mm
    o = K.obj(cyl(6.0 * mm, -0.0200, 0.0205, 'x', (BF, BZ), 16), 'optic', 'black'); smooth(o)
    o = K.tmp(cyl(6.4 * mm, -0.0245, -0.0198, 'x', (BF, BZ), 16))
    for i in range(8):
        g = box(-0.0246, -0.0205, -0.5 * mm, 0.5 * mm, 5.9 * mm, 6.8 * mm); g.transform(Matrix.Translation((0, BF, BZ)) @ Matrix.Rotation(i * math.pi / 4, 4, 'X')); cut(o, g)
    smooth(o); K.adopt(o, 'optic', 'rubber')
# ---- the controls: two rubber buttons (up/down) ----
if C.get('buttons', 'rear') == 'rear':
    for x in (-0.009, 0.009):
        o = K.tmp(prism(rounded(x, YB / 2 + 1 * mm, 3.5 * mm, 2.6 * mm, 1.2 * mm, 2), 'y', F0 - 2.2 * mm, F0 + 0.5 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'optic', 'rubber')
else:
    for f in (F0 + 8 * mm, F0 + 16 * mm):
        o = K.tmp(prism(rounded(f, YB / 2 + 1 * mm, 3.2 * mm, 2.6 * mm, 1.2 * mm, 2), 'x', -0.0222, -0.0195)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'optic', 'rubber')
# ---- the adjusters: elevation and windage screws on the right of the base, behind the battery ----
for k, f in enumerate((F0 + 9 * mm, F0 + 17 * mm)):
    if C.get('battery', 'side') == 'front' or k == 0:
        o = K.obj(cyl(2.4 * mm, 0.0195, 0.0212, 'x', (f, YB / 2 + 1 * mm), 14), 'optic', 'steel'); smooth(o)
        cut(o, box(0.0205, 0.022, f - 0.35 * mm, f + 0.35 * mm, YB / 2 - 1.5 * mm, YB / 2 + 3.5 * mm))
if C.get('qd'):   # the QD lever (right) and its locking button
    lv = K.tmp(prism([(F0 + 0.012, 0.001), (F0 + 0.040, 0.001), (F0 + 0.042, 0.006), (F0 + 0.016, 0.0068)], 'x', 0.0200, 0.0228)); bevel(lv, 0.6 * mm, 1, 30); smooth(lv); K.adopt(lv, 'optic', 'black')
    o = K.obj(cyl(2.0 * mm, 0.0228, 0.0238, 'x', (F0 + 0.020, 0.004), 12), 'optic', 'steel'); smooth(o)

# ---- model.json ----
cfg = {'source': 'authored', 'kind': 'part', 'slot': 'optic', 'frame': 'rail-top',
       'optic': {'sy': SY, 'fSight': round(HF0, 4), 'relief': 0.1,
                 'reflex': {'f': round(WF, 4), 'y': SY, 'w': WW, 'h': WH, 'kind': 'holo'},
                 'magnifier': True, 'height': 'mid'},
       'replaces': C['replaces']}
if EXPORT:
    with open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8') as fh: fh.write(json.dumps(cfg, indent=2, ensure_ascii=False) + '\n')
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
