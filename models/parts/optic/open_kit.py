# The shared builder of the OPEN-EMITTER rifle reflex sights (models/parts/optic/<id>/build_<id>.py set CFG and exec this): built to keep
# the frame out of the sight picture. The window is wide and the hoop round it thin (1.6 mm at the sides, 2 mm on top); everything else
# (the emitter housing, the turrets, the buttons, the deck) sits BELOW the window's bottom edge, so looking through the sight you see glass
# with a hairline round it. On an integrated riser (a rail clamp) to its catalogue sight line.
# Frame (docs/models.md "Authored parts"): Blender X = right, Y = forward, Z = up, metres; ORIGIN = the rail's top at the mount point, centred.
# CFG: sy (the sight line, metres), win (w, h: the window, metres), ret (dot, dotG, cdot), replaces, and the look:
#   top 'square' or 'round' (the hoop's top corners); lean (the hoop's lean back, degrees); solar: a panel on the deck between the housing
#   and the hoop; tray: a side battery tray on the right; qd: a throw lever on the clamp; open_top: no bar over the glass (two side posts,
#   the lens's top edge free: nothing at all above the window).
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
SY = C['sy']
WW, WH = C['win']
WB = SY - WH / 2                       # the window's bottom edge: nothing but the hoop's foot above it, behind it
DW = WW / 2 + 1.6 * mm                 # the hoop's (and the deck's) half width
F0, F1 = -0.026, 0.016                 # the deck's rear (the emitter housing's back) and front
DT = WB - 2.2 * mm                     # the deck's top
HT = WB - 0.6 * mm                     # the emitter housing's top: under the window's bottom
LEAN = math.radians(C.get('lean', 10))

# ---- the riser: a rail clamp up to the deck, a lightening window through it ----
BT = DT - 4.0 * mm                     # the riser's top (the deck sits on it)
BL = 0.036
b = K.tmp(prism([(-0.0155, 0.0), (0.0155, 0.0), (0.0158, 0.004), (0.012, BT), (-0.012, BT), (-0.0158, 0.004)], 'y', -0.006 - BL / 2, -0.006 + BL / 2))
cut(b, box(-0.0108, 0.0108, -0.1, 0.1, -0.001, 0.0015))
if BT > 0.014: cut(b, prism(rounded(-0.006, (0.004 + BT) / 2 + 0.0005, BL / 2 - 6 * mm, (BT - 0.004) / 2 - 2.6 * mm, 2.0 * mm, 2), 'x', -0.03, 0.03))
bevel(b, 0.8 * mm, 1, 30); smooth(b); K.adopt(b, 'optic', 'black')
if C.get('qd'):
    lv = K.tmp(prism([(-0.006 - 0.012, 0.002), (-0.006 + 0.012, 0.002), (-0.006 + 0.014, 0.007), (-0.006 - 0.008, 0.008)], 'x', 0.0158, 0.0188)); bevel(lv, 0.6 * mm, 1, 30); smooth(lv); K.adopt(lv, 'optic', 'black')
    o = K.obj(cyl(2.4 * mm, 0.0158, 0.0178, 'x', (-0.006, 0.005), 12), 'optic', 'steel'); smooth(o)
else:
    for s in (-1, 1): o = K.obj(cyl(2.6 * mm, s * 0.0155, s * 0.0170, 'x', (-0.006, 0.005), 6 if s < 0 else 12), 'optic', 'steel'); smooth(o)

# ---- the deck and the emitter housing (one side profile across the deck's width): the housing at the rear, low ----
HF = F0 + 0.016                        # the housing's front face
prof = [(F0, BT - 0.5 * mm), (F1, BT - 0.5 * mm), (F1, DT - 1.0 * mm), (F1 - 1.0 * mm, DT), (HF + 1.5 * mm, DT), (HF, DT + 1.0 * mm), (HF - 1.0 * mm, HT),
        (F0 + 2.5 * mm, HT), (F0, HT - 2.5 * mm)]
