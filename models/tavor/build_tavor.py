# The TX-9 Tavor: an IWI TAR-21 (the original 5.56 bullpup) on STANAG magazines, in Blender.
#   Blender: exec(open(r'<repo>/models/tavor/build_tavor.py').read(), {'GUN_DIR': r'<repo>/models/tavor'})
#   or:      blender -b -P models/tavor/build_tavor.py
# Reference: "IWI-Tavor-TAR-21w1.jpg" on Wikimedia Commons (MathKnight, CC BY 3.0; 3104 x 1256 px, a level studio shot of the LEFT side on white,
# muzzle to the left, an olive TAR-21 with an EOTech on its rail and a 30-round aluminium STANAG magazine). One scale: 720 mm overall (the
# published figure; muzzle tip at photo x 178, butt plate at x 3048), 0.2509 mm a pixel; the bore on photo y 518.5 (the barrel's edges 485.5
# and 551.5). The outlines below are that photograph's pixels (the shell's, the grip's, the butt pad's from its silhouette traced off the
# white; the controls from crops of it). The EOTech in the photo is not modelled: the game's optics sit on the rail under it.
# The variant: the TAR-21 (not the X95 or the CTAR): a 5.56 NATO rifle on STANAG magazines with a long barrel, the left-side charging handle in a
# long channel, the selector either side. The photo is the left side; the right side is not photographed, so its ejection port (open) and its
# controls are the left's mirrored where the gun has them on both sides; the left has the ejection-port blank (a black panel).
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the butt's back face (photo x 3048) on the bore line (photo y 518.5).
import bpy, json, math, os
from mathutils import Matrix
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
ID = 'tavor'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
S = 0.720 / (3048 - 178)                      # metres a pixel
def F(x): return (3048 - x) * S
def U(y): return (518.5 - y) * S
def PL(pts): return [(F(x), U(y)) for x, y in pts]
def wnorm(o, deg=30):
    smooth(o, deg)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    _apply(o, md); return o
def xs(a, b): return tuple(sorted((a, b)))

