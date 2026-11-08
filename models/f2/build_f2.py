# The F2: a FAMAS in its Valorise fit (the French Army's railed upgrade), on a STANAG magazine well, in Blender.
#   Blender: exec(open(r'<repo>/models/f2/build_f2.py').read(), {'GUN_DIR': r'<repo>/models/f2'})
#   or:      blender -b -P models/f2/build_f2.py
# Reference: the side-on photograph "FAMAS-G2-IMG 8894-white.jpg" on Wikimedia Commons (CC BY-SA 2.0 fr; 3000 x 2000 px, right side,
# muzzle right), 0.3554 mm a pixel (757 mm overall, the published figure); the outlines below are its pixels, the same trace the
# recipe drew the F2 from (x forward from the butt at 204, y down from the bore at 931). The Valorise fit, from the FAMAS FELIN photos
# on Commons (Category:FAMAS FELIN): a Picatinny rail along the top of the carrying handle, short rails on the handguard's flanks, the
# F1's thin steel trigger-guard loop (the G2's full-hand band is gone). The magazine well takes STANAG magazines (the G2's), so the
# game's AR magazines fit.
# A bullpup in a composite shell: the butt with its rubber pad, the cheek step, the ejection port on the right, the magazine well
# behind the hand, the belly arching up to the grip; over the receiver the carrying handle, its top bar a channel the sights stand in (its side panels hide them from the side), the cocking lever in its window.
# The sights from a photo of the real rear sight from behind: a narrow block, a small aperture drum on it, the handle's panels either side.
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the butt's back face (photo x 204) on the bore line (y 931).
import bpy, json, math, os
from mathutils import Matrix
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
ID = 'f2'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
S = 0.3554 * mm
def F(x): return (x - 204) * S
def wnorm(o, deg=30):
    # shade by angle, then weight each vertex's normal by its faces' areas (the sharp edges kept): the big flat sides stay flat instead
    # of fanning the rounded edges' slope across their long triangles (the forend's wedge, the smear round the scallops)
    smooth(o, deg)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    _apply(o, md); return o
def U(y): return (931 - y) * S
def PL(pts): return [(F(x), U(y)) for x, y in pts]

