# The shared builder of the low-power prism sights (models/parts/optic/<id>/build_<id>.py set CFG and exec this).
# Frame (docs/models.md "Authored parts"): Blender X = right, Y = forward, Z = up, metres; ORIGIN = the rail's top at the sight's mount point,
# centred; nothing below Z = 0. A prism sight: an integrated rail clamp (a base on the rail, its jaw and throw lever on the right), a neck up to
# the housing, the housing round the prism (its section a chamfered rectangle), an objective bell in front with its lens, an eyepiece behind
# with a rubber eyecup and the eye lens (the picture-in-picture lens: model.json optic.pip), an elevation turret on top, a windage turret on
# the right, an illumination dial on the left. CFG decides the family's look and the size for the magnification.
import bpy, json, math, os
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))   # (<repo>/models/parts/optic/<id>)
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = os.path.basename(HERE)
C = globals()['CFG']
EXPORT = os.environ.get('PART_EXPORT', '1') == '1'

# the triangle budget (a sight is small on screen): round things at most 16 sides, small dials 14, one-segment bevels
_lathe, _cyl, _bevel = lathe, cyl, bevel
def lathe(prof, seg=24, at=(0, 0, 0)): return _lathe(prof, 24 if seg >= 32 else min(seg, 16), at)     # (seg 32: the eyepiece, right at the eye, keeps 24)
def cyl(r, a0, a1, axis, c, seg=20): return _cyl(r, a0, a1, axis, c, min(seg, 16 if r > 8 * mm else 12))
def bevel(o, w, seg=2, angle=40): return _bevel(o, w, 1, angle)
coll, root = kit_collection(ID)
K = Kit(coll, root)
RISER = C.get('riser', 0.0)                              # an integrated riser under the housing (a 1x at lower-third co-witness height)
SY = C.get('sy', 0.030) + RISER                          # the sight line over the rail
L = C['len']                                             # the housing's length
F0, F1 = -L / 2, L / 2                                   # its rear and front
HW, HH = C.get('hw', 0.0165), C.get('hh', 0.015)         # the housing's half width and half height (round the sight line)
CH = C.get('chamfer', 0.005)                             # its corner chamfers
RO = C['obj_r']                                          # the objective's outer radius
RE = C.get('eye_r', 0.0125)                              # the eyepiece's outer radius (the eyecup)
LENS_E = RE - 1.6 * mm                                   # the eye lens (the pip)

def section(hw, hh, ch, facets):
    # the housing's section round the sight line: a chamfered rectangle, or (facets) a hexagon-ish angular one
    if facets:
        return [(-hw, SY - hh * 0.35), (-hw * 0.72, SY - hh), (hw * 0.72, SY - hh), (hw, SY - hh * 0.35), (hw, SY + hh * 0.35), (hw * 0.6, SY + hh), (-hw * 0.6, SY + hh), (-hw, SY + hh * 0.35)]
    return [(-hw + ch, SY - hh), (hw - ch, SY - hh), (hw, SY - hh + ch), (hw, SY + hh - ch), (hw - ch, SY + hh), (-hw + ch, SY + hh), (-hw, SY + hh - ch), (-hw, SY - hh + ch)]

# ---- the base: a clamp on the rail (the rail's top is z 0), a neck up to the housing ----
BL = C.get('base_len', min(L, 0.050))
BT = 0.011 + RISER                                       # the base's top (the riser raises it)
b = K.tmp(prism([(-0.015, 0.0), (0.015, 0.0), (0.0155, 0.004), (0.012 if not RISER else 0.0135, BT), (-0.012 if not RISER else -0.0135, BT), (-0.0155, 0.004)], 'y', -BL / 2, BL / 2))
cut(b, box(-0.0108, 0.0108, -BL, BL, -0.001, 0.0015))                                     # (the rail's top lies in its channel)
if RISER:   # the riser's lightening window, through it side to side
    cut(b, prism(rounded(0.0, 0.011 + RISER / 2 - 0.0005, BL / 2 - 0.009, RISER / 2 - 0.0035, 2.5 * mm, 3), 'x', -0.03, 0.03))
bevel(b, 0.8 * mm, 2, 30); smooth(b); K.adopt(b, 'optic', 'black')
nk = K.tmp(prism([(-0.011, BT - 0.001), (0.011, BT - 0.001), (0.009, SY - HH + 0.001), (-0.009, SY - HH + 0.001)], 'y', -BL / 2 + 0.004, BL / 2 - 0.004))
bevel(nk, 1 * mm, 2, 30); smooth(nk); K.adopt(nk, 'optic', 'black')
# the throw lever (right) and its cross-bolt (left)
lv = K.tmp(prism([(-0.010, 0.002), (0.012, 0.002), (0.014, 0.007), (-0.006, 0.008)], 'x', 0.0155, 0.0185)); bevel(lv, 0.6 * mm, 2, 30); smooth(lv); K.adopt(lv, 'optic', 'black')
o = K.obj(cyl(2.4 * mm, 0.0155, 0.0175, 'x', (0.0, 0.005), 12), 'optic', 'steel'); smooth(o)
o = K.obj(cyl(2.2 * mm, -0.0172, -0.0152, 'x', (0.0, 0.005), 6), 'optic', 'steel'); smooth(o)

