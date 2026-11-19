# The TX-9 Tavor: an IWI Tavor X95 (the 16.5 in. 5.56 rifle, flat-top) on STANAG magazines, in Blender.
#   Blender: exec(open(r'<repo>/models/tavor/build_tavor.py').read(), {'GUN_DIR': r'<repo>/models/tavor'})
#   or:      blender -b -P models/tavor/build_tavor.py
# Reference: "IDF Tavor X95 Flat-top - Independence Day 2019- IZE-129.jpg" on Wikimedia Commons (Zachi Evenor, CC BY-SA; 3840 x 2377 px, the LEFT side, muzzle to the
# left, an X95 stood on its foregrip and bipod with an optic on the rail, no magazine in it), turned 18.6 degrees to level its rail and bore, then traced at 0.3876 mm
# a pixel: 663.6 mm overall (the 16.5 in. rifle's published 26.125 in.; IWI US). The photo is a little three-quarter (it is not a studio side shot), so the outline
# has a few millimetres of slop; the outlines below are its pixels (x forward to the left from the butt at 1943, y down from the bore at 817), the controls are read
# off crops of it. The right side is not in the photo: its ejection port (open) and controls are the left's mirrored.
# What makes it the X95 rather than the TAR-21: the full-length flat Picatinny rail, the slimmer handguard block with its slots and its bottom rail, the conventional
# pistol grip with a closed trigger guard (no grip loop), the left charging handle forward in its long slot, the bolt release above the guard, the mag release behind the
# well, the squarer butt. Flip-up irons stand on the rail (front at its front end, rear at its back).
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the butt's back face on the bore line.
import bpy, json, math, os
from mathutils import Matrix
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
ID = 'tavor'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
S = 0.6636 / (1943 - 231)                     # metres a pixel
def F(x): return (1943 - x) * S
def U(y): return (817 - y) * S
def PL(pts): return [(F(x), U(y)) for x, y in pts]
def wnorm(o, deg=30):
    smooth(o, deg)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    _apply(o, md); return o
def xs(a, b): return tuple(sorted((a, b)))
def slot_pts(cx, cy, ln, wd, ang, n=8):
    """A stadium (a slot with round ends) in photo pixels: centre, length, width, `ang` degrees from vertical."""
    r = wd / 2; a = math.radians(ang); d = ln / 2 - r
    ex, ey = math.sin(a), -math.cos(a)
    top = (cx + ex * d, cy + ey * d); bot = (cx - ex * d, cy - ey * d); base = math.atan2(ey, ex); pts = []
    for i in range(n + 1): th = base - math.pi / 2 + math.pi * i / n; pts.append((top[0] + r * math.cos(th), top[1] + r * math.sin(th)))
    for i in range(n + 1): th = base + math.pi / 2 + math.pi * i / n; pts.append((bot[0] + r * math.cos(th), bot[1] + r * math.sin(th)))
    return pts
def circ(cx, cy, r, n=18): return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]

# ---- the STANAG magazine, the sights: the Mk18's (models/ar_kit.py), borrowed by running the AR builder into a scratch collection
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
SH = 'polymer'                               # the X95's black polymer

# ===================================================================================== plan
HWG = 27.0 * mm                              # the handguard and handle channel's half width
PLAN = [(-30 * mm, -0.01), (-31 * mm, 0.12), (-31 * mm, 0.36), (-HWG, 0.40), (-HWG, 0.62), (HWG, 0.62), (HWG, 0.40), (31 * mm, 0.36), (31 * mm, 0.12), (30 * mm, -0.01)]
def dark(poly_px, x_lo, x_hi):
    o = K.tmp(prism(PL(poly_px), 'x', x_lo, x_hi)); smooth(o); K.adopt(o, 'base', 'black'); return o

# ===================================================================================== the shell (base)
SHELL = [[506, 876], [506, 764], [520, 725], [540, 692], [562, 680], [1437, 680], [1440, 684], [1930, 684], [1945, 700], [1945, 880], [1925, 960], [1897, 1010],
         [1587, 1013], [1587, 1027], [1507, 1027], [1507, 968], [1330, 968], [1215, 945], [1200, 935], [1090, 932], [1060, 915], [1020, 895], [850, 893], [830, 885]]