dk = K.tmp(prism(prof, 'x', -DW, DW))
EMU = DT + 0.9 * mm                    # the emitter's port: on the housing's face, just over the deck
cut(dk, cyl(1.2 * mm, HF - 1.5 * mm, HF + 0.5 * mm, 'y', (0, EMU), 16))
cut(dk, box(-1.2 * mm, 1.2 * mm, F0 - 1 * mm, F0 + 4 * mm, HT - 0.9 * mm, HT + 1 * mm))   # a notch in the housing's top (a rear-sight index)
bevel(dk, 0.7 * mm, 1, 30); smooth(dk); K.adopt(dk, 'optic', 'black')
o = K.obj(cyl(0.8 * mm, HF - 1.2 * mm, HF - 0.8 * mm, 'y', (0, EMU), 12), 'optic', 'glass'); smooth(o)
# the adjusters (steel screw heads, flush): elevation on the housing's top, windage on its right; the buttons on its left
AF = F0 + 0.007
el = K.obj(cyl(2.4 * mm, HT - 0.8 * mm, HT + 0.2 * mm, 'z', (4.5 * mm, AF), 16), 'optic', 'steel')
cut(el, box(1.5 * mm, 7.5 * mm, AF - 0.35 * mm, AF + 0.35 * mm, HT - 0.3 * mm, HT + 1 * mm)); smooth(el)
wd = K.obj(cyl(2.0 * mm, DW - 0.6 * mm, DW + 0.3 * mm, 'x', (AF + 1 * mm, (BT + HT) / 2 + 1 * mm), 16), 'optic', 'steel'); smooth(wd)
cut(wd, box(DW, DW + 0.5 * mm, AF + 1 * mm - 1.8 * mm, AF + 1 * mm + 1.8 * mm, (BT + HT) / 2 + 0.7 * mm, (BT + HT) / 2 + 1.3 * mm))
for f in (F0 + 5 * mm, F0 + 11 * mm):
    o = K.tmp(prism(rounded(f, (BT + HT) / 2 + 1 * mm, 2.2 * mm, 1.6 * mm, 0.8 * mm, 2), 'x', -DW - 0.8 * mm, -DW + 0.4 * mm)); smooth(o); K.adopt(o, 'optic', 'rubber')
if C.get('solar'):
    o = K.obj(box(-DW + 2 * mm, DW - 2 * mm, F0 + 11 * mm, HF - 1.5 * mm, HT - 0.1 * mm, HT + 0.2 * mm), 'optic', 'glass')
if C.get('tray'):
    o = K.tmp(box(DW - 0.2 * mm, DW + 1.4 * mm, F0 + 2 * mm, F0 + 14 * mm, BT + 0.5 * mm, HT - 1.5 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')

# ---- the hoop: a thin loop round the window, standing on the deck's front, leaning back; the lens in it ----
HD = 4.5 * mm                          # its depth
HFR = F1 - 0.6 * mm                    # its front face at the deck
top = SY + WH / 2 + 2.0 * mm
RT = (WW / 2 + 1.6 * mm) * 0.75 if C.get('top') == 'round' else 3.0 * mm
outer = rounded(0, (DT - 0.5 * mm + top) / 2, DW, (top - DT + 0.5 * mm) / 2, RT, 5)
cy_ = (DT - 0.5 * mm + top) / 2
outer = [((DW if x > 0 else -DW) if y < cy_ else x, max(y, DT - 0.5 * mm)) for x, y in outer]   # (only the top corners round: the foot square)
outer = [p for i, p in enumerate(outer) if p != outer[i - 1]]
hp = K.tmp(prism(outer, 'y', HFR - HD, HFR))
WR = RT - 1.6 * mm if C.get('top') == 'round' else 1.6 * mm
cut(hp, prism(rounded(0, SY, WW / 2, WH / 2, max(1.2 * mm, WR), 5), 'y', HFR - HD - 0.01, HFR + 0.01))
if C.get('open_top'):   # no bar over the top: the hoop cut down to two side posts (their tips just over the glass) and the foot
    cut(hp, box(-WW / 2 - 0.05 * mm, WW / 2 + 0.05 * mm, HFR - HD - 0.01, HFR + 0.01, SY, top + 0.01))
    for sx in (-1, 1): cut(hp, box(sx * (DW + 0.1 * mm) if sx < 0 else WW / 2, DW + 0.1 * mm if sx > 0 else -WW / 2, HFR - HD - 0.01, HFR + 0.01, SY + WH / 2 + 1.0 * mm, top + 0.01))
for v in hp.data.vertices: v.co.y -= max(0.0, v.co.z - DT) * math.tan(LEAN)
bevel(hp, 0.5 * mm, 1, 30); smooth(hp); K.adopt(hp, 'optic', 'black')
LF = HFR - HD / 2                      # the lens: in the hoop's middle, leaning with it
ln = K.obj(prism(rounded(0, SY, WW / 2 + 0.4 * mm, WH / 2 + 0.4 * mm, (4.0 * mm if C.get('open_top') else max(1.2 * mm, WR)) + 0.4 * mm, 5), 'y', LF - 0.6 * mm, LF + 0.6 * mm), 'optic', 'reflexLens')
for v in ln.data.vertices: v.co.y -= max(0.0, v.co.z - DT) * math.tan(LEAN)
WF = LF - (SY - DT) * math.tan(LEAN)   # the lens at the sight line (the window)

cfg = {'source': 'authored', 'kind': 'part', 'slot': 'optic', 'frame': 'rail-top',
       'optic': {'sy': round(SY, 4), 'fSight': round(F0, 4), 'relief': C.get('relief', 0.09),
                 'reflex': {'f': round(WF, 4), 'y': round(SY, 4), 'w': round(WW, 4), 'h': round(WH, 4), 'kind': C.get('ret', 'dot')},
                 'magnifier': True, 'height': 'low' if SY < 0.03 else 'mid'},
       'replaces': C['replaces']}
if EXPORT:
    with open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8') as fh: fh.write(json.dumps(cfg, indent=2, ensure_ascii=False) + '\n')
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