# ---- the STANAG magazine, the sights and the muzzle: the Mk18's (models/ar_kit.py), borrowed by running the AR builder into a scratch collection
ag = {'GUN_DIR': os.path.join(MODELS, '_tavor_scratch'), 'CFG': {}}
os.environ['GUN_EXPORT'] = '0'
exec(open(os.path.join(MODELS, 'ar_kit.py'), encoding='utf-8').read(), ag)
os.environ['GUN_EXPORT'] = '1' if EXPORT else '0'
scratch = ag['coll']
for o in list(scratch.all_objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.collections.remove(scratch)

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID
SH = 'od'                                    # the shell (the olive polymer of the photo)

# ===================================================================================== plan and sizes
def HW(f):
    """The shell's half width at f (the plan: 60 mm across at the butt, 62 behind the handguard, narrowing to 52 round the handle's channel)."""
    pts = [(0.0, 30.0), (0.12, 31.0), (0.40, 31.0), (0.446, 26.0), (0.60, 26.0)]
    for (a, wa), (b, wb) in zip(pts, pts[1:]):
        if a <= f <= b: return (wa + (wb - wa) * (f - a) / (b - a)) * mm
    return pts[-1][1] * mm
PLAN = [(-30 * mm, -0.01), (-31 * mm, 0.12), (-31 * mm, 0.40), (-26 * mm, 0.446), (-26 * mm, 0.62),
        (26 * mm, 0.62), (26 * mm, 0.446), (31 * mm, 0.40), (31 * mm, 0.12), (30 * mm, -0.01)]

def slot_pts(cx, cy, ln, wd, ang, n=8):
    """The same, built from the hull of two circles (points in order round it)."""
    r = wd / 2; a = math.radians(ang); d = ln / 2 - r
    ex, ey = math.sin(a), -math.cos(a)
    top = (cx + ex * d, cy + ey * d); bot = (cx - ex * d, cy - ey * d)
    pts = []
    base = math.atan2(ey, ex)                               # (the axis direction: toward the top)
    for i in range(n + 1): th = base - math.pi / 2 + math.pi * i / n; pts.append((top[0] + r * math.cos(th), top[1] + r * math.sin(th)))
    for i in range(n + 1): th = base + math.pi / 2 + math.pi * i / n; pts.append((bot[0] + r * math.cos(th), bot[1] + r * math.sin(th)))
    return pts

# ===================================================================================== the shell (base)
SHELL = [[675, 445], [684, 425], [702, 402], [725, 380], [736, 364], [2205, 364], [2210, 292], [2805, 282], [2930, 284], [2954, 294], [3040, 413], [3046, 417], [3048, 455],
         [3032, 531], [3032, 545], [3028, 555], [2976, 866], [2891, 883], [2840, 881], [2835, 886], [2818, 886], [2746, 859], [2620, 719], [2612, 728], [2580, 745],
         [2556, 764], [2540, 769], [2517, 756], [2511, 748], [2499, 741], [2457, 746], [2442, 753], [2424, 769], [2418, 769], [2391, 760], [2380, 773], [2124, 781],
         [2110, 777], [2090, 761], [2032, 642], [2017, 626], [1996, 614], [1986, 612], [1979, 620], [1950, 621], [1943, 608], [1932, 602], [1752, 603], [1722, 614],
         [1705, 628], [1696, 645], [1696, 657], [1708, 674], [1712, 700], [1540, 700], [1534, 691], [1523, 662], [1506, 650], [1379, 650], [1363, 653], [1348, 664],
         [1337, 678], [1328, 700], [1170, 704], [951, 695], [886, 700], [834, 694], [803, 694], [793, 699], [772, 723], [760, 724], [746, 716], [726, 687], [694, 605],
         [690, 587], [678, 572], [676, 551]]
MAG_TOP = (0.2003, -0.0235)                  # the magazine's top (centre front to back): the well's mouth is photo x 2124-2380, its centre 2252
MB, MF = -32.6 * mm, 31.6 * mm
sh = K.tmp(prism(PL(SHELL), 'x', -40 * mm, 40 * mm))
boolean(sh, prism(PLAN, 'z', U(1300), U(200)), 'INTERSECT')
tidy(sh, 0.1 * mm, False); bevel(sh, 3.0 * mm, 1, 30)               # (chamfer the body once, THEN the cuts: modeling-practices rule 1)
# the magazine well: a pocket up into the shell round the magazine
cut(sh, box(-12.4 * mm, 12.4 * mm, MAG_TOP[0] + MB - 1.0 * mm, MAG_TOP[0] + MF + 1.0 * mm, U(1250), MAG_TOP[1] + 2 * mm))
# the ejection port (right): open, a pocket down past the bore
PORT = (F(2480), F(2150), U(545), U(478))
def port_cutter(pa, pb, pu0, pu1, x_in, x_out, flare=0.7 * mm):
    c, m = (pa + pb) / 2, (pu0 + pu1) / 2; hw_, hh_ = (pb - pa) / 2, (pu1 - pu0) / 2; r_ = 2.0 * mm; cs = corner_segs(r_)
    xm = x_out - 2.5 * mm
    a = prism(rounded(c, m, hw_, hh_, r_, cs), 'x', x_in, xm)
    b = loft(rounded(c, m, hw_, hh_, r_, cs), rounded(c, m, hw_ + flare, hh_ + flare, r_ + flare, cs), 'x', xm - 0.01, x_out)
    return a, b
for pc_ in port_cutter(*PORT, -2.0 * mm, 33 * mm): cut(sh, pc_)
# the left side: the long channel the charging handle runs in (a slot 11 mm tall along the upper half, from the nose back to photo x 1262), the four slanted vents
# over the selector, the recessed pad with the bolt catch's button, the blank where the port would be; each pocket 3 to 10 mm deep with sloped walls
CH_SLOT = slot_pts(981, 458, 580, 38, 90, 8)                  # (a long stadium lying along the photo's x: ang 90 -> the axis horizontal)
hwc = 26.0 * mm
cut(sh, prism(PL(CH_SLOT), 'x', -hwc - 1 * mm, -hwc + 6.0 * mm))
for cx_ in (1448, 1542, 1642, 1742):
    cut(sh, prism(PL(slot_pts(cx_, 468, 92, 40, 17, 8)), 'x', -31 * mm - 1 * mm, -31 * mm + 9.0 * mm))
# the bolt catch's pad (recessed 0.8 mm), both sides
BC_PAD = [[1890, 424], [2036, 424], [2044, 436], [2044, 462], [2036, 472], [1890, 472], [1882, 462], [1882, 436]]
for sx in (-1, 1): cut(sh, prism(PL(BC_PAD), 'x', *xs(sx * (31 * mm - 0.8 * mm), sx * (31 * mm + 1 * mm))))
# the blank where the left port would be: a dark panel set 1.5 mm in
BLANK = [[2148, 484], [2488, 484], [2492, 490], [2492, 540], [2488, 546], [2148, 546], [2144, 540], [2144, 490]]
cut(sh, prism(PL(BLANK), 'x', -31 * mm - 1 * mm, -31 * mm + 1.5 * mm))
# the handguard's lower pad (the raised, rounded panel the support hand takes): a shallow step on each side, 0.8 mm
PAD = [[740, 545], [1290, 545], [1296, 560], [1290, 690], [1260, 698], [770, 698], [748, 690], [726, 640], [722, 580], [726, 556]]
tidy(sh, 1e-6, True)
wnorm(sh); K.adopt(sh, 'base', SH)
# what shows in the port, and the bolt carrier (part_carrier)
port_inside(K, *PORT, 31 * mm, mouth_r=5.6 * mm, ramp=26 * mm, az=(PORT[2] + PORT[3]) / 2)
CARRIER = port_carrier(K, *PORT, 31 * mm, ax=0.0, az=(PORT[2] + PORT[3]) / 2)
# the dark floors of the openings
def dark(poly_px, x_lo, x_hi):
    o = K.tmp(prism(PL(poly_px), 'x', x_lo, x_hi)); smooth(o); K.adopt(o, 'base', 'black'); return o
dark(CH_SLOT, -hwc + 5.4 * mm, -hwc + 6.2 * mm)
for cx_ in (1448, 1542, 1642, 1742): dark(slot_pts(cx_, 468, 92, 40, 17, 8), -31 * mm + 8.4 * mm, -31 * mm + 9.2 * mm)
dark(BLANK, -31 * mm + 1.2 * mm, -31 * mm + 1.8 * mm)
# the raised pad's outline as a thin black-edged step is skipped: a plate 0.6 mm proud, the same olive
for sx in (-1, 1):
    pp = K.tmp(prism(PL(PAD), 'x', *xs(sx * (26 * mm - 0.2 * mm), sx * (26 * mm + 0.7 * mm)))); bevel(pp, 0.3 * mm, 1); smooth(pp); K.adopt(pp, 'base', SH)
# the butt pad: a little proud of the shell all round its back
BUTT = [[2930, 284], [2954, 294], [3040, 413], [3046, 417], [3048, 455], [3032, 531], [3032, 545], [3028, 555], [2976, 866], [2891, 883], [2900, 830], [2915, 650],
        [2930, 500], [2925, 380], [2905, 318]]
o = K.tmp(prism(PL(BUTT), 'x', -30.8 * mm, 30.8 * mm)); tidy(o, 0.1 * mm, False); bevel(o, 2.0 * mm, 1, 30); wnorm(o); K.adopt(o, 'base', 'rubber')
# the sling socket on the butt (a round with its ring), the pins
for sx in (-1, 1):
    o = K.obj(cyl(5.6 * mm, *xs(sx * 29.5 * mm, sx * 31.4 * mm), 'x', (F(2775), U(640)), 14), 'base', 'steel'); smooth(o)
    o = K.obj(cyl(3.6 * mm, *xs(sx * 30.5 * mm, sx * 31.7 * mm), 'x', (F(2775), U(640)), 12), 'base', 'black'); smooth(o)
# the mag catch (a steel lever plate with its spring pin, left and right) and the selector (a hub with its lever, through the shell)
for sx in (-1, 1):
    o = K.tmp(prism(PL([[2208, 648], [2350, 648], [2354, 654], [2354, 686], [2350, 690], [2208, 690], [2204, 684], [2204, 654]]), 'x', *xs(sx * 30.3 * mm, sx * 32.3 * mm)))
    bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
    o = K.obj(cyl(1.0 * mm, *xs(sx * 30.0 * mm, sx * 33.2 * mm), 'x', (F(2330), U(660)), 8), 'base', 'black'); smooth(o)
    o = K.obj(cyl(5.5 * mm, *xs(sx * 30.5 * mm, sx * 32.5 * mm), 'x', (F(1960), U(446)), 14), 'base', 'steel'); smooth(o)     # (the bolt catch's button)
SEL = (F(1604), U(636))
o = K.obj(cyl(2.2 * mm, -33 * mm, 33 * mm, 'x', SEL, 10), 'base', 'steel'); smooth(o)
for sx in (-1, 1):
    o = K.obj(cyl(5.6 * mm, *xs(sx * 30.0 * mm, sx * 33.2 * mm), 'x', SEL, 16), 'base', 'black'); smooth(o)
    lv = K.tmp(prism([(SEL[0] - 1.6 * mm, SEL[1]), (SEL[0] + 1.6 * mm, SEL[1]), (SEL[0] + 1.4 * mm, SEL[1] - 18 * mm), (SEL[0] - 1.4 * mm, SEL[1] - 18 * mm)], 'x', *xs(sx * 33.0 * mm, sx * 36.0 * mm)))
    bevel(lv, 0.4 * mm, 1); smooth(lv); K.adopt(lv, 'base', 'black')
# the trigger, in the window
TRIG = [[1409, 650], [1438, 681], [1438, 701], [1433, 714], [1421, 729], [1419, 738], [1412, 740], [1409, 745], [1414, 756], [1421, 756], [1443, 744], [1463, 724],
        [1474, 704], [1475, 661], [1450, 650]]
o = K.tmp(prism(PL(TRIG), 'x', -3.5 * mm, 3.5 * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')

# ===================================================================================== the top rail and the barrel's nose
RA, RB = F(2190), F(750)
RAIL_U = U(364)
picatinny(K, RA, RB, RAIL_U, 'base', 'black', lean=True)
RAIL_TOP = RAIL_U + 5.6 * mm
SY = RAIL_TOP + 19 * mm
# the side rails (the game's light mounts): short Picatinny stubs on the handguard's flanks, low, ahead of the pad's rear (not on the real TAR-21; the X95 has them)
L = F(676)                                                   # (the nose's front face: where the barrel comes out)
for s_, ax in ((1, 'right'), (-1, 'left')):
    picatinny(K, L - 0.100, L - 0.045, -6 * mm, 'base', 'black', axis=ax, x0=s_ * 26 * mm, lean=True)

# ===================================================================================== the barrel (barrel) and the flash hider (muzzle)
MZ0 = F(370)                                                 # (the flash hider's seat: photo x 370, the device is 48 mm long to the tip at 178)
COLLAR_R, COLLAR_BORE = 14.5 * mm, 12.3 * mm
cl = K.tmp(lathe([(L - 0.032, COLLAR_R), (L + 0.012, COLLAR_R), (L + 0.014, COLLAR_R - 1.5 * mm)], segs(COLLAR_R)))
cut(cl, cyl(COLLAR_BORE, L - 0.04, L + 0.03, 'y', (0, 0), segs(COLLAR_BORE, 0.3 * mm)))
tidy(cl); smooth(cl); K.adopt(cl, 'base', 'black')
BR = 8.3 * mm
o = K.obj(lathe([(0.222, BR), (L - 0.030, BR)], 12), 'barrel', 'park'); smooth(o)
o = K.obj(lathe([(L - 0.030, BR), (MZ0, BR)], segs(BR)), 'barrel', 'park'); smooth(o)
o = K.obj(lathe([(L + 0.004, 10.0 * mm), (L + 0.014, 10.0 * mm), (L + 0.017, BR)], segs(10 * mm)), 'barrel', 'black'); smooth(o)
def band(prof, seg):
    bm = bmesh.new(); rings = [[bm.verts.new((r * math.cos(2 * math.pi * i / seg), f, r * math.sin(2 * math.pi * i / seg))) for i in range(seg)] for f, r in prof]
    for A, B in zip(rings, rings[1:]):
        for i in range(seg): bm.faces.new((A[i], A[(i + 1) % seg], B[(i + 1) % seg], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me
f = F(482)                                                   # (the ring on the barrel at photo x 441-482: a front-sight base's clamp)
o = K.obj(band([(f, BR), (f + 0.6 * mm, 9.6 * mm), (f + 9.5 * mm, 9.6 * mm), (f + 10.2 * mm, BR)], 14), 'barrel', 'black'); smooth(o)
def flash_hider(mz0, ln=0.048, R=11.2 * mm):
    o = K.obj(lathe([(mz0 - 2 * mm, 9.6 * mm), (mz0, 9.6 * mm)], segs(9.6 * mm)), 'muzzle', 'steel'); smooth(o)
    fh = K.tmp(lathe([(mz0, 9.0 * mm), (mz0 + 3 * mm, R), (mz0 + ln - 3 * mm, R), (mz0 + ln, R - 1.0 * mm)], segs(R)))
    cut(fh, cyl(4.2 * mm, mz0 - 0.001, mz0 + ln + 0.001, 'y', (0, 0), 16))
    for a in range(-2, 3):                                   # (the five slots, as in the photo: the slot ring over the front half)
        g = box(-1.3 * mm, 1.3 * mm, mz0 + 0.018, mz0 + ln - 3 * mm, 4 * mm, 14 * mm); g.transform(Matrix.Rotation(a * math.radians(45), 4, 'Y')); cut(fh, g)
    smooth(fh); K.adopt(fh, 'muzzle', 'park')
    return mz0 + ln
MUZ = flash_hider(MZ0)

# ===================================================================================== the grip (grip): the loop under the shell, the pistol grip and the guard in one
GRIP = [[1170, 692], [1170, 707], [1212, 731], [1252, 769], [1366, 909], [1471, 1029], [1487, 1059], [1501, 1098], [1517, 1102], [1538, 1101], [1695, 1039], [1755, 1008],
        [1804, 978], [1818, 953], [1822, 912], [1814, 866], [1801, 833], [1767, 766], [1712, 692]]
WIN = [[1318, 680], [1318, 718], [1370, 782], [1379, 787], [1385, 800], [1415, 832], [1418, 841], [1452, 878], [1519, 963], [1555, 998], [1575, 998], [1656, 967], [1658, 959],
       [1664, 954], [1663, 948], [1578, 753], [1568, 741], [1534, 742], [1528, 736], [1528, 715], [1534, 680]]
gp = K.tmp(prism(PL(GRIP), 'x', -17 * mm, 17 * mm)); tidy(gp, 0.1 * mm, False); bevel(gp, 3.0 * mm, 1, 30)
cut(gp, prism(PL(WIN), 'x', -20 * mm, 20 * mm))
tidy(gp); wnorm(gp, 35); K.adopt(gp, 'grip', SH)

# ===================================================================================== the charging handle (part_handle): a lug on the LEFT of the shell, at the front
# of its channel (photo x 672-745, y 395-482), its rod running back in the channel; it is pulled back by the hand and does not reciprocate
H0 = (F(738), U(458))
ph = K.part('handle', (0, H0[0], H0[1]))
XH = -hwc                                                    # (the shell's side there)
head = K.tmp(prism(rounded(H0[0], H0[1], 9.5 * mm, 11.0 * mm, 4.0 * mm, 4), 'x', XH - 12.5 * mm, XH - 3.0 * mm)); bevel(head, 1.6 * mm, 2, 30); smooth(head); K.adopt(head, 'base', 'black', ph)
o = K.tmp(prism(rounded(H0[0], H0[1], 5.5 * mm, 6.5 * mm, 2.0 * mm, 4), 'x', XH - 4.0 * mm, XH + 0.5 * mm)); smooth(o); K.adopt(o, 'base', 'black', ph)   # (its neck, in the channel)
o = K.obj(cyl(2.0 * mm, H0[0] - 0.115, H0[0] - 0.004, 'y', (XH + 2.0 * mm, H0[1]), 8), 'base', 'steel', ph); smooth(o)                                          # (the rod in the channel)

# ===================================================================================== the sights (optic: the gun's own flip-up irons, on the rail)
ag['K'] = K; ag['RAIL_TOP'] = RAIL_TOP; ag['SY'] = SY; ag['RCV'] = 'black'
RS, FS = F(2125), F(790)
ag['rear_flip'](RS)
ag['front_flip'](FS, RAIL_TOP)
ag['fold_irons'](RS, FS)

# ===================================================================================== the magazine (part_mag): the Mk18's STANAG
ag['mag_stanag'](MAG_TOP)

# ===================================================================================== info and anchors
r4 = lambda v: round(v, 4)
GRIPF = (F(1715), U(850))
info = {
    'sy': r4(SY), 'fSight': r4(RS), 'relief': 0.07,
    'muzzles': [[r4(MUZ), 0, 0]],
    'grip': [r4(GRIPF[0]), r4(GRIPF[1]), 0], 'support': [0.50, -0.025, 0],
    'anim': {'mag': 'part_mag', 'handle': 'part_handle', 'carrier': 'part_carrier'},
    'carrier': {'travel': 0.090},
    'magAt': [r4(MAG_TOP[0]), r4(MAG_TOP[1])],
    'handle': {'f': r4(H0[0]), 'y': r4(H0[1]), 'x': r4(XH - 0.012), 'travel': 0.100, 'recip': False, 'style': 'knob', 'grab': [r4(H0[0] + 0.0055), r4(H0[1]), r4(XH - 0.014)]},
    'port': [r4((PORT[0] + PORT[1]) / 2), r4((PORT[2] + PORT[3]) / 2), 0.031],
    'chamberAt': {'side': 'port', 'f': r4(PORT[1] - 0.7 * mm - 0.72 * 0.042), 'y': r4((PORT[2] + PORT[3]) / 2 + 0.0048), 'x': 0.0},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [r4(MZ0), 0, 0]},
}
anchors = {
    'mount_optic': [r4(RA), r4(RAIL_U), 0], 'mount_optic_end': [r4(RB), r4(RAIL_U), 0],
    'mount_optic_rail': [r4(RA), r4(RAIL_TOP), 0], 'mount_optic_rail_end': [r4(RB), r4(RAIL_TOP), 0],
    'mount_handguard': [r4(L - 0.004), 0, 0], 'mount_handguard_end': [r4(L - 0.001), 0, 0],
    'mount_barrel': [r4(L), 0, 0], 'mount_muzzle': [r4(MZ0), 0, 0],
    'mount_stock': [0, r4(U(500)), 0],
    'mount_grip': [r4(F(1620)), r4(U(700)), 0],
    'mount_mag': [r4(MAG_TOP[0]), r4(MAG_TOP[1]), 0],
    'mount_tac': [r4(L - 0.0725), -0.006, 0.026],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
json.dump({'source': 'authored', 'sights': {'builtin': ['irons'], 'rail': [], 'railed': True}}, open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8'), indent=2)
for n, c in (('od', (0.30, 0.34, 0.20, 1)),):
    m = bpy.data.materials.get(n)
    if m: m.diffuse_color = c
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