MAG_TOP = (0.2079, -0.0186)                  # the well's mouth is photo x 1330-1500 (its middle 1407), y 968
MB, MF = -32.6 * mm, 31.6 * mm
sh = K.tmp(prism(PL(SHELL), 'x', -40 * mm, 40 * mm))
boolean(sh, prism(PLAN, 'z', U(1300), U(500)), 'INTERSECT')
tidy(sh, 0.1 * mm, False); bevel(sh, 3.0 * mm, 1, 30)               # (chamfer the body once, THEN the cuts)
cut(sh, box(-12.4 * mm, 12.4 * mm, MAG_TOP[0] + MB - 1.0 * mm, MAG_TOP[0] + MF + 1.0 * mm, U(1250), MAG_TOP[1] + 2 * mm))
PORT = (F(1607), F(1377), U(840), U(787))                           # (the right side's ejection port: the left shows its blank cover at the same place)
def port_cutter(pa, pb, pu0, pu1, x_in, x_out, flare=0.7 * mm):
    c, m = (pa + pb) / 2, (pu0 + pu1) / 2; hw_, hh_ = (pb - pa) / 2, (pu1 - pu0) / 2; r_ = 2.0 * mm; cs = corner_segs(r_)
    xm = x_out - 2.5 * mm
    a = prism(rounded(c, m, hw_, hh_, r_, cs), 'x', x_in, xm)
    b = loft(rounded(c, m, hw_, hh_, r_, cs), rounded(c, m, hw_ + flare, hh_ + flare, r_ + flare, cs), 'x', xm - 0.01, x_out)
    return a, b
for pc_ in port_cutter(*PORT, -2.0 * mm, 33 * mm): cut(sh, pc_)
# ---- the left side's openings: each a pocket with walls and a floor
hwc = HWG
cut(sh, prism(PL(slot_pts(942, 781, 372, 22, 90, 8)), 'x', -hwc - 1 * mm, -hwc + 12.0 * mm))      # (the long channel the charging handle runs in: photo x 756-1128)
BLANK = [[1377, 790], [1603, 790], [1607, 796], [1607, 834], [1603, 840], [1377, 840], [1373, 834], [1373, 796]]
cut(sh, prism(PL(BLANK), 'x', -31 * mm - 1 * mm, -31 * mm + 9.0 * mm))                           # (the blank where the left port would be, a deep pocket)
HOLEPLATE = [[1613, 784], [1695, 784], [1699, 790], [1699, 834], [1695, 840], [1613, 840], [1609, 834], [1609, 790]]
cut(sh, prism(PL(HOLEPLATE), 'x', -31 * mm - 1 * mm, -31 * mm + 1.5 * mm))
HOLES = [(1627, 813), (1646, 814), (1670, 815)]
for hx, hy in HOLES: cut(sh, cyl(1.8 * mm, -31 * mm - 1 * mm, -31 * mm + 6.0 * mm, 'x', (F(hx), U(hy)), 10))
for sx in (-1, 1):                                                                                # (the bolt catch's, the mag release's, the plug's wells, both sides)
    cut(sh, prism(PL([[1493, 905], [1633, 905], [1637, 910], [1637, 930], [1633, 935], [1493, 935], [1489, 930], [1489, 910]]), 'x', *xs(sx * (31 * mm - 1.0 * mm), sx * (31 * mm + 1 * mm))))
    cut(sh, prism(PL(circ(1273, 792, 38)), 'x', *xs(sx * (31 * mm - 6.0 * mm), sx * (31 * mm + 1 * mm))))
    cut(sh, prism(PL(circ(1083, 877, 30)), 'x', *xs(sx * (31 * mm - 3.0 * mm), sx * (31 * mm + 1 * mm))))
# the handguard's slots (left and right: vertical ventilation slots in its lower block, short ones under them, four long ones along its top housing), the round cap
for hx in (559, 594, 631, 666, 700):
    cut(sh, prism(PL(slot_pts(hx, 808, 40, 11, -10, 6)), 'x', -HWG - 1 * mm, -HWG + 10.0 * mm)); cut(sh, prism(PL(slot_pts(hx, 808, 40, 11, -10, 6)), 'x', HWG - 10.0 * mm, HWG + 1 * mm))
for hx in (631, 659, 694): cut(sh, prism(PL(slot_pts(hx, 853, 18, 10, 0, 6)), 'x', -HWG - 1 * mm, -HWG + 10.0 * mm))
for hx in (612, 678, 742, 790):
    for sx in (-1, 1): cut(sh, prism(PL(slot_pts(hx, 737, 50 if hx < 700 else 30, 11, 90, 6)), 'x', *xs(sx * (HWG - 8.0 * mm), sx * (HWG + 1 * mm))))
