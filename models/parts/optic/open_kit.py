# The shared builder of the OPEN-EMITTER rifle reflex sights (models/parts/optic/<id>/build_<id>.py set CFG and exec this): built to keep
# the frame out of the sight picture. The window is wide and the hoop round it thin (1.6 mm at the sides, 2 mm on top); everything else
# (the emitter housing, the turrets, the buttons, the deck) sits BELOW the window's bottom edge, so looking through the sight you see glass
# with a hairline round it. The body is one casting from the rail clamp up (a rifle sight's mount, not a pistol dot on a riser).
# Frame (docs/models.md "Authored parts"): Blender X = right, Y = forward, Z = up, metres; ORIGIN = the rail's top at the mount point, centred.
# CFG: sy (the sight line, metres), win (w, h: the window, metres), ret (dot, dotG, cdot), replaces, and the look:
#   top 'square' or 'round' (the hoop's top corners); lean (the hoop's lean back, degrees); solar: a panel on the hood's (deeper) top bar;
#   wings: protective plates flaring forward outside the hood's sides; battery 'aaa' (a tube along the right side), 'coin_top' (a CR2032
#   under a cap in the housing's top) or 'tray' (a CR2032 side tray on the right); qd: a throw lever on the clamp; open_top: no bar over the glass (two side posts,
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
F0, F1 = -0.044, 0.018                 # the body's rear and front (62 mm: a rifle sight's length)
DT = WB - 2.2 * mm                     # the deck's top (in front of the housing, under the hood)
HT = WB - 0.6 * mm                     # the housing's top: under the window's bottom
LEAN = math.radians(C.get('lean', 10))

# ---- the BODY: one casting from the rail clamp up: the ELECTRONICS HOUSING over the rear two thirds (the board, the LED's driver, the
# battery), the deck in front of it carrying the hood. A rifle sight's mount is its body: nothing sits on a separate riser ----
HF = F0 + 0.034                        # the housing's front face (the LED looks forward out of it, low, at the lens)
MID = DT - 3.5 * mm                    # (the side controls' height)
prof = [(F0, 0.0), (F1, 0.0), (F1, 3.0 * mm), (F1 - 2.0 * mm, DT - 1.0 * mm), (F1 - 3.0 * mm, DT), (HF + 1.5 * mm, DT), (HF, DT + 1.0 * mm), (HF - 1.0 * mm, HT),
        (F0 + 6.0 * mm, HT), (F0, HT - 5.0 * mm)]
dk = K.tmp(prism(prof, 'x', -DW, DW))
cut(dk, box(-0.0108, 0.0108, -0.1, 0.1, -0.001, 0.0015))                                    # (the rail's top in the clamp's channel)
cut(dk, box(-0.03, 0.03, F0 + 8 * mm, F1 - 8 * mm, -0.001, 2.2 * mm))                         # (relief between the clamp's jaws)
# the housing's cover seam: a fine groove round its sides and back, a third of the way down
g = K.tmp(box(-DW - 1 * mm, DW + 1 * mm, F0 - 1 * mm, HF - 2 * mm, HT - 4.6 * mm, HT - 4.0 * mm)); cut(g, box(-DW + 0.4 * mm, DW - 0.4 * mm, F0 + 0.4 * mm, HF, HT - 5 * mm, HT - 3.6 * mm))
cut(dk, g.data.copy()); bpy.data.objects.remove(g, do_unlink=True)
EMU = DT + 0.9 * mm                    # the emitter's port: on the housing's face, just over the deck
cut(dk, cyl(1.2 * mm, HF - 1.5 * mm, HF + 0.5 * mm, 'y', (0, EMU), 16))
cut(dk, box(-1.2 * mm, 1.2 * mm, F0 - 1 * mm, F0 + 7 * mm, HT - 0.9 * mm, HT + 1 * mm))   # a notch in the housing's top (a rear-sight index)
bevel(dk, 0.7 * mm, 1, 30); smooth(dk); K.adopt(dk, 'optic', 'black')
o = K.obj(cyl(0.8 * mm, HF - 1.2 * mm, HF - 0.8 * mm, 'y', (0, EMU), 12), 'optic', 'glass'); smooth(o)
# the QD lever (right) along the clamp, or a cross-bolt
QF = (F0 + F1) / 2
if C.get('qd'):
    lv = K.tmp(prism([(QF - 0.016, 0.0015), (QF + 0.012, 0.0015), (QF + 0.014, 0.0065), (QF - 0.012, 0.0075)], 'x', DW - 0.2 * mm, DW + 2.6 * mm)); bevel(lv, 0.6 * mm, 1, 30); smooth(lv); K.adopt(lv, 'optic', 'black')
    o = K.obj(cyl(2.4 * mm, DW + 2.6 * mm, DW + 3.4 * mm, 'x', (QF - 0.010, 0.0045), 12), 'optic', 'steel'); smooth(o)
else:
    for s_ in (-1, 1): o = K.obj(cyl(2.6 * mm, min(s_ * (DW - 0.2 * mm), s_ * (DW + 1.2 * mm)), max(s_ * (DW - 0.2 * mm), s_ * (DW + 1.2 * mm)), 'x', (QF, 0.005), 6 if s_ < 0 else 12), 'optic', 'steel'); smooth(o)

