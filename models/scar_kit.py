# The shared builder of the SCAR family (FN SCAR-H and SCAR-L): models/<id>/build_<id>.py set CFG = {'variant': 'h' | 'l'} and exec this. The long
# aluminium upper with its full-length top rail, the side rails and the bottom rail of its front, the polymer lower with its integral trigger
# guard and magazine well, the reciprocating charging handle, the folding rear sight and the front sight on the gas block, the folding / telescoping
# stock on its hinge are the same on both; the H's well takes the 20-round 7.62 magazine (its own, below), the L's the STANAG family's (ar_kit.py's
# mag_stanag, borrowed as the F2 does), and the barrel and flash hider are each calibre's.
#
# This is the NRCH generation (the SCAR 17S NRCH for the H, the 16S NRCH for the L): M-LOK on the forend, a non-reciprocating charging handle on the left (part_ch),
# the telescoping stock with its adjustable cheek, the large trigger guard. References (viewed in the browser, not downloaded):
#  - FN America's product pages, the level side-on studio shots on a transparent background (1200 x 598, the right side, FDE): "SCAR-17S-NRCH_Rotators_7_0000_SCAR17S_FDE_right_side_"
#    (fnamerica.com/products/rifles/fn-scar-17s-nrch/: barrel 16.25", overall 36"-38.5"; the H's well, magazine and trigger guard are fitted to it; 0.834 mm a pixel from its
#    rail's slot pitch, 12.0 px) and "NRCH_Rotators__0000_SCAR16S_FDE_right_side_" (fnamerica.com/products/rifles/fn-scar-16s-nrch/: overall 34.5"-37"; the L's lower and
#    magazine, the NRCH stock, the guard's window and the trigger; 0.804 mm a pixel, slot pitch 12.45 px, 1168 px of gun = 939 mm).
#  - The upper, rails, irons and gas block were laid over the older photo below; they agree with FN's shots to a few percent.
# Older references (Wikimedia Commons):
#  - "FN SCAR-L noBG.png" (CC BY-SA 4.0; 2148 x 815, the right side, muzzle right, the stock extended, an FDE Mk 16 with the factory flash hider): the
#    outlines below are its pixels, in the full-size image's frame (x forward, y down): the upper's rear face at x 640, the bore at y 351
#    (the barrel is 30 px across at its centre line). Its scale is 0.455 mm a pixel: the top rail's slot pitch is 22.2 px (the Picatinny pitch,
#    10.01 mm: 0.451), the 889 mm of an extended SCAR-L STD over its 1930 px of gun 0.461, a STANAG magazine 74 mm across its base; PXMM is the middle.
#  - "FN SCAR-L and SCAR-H.png" and "FN SCAR-L and SCAR-H (black background).jpg" (public domain, 432 x 283): the H under the L, the same upper and
#    stock, the H's lower and 20-round magazine a little fuller. "FN SCAR-L - Aimpoint CompM4- Belgian Army.png" (CC0): the rear sight raised, seen
#    from behind. "SCAR-H EP.jpg" (CC BY-SA 4.0): the H's lower and magazine from the front quarter.
# Real figures: SCAR-L STD 889 mm overall stock extended, SCAR-H STD 965 mm; the SCAR-H's magazine 20 rounds of 7.62 x 51 (about 70 mm across at the
# well), the L's a 30-round STANAG.
#
# Frame (docs/models.md "Authored models"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the back of the upper (the hinge's face, photo
# x 640) on the bore line (y 351).
import bpy, json, math, os
from mathutils import Matrix
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
ID = os.path.basename(HERE)
C = globals()['CFG']
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
VAR = C.get('variant', 'l')

PXMM = 0.455                                   # millimetres a photo pixel
X0, Y0 = 640, 351
def Fp(x): return (x - X0) * PXMM * mm         # metres forward of the upper's back
def Up(y): return (Y0 - y) * PXMM * mm         # metres over the bore
def PL(pts): return [(Fp(x), Up(y)) for x, y in pts]
def xs(a, b): return tuple(sorted((a, b)))

# ----------------------------------------------------------------------------------------------------- the borrowed AR builder (grip, birdcage, STANAG magazine)
os.environ['GUN_EXPORT'] = '0'
ag = {'GUN_DIR': os.path.join(MODELS, '_scar_scratch'), 'CFG': {}}
exec(open(os.path.join(MODELS, 'ar_kit.py'), encoding='utf-8').read(), ag)
_scratch = ag['coll']
for _o in list(_scratch.all_objects): bpy.data.objects.remove(_o, do_unlink=True)
bpy.data.collections.remove(_scratch)
os.environ['GUN_EXPORT'] = '1' if EXPORT else '0'

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID
ag['K'] = K
ag['FURN'] = 'tan'