cut(sh, prism(PL(circ(581, 854, 21)), 'x', -HWG - 1 * mm, -HWG + 4.0 * mm))
tidy(sh, 1e-6, True)
wnorm(sh); K.adopt(sh, 'base', SH)
port_inside(K, *PORT, 31 * mm, mouth_r=5.6 * mm, ramp=26 * mm, az=(PORT[2] + PORT[3]) / 2)
CARRIER = port_carrier(K, *PORT, 31 * mm, ax=0.0, az=(PORT[2] + PORT[3]) / 2)
# their floors
dark(slot_pts(942, 781, 372, 22, 90, 8), -hwc + 11.4 * mm, -hwc + 12.2 * mm)
dark(BLANK, -31 * mm + 8.4 * mm, -31 * mm + 9.0 * mm)
dark(HOLEPLATE, -31 * mm + 1.0 * mm, -31 * mm + 1.5 * mm)
for hx, hy in HOLES: o = K.obj(cyl(1.8 * mm, -31 * mm + 5.2 * mm, -31 * mm + 6.0 * mm, 'x', (F(hx), U(hy)), 10), 'base', 'black'); smooth(o)
for hx in (559, 594, 631, 666, 700):
    dark(slot_pts(hx, 808, 40, 11, -10, 6), -HWG + 9.4 * mm, -HWG + 10.2 * mm); dark(slot_pts(hx, 808, 40, 11, -10, 6), HWG - 10.2 * mm, HWG - 9.4 * mm)
for hx in (631, 659, 694): dark(slot_pts(hx, 853, 18, 10, 0, 6), -HWG + 9.4 * mm, -HWG + 10.2 * mm)
for hx in (612, 678, 742, 790):
    for sx in (-1, 1): dark(slot_pts(hx, 737, 50 if hx < 700 else 30, 11, 90, 6), *xs(sx * (HWG - 8.0 * mm), sx * (HWG - 7.2 * mm)))
o = K.obj(cyl(21 * S, -HWG + 3.4 * mm, -HWG + 4.0 * mm, 'x', (F(581), U(854)), 20), 'base', 'black'); smooth(o)
# the controls: bolt catch's and mag release's plates (steel), the plug's steel cap, the selector (a hub with its lever through the shell), the butt pins
for sx in (-1, 1):
    o = K.tmp(prism(PL([[1500, 909], [1625, 909], [1629, 914], [1629, 926], [1625, 931], [1500, 931], [1496, 926], [1496, 914]]), 'x', *xs(sx * 30.0 * mm, sx * 32.0 * mm))); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
    o = K.obj(cyl(10 * S, *xs(sx * (31 * mm - 5.0 * mm), sx * (31 * mm - 1.0 * mm)), 'x', (F(1273), U(792)), 16), 'base', 'steel'); smooth(o)
    o = K.tmp(prism(PL([[909, 862], [946, 862], [958, 880], [950, 904], [920, 906], [909, 890]]), 'x', *xs(sx * 30.0 * mm, sx * 33.0 * mm))); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')   # (the bolt release's paddle)
    SEL = (F(1083), U(877))
    o = K.obj(cyl(5.4 * mm, *xs(sx * 28.0 * mm, sx * 32.5 * mm), 'x', SEL, 16), 'base', 'black'); smooth(o)
    lv = K.tmp(prism([(SEL[0] - 1.6 * mm, SEL[1] - 1.6 * mm), (SEL[0] - 18 * mm, SEL[1] - 1.4 * mm), (SEL[0] - 18 * mm, SEL[1] + 1.4 * mm), (SEL[0] - 1.6 * mm, SEL[1] + 1.6 * mm)], 'x', *xs(sx * 32.0 * mm, sx * 35.0 * mm)))
    bevel(lv, 0.4 * mm, 1); smooth(lv); K.adopt(lv, 'base', 'black')
    for px, py in ((1887, 772), (1840, 960)):
        o = K.obj(cyl(5.0 * mm, *xs(sx * 30.0 * mm, sx * 31.8 * mm), 'x', (F(px), U(py)), 14), 'base', 'black'); smooth(o)