# ---- the BATTERY ----
BAT = C.get('battery', 'aaa')
if BAT == 'aaa':     # an AAA in a tube along the housing's right side (half let into it), a knurled cap at the back
    BX, BZ, BR = DW - 0.5 * mm, MID - 1.5 * mm, 6.2 * mm
    o = K.tmp(cyl(BR, F0 + 2.0 * mm, HF - 1.0 * mm, 'y', (BX, BZ), 20)); bevel(o, 0.6 * mm, 1, 30); smooth(o); K.adopt(o, 'optic', 'black')
    o = K.tmp(cyl(BR + 0.3 * mm, F0 - 4.0 * mm, F0 + 2.2 * mm, 'y', (BX, BZ), 20))
    for i in range(12):
        gg = box(-0.6 * mm, 0.6 * mm, F0 - 5 * mm, F0 + 2.5 * mm, BR - 0.2 * mm, BR + 1 * mm); gg.transform(Matrix.Translation((BX, 0, BZ)) @ Matrix.Rotation(i * math.pi / 6, 4, 'Y')); cut(o, gg)
    smooth(o); K.adopt(o, 'optic', 'rubber')
elif BAT == 'coin_top':   # a CR2032 under a knurled cap let into the housing's top
    CF, CR = F0 + 13.0 * mm, 9.0 * mm
    o = K.tmp(cyl(CR, HT - 0.8 * mm, HT + 0.35 * mm, 'z', (0, CF), 24))
    for i in range(16):
        gg = box(-0.5 * mm, 0.5 * mm, CR - 0.5 * mm, CR + 1 * mm, HT - 1 * mm, HT + 1 * mm); gg.transform(Matrix.Translation((0, CF, 0)) @ Matrix.Rotation(i * math.pi / 8, 4, 'Z')); cut(o, gg)
    cut(o, box(-4 * mm, 4 * mm, CF - 0.5 * mm, CF + 0.5 * mm, HT, HT + 1 * mm))                   # its coin slot
    smooth(o); K.adopt(o, 'optic', 'black')
elif BAT == 'tray':   # a CR2032 in a side tray on the right: a round-ended plate, two captive screws
    TF0, TF1, TZ0, TZ1 = F0 + 4 * mm, F0 + 30 * mm, 8.6 * mm, HT - 1.6 * mm   # (above the QD lever)
    o = K.tmp(prism(rounded((TF0 + TF1) / 2, (TZ0 + TZ1) / 2, (TF1 - TF0) / 2, (TZ1 - TZ0) / 2, (TZ1 - TZ0) / 2 - 0.5 * mm, 4), 'x', DW - 0.2 * mm, DW + 1.6 * mm))
    bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
    for f in (TF0 + 3.5 * mm, TF1 - 3.5 * mm): o = K.obj(cyl(1.1 * mm, DW + 1.5 * mm, DW + 1.9 * mm, 'x', (f, (TZ0 + TZ1) / 2), 10), 'optic', 'steel'); smooth(o)

# the adjusters (steel screw heads, flush): elevation on the housing's top, windage on its right (left beside an AAA tube); buttons on the left
AF = HF - 5.5 * mm if BAT == 'coin_top' else F0 + 9 * mm
el = K.obj(cyl(2.4 * mm, HT - 0.8 * mm, HT + 0.2 * mm, 'z', (4.5 * mm if BAT != 'coin_top' else 0.0, AF), 16), 'optic', 'steel')
cut(el, box((4.5 * mm if BAT != 'coin_top' else 0.0) - 3 * mm, (4.5 * mm if BAT != 'coin_top' else 0.0) + 3 * mm, AF - 0.35 * mm, AF + 0.35 * mm, HT - 0.3 * mm, HT + 1 * mm)); smooth(el)
WS = -1 if BAT == 'aaa' else 1                    # the windage screw's side
WF_ = HF - 6 * mm
x0, x1 = sorted((WS * (DW - 0.6 * mm), WS * (DW + 0.3 * mm)))
wd = K.obj(cyl(2.0 * mm, x0, x1, 'x', (WF_, MID + 1 * mm), 16), 'optic', 'steel'); smooth(wd)
for f in (F0 + 7 * mm, F0 + 13 * mm):
    o = K.tmp(prism(rounded(f, MID + 1 * mm, 2.4 * mm, 1.8 * mm, 0.8 * mm, 2), 'x', -DW - 0.8 * mm, -DW + 0.4 * mm)); smooth(o); K.adopt(o, 'optic', 'rubber')

# ---- the hoop: a thin loop round the window, standing on the deck's front, leaning back; the lens in it ----
HD = 4.5 * mm                          # its depth
HFR = F1 - 0.6 * mm                    # its front face at the deck
top = SY + WH / 2 + (4.5 * mm if C.get('solar') else 2.0 * mm)   # (a solar hood: a deeper top bar carries the panel)
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
if C.get('solar'):   # the solar panel on the hood's top bar
    o = K.obj(box(-WW / 2 + 1.5 * mm, WW / 2 - 1.5 * mm, HFR - HD + 0.6 * mm, HFR - 0.6 * mm, top - 0.15 * mm, top + 0.25 * mm), 'optic', 'glass')
    for v in o.data.vertices: v.co.y -= max(0.0, v.co.z - DT) * math.tan(LEAN)
if C.get('wings'):   # protective wings: a plate outside each side of the hood, flaring out toward the front
    for s_ in (-1, 1):
        x0, x1 = sorted((s_ * (DW - 0.3 * mm), s_ * (DW + 1.6 * mm)))
        o = K.tmp(box(x0, x1, HFR - HD - 3 * mm, HFR + 5 * mm, DT - 0.5 * mm, top - 1.0 * mm))
        for v in o.data.vertices:
            v.co.x += s_ * max(0.0, v.co.y - (HFR - HD)) * math.tan(math.radians(14))
            v.co.y -= max(0.0, v.co.z - DT) * math.tan(LEAN)
        bevel(o, 0.5 * mm, 1, 30); smooth(o); K.adopt(o, 'optic', 'black')
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