# ----------------------------------------------------------------------------------------------------- the variant's figures
V = {
    'l': dict(mag='stanag', barrel_r=7.0, thr_r=7.6, muzzle_sc=1.0, muzzle_len=0.0505, mount_muzzle=0.602, hwl=15.0, ihalf=12.4, mag_depth=(-32.3, 31.0), magx=0.152),
    'h': dict(mag='h', barrel_r=7.5, thr_r=8.0, muzzle_sc=1.12, muzzle_len=0.0566, mount_muzzle=0.630, hwl=16.8, ihalf=14.2, mag_depth=(-38.0, 38.0), magx=0.160),
}[VAR]
RCV, FURN = 'tan', 'tan'

HWU = 19.0                    # the upper's half width (mm)
UP_TOP, UP_BOT = 39.9, Up(398) / mm       # the upper's top (the rail's seat) and bottom (mm)
RAIL_T = Up(251) / mm         # the top rail's top (mm): 45.5
F_FRONT = Fp(1498)            # the upper's front face: mount_handguard
F_GAS = Fp(1600)              # the gas block's front: mount_barrel
BORE_R = V['barrel_r'] * mm
SY = 75.0                     # the sight line over the bore (mm): the front post's tip, the rear aperture's centre
RS_F = -0.0010                # the rear aperture blade's back face (info.fSight)
MAG_TOP = (V['magx'], -0.030)  # the magazine's top, centred on its axis (magAt)
MB, MF = V['mag_depth']       # the magazine's back and front from MAG_TOP[0] (mm)
W_IN_B, W_IN_F = MAG_TOP[0] + (MB - 2.8) * mm, MAG_TOP[0] + (MF + 1.6) * mm      # the well's inside, back and front
W_OUT_B, W_OUT_F = W_IN_B - 3.0 * mm, W_IN_F + 3.0 * mm
HWL = V['hwl'] * mm           # the lower's half width
W_BOT = -0.0895             # the well's bottom (the guard's too)
MZ0 = V['mount_muzzle']       # the factory barrel's end: mount_muzzle