o = K.obj(cyl(2.2 * mm, -33 * mm, 33 * mm, 'x', SEL, 10), 'base', 'steel'); smooth(o)
# the ejection deflector (right): a small wedge on the port's rear edge
o = K.tmp(prism([(PORT[0] - 4 * mm, PORT[3] - 6 * mm), (PORT[0] + 12 * mm, PORT[3] - 3 * mm), (PORT[0] + 12 * mm, PORT[3] + 2 * mm), (PORT[0] - 4 * mm, PORT[3] + 3 * mm)], 'x', 30.5 * mm, 33.5 * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')
# the butt pad
BUTT = [[1908, 686], [1930, 686], [1945, 700], [1945, 880], [1925, 960], [1897, 1010], [1884, 1010], [1900, 900], [1905, 700]]
o = K.tmp(prism(PL(BUTT), 'x', -30.8 * mm, 30.8 * mm)); tidy(o, 0.1 * mm, False); bevel(o, 2.0 * mm, 1, 30); wnorm(o); K.adopt(o, 'base', 'rubber')
# the trigger and its closed guard (a conventional one)
TRIG = [[975, 915], [992, 915], [1008, 960], [998, 970], [984, 955]]
o = K.tmp(prism(PL(TRIG), 'x', -3.5 * mm, 3.5 * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')
GUARD = [[868, 892], [890, 892], [905, 965], [940, 1000], [1010, 1005], [1072, 975], [1090, 932], [1112, 932], [1098, 990], [1050, 1030], [935, 1032], [885, 990], [870, 930]]
o = K.tmp(prism(PL(GUARD), 'x', -4.5 * mm, 4.5 * mm)); tidy(o, 0.1 * mm, False); bevel(o, 1.2 * mm, 1, 30); smooth(o); K.adopt(o, 'base', SH)

# ===================================================================================== the top rail, the handguard's bottom and side rails
RA, RB = F(1440), F(562)
RAIL_U = U(680)
picatinny(K, RA, RB, RAIL_U, 'base', 'black', lean=True)
RAIL_TOP = RAIL_U + 5.6 * mm
SY = RAIL_TOP + 17 * mm                                          # (the flip-up irons: about 17 mm of sight over the rail)
L = F(506)                                                        # (the handguard's front face: where the barrel comes out)
picatinny(K, F(838), F(525), U(880), 'base', 'black', axis='bottom', lean=True)       # (its bottom rail)
for s_, ax in ((1, 'right'), (-1, 'left')):
    picatinny(K, L - 0.100, L - 0.045, -6 * mm, 'base', 'black', axis=ax, x0=s_ * HWG, lean=True)    # (the side rail sections, three and nine o'clock)

# ===================================================================================== the barrel (barrel) and the flash hider (muzzle)
MZ0 = F(375)
COLLAR_R, COLLAR_BORE = 13.5 * mm, 12.3 * mm
cl = K.tmp(lathe([(L - 0.032, COLLAR_R), (L + 0.008, COLLAR_R), (L + 0.010, COLLAR_R - 1.5 * mm)], segs(COLLAR_R)))
cut(cl, cyl(COLLAR_BORE, L - 0.04, L + 0.03, 'y', (0, 0), segs(COLLAR_BORE, 0.3 * mm)))
tidy(cl); smooth(cl); K.adopt(cl, 'base', 'black')
BR = 7.4 * mm
o = K.obj(lathe([(0.222, BR), (L - 0.030, BR)], 12), 'barrel', 'park'); smooth(o)
o = K.obj(lathe([(L - 0.030, BR), (MZ0, BR)], segs(BR)), 'barrel', 'park'); smooth(o)
o = K.obj(lathe([(L + 0.003, 9.0 * mm), (L + 0.010, 9.0 * mm), (L + 0.013, BR)], segs(9 * mm)), 'barrel', 'black'); smooth(o)
def flash_hider(mz0, ln=0.0558, R=11.4 * mm):
    o = K.obj(lathe([(mz0 - 2 * mm, 9.6 * mm), (mz0, 9.6 * mm)], segs(9.6 * mm)), 'muzzle', 'steel'); smooth(o)
    fh = K.tmp(lathe([(mz0, 9.0 * mm), (mz0 + 3 * mm, 9.8 * mm), (mz0 + 14 * mm, 9.8 * mm), (mz0 + 15 * mm, R), (mz0 + 20 * mm, R), (mz0 + 21 * mm, 9.8 * mm), (mz0 + 25 * mm, 9.8 * mm),
                              (mz0 + 26 * mm, R), (mz0 + ln - 3 * mm, R), (mz0 + ln, R - 1.0 * mm)], segs(R)))
    cut(fh, cyl(4.2 * mm, mz0 - 0.001, mz0 + ln + 0.001, 'y', (0, 0), 16))
    for a in range(-2, 3):
        g = box(-1.3 * mm, 1.3 * mm, mz0 + 0.027, mz0 + ln - 3 * mm, 4 * mm, 14 * mm); g.transform(Matrix.Rotation(a * math.radians(45), 4, 'Y')); cut(fh, g)
    smooth(fh); K.adopt(fh, 'muzzle', 'park')
    return mz0 + ln
MUZ = flash_hider(MZ0)

# ===================================================================================== the grip (grip): the conventional pistol grip with its finger grooves
GRIP = [[1085, 928], [1212, 928], [1210, 1010], [1207, 1085], [1203, 1165], [1190, 1177], [1100, 1177], [1092, 1160], [1100, 1100], [1096, 1040], [1088, 990], [1076, 950]]
gp = K.tmp(prism(PL(GRIP), 'x', -17 * mm, 17 * mm)); tidy(gp, 0.1 * mm, False); bevel(gp, 2.5 * mm, 1, 30)
for gy in (1010, 1050, 1090, 1130):                                                  # (the finger grooves down its front)
    cut(gp, prism(PL([[1070, gy], [1104, gy - 4], [1106, gy + 8], [1070, gy + 12]]), 'x', -20 * mm, 20 * mm))
tidy(gp); wnorm(gp, 35); K.adopt(gp, 'grip', SH)

# ===================================================================================== the charging handle (part_handle): a knob on the LEFT, forward in its channel
H0 = (F(800), U(781))
ph = K.part('handle', (0, H0[0], H0[1]))
XH = -hwc
o = K.obj(cyl(3.2 * mm, XH - 9.0 * mm, XH + 0.5 * mm, 'x', H0, 12), 'base', 'black', ph); smooth(o)                                 # (the stem)
hd = K.tmp(cyl(7.2 * mm, XH - 17.0 * mm, XH - 8.5 * mm, 'x', H0, 20)); bevel(hd, 2.2 * mm, 2, 30); smooth(hd); K.adopt(hd, 'base', 'black', ph)   # (the round knob)
o = K.obj(cyl(2.0 * mm, H0[0] - 0.120, H0[0] - 0.004, 'y', (XH + 2.0 * mm, H0[1]), 8), 'base', 'steel', ph); smooth(o)                 # (the guide rod in the channel)

# ===================================================================================== the sights (optic: the gun's own flip-up irons on the rail)
ag['K'] = K; ag['RAIL_TOP'] = RAIL_TOP; ag['SY'] = SY; ag['RCV'] = 'black'
RS, FS = F(1400), RB - 0.010
ag['rear_flip'](RS)
ag['front_flip'](FS, RAIL_TOP)
ag['fold_irons'](RS, FS)

# ===================================================================================== the magazine (part_mag): the Mk18's STANAG
ag['mag_stanag'](MAG_TOP)

# ===================================================================================== info and anchors
r4 = lambda v: round(v, 4)
GRIPF = (F(1150), U(1050))
info = {
    'sy': r4(SY), 'fSight': r4(RS), 'relief': 0.07,
    'muzzles': [[r4(MUZ), 0, 0]],
    'grip': [r4(GRIPF[0]), r4(GRIPF[1]), 0], 'support': [r4(F(680)), -0.001, 0],
    'anim': {'mag': 'part_mag', 'handle': 'part_handle', 'carrier': 'part_carrier'},
    'carrier': {'travel': 0.090},
    'magAt': [r4(MAG_TOP[0]), r4(MAG_TOP[1])],
    'handle': {'f': r4(H0[0]), 'y': r4(H0[1]), 'x': r4(XH - 0.014), 'travel': 0.100, 'recip': False, 'style': 'knob', 'grab': [r4(H0[0] + 0.0055), r4(H0[1]), r4(XH - 0.014)]},
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
    'mount_stock': [0, r4(U(780)), 0],
    'mount_grip': [r4(F(1148)), r4(U(930)), 0],
    'mount_mag': [r4(MAG_TOP[0]), r4(MAG_TOP[1]), 0],
    'mount_tac': [r4(L - 0.0725), -0.006, 0.026],
    'mount_fg': [r4(L - 0.10), r4(U(880)) - 0.0056, 0],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
json.dump({'source': 'authored', 'sights': {'builtin': ['irons'], 'rail': [], 'railed': True}}, open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8'), indent=2)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