# ---- the housing ----
hs = K.tmp(prism(section(HW, HH, CH, C.get('facets', False)), 'y', F0 + 0.004, F1 - 0.002))
bevel(hs, 1 * mm, 2, 30)
for k_ in range(C.get('ribs', 0)):                                                         # side ribs (grooves) along it
    z = SY - 0.006 + k_ * 0.004
    for s in (-1, 1): cut(hs, box(s * (HW - 0.6 * mm), s * (HW + 0.01), F0 + 0.010, F1 - 0.010, z - 0.6 * mm, z + 0.6 * mm))
smooth(hs); K.adopt(hs, 'optic', 'black')

# ---- the objective bell and lens (front), the eyepiece, eyecup and eye lens (rear) ----
OB_L = C.get('obj_len', 0.010)
ob = K.tmp(lathe([(F1 - 0.004, min(HW, HH) - 1 * mm), (F1 + OB_L * 0.4, RO), (F1 + OB_L, RO), (F1 + OB_L, RO - 1.5 * mm), (F1 + 0.002, RO - 1.5 * mm)], 24, (0, 0, SY)))
smooth(ob); K.adopt(ob, 'optic', 'black')
o = K.obj(cyl(RO - 1.5 * mm, F1 + 0.0015, F1 + 0.0025, 'y', (0, SY), 24), 'optic', 'lens'); smooth(o)
if C.get('sunshade'):
    o = K.obj(lathe([(F1 + OB_L, RO), (F1 + OB_L + C['sunshade'], RO), (F1 + OB_L + C['sunshade'], RO - 1.0 * mm), (F1 + OB_L, RO - 1.0 * mm)], 24, (0, 0, SY)), 'optic', 'black'); smooth(o)
ep = K.tmp(lathe([(F0 + 0.006, min(HW, HH) - 1 * mm), (F0 - 0.002, RE - 1.5 * mm), (F0 - 0.002, LENS_E + 0.4 * mm), (F0 + 0.004, LENS_E + 0.4 * mm)], 32, (0, 0, SY)))
smooth(ep); K.adopt(ep, 'optic', 'black')
EC_L = C.get('eyecup', 0.008)
ec = K.tmp(lathe([(F0 - 0.001, RE - 1 * mm), (F0 - EC_L, RE), (F0 - EC_L, LENS_E + 1.2 * mm), (F0 - 0.001, LENS_E + 1.2 * mm)], 32, (0, 0, SY)))
smooth(ec); K.adopt(ec, 'optic', 'rubber')
PIP_F = F0 - 0.0015
o = K.obj(cyl(LENS_E, PIP_F - 0.0005, PIP_F + 0.0005, 'y', (0, SY), 24), 'optic', 'lens'); smooth(o)

# ---- turrets: elevation on top, windage on the right (capped), the illumination dial on the left (ribbed) ----
TF = C.get('turret_f', 0.0)
el = K.tmp(lathe([(0.0, C.get('turret_r', 6.5 * mm)), (0.008, C.get('turret_r', 6.5 * mm)), (0.009, C.get('turret_r', 6.5 * mm) - 1 * mm), (0.009, 0.0005)], 14))     # (a flat cap)
el.data.transform(Matrix.Translation((0, TF, SY + HH - 0.001)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))      # (its axis up)
smooth(el); K.adopt(el, 'optic', 'black')
wd = K.tmp(lathe([(0.0, 5.5 * mm), (0.007, 5.5 * mm), (0.008, 4.5 * mm), (0.008, 0.0005)], 14))
wd.data.transform(Matrix.Translation((HW - 0.001, TF, SY)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z'))
smooth(wd); K.adopt(wd, 'optic', 'black')
il = K.tmp(lathe([(0.0, 7.0 * mm), (0.006, 7.0 * mm), (0.0065, 6.0 * mm), (0.0065, 0.0005)], 12))
for i in range(6):
    g = box(-0.5 * mm, 0.5 * mm, 0.001, 0.007, 6.4 * mm, 7.5 * mm); g.transform(Matrix.Rotation(i * math.pi / 3, 4, 'Y')); cut(il, g)
il.data.transform(Matrix.Translation((-HW + 0.001, TF + C.get('dial_df', 0.0), SY)) @ Matrix.Rotation(math.pi / 2, 4, 'Z'))
smooth(il); K.adopt(il, 'optic', 'black')
o = K.obj(cyl(1.4 * mm, -HW - 0.0062, -HW - 0.0058, 'x', (TF + C.get('dial_df', 0.0), SY + 4.5 * mm), 10), 'optic', 'dot')   # its index mark (lit)

# ---- model.json: the optic block (sy, fSight at the eyecup, relief, the pip lens) and what it replaces ----
cfg = {'source': 'authored', 'kind': 'part', 'slot': 'optic', 'frame': 'rail-top',
       'optic': {'sy': round(SY, 4), 'fSight': round(F0 - EC_L, 4), 'relief': C.get('relief', 0.07),
                 'pip': {'f': round(PIP_F, 4), 'y': round(SY, 4), 'r': round(LENS_E, 4)}, 'magnifier': False, 'height': 'high' if RISER else 'mid'},
       'replaces': C['replaces']}
if EXPORT:
    with open(os.path.join(HERE, 'model.json'), 'w') as fh: fh.write(json.dumps(cfg, indent=2, ensure_ascii=False) + '\n')
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