# ----------------------------------------------------------------------------------------------------- UPPER and RAILS (base)
def upper():
    """The upper: one aluminium extrusion from the hinge to the front of the handguard section (the barrel comes out of its front), chamfered
    along its edges; the ejection port on the right, three lightening slots each side of its front, the charging handle's track."""
    f0, f1 = 0.0, F_FRONT
    ub = UP_BOT * mm
    up = K.tmp(prism([(f0, ub), (f1, ub), (f1, UP_TOP * mm), (f0, UP_TOP * mm)], 'x', -HWU * mm, HWU * mm))
    sec = [(-HWU + 3, UP_BOT), (HWU - 3, UP_BOT), (HWU, UP_BOT + 3), (HWU, UP_TOP - 2), (HWU - 2, UP_TOP), (-HWU + 2, UP_TOP), (-HWU, UP_TOP - 2), (-HWU, UP_BOT + 3)]
    boolean(up, prism([(x * mm, u * mm) for x, u in sec], 'y', f0 - 0.01, f1 + 0.01), 'INTERSECT')
    # the ejection port, right: a pocket 4 mm deep (the bolt carrier's flank shows in it)
    pa, pb, pu0, pu1 = Fp(850), Fp(1062), Up(358), Up(339)
    cut(up, prism(rounded((pa + pb) / 2, (pu0 + pu1) / 2, (pb - pa) / 2, (pu1 - pu0) / 2, 2.2 * mm, 4), 'x', (HWU - 4.0) * mm, (HWU + 1) * mm))
    # the lightening slots down the front, each side; the charging handle's track on the right
    for xa, xb in ((1250, 1285), (1300, 1340), (1370, 1410)):
        for s in (-1, 1):
            cut(up, prism(rounded(Fp((xa + xb) / 2), Up(307), (Fp(xb) - Fp(xa)) / 2, 2.4 * mm, 2.2 * mm, 4), 'x', *xs(s * (HWU - 2.2) * mm, s * (HWU + 1) * mm)))
    cut(up, prism(rounded(Fp((905 + 1200) / 2), Up(303.5), (Fp(1200) - Fp(905)) / 2, 1.6 * mm, 1.5 * mm, 4), 'x', -(HWU + 1) * mm, -(HWU - 1.4) * mm))   # (the NRCH's handle is on the left)
    # M-LOK at 3, 6 and 9 o'clock: three slots 32 x 7 mm at 29 mm centres, 3 mm deep, on each flank and the underside of the forend
    for f in (0.300, 0.329, 0.358):
        for s in (-1, 1):
            cut(up, prism(rounded(f, -8.6 * mm, 16 * mm, 3.5 * mm, 3.4 * mm, 4), 'x', *xs(s * (HWU - 3.0) * mm, s * (HWU + 1) * mm)))
        cut(up, prism(rounded(0, f, 3.5 * mm, 16 * mm, 3.4 * mm, 4), 'z', (UP_BOT - 1) * mm, (UP_BOT + 3.0) * mm))
    bevel(up, 0.9 * mm, 1, 30); smooth(up); K.adopt(up, 'base', RCV)
    # the bolt carrier's flank in the port
    o = K.tmp(box((HWU - 4.6) * mm, (HWU - 3.8) * mm, Fp(868), Fp(1044), Up(352), Up(344))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
    # the barrel nut's pins and the lower's pins (both sides)
    for px, py, r in ((682, 367, 2.6), (716, 367, 2.6), (826, 360, 2.8)):
        for s in (-1, 1):
            o = K.obj(cyl(r * mm, *xs(s * (HWU - 0.3) * mm, s * (HWU + 0.7) * mm), 'x', (Fp(px), Up(py)), 12), 'base', 'steel'); smooth(o)

def rails():
    """The top rail along the whole upper, a short rail each side of its front and one under it (all Picatinny: 21.2 mm across, 5.6 tall)."""
    picatinny(K, 0.0, F_FRONT - 0.002, UP_TOP * mm, 'base', RCV)
    # (the NRCH generation: M-LOK slots at 3, 6 and 9 o'clock on the forend instead, mlok_slots() in the upper: three 32 x 7 mm slots at a 29 mm pitch)

# ----------------------------------------------------------------------------------------------------- LOWER (base)
def lower():
    """The polymer lower: from the hinge under the upper to the magazine well's front, the integral trigger guard (a strap round its window) and the
    well, a hollow shell round the magazine (walls 3 mm, the magazine 1.6 to 2.8 mm clear of them) open at the bottom; the selector each side, the
    magazine catch's button."""
    ul = Up(390)
    pts = [(0.0, ul), (W_OUT_F + 0.010, ul), (W_OUT_F + 0.003, Up(402)), (W_OUT_F, Up(425)), (W_OUT_F, W_BOT), (GRIP_TOP[0] + 0.004, W_BOT), (GRIP_TOP[0], Up(525)), (GRIP_TOP[0], Up(500)),
           (GRIP_TOP[0] + 0.004, Up(470)), (Fp(700), Up(470)), (Fp(664), Up(456)), (0.0, Up(445))]
    lo = K.tmp(prism(pts, 'x', -HWL, HWL))
    # the guard: the strap's sides cut away to 10 mm each side of the middle, its window through
    for s in (-1, 1): cut(lo, box(*xs(s * 10.0 * mm, s * 24 * mm), GRIP_TOP[0] - 0.002, W_OUT_B, W_BOT - 0.01, Up(472)))
    wa, wb = GRIP_TOP[0] + 0.008, min(0.1158, W_OUT_B - 0.002)   # (the guard's window, traced off FN's 16S/17S NRCH studio shots: 56 mm long, 30 deep, from the grip's front to the well's back wall)
    cut(lo, prism(rounded((wa + wb) / 2, -0.0693, (wb - wa) / 2, 0.01525, 5 * mm, 4), 'x', -0.02, 0.02))
    for s in (-1, 1):   # (moulded panels let into the flanks, 0.6 mm: behind the selector, ahead of the guard)
        cut(lo, prism(rounded(0.020, -0.040, 0.015, 0.008, 3 * mm, 4), 'x', *xs(s * (HWL - 0.6 * mm), s * (HWL + 1.0 * mm))))
        cut(lo, prism(rounded(0.098, -0.068, 0.012, 0.007, 3 * mm, 4), 'x', *xs(s * (HWL - 0.6 * mm), s * (HWL + 1.0 * mm))))
    cut(lo, box(-V['ihalf'] * mm, V['ihalf'] * mm, W_IN_B, W_IN_F, W_BOT - 0.01, MAG_TOP[1] + 7 * mm))                                # (the well)
    bevel(lo, 1.0 * mm, 2, 30); smooth(lo); K.adopt(lo, 'base', FURN)
    # the trigger in its guard
    o = K.tmp(prism([(0.0715, -0.0545), (0.0805, -0.0545), (0.0815, -0.067), (0.0865, -0.077), (0.095, -0.0835), (0.0935, -0.0845), (0.0835, -0.0825), (0.0745, -0.072), (0.0715, -0.058)], 'x', -2.2 * mm, 2.2 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')
    # the selector (both sides): its boss on the pin, the lever lying forward and down; the magazine catch's button through the well's front
    for s in (-1, 1):
        o = K.obj(cyl(5.4 * mm, *xs(s * (HWL - 0.3) * mm, s * (HWL + 2.4) * mm), 'x', (Fp(762), Up(410)), 18), 'base', 'black'); smooth(o)
        lv = K.tmp(prism(PL([(756, 404), (766, 404), (800, 430), (794, 440)]), 'x', *xs(s * (HWL + 1.8) * mm, s * (HWL + 4.2) * mm))); bevel(lv, 0.7 * mm, 1); smooth(lv); K.adopt(lv, 'base', 'black')
    for s in (-1, 1):
        o = K.obj(cyl(4.2 * mm, *xs(s * (HWL - 0.3 * mm), s * (HWL + 2.2 * mm)), 'x', (W_OUT_F - 4.5 * mm, Up(398)), 16), 'base', 'steel'); smooth(o)
    # the bolt catch's paddle on the left, ahead of the grip
    o = K.tmp(prism(PL([(728, 440), (748, 440), (752, 458), (730, 458)]), 'x', *xs(-(HWL - 0.2) * mm, -(HWL + 1.8) * mm))); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')

# ----------------------------------------------------------------------------------------------------- GAS BLOCK (base) and the barrel
def gas_block():
    """What the upper's front carries round the barrel (base: it stays when another barrel is fitted): the barrel collar, the gas piston's housing
    above it with its flange, the front sight's seat on top."""
    r_c = 12.5 * mm
    o = K.obj(lathe([(F_FRONT - 0.002, r_c), (F_GAS - 0.004, r_c), (F_GAS - 0.004, 9.4 * mm), (F_GAS + 0.001, 9.4 * mm)], 28), 'base', 'steel'); smooth(o)
    pu = Up(314)
    h = K.obj(lathe([(F_FRONT - 0.002, 9.5 * mm), (Fp(1572), 9.5 * mm), (Fp(1572), 11.8 * mm), (Fp(1590), 11.8 * mm), (Fp(1590), 9.0 * mm), (Fp(1596), 9.0 * mm)], 24, (0, 0, pu)), 'base', 'steel'); smooth(h)
    o = K.tmp(box(-5.0 * mm, 5.0 * mm, Fp(1500), Fp(1580), pu + 6 * mm, UP_TOP * mm)); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')    # (the seat under the front sight)

def barrel():
    """The factory barrel (the light pencil one): from the gas block's front to the muzzle thread's shoulder, the thread; slot barrel."""
    r = BORE_R
    o = K.obj(lathe([(F_GAS - 0.002, r), (MZ0 - 6 * mm, r), (MZ0 - 6 * mm, V['thr_r'] * mm), (MZ0, V['thr_r'] * mm)], 20), 'barrel', 'park'); smooth(o)

def muzzle():
    """The factory flash hider: the A2 birdcage (ar_kit.py's), the 7.62's a little larger. Returns where the bullet leaves it."""
    return ag['muzzle_a2'](MZ0, V['muzzle_sc'])

# ----------------------------------------------------------------------------------------------------- IRONS (slot optic): the rear sight and the front sight
def rear_sight():
    """The folding rear sight, raised: its clamp base on the top rail's rear, the aperture blade (a 6.6 mm hole on the sight line, closed over the top)
    between two protective ears."""
    rt = RAIL_T * mm
    o = K.tmp(box(-11.0 * mm, 11.0 * mm, -0.012, 0.0265, rt - 12 * mm, rt + 6.2 * mm)); bevel(o, 0.9 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
    bl = K.tmp(box(-5.8 * mm, 5.8 * mm, RS_F, RS_F + 4.0 * mm, rt + 5 * mm, (SY + 6.0) * mm))
    cut(bl, cyl(3.3 * mm, RS_F - 0.001, RS_F + 5 * mm, 'y', (0, SY * mm), 28))
    cut(bl, lathe([(RS_F - 0.001, 4.8 * mm), (RS_F + 1.2 * mm, 3.3 * mm)], 24, (0, 0, SY * mm)))                       # (countersunk toward the eye)
    bevel(bl, 0.5 * mm, 1); smooth(bl); K.adopt(bl, 'optic', 'black')
    for s in (-1, 1):
        o = K.tmp(prism([(RS_F - 3 * mm, rt + 4 * mm), (RS_F + 9 * mm, rt + 4 * mm), (RS_F + 8 * mm, (SY + 7) * mm), (RS_F - 1 * mm, (SY + 7) * mm)], 'x', *xs(s * 6.8 * mm, s * 8.8 * mm)))
        bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
    o = K.obj(cyl(3.6 * mm, 11.0 * mm, 14.0 * mm, 'x', (RS_F + 8 * mm, rt + 3.2 * mm), 16), 'optic', 'steel'); smooth(o)          # (the windage knob)

POST_F = Fp(1537)
def front_sight():
    """The front sight on the gas piston's housing, raised: its tower, two ears round the post (the photo's blade, seen from the side) and the post, its
    tip on the sight line."""
    pu = Up(314)
    o = K.tmp(box(-7.5 * mm, 7.5 * mm, Fp(1503), Fp(1566), pu + 5.5 * mm, RAIL_T * mm + 1.5 * mm)); bevel(o, 1.0 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
    for s in (-1, 1):
        ea = K.tmp(prism(PL([(1519, 249), (1552, 249), (1552, 188), (1545, 177), (1527, 177), (1519, 188)]), 'x', *xs(s * 4.6 * mm, s * 6.4 * mm)))
        bevel(ea, 0.5 * mm, 1); smooth(ea); K.adopt(ea, 'optic', 'black')
    o = K.tmp(box(-0.8 * mm, 0.8 * mm, POST_F - 0.8 * mm, POST_F + 0.8 * mm, RAIL_T * mm, SY * mm)); smooth(o); K.adopt(o, 'optic', 'steel')

# ----------------------------------------------------------------------------------------------------- CHARGING HANDLE (part_handle)
HANDLE = (Fp(1120), Up(362))
def handle():
    """The non-reciprocating charging handle of the NRCH generation (part_ch: it stays put when the gun fires and is pulled back only when it is charged, as
    the AR's is): the oval pad folded flat against the LEFT of the upper ahead of the ejection port, its three studs, the stem into the track."""
    ph = K.part('ch', (0, HANDLE[0], HANDLE[1]))
    pad = K.tmp(prism(rounded(HANDLE[0], HANDLE[1], 28 * mm, 8.4 * mm, 6.5 * mm, 5), 'x', -(HWU + 5.2) * mm, -(HWU + 0.1) * mm)); bevel(pad, 1.2 * mm, 2, 30); smooth(pad); K.adopt(pad, 'base', 'black', ph)
    for dx in (-17, 0, 17):
        o = K.obj(cyl(2.7 * mm, -(HWU + 7.0) * mm, -(HWU + 5.0) * mm, 'x', (HANDLE[0] + dx * mm, HANDLE[1]), 14), 'base', 'steel', ph); smooth(o)
    st = K.tmp(box(-(HWU + 0.5) * mm, -(HWU - 1.2) * mm, HANDLE[0] - 20 * mm, HANDLE[0] + 20 * mm, HANDLE[1] - 2 * mm, HANDLE[1] + 2 * mm)); smooth(st); K.adopt(st, 'base', 'steel', ph)
    return ph

# ----------------------------------------------------------------------------------------------------- STOCK (factory: stock)
STOCK_UP = -0.010            # mount_stock's height: the stock's wrist at the upper's back
# (the NRCH stock is traced off FN's 16S NRCH studio shot, a second frame: 0.804 mm a pixel (the rail's slot pitch 12.45 px), the upper's back at x 363, the bore at y 233)
def P16(x, y): return ((x - 363) * 0.804 * mm, (233 - y) * 0.804 * mm)
STOCK_ANCH = {'butt': P16(22, 300), 'cheek': P16(250, 181)}
def stock():
    """The SCAR NRCH's folding, telescoping stock with its raised adjustable cheek: its hinge block against the upper's back, the comb rising to the hinge, the
    long body with its slot, the butt raked back down to the heel with its rubber pad, the lower strut's ribbed front edge."""
    body = [P16(x, y) for x, y in [(48, 206), (141, 205), (182, 188), (283, 185), (318, 179), (363, 177), (363, 285), (305, 285), (299, 282), (173, 282), (170, 278), (124, 278), (116, 284),
                                   (115, 292), (104, 312), (92, 328), (82, 352), (73, 363), (63, 376), (48, 380), (43, 388), (34, 391), (30, 372), (31, 326), (31, 267), (30, 222), (36, 198)]]
    st = K.tmp(prism(body, 'x', -17.0 * mm, 17.0 * mm))
    boolean(st, prism([(-17 * mm, -0.16), (17 * mm, -0.16), (17 * mm, 0.036), (13 * mm, 0.0485), (-13 * mm, 0.0485), (-17 * mm, 0.036)], 'y', -0.5, 0.1), 'INTERSECT')
    for s in (-1, 1):   # the lightening slot, each side
        f0, f1 = P16(66, 0)[0], P16(155, 0)[0]
        cut(st, prism(rounded((f0 + f1) / 2, P16(0, 215)[1], (f1 - f0) / 2, 4.5 * mm, 3 * mm, 4), 'x', *xs(s * 15.0 * mm, s * 19 * mm)))
    for k_ in range(7):   # the ribs down the lower strut's front edge
        t = (k_ + 0.5) / 7; x_ = 119 - 52 * t; y_ = 282 + 95 * t
        for s in (-1, 1): cut(st, prism([P16(x_ - 12, y_ + 3), P16(x_ + 4, y_ - 9), P16(x_ + 4, y_ - 5), P16(x_ - 10, y_ + 6)], 'x', *xs(s * 15.5 * mm, s * 18 * mm)))
    bevel(st, 2.2 * mm, 2, 30); smooth(st); K.adopt(st, 'stock', FURN)
    # the hinge block against the upper's back: a plate and the three knuckles on the hinge's vertical axis
    hb = K.tmp(prism([P16(300, 178), P16(363, 178), P16(363, 285), P16(300, 285)], 'x', -HWU * mm, HWU * mm)); bevel(hb, 1.4 * mm, 2, 30); smooth(hb); K.adopt(hb, 'stock', FURN)
    for y0, y1 in ((176, 225), (232, 262), (268, 285)):
        o = K.obj(cyl(6.2 * mm, P16(0, y1)[1], P16(0, y0)[1], 'z', (HWU * mm + 1.4 * mm, P16(330, 0)[0]), 20), 'stock', FURN); smooth(o)
    o = K.obj(cyl(2.6 * mm, P16(0, 290)[1], P16(0, 172)[1], 'z', (HWU * mm + 1.4 * mm, P16(330, 0)[0]), 12), 'stock', 'steel'); smooth(o)
    # the rubber butt pad along the raked rear edge, a little proud of the body all round
    pad = K.tmp(prism([P16(x, y) for x, y in [(34, 198), (50, 206), (46, 222), (44, 267), (45, 326), (48, 372), (56, 390), (34, 394), (18, 387), (21, 222), (21, 196)]], 'x', -17.8 * mm, 17.8 * mm))
    bevel(pad, 1.4 * mm, 2, 30); smooth(pad); K.adopt(pad, 'stock', 'rubber')

# ----------------------------------------------------------------------------------------------------- GRIP (factory: grip): the standard A2
GRIP_TOP = (0.050, Up(470))       # its front top, under the lower: mount_grip

# ----------------------------------------------------------------------------------------------------- MAGAZINE (part_mag)
def mag_h(top):
    """The SCAR-H's 20-round 7.62 x 51 magazine: straight through the well (1.6 to 2.8 mm clear of its walls), curving a little forward below it, open at
    the top between its feed lips with the top two rounds in it (the top one the check's), two pressed ribs down each side, a floorplate, five witness
    holes down its back."""
    pm = K.part('mag', (0, top[0], top[1])); HWm = 13.0 * mm; pm['check'] = {'w': round(2 * HWm, 4)}
    b0, f0_ = MB * mm, MF * mm                                                  # (its back and front, from its top's middle)
    dB = (W_BOT - top[1]) + 0.002                                               # (the well's mouth below its top: straight to here)
    L, cv = 0.134, 0.003
    def cx(z): return 0.0 if z > dB else cv * ((dB - z) / (dB + L)) ** 1.6
    zs = [0.0, dB] + [dB + (-L - dB) * k / 6 for k in range(1, 7)]
    back = [(top[0] + b0 + cx(z), top[1] + z) for z in zs]
    front = [(top[0] + f0_ + cx(z), top[1] + z) for z in zs]
    out = [back[0]] + front + back[::-1][:-1]
    mg = K.tmp(prism(out, 'x', -HWm, HWm))
    cut(mg, prism([(top[0] + b0 + 1.4 * mm, top[1] - 4.5 * mm), (top[0] + f0_ - 1.4 * mm, top[1] - 4.5 * mm), (top[0] + f0_ - 1.4 * mm, top[1] + 0.01),
                   (top[0] + b0 + 1.4 * mm, top[1] + 0.01)], 'x', -HWm + 1.0 * mm, HWm - 1.0 * mm))      # (open at the top)
    def face(t):
        z = -6 * mm + t * (-L + 0.030 + 6 * mm); dz = 0.004
        return (top[0] + b0 + cx(z), top[1] + z), (cx(z - dz) - cx(z + dz), -2 * dz)
    wins = ag['mag_holes'](mg, pm, face, 5, HWm)
    bevel(mg, 1.0 * mm, 1, 30); smooth(mg); K.adopt(mg, 'mag', 'park', pm)
    ag['mag_hole_glass'](wins, pm)
    for fr in (0.3, 0.68):   # the pressed ribs down each side, below the well
        pts = [(top[0] + b0 + (f0_ - b0) * fr + cx(z), top[1] + z) for z in (dB - 4 * mm, -L + 0.012)]
        for sd in (-1, 1):
            o = K.tmp(prism([(pts[0][0] - 2.5 * mm, pts[0][1]), (pts[0][0] + 2.5 * mm, pts[0][1]), (pts[1][0] + 2.5 * mm, pts[1][1]), (pts[1][0] - 2.5 * mm, pts[1][1])],
                            'x', *xs(sd * (HWm - 0.2 * mm), sd * (HWm + 0.6 * mm)))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    zb = top[1] - L; fb0, fb1 = top[0] + b0 + cv - 2 * mm, top[0] + f0_ + cv + 2.5 * mm        # the floorplate
    o = K.tmp(prism([(fb0, zb + 2 * mm), (fb1, zb + 2 * mm), (fb1, zb - 3.5 * mm), (fb0, zb - 3.5 * mm)], 'x', -HWm - 0.8 * mm, HWm + 0.8 * mm))
    bevel(o, 1.0 * mm, 2, 30); smooth(o); K.adopt(o, 'mag', 'polymer', pm)
    for sd in (-1, 1):       # the feed lips
        o = K.tmp(box(*xs(sd * (HWm - 0.2 * mm), sd * (HWm - 3.4 * mm)), top[0] + b0 + 1 * mm, top[0] + b0 + 0.048, top[1] - 2.0 * mm, top[1] + 0.6 * mm))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    h = top[0] + b0 + 1.2 * mm     # (7.62 x 51: the case 51 mm, the round 70.5 mm; its head against the back wall)
    ag['round_lathe'](h, 2.9 * mm, top[1] - 3.2 * mm, 0.051, 0.0705, 6.0 * mm, 5.9 * mm, 4.4 * mm, 3.9 * mm, pm, True)
    ag['round_lathe'](h, -2.9 * mm, top[1] - 8.4 * mm, 0.051, 0.0705, 6.0 * mm, 5.9 * mm, 4.4 * mm, 3.9 * mm, pm, 'second')
    return pm

# ----------------------------------------------------------------------------------------------------- DETAILS (base): what FN's NRCH studio shots show
def details():
    """The right side's features, and the left's: the brass deflector's wedge behind the ejection port, the magazine release (a square housing and its round
    button on each flank of the well's top), the takedown pins, the quick-detach sling sockets on the upper's back and under the gas housing, the seam
    groove between the upper and the lower, the handle's lock stud on the left."""
    for s in (-1, 1):
        o = K.tmp(prism(rounded(0.114, -0.041, 8 * mm, 11 * mm, 2.5 * mm, 4), 'x', *xs(s * (HWL - 0.3 * mm), s * (HWL + 1.4 * mm)))); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', FURN)
        o = K.obj(cyl(4.6 * mm, *xs(s * (HWL + 1.0 * mm), s * (HWL + 3.2 * mm)), 'x', (0.114, -0.041), 18), 'base', 'black'); smooth(o)
        for f, u, r in ((0.018, -0.0145, 3.4), (0.171, -0.0145, 3.0)):     # (the takedown pins, rear and front)
            o = K.obj(cyl(r * mm, *xs(s * (HWL - 0.2 * mm), s * (HWL + 2.0 * mm)), 'x', (f, u), 16), 'base', 'steel'); smooth(o)
        for f, u in ((0.010, 0.0075), (F_FRONT + 0.006, -0.012)):             # (the quick-detach sockets: a boss with its hole)
            q = K.tmp(cyl(5.8 * mm, *xs(s * (HWU - 0.4) * mm, s * (HWU + 3.0) * mm), 'x', (f, u), 20)); cut(q, cyl(2.6 * mm, *xs(s * (HWU - 1.0) * mm, s * (HWU + 3.5) * mm), 'x', (f, u), 14))
            bevel(q, 0.4 * mm, 1); smooth(q); K.adopt(q, 'base', 'steel')
        g = K.tmp(box(*xs(s * (HWU - 0.2) * mm, s * (HWU + 0.7) * mm), 0.0, F_FRONT - 0.002, UP_BOT * mm - 0.0006, UP_BOT * mm + 0.0006)); smooth(g); K.adopt(g, 'base', 'black')   # (the seam)
    # the brass deflector: a wedge at the port's rear on the right, its slope toward the port
    d = K.tmp(prism([(0.086, -0.003), (0.100, -0.003), (0.100, 0.016), (0.092, 0.017), (0.086, 0.009)], 'x', (HWU - 0.4) * mm, (HWU + 4.4) * mm)); bevel(d, 0.8 * mm, 2, 30); smooth(d); K.adopt(d, 'base', 'black')
    o = K.obj(cyl(3.2 * mm, -(HWU + 2.2) * mm, -(HWU - 0.4) * mm, 'x', (HANDLE[0] - 0.026, HANDLE[1] + 0.012), 16), 'base', 'steel'); smooth(o)         # (the left handle's lock stud)

# ===================================================================================================== ASSEMBLY
upper()
rails()
lower()
gas_block()
rear_sight()
front_sight()
ph = handle()
details()
barrel()
MUZ = muzzle()
ag['grip_a2'](GRIP_TOP)
stock()
if V['mag'] == 'stanag': ag['mag_stanag'](MAG_TOP)
else: mag_h(MAG_TOP)
# flat faces shade flat, edges hard at 30 degrees: normals weighted by face area (no streaks across long thin triangles of big faces)
for o in [o for o in coll.all_objects if o.type == 'MESH' and not o.name.startswith('tmp')]:
    smooth(o, 30)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    _apply(o, md)
for o in list(coll.all_objects):
    if o.name.startswith('tmp') or o.name.startswith('cutter'): bpy.data.objects.remove(o, do_unlink=True)
# viewing colours for the materials blender_kit does not know (the game replaces every material by its name)
for n, c in (('tan', (0.42, 0.34, 0.2, 1)),):
    m = bpy.data.materials.get(n)
    if m: m.diffuse_color = c

# ===================================================================================================== info and anchors
HG_END = F_FRONT + 0.003     # no handguard (the rails are the upper's): hgMax 0
info = {
    'sy': round(SY * mm, 4), 'fSight': round(RS_F, 4), 'relief': 0.075,
    'muzzles': [[round(MUZ, 4), 0, 0]],
    'grip': [round(GRIP_TOP[0] - 0.040, 4), round(GRIP_TOP[1] - 0.040, 4), 0], 'support': [0.300, -0.030, 0],
    'anim': {'ch': 'part_ch', 'mag': 'part_mag'},
    'magAt': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4)],
    'ch': [round(HANDLE[0], 4), round(HANDLE[1], 4), round(-(HWU + 3.0) * mm, 4)],
    'port': [round(Fp(956), 4), round(Up(349), 4), round(HWU * mm, 4)],
    'chamberAt': {'side': 'right', 'f': round(Fp(1030), 4), 'y': 0.0, 'x': round((HWU - 2.5) * mm, 4)},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [round(MZ0, 4), 0, 0]},
}
anchors = {
    'mount_optic': [0.035, round(RAIL_T * mm, 4), 0], 'mount_optic_end': [round(F_FRONT - 0.002, 4), round(RAIL_T * mm, 4), 0],
    'mount_handguard': [round(F_FRONT, 4), 0, 0], 'mount_handguard_end': [round(HG_END, 4), 0, 0],
    'mount_barrel': [round(F_GAS, 4), 0, 0], 'mount_muzzle': [round(MZ0, 4), 0, 0],
    'mount_stock': [0, STOCK_UP, 0], 'mount_grip': [round(GRIP_TOP[0], 4), round(GRIP_TOP[1], 4), 0],
    'mount_mag': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4), 0],
    'mount_tac': [round(Fp(1400), 4), round(Up(371), 4), round((HWU + 0.5) * mm, 4)],
    'mount_fg': [0.270, round(UP_BOT * mm - 0.0056, 4), 0],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
if EXPORT:
    with open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'source': 'authored', 'sights': {'builtin': ['irons'], 'rail': [], 'railed': True}}, indent=2) + '\n')
def open_edges(objs):
    """The meshes with non-manifold edges (open, or more than two faces on an edge): name -> count."""
    import bmesh as _bm
    out = {}
    for o in objs:
        b = _bm.new(); b.from_mesh(o.data); n = sum(1 for e in b.edges if not e.is_manifold); b.free()
        if n: out[o.name] = n
    return out
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'open_meshes': open_edges(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT), 'info': info, 'anchors': anchors}
print('RESULT', json.dumps(result))