# ---- the STANAG magazine: the Mk18's (models/ar_kit.py mag_stanag), borrowed by running the AR builder into a scratch collection
ag = {'GUN_DIR': os.path.join(MODELS, '_f2_scratch'), 'CFG': {}}
os.environ['GUN_EXPORT'] = '0'
exec(open(os.path.join(MODELS, 'ar_kit.py'), encoding='utf-8').read(), ag)
os.environ['GUN_EXPORT'] = '1' if EXPORT else '0'
scratch = ag['coll']
for o in list(scratch.all_objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.collections.remove(scratch)

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID
SH = 'polymer'                                   # the shell (the game's furniture polymer)

def xs(a, b): return tuple(sorted((a, b)))
def DR(pts):
    """Points off the FAMAS-F1 technical drawing (top view, 2000 px wide: its butt at x 386, its muzzle at 1587, the bore at y 384.5,
    1.5888 px a mm) in the photo trace's pixels."""
    return [[204 + (x - 386) * 1.771, 931 + (y - 384.5) * 1.771] for x, y in pts]

def strip(cl, w):
    """A band w wide (side view) along the polyline cl [(forward, up)], as a closed outline."""
    L_, R_ = [], []
    for i, (x, y) in enumerate(cl):
        a, b = cl[max(i - 1, 0)], cl[min(i + 1, len(cl) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; n = math.hypot(dx, dy); nx, ny = -dy / n, dx / n
        L_.append((x + nx * w / 2, y + ny * w / 2)); R_.append((x - nx * w / 2, y - ny * w / 2))
    return L_ + R_[::-1]

# ===================================================================================== the shell (base)
# (after the F1 drawing: the butt's underside 15 mm higher than the photo trace, rising to the magazine well; the cheek pad over the
# receiver's rear raised to y 834, up to the handle)
SHELL = [[205, 949], [225, 827], [239, 815], [252, 823], [265, 816], [280, 817], [304, 818], [470, 818], [510, 868], [520, 871], [596, 871], [604, 842], [614, 834],
         [905, 834], [905, 1150], [896, 1155], [861, 1161], [652, 1170], [651, 1106], [623, 1100], [540, 1110], [480, 1125], [434, 1140], [340, 1146], [285, 1148],
         [237, 1148], [226, 1140], [215, 1119], [207, 1107], [206, 1088], [213, 1083], [204, 1068], [203, 1035]]
MAG_TOP = (F(767), U(1072))                      # the magazine's top (its centre front to back): 50 mm under the bore, as on the Mk18
MB, MF = -32.6 * mm, 31.6 * mm                   # (a STANAG's back and front from that centre, 1 mm inside the well's walls)
sh = K.tmp(prism(PL(SHELL), 'x', -20 * mm, 20 * mm))           # (40 mm across, the receiver's width, as in the front-quarter photo)
# its top narrowing to the cheek rest's ridge: the sides lean in over the top 21 mm of the butt (above y 880), to 26 mm across at its top
boolean(sh, prism([(-20 * mm, U(1300)), (20 * mm, U(1300)), (20 * mm, U(880)), (13 * mm, U(812)), (-13 * mm, U(812)), (-20 * mm, U(880))], 'y', -0.01, F(910)), 'INTERSECT')
# the magazine well: a pocket up into the shell round the magazine (its walls the shell's own sides, front and back)
cut(sh, box(-12.4 * mm, 12.4 * mm, MAG_TOP[0] + MB - 1.0 * mm, MAG_TOP[0] + MF + 1.0 * mm, U(1250), MAG_TOP[1] + 2 * mm))
# the ejection port (right): a recess its cover sits in, the bolt showing
cut(sh, box(17.5 * mm, 21 * mm, F(657), F(946), U(979), U(933)))
bevel(sh, 3.0 * mm, 2, 30); wnorm(sh); K.adopt(sh, 'base', SH)
o = K.tmp(box(17.0 * mm, 19.5 * mm, F(665), F(938), U(972), U(940))); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')     # (the bolt)
o = K.tmp(box(16.5 * mm, 18.0 * mm, F(940), F(946), U(979), U(933))); smooth(o); K.adopt(o, 'base', 'black')                             # (the port's front lip)
# the butt pad, a little proud of the shell all round its back
BUTT = [[239, 815], [225, 827], [205, 949], [203, 1035], [204, 1068], [213, 1083], [206, 1088], [207, 1107], [215, 1119], [226, 1140], [237, 1148], [285, 1148],
        [290, 820], [265, 816]]
o = K.tmp(prism(PL(BUTT), 'x', -21 * mm, 21 * mm))
boolean(o, prism([(-21 * mm, U(1300)), (21 * mm, U(1300)), (21 * mm, U(880)), (14 * mm, U(810)), (-14 * mm, U(810)), (-21 * mm, U(880))], 'y', -0.01, F(300)), 'INTERSECT'); bevel(o, 2.5 * mm, 2, 30); smooth(o); K.adopt(o, 'base', 'rubber')
# the sling loop on the butt's right, the magazine catch, the pins
lp = K.tmp(prism(PL([[262, 1002], [297, 1002], [300, 1078], [266, 1078]]), 'x', 20 * mm, 22.5 * mm))
cut(lp, prism(PL([[270, 1010], [289, 1010], [292, 1070], [274, 1070]]), 'x', 19 * mm, 24 * mm)); bevel(lp, 0.4 * mm, 1); smooth(lp); K.adopt(lp, 'base', 'steel')
for (x, y), r, w, m in (((909, 1049), 7.5, 43, 'black'), ((1065, 889), 5.8, 28, 'steel'), ((688, 1078), 5.8, 43, 'black')):
    o = K.obj(cyl(r * mm, -w / 2 * mm, w / 2 * mm, 'x', (F(x), U(y)), 18), 'base', m); smooth(o)

# ===================================================================================== the receiver and handguard (base)
RCV = [[905, 846], [1992, 846], [1992, 900], [1986, 940], [1972, 962], [1955, 978], [1881, 994], [1700, 1000], [1560, 1006], [1522, 1008], [1140, 1008], [1120, 1004], [1083, 1000],
       [1010, 1012], [953, 1046], [922, 1080], [905, 1100]]   # (the underside after the F1 drawing: nearly level from the trigger to the forend's front, its lower front corner rounded up into the front face)   # (its back ends at the shell's front: the trace's tail crossed itself)
rc = K.tmp(prism(PL(RCV), 'x', -24 * mm, 24 * mm))           # (40 mm across: about twice the 22 mm flash hider, as in the photos)
# its sides straight up to the side rails' top (5 mm over the bore), then sloping in to the handle's width at the handle's foot (photo
# y 860, 25 mm over the bore), straight up from there under the handle
HF = U(860)
for sx in (-1, 1):
    w = [(11.5 * mm, HF), (25 * mm, 5 * mm - 2 * mm * (HF - 5 * mm) / (11.5 * mm)), (25 * mm, 0.05), (11.5 * mm, 0.05)]   # (from the forend's 23 mm at 5 mm over the bore)
    cut(rc, prism([(sx * x, z) for x, z in (w if sx > 0 else w[::-1])], 'y', F(890), F(2040)))
# its nose narrowing to 30 mm round the barrel, where the bipod clamps on (as in the front-quarter photo)
# (and in plan: 40 mm across behind the guard, the forend ahead of it widened to 46 mm, the nose 30 mm)
boolean(rc, prism([(-20 * mm, F(880)), (20 * mm, F(880)), (20 * mm, F(1500)), (23 * mm, F(1560)), (23 * mm, F(1880)), (15 * mm, F(1950)), (15 * mm, F(2030)), (-15 * mm, F(2030)),
                   (-15 * mm, F(1950)), (-23 * mm, F(1880)), (-23 * mm, F(1560)), (-20 * mm, F(1500))],
                  'z', U(1300), U(700)), 'INTERSECT')
# the cooling scallops along the forend's lower edge (the drawing's five), recessed 2 mm into each side
for xa, xb in ((1486, 1539), (1569, 1623), (1669, 1716), (1757, 1805), (1853, 1881)):
    xm, w_ = (xa + xb) / 2, xb - xa
    for sx in (-1, 1):
        cut(rc, prism(PL([[xa, 1020], [xa + w_ * 0.12, 1000], [xa + w_ * 0.3, 988], [xm, 984], [xb - w_ * 0.3, 988], [xb - w_ * 0.12, 1000], [xb, 1020]]), 'x', *xs(sx * 21 * mm, sx * 30 * mm)))
bevel(rc, 3.0 * mm, 2, 30); wnorm(rc); K.adopt(rc, 'base', SH)
# the Valorise rails on the handguard's flanks (the light's and the laser's), and the grenade sight's rod along the right with its ear
L = 0.637                                                    # (the handguard's front face: where the barrel comes out)
for s_, ax in ((1, 'right'), (-1, 'left')):
    picatinny(K, L - 0.100, L - 0.045, -6 * mm, 'base', 'black', axis=ax, x0=s_ * 23 * mm)   # (behind the narrow nose)
o = K.obj(cyl(3.0 * mm, F(1140), F(1710), 'y', (21.5 * mm, U(902)), 14), 'base', 'steel'); smooth(o)   # (on the slope)
o = K.tmp(box(11 * mm, 17 * mm, F(1638), F(1666), U(845), U(810))); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')

# ===================================================================================== the carrying handle (base): a box over the receiver,
# its top bar a channel open on top: its side panels run its length, taller than the sights inside it (from the side they hide them),
# the channel deeper at its two ends where the sights stand; the Valorise rail low on the channel's floor between the sights, the panels
# cut down beside it so a rail sight's clamps fit
HT = 684                                                     # (its top, level for the rail: photo y)
HANDLE = [[1040, 860], [1040, 844], [1062, 712], [1078, 693], [1100, HT], [1939, HT], [1953, 699], [1991, 737], [2000, 756], [2000, 860]]
WIN = [[1150, 803], [1155, 794], [1185, 776], [1486, 772], [1550, 770], [1821, 767], [1876, 768], [1872, 819], [1688, 819], [1666, 810], [1641, 825], [1638, 845],
       [1580, 840], [1463, 839], [1160, 823]]
CW = 9.1 * mm                                                # (the channel's half width, the rail's foot: the panels 1.9 mm thick)
hd = K.tmp(prism(PL(HANDLE), 'x', -11 * mm, 11 * mm))           # (22 mm across: the top of the rifle slim)
cut(hd, prism(PL(WIN), 'x', -0.03, 0.03))                    # (the window, through both walls)
FL = U(758)                                                  # (the channel's floor: 3.6 mm over the window)
cut(hd, box(-CW, CW, F(1050), F(2010), FL, U(HT) + 0.01))                      # (the channel, open on top and at both ends)
for a_, b_ in ((1050, 1172), (1872, 2010)): cut(hd, box(-CW, CW, F(a_), F(b_), U(790), U(760)))   # (deeper where the sights stand)
RA, RB = F(1190), F(1720)                                    # (the rail's span)
cut(hd, box(-0.03, 0.03, RA - 6 * mm, RB + 6 * mm, FL + 2.0 * mm, U(HT) + 0.01))   # (the panels cut down beside it to 2 mm over its foot)
bevel(hd, 1.0 * mm, 1, 30); wnorm(hd); K.adopt(hd, 'base', SH)
RAIL_U = FL
picatinny(K, RA, RB, RAIL_U, 'base', 'black')
RAIL_TOP = RAIL_U + 5.6 * mm
SY = RAIL_TOP + 14 * mm                                      # (the line of sight: down the channel, clear of the rail by 2.4 degrees from the eye)

# ===================================================================================== the sights (optic: the gun's own irons, in the channel)
RS, FS = F(1125), F(1905)
# the rear: a narrow block with its windage drum's ribs across its back, the aperture drum on top (a short cylinder along the sight
# line, its peep through it)
o = K.tmp(box(-6.5 * mm, 6.5 * mm, F(1105), F(1147), U(790) - 0.5 * mm, SY - 6 * mm))
for k_ in range(5): cut(o, box(-7 * mm, 7 * mm, F(1105) - 0.01, F(1105) + 1.2 * mm, SY - 15 * mm + k_ * 1.6 * mm, SY - 14.4 * mm + k_ * 1.6 * mm))   # (the ribs just under the drum, as on the real one)
bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
dr = K.tmp(cyl(6.6 * mm, RS - 6 * mm, RS + 6 * mm, 'y', (0, SY), 28))
cut(dr, cyl(4.0 * mm, RS - 0.01, RS + 0.01, 'y', (0, SY), 24))                          # (the peep: 8 mm, about 2.5 degrees from the eye at the drum's far end)
cut(dr, lathe([(RS - 6.1 * mm, 5.0 * mm), (RS - 4.0 * mm, 4.0 * mm)], 24, (0, 0, SY)))     # (countersunk toward the eye)
bevel(dr, 0.4 * mm, 1); smooth(dr); K.adopt(dr, 'optic', 'black')
# the front: a post on its base in the channel's front
o = K.tmp(box(-4 * mm, 4 * mm, FS - 7 * mm, FS + 5 * mm, U(790) - 0.5 * mm, SY - 12 * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
o = K.obj(box(-0.75 * mm, 0.75 * mm, FS - 0.8 * mm, FS + 0.8 * mm, SY - 12.5 * mm, SY), 'optic', 'steel')

# ===================================================================================== the grip (the F2's own: raked, finger grooves down its front)
GRIP = DR([(918, 412), (1002, 415), (1003, 455), (995, 470), (980, 480), (978, 495), (993, 510), (985, 518), (967, 522), (966, 537), (980, 543), (970, 552), (948, 560),
           (947, 573), (957, 593), (953, 596), (893, 581), (882, 567), (880, 533), (897, 487), (918, 437)])[::-1]   # (from the F1 drawing)
gp = K.tmp(prism(PL(GRIP), 'x', -15 * mm, 15 * mm)); bevel(gp, 4.5 * mm, 3, 30); wnorm(gp, 35); K.adopt(gp, 'grip', SH)
# the F1's trigger guard (after the drawing): a thin wire loop round the trigger only, from the grip's front to the receiver ahead of it
CL = PL(DR([(1000, 428), (1006, 455), (1013, 473), (1030, 485), (1075, 489), (1098, 482), (1108, 460), (1103, 428)]))
o = K.tmp(prism(strip(CL, 2.6 * mm), 'x', -1.6 * mm, 1.6 * mm)); bevel(o, 0.5 * mm, 1, 30); smooth(o); K.adopt(o, 'base', 'black')
# the trigger, and the selector's bar behind it
o = K.tmp(prism(PL(DR([(1030, 425), (1046, 425), (1045, 445), (1042, 462), (1040, 478), (1036, 478), (1035, 462), (1033, 445)])), 'x', -3.5 * mm, 3.5 * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')
o = K.tmp(prism(PL(DR([(1050, 425), (1090, 425), (1086, 440), (1062, 452), (1052, 458), (1049, 442)])), 'x', -5 * mm, 5 * mm)); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')

# ===================================================================================== the cocking lever (part_handle): the hook under the
# handle's top bar, standing in the window; it is worked back by the hand and does not reciprocate
H0 = (F(1505), U(850))
ph = K.part('handle', (0, H0[0], H0[1]))
o = K.tmp(prism(PL([[3010 - x, y] for x, y in [[1478, 852], [1532, 852], [1530, 815], [1520, 792], [1500, 781], [1484, 786], [1496, 797], [1509, 802], [1515, 816], [1509, 842], [1486, 842]]][::-1]), 'x', -4 * mm, 4 * mm))   # (its stem at the back, the hook curling forward over the finger's pull)
bevel(o, 1.0 * mm, 2, 30); smooth(o); K.adopt(o, 'base', 'black', ph)

# ===================================================================================== the barrel (barrel: the F2's own, the grenade spigot's
# rings along it) and the flash hider (muzzle: the A2 pattern, the game's r556 birdcage)
MZ0 = L + 0.068
o = K.obj(lathe([(L - 0.008, 10.5 * mm), (L + 0.022, 10.5 * mm), (L + 0.024, 6.8 * mm)], 24), 'barrel', 'black'); smooth(o)   # (its back 8 mm into the forend's face)
o = K.obj(lathe([(L, 6.8 * mm), (MZ0, 6.8 * mm)], 20), 'barrel', 'park'); smooth(o)
for i in range(9):
    f = L + 0.026 + (MZ0 - 0.008 - L - 0.026) * i / 8
    o = K.obj(lathe([(f, 6.8 * mm), (f + 0.4 * mm, 7.6 * mm), (f + 1.2 * mm, 7.6 * mm), (f + 1.6 * mm, 6.8 * mm)], 20), 'barrel', 'black'); smooth(o)
def muzzle_a2(mz0, sc=1.0):
    Lm, R = 0.0505 * sc, 10.9 * mm * sc
    o = K.obj(lathe([(mz0 - 2 * mm, 9.6 * mm * sc), (mz0, 9.6 * mm * sc)], 20), 'muzzle', 'steel'); smooth(o)
    fh = K.tmp(lathe([(mz0, 8.6 * mm * sc), (mz0 + 3 * mm, R), (mz0 + Lm - 3 * mm, R), (mz0 + Lm, R - 1.0 * mm)], 24))
    cut(fh, cyl(3.6 * mm * sc, mz0 - 0.001, mz0 + Lm + 0.001, 'y', (0, 0), 16))
    for a in range(-2, 3):
        g = box(-1.3 * mm * sc, 1.3 * mm * sc, mz0 + 0.018 * sc, mz0 + Lm - 3 * mm, 4 * mm, 14 * mm * sc); g.transform(Matrix.Rotation(a * math.radians(45), 4, 'Y')); cut(fh, g)
    smooth(fh); K.adopt(fh, 'muzzle', 'park')
    return mz0 + Lm
MUZ = muzzle_a2(MZ0)

# ===================================================================================== the magazine (part_mag): the Mk18's STANAG
ag['K'] = K
ag['mag_stanag'](MAG_TOP)

# ===================================================================================== info and anchors
r4 = lambda v: round(v, 4)
info = {
    'sy': r4(SY), 'fSight': r4(RS), 'relief': 0.08,
    'muzzles': [[r4(MUZ), 0, 0]],
    'grip': [r4(F(1180)), r4(U(1100)), 0], 'support': [0.53, r4(U(1000) - 6 * mm), 0],
    'anim': {'mag': 'part_mag', 'handle': 'part_handle'},
    'magAt': [r4(MAG_TOP[0]), r4(MAG_TOP[1])],
    'handle': {'f': r4(H0[0]), 'y': r4(U(800)), 'x': 0, 'travel': 0.055, 'style': 'top', 'stem': 0.008, 'recip': False},
    'port': [r4(F(800)), r4(U(956)), 0.02],
    'chamberAt': {'side': 'right', 'f': r4(F(930)), 'y': 0.0, 'x': 0.018},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [r4(MZ0), 0, 0]},
}
anchors = {
    'mount_optic': [r4(RA), r4(RAIL_TOP), 0], 'mount_optic_end': [r4(RB), r4(RAIL_TOP), 0],
    'mount_handguard': [r4(L - 0.004), 0, 0], 'mount_handguard_end': [r4(L - 0.001), 0, 0],    # (no handguard slot: the shell is the handguard)
    'mount_barrel': [r4(L), 0, 0], 'mount_muzzle': [r4(MZ0), 0, 0],
    'mount_stock': [0, r4(U(1010)), 0],                                                          # (a bullpup: no stock slot; the butt's back)
    'mount_grip': [r4(F(1295)), r4(U(1008)), 0],
    'mount_mag': [r4(MAG_TOP[0]), r4(MAG_TOP[1]), 0],
    'mount_tac': [r4(L - 0.0725), -0.006, 0.026],                                                 # (the right flank's rail)
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
json.dump({'source': 'authored', 'sights': {'builtin': ['irons'], 'rail': [], 'railed': True}}, open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8'), indent=2)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
