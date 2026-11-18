# The B&T APC9 (PRO: the 175 mm / 6.9" barrel, the side-folding strut stock), modelled in Blender, fitted to take MP5 magazines.
#   Blender: exec(open(r'<repo>/models/apc9/build_apc9.py').read(), {'GUN_DIR': r'<repo>/models/apc9'})
#   or:      blender -b --factory-startup -P models/apc9/build_apc9.py
#
# What is real and what is the game's: B&T's APC9 / APC9 PRO is a closed-bolt blowback 9x19 carbine with an upper that carries the Picatinny rail the whole
# way, a non-reciprocating charging handle in a channel on the side (reversible), a polymer lower with an AR-pattern grip, an ambidextrous paddle release in
# front of the guard, flip-up irons and a folding strut stock. B&T's own lowers take B&T MP9 magazines (or Glock / SIG P320 through other lowers); the lower
# here is NOT a B&T product: the user asked for an APC9 that takes MP5 magazines, so its well is made for the MP5's curved 30-round (the factory magazine is the
# MP5 family's own, drawn as models/mp5_kit.py draws it) and the rest of the gun is the reference's.
#
# Reference (viewed, not downloaded): Wikimedia Commons "B&T APC 9 K side profile.jpg" (the gun's right side, level, studio, 7952 x 5304; the 1920 px thumbnail is
# used: 1765 px from the butt's back to the muzzle). It is an APC9K (4.3" barrel, short forend); the APC9's receiver, lower, grip, stock, sights and port are the
# same, so those are traced off it and the forend and barrel are the PRO's 175 mm (a forend 62 mm longer, the muzzle 65 mm further). Scale: 0.318 mm a pixel from
# the APC9 PRO's 627 mm overall (B&T: stock extended; its K is 562 mm) and checked against the butt plate (107 mm tall) and the grip (100 mm). Licence: see the file's
# page on Commons (CC BY-SA). Charging handle: it is on the right in the photo; here it is on the LEFT (the support side for the right-handed shooter), the right
# channel stays empty.
#
# Frame (docs/models.md "Authored models"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the upper's rear face on the bore line (photo x 800, y 476).
import bpy, json, math, os
from mathutils import Matrix, Vector
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = os.path.basename(HERE)
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'

S = 0.318 * mm
X0, Y0 = 800, 476
def F(x): return (x - X0) * S
def U(y): return (Y0 - y) * S
def PL(pts): return [(F(x), U(y)) for x, y in pts]
def xs(a, b): return tuple(sorted((a, b)))
def rprism(pts, x0, x1): return prism(pts, 'x', *xs(x0, x1))

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID
RCV, LOW = 'black', 'polymer'

# ---- stations (metres) ----
HW = 24.0 * mm                       # the upper's half width below its shoulder
HWT = 21.0 * mm                      # ... and above the step (a ledge runs along each side at photo y 425)
UB = U(512)                          # the upper's underside (the lower's seam)
RAIL_U0 = U(354)                     # the rail's base: the top of the upper's body
RAIL_TOP = RAIL_U0 + 5.6 * mm        # ... and the rail's top
UP_F1 = F(1684)                      # the upper's front face: mount_handguard
FEND = UP_F1 + 0.062                 # the APC9 PRO's longer forend ends here (the APC9K's barrel shows from the face)
MZ0 = FEND + 0.030                   # the factory barrel's end: a muzzle device screws on
MUZ = MZ0 + 0.017                    # the factory muzzle (a thread protector / flash hider): 627 mm overall with the stock out
SY = RAIL_TOP + 22.0 * mm            # the sight line: the front post's tip and the rear aperture's centre
RS = F(922)                          # the rear sight's pivot (fSight)
FS = F(1603)                         # the front sight's pivot
PORT = (F(1242), F(1363))            # the ejection port, forward
PORT_U = (U(496), U(436))            # ... its foot and top (the photo's window sits higher; the chamber is on the bore, so it is centred there)
BR = 6.6 * mm

# ===================================================================================== UPPER (base)
def upper():
    """The upper receiver: the full-length Picatinny rail on a body with a ledge along each side (the photo's light band), the long channel for the non-reciprocating
    charging handle down each flank (open on the left, where the handle is, an empty one on the right) with its two windows ahead, the ejection port with the bolt in it
    on the right, three pin heads behind the front rail block, a short Picatinny rail on each side of the front, the PRO's forend with its M-LOK slots."""
    half = [(0, UB), (HW - 2 * mm, UB), (HW, UB + 2 * mm), (HW, U(432)), (HW - 1.5 * mm, U(428)), (HWT + 1.5 * mm, U(420)), (HWT, U(414)), (HWT, RAIL_U0 - 2 * mm), (HWT - 2 * mm, RAIL_U0), (0, RAIL_U0)]
    full = half + [(-x, z) for x, z in reversed(half) if x > 0]
    up = K.tmp(prism(ccw([(x, z) for x, z in full]), 'y', 0.0, FEND))
    cut(up, port_pocket(PORT[0], PORT[1], PORT_U[0], PORT_U[1], HW + 2 * mm, 3.0 * mm, -2.0 * mm))                       # the ejection port (right)
    for s in (-1, 1):                                                                                                    # the handle's channel each side, and the windows ahead of it
        cut(up, prism(rounded((F(1150) + F(1535)) / 2, U(388), (F(1535) - F(1150)) / 2, 15 * S, 4.0 * mm, 4), 'x', *xs(s * (HWT - 3.0 * mm), s * (HWT + 1 * mm))))
        for a, b in ((1542, 1590), (1600, 1630)):
            cut(up, prism(rounded((F(a) + F(b)) / 2, U(388), (F(b) - F(a)) / 2, 12 * S, 2.0 * mm, 3), 'x', *xs(s * (HWT - 1.0 * mm), s * (HWT + 1 * mm))))
    for s in (-1, 1):                                                                                                    # M-LOK slots on the PRO's forend, sides and bottom
        for k in range(3):
            f = UP_F1 + 0.012 + k * 0.016
            cut(up, prism(rounded(f, U(470), 6.5 * mm, 3.2 * mm, 1.5 * mm, 3), 'x', *xs(s * (HW - 3.0 * mm), s * (HW + 1 * mm))))
    fb = K.tmp(prism(rounded(0, (UB + U(548)) / 2, 20.0 * mm, (UB - U(548)) / 2 + 2.0 * mm, 3.0 * mm, 3), 'y', F(1430), FEND)); bevel(fb, 0.8 * mm, 1, 35); smooth(fb); K.adopt(fb, 'base', RCV)       # (the forend's underside runs down to photo y 548 ahead of the lower)
    bevel(up, 0.8 * mm, 1, 35); smooth(up); K.adopt(up, 'base', RCV)
    picatinny(K, 0.0 + 1.0 * mm, UP_F1 - 2.0 * mm, RAIL_U0, 'base', RCV)
    for s in (-1, 1):    # the dark floor of each channel and window, so they read as openings
        o = K.obj(box(*xs(s * (HWT - 3.0 * mm + 0.05 * mm), s * (HWT - 3.2 * mm)), F(1150) + 2 * mm, F(1535) - 2 * mm, U(388) - 4.0 * mm, U(388) + 4.0 * mm), 'base', 'black'); smooth(o)
    # the port's inside (a black lining, the chamber's mouth, the feed ramp), the carrier is part_carrier
    port_inside(K, PORT[0], PORT[1], PORT_U[0], PORT_U[1], HW, mouth_r=5.2 * mm, ramp=16 * mm)
    # a short Picatinny rail on each side of the front (the photo's side rail block at x 1470-1640: mount_tac) on a raised pad
    for s in (-1, 1):
        pad = K.tmp(box(*xs(s * (HW - 0.5 * mm), s * (HW + 3.0 * mm)), F(1470), F(1640), U(525), U(437))); bevel(pad, 0.8 * mm, 1); smooth(pad); K.adopt(pad, 'base', RCV)
        picatinny(K, F(1476), F(1634), U(481), 'base', RCV, axis='right' if s > 0 else 'left', x0=s * (HW + 3.0 * mm - 0.4 * mm))
    # the pins' heads (photo (1380, 475) (1430, 472) (1405, 520)) each side, the takedown pin's boss
    for s in (-1, 1):
        for px, py, r in ((1380, 475, 3.4), (1430, 472, 3.4), (1405, 520, 3.4)):
            o = K.tmp(cyl(r * mm, *xs(s * (HW - 0.2 * mm), s * (HW + 1.0 * mm)), 'x', (F(px), U(py)), 16)); cut(o, cyl(1.2 * mm, *xs(s * (HW + 0.4 * mm), s * (HW + 1.4 * mm)), 'x', (F(px), U(py)), 6)); smooth(o); K.adopt(o, 'base', 'steel')
    # the hand stop under the PRO's forend, a hooked lug (photo 1560-1610, 530-600)
    hs = K.tmp(rprism(PL([(1560, 512), (1612, 512), (1612, 580), (1598, 600), (1584, 596), (1580, 530), (1560, 528)]), -6.0 * mm, 6.0 * mm)); bevel(hs, 0.8 * mm, 1); smooth(hs); K.adopt(hs, 'base', RCV)
    # the barrel nut / the forend's front cap, and the barrel from it (slot barrel: see barrel())
    o = K.obj(lathe([(FEND - 0.5 * mm, 13.5 * mm), (FEND, 13.5 * mm)], 24), 'base', 'park'); smooth(o)

# ===================================================================================== LOWER (base): body, guard, trigger, well, releases, selector
MAG_F, MAG_Y = F(1318), -12.0 * mm   # the magazine well's centre and the magazine's top (mount_mag): the MP5's 30-round, drawn as models/mp5_kit.py draws it
MAG_LEN, MAG_C, MAG_D, MAG_W = 0.180, 0.058, 0.032, 0.022
W_BK, W_FR = MAG_F - 17.5 * mm, MAG_F + 25.0 * mm   # the well's inside, back and front (the curved magazine drifts forward as it goes down)
W_HW = 12.5 * mm                                     # its inside half width (the magazine is 22 mm)
LW = 19.0 * mm                                       # the lower's half width
LIP = U(700)                                         # the well's mouth (the lower's underside)
def lower():
    body = K.tmp(rprism(PL([(800, 512), (1427, 512), (1427, 700), (1213, 700), (1196, 714), (1164, 724), (1021, 724), (1021, 624), (960, 604), (900, 598), (846, 592), (836, 560), (800, 540)]), -LW, LW))
    cut(body, rprism(PL([(1045, 634), (1196, 634), (1204, 652), (1188, 700), (1160, 716), (1052, 716), (1044, 702)]), -LW - 1 * mm, LW + 1 * mm))          # the trigger guard's opening
    cut(body, box(-W_HW, W_HW, W_BK, W_FR, -0.09, UB + 0.01))                                                                                          # the magazine well, through
    bevel(body, 1.2 * mm, 2, 35); smooth(body); K.adopt(body, 'base', LOW)
    # the guard's reinforced rim round its opening (a bead along the edge), the trigger
    t = K.tmp(rprism(PL([(1096, 634), (1112, 634), (1118, 660), (1120, 690), (1110, 710), (1100, 708), (1104, 690), (1100, 660)]), -3.2 * mm, 3.2 * mm)); bevel(t, 0.6 * mm, 1); smooth(t); K.adopt(t, 'base', 'black')
    # the ambidextrous paddle release along the guard's front and the well's lower edge (photo (1207,667) to (1368,633)), on both sides
    for s in (-1, 1):
        p = K.tmp(rprism(PL([(1207, 667), (1366, 633), (1372, 640), (1366, 652), (1212, 686), (1204, 678)]), s * (LW - 0.2 * mm), s * (LW + 2.8 * mm))); bevel(p, 0.8 * mm, 2, 35); smooth(p); K.adopt(p, 'base', 'black')
    # the selector (an ambidextrous lever round its spindle, photo (985, 560)), the red 'fire' pip, the pins through the lower (photo (1070, 600), (1410, 540))
    for s in (-1, 1):
        o = K.obj(cyl(4.4 * mm, *xs(s * LW, s * (LW + 1.2 * mm)), 'x', (F(985), U(562)), 18), 'base', 'black'); smooth(o)
        sl = K.tmp(rprism(PL([(958, 568), (968, 552), (996, 548), (1012, 560), (1008, 580), (990, 588), (968, 584)]), *xs(s * (LW + 1.0 * mm), s * (LW + 3.4 * mm)))); bevel(sl, 0.8 * mm, 2, 35); smooth(sl); K.adopt(sl, 'base', 'black')
        for px, py, r, m in ((1070, 600, 5.0, 'steel'), (1410, 540, 6.0, 'steel'), (835, 535, 5.0, 'steel')):
            o = K.obj(cyl(r * mm, *xs(s * (LW - 0.4 * mm), s * (LW + 1.0 * mm)), 'x', (F(px), U(py)), 18), 'base', m); smooth(o)
    o = K.obj(box(LW + 0.0 * mm, LW + 0.8 * mm, F(1050), F(1076), U(604), U(598)), 'base', 'm_c22b1e'); smooth(o)          # (the red pip beside the selector's pin)
    # the lower's rim where it meets the upper: a thin seam strip
    for s in (-1, 1):
        o = K.obj(box(*xs(s * (LW - 0.1 * mm), s * (LW + 0.4 * mm)), F(810), F(1420), UB - 0.6 * mm, UB + 0.2 * mm), 'base', 'gunmetal')

def grip():
    """B&T's grip (an AR-pattern pistol grip with a flat back strap, a deep finger front and slat grooves down both faces); its front top is mount_grip."""
    pts = PL([(1021, 612), (1021, 724), (990, 740), (973, 780), (955, 820), (937, 860), (919, 900), (913, 922), (920, 946), (884, 944), (837, 925), (794, 905), (755, 882), (759, 860), (781, 820), (804, 780), (830, 740), (859, 700), (878, 660), (870, 620), (849, 600), (900, 588), (960, 602)])   # (the photo's grip outline, read off its silhouette every 20 px)
    gp = K.tmp(rprism(pts, -15.0 * mm, 15.0 * mm))
    for k in range(8):   # the slats pressed into each face
        y = 760 + 22 * k
        for s in (-1, 1):
            g = box(*xs(s * 14.2 * mm, s * 16 * mm), F(740), F(1010), U(y + 8), U(y)); cut(gp, g)
    bevel(gp, 3.5 * mm, 3, 30); smooth(gp); K.adopt(gp, 'grip', LOW)
    o = K.obj(cyl(2.4 * mm, 14.8 * mm, 15.4 * mm, 'x', (F(885), U(700)), 14), 'grip', 'steel'); smooth(o)     # (a screw / medallion each side)

# ===================================================================================== STOCK (factory: stock): the hinge block, the strut, the butt plate
def stock():
    hb = K.tmp(rprism(PL([(800, 338), (729, 440), (740, 458), (738, 530), (750, 560), (785, 580), (849, 600), (849, 512), (800, 512)]), -20.0 * mm, 20.0 * mm)); bevel(hb, 1.5 * mm, 2, 35); smooth(hb); K.adopt(hb, 'stock', LOW)
    st = K.tmp(rprism(PL([(790, 450), (125, 450), (125, 498), (790, 498)]), -13.0 * mm, 13.0 * mm)); bevel(st, 1.0 * mm, 1, 35); smooth(st); K.adopt(st, 'stock', 'black')
    # the butt: an oval plate with two long windows, a hub block on the strut with two screws
    ob = K.tmp(prism(rounded(0, (U(329) + U(672)) / 2, 18.0 * mm, (U(329) - U(672)) / 2, 11.0 * mm, 6), 'y', F(61), F(139)))
    cut(ob, prism(rounded(0, U(395), 6.0 * mm, 28.0 * mm, 4.0 * mm, 4), 'y', F(61) - 1 * mm, F(139) + 1 * mm)); cut(ob, prism(rounded(0, U(600), 6.0 * mm, 30.0 * mm, 4.0 * mm, 4), 'y', F(61) - 1 * mm, F(139) + 1 * mm))
    bevel(ob, 1.8 * mm, 2, 35); smooth(ob); K.adopt(ob, 'stock', 'rubber')
    hub = K.tmp(box(-12.0 * mm, 12.0 * mm, F(61) + 3 * mm, F(150), U(440), U(505))); bevel(hub, 1.2 * mm, 2, 35); smooth(hub); K.adopt(hub, 'stock', 'black')
    for px in (73, 94):
        o = K.tmp(cyl(2.4 * mm, 12.0 * mm, 13.2 * mm, 'x', (F(px) + 6 * mm, U(473)), 14)); smooth(o); K.adopt(o, 'stock', 'steel')

# ===================================================================================== BARREL and MUZZLE (slots barrel, muzzle)
def barrel_and_muzzle():
    o = K.obj(lathe([(FEND, BR), (MZ0, BR)], 24), 'barrel', 'park'); smooth(o)
    mz = K.tmp(lathe([(MZ0, 7.0 * mm), (MUZ - 2.5 * mm, 7.0 * mm), (MUZ - 0.5 * mm, 6.4 * mm), (MUZ, 6.0 * mm), (MUZ, 3.2 * mm), (MUZ - 0.01, 3.2 * mm)], 24))
    cut(mz, lathe([(MZ0 + 5 * mm, 7.4 * mm), (MZ0 + 6 * mm, 6.2 * mm), (MZ0 + 8 * mm, 6.2 * mm), (MZ0 + 9 * mm, 7.4 * mm)], 24))
    smooth(mz); K.adopt(mz, 'muzzle', 'park')
    for k in range(3):   # the three lugs / slots of the thread protector's end
        lg = K.tmp(box(-1.2 * mm, 1.2 * mm, MUZ - 7 * mm, MUZ - 0.4 * mm, 6.0 * mm, 7.6 * mm)); lg.data.transform(Matrix.Rotation(k * 2 * math.pi / 3, 4, 'Y')); smooth(lg); K.adopt(lg, 'muzzle', 'park')

# ===================================================================================== IRONS (slot optic): the flip-up rear dial sight and front post, upright; folded as the mount
def rear_flip(f):
    base = K.tmp(prism([(f - 14 * mm, RAIL_TOP), (f + 12 * mm, RAIL_TOP), (f + 10 * mm, RAIL_TOP + 8 * mm), (f - 12 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm)); bevel(base, 0.8 * mm, 1); smooth(base); K.adopt(base, 'optic', RCV)
    o = K.obj(cyl(3.6 * mm, 9.5 * mm, 12.0 * mm, 'x', (f, RAIL_TOP + 4.5 * mm), 16), 'optic', 'steel'); smooth(o)            # (the pivot's hex socket screw)
    lf = K.tmp(prism([(-4.5 * mm, RAIL_TOP + 7 * mm), (4.5 * mm, RAIL_TOP + 7 * mm), (4.5 * mm, SY - 5 * mm), (-4.5 * mm, SY - 5 * mm)], 'y', f - 1.6 * mm, f + 1.6 * mm))
    boolean(lf, cyl(7.0 * mm, f - 2.6 * mm, f + 2.6 * mm, 'y', (0, SY), 28), 'UNION')
    cut(lf, cyl(3.2 * mm, f - 0.01, f + 0.01, 'y', (0, SY), 24))
    cut(lf, lathe([(f - 3.0 * mm, 4.6 * mm), (f - 0.2 * mm, 3.2 * mm)], 24, (0, 0, SY)))
    for k in range(18):   # the dial's knurl
        a = 2 * math.pi * k / 18
        g = box(-0.5 * mm, 0.5 * mm, f - 3.0 * mm, f + 3.0 * mm, 6.8 * mm, 7.6 * mm); g.transform(Matrix.Translation((0, 0, SY)) @ Matrix.Rotation(a, 4, 'Y') if False else Matrix.Translation((0, f, SY)) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Translation((0, -f, -SY)))
        cut(lf, g)
    bevel(lf, 0.4 * mm, 1); smooth(lf); K.adopt(lf, 'optic', RCV)

def front_flip(f):
    base = K.tmp(prism([(f - 20 * mm, RAIL_TOP), (f + 8 * mm, RAIL_TOP), (f + 7 * mm, RAIL_TOP + 8 * mm), (f - 18 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm)); bevel(base, 0.8 * mm, 1); smooth(base); K.adopt(base, 'optic', RCV)
    o = K.obj(cyl(3.6 * mm, 9.5 * mm, 12.0 * mm, 'x', (f, RAIL_TOP + 4.5 * mm), 16), 'optic', 'steel'); smooth(o)
    ea = K.tmp(prism([(f - 4 * mm, RAIL_TOP + 6 * mm), (f + 2 * mm, RAIL_TOP + 6 * mm), (f + 1 * mm, SY + 5 * mm), (f - 3 * mm, SY + 5 * mm)], 'x', -9.0 * mm, 9.0 * mm))
    cut(ea, box(-7.2 * mm, 7.2 * mm, f - 0.01, f + 0.01, SY - 12 * mm, SY + 6 * mm)); bevel(ea, 0.5 * mm, 1); smooth(ea); K.adopt(ea, 'optic', RCV)
    K.obj(box(-0.75 * mm, 0.75 * mm, f - 1.6 * mm, f + 0.2 * mm, SY - 12.5 * mm, SY), 'optic', 'steel')

def fold_irons(rs, fs_):
    """Both sights folded flat BACK toward the shooter over their bases (the photo's state): the optic's mount piece, drawn only under a real optic (extras.mount)."""
    def mount(o): o['mount'] = True; return o
    f = rs
    base = K.tmp(prism([(f - 14 * mm, RAIL_TOP), (f + 12 * mm, RAIL_TOP), (f + 10 * mm, RAIL_TOP + 8 * mm), (f - 12 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm)); bevel(base, 0.8 * mm, 1); smooth(base); mount(K.adopt(base, 'optic', RCV))
    mount(smooth(K.obj(cyl(3.6 * mm, 9.5 * mm, 12.0 * mm, 'x', (f, RAIL_TOP + 4.5 * mm), 16), 'optic', 'steel')))
    ln = SY + 7.0 * mm - (RAIL_TOP + 7 * mm)
    lf = K.tmp(prism([(-4.5 * mm, f - 1 * mm), (4.5 * mm, f - 1 * mm), (4.5 * mm, f - ln + 7.0 * mm), (-4.5 * mm, f - ln + 7.0 * mm)], 'z', RAIL_TOP + 8.0 * mm, RAIL_TOP + 11.2 * mm))
    boolean(lf, cyl(7.0 * mm, RAIL_TOP + 8.0 * mm, RAIL_TOP + 11.2 * mm, 'z', (0, f - ln + 7.0 * mm), 28), 'UNION')
    cut(lf, cyl(3.2 * mm, RAIL_TOP + 7 * mm, RAIL_TOP + 12 * mm, 'z', (0, f - ln + 7.0 * mm), 24)); bevel(lf, 0.4 * mm, 1); smooth(lf); mount(K.adopt(lf, 'optic', RCV))
    f = fs_
    base = K.tmp(prism([(f - 20 * mm, RAIL_TOP), (f + 8 * mm, RAIL_TOP), (f + 7 * mm, RAIL_TOP + 8 * mm), (f - 18 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm)); bevel(base, 0.8 * mm, 1); smooth(base); mount(K.adopt(base, 'optic', RCV))
    mount(smooth(K.obj(cyl(3.6 * mm, 9.5 * mm, 12.0 * mm, 'x', (f, RAIL_TOP + 4.5 * mm), 16), 'optic', 'steel')))
    ea = K.tmp(prism([(-9.0 * mm, f - 22 * mm), (9.0 * mm, f - 22 * mm), (9.0 * mm, f + 1 * mm), (-9.0 * mm, f + 1 * mm)], 'z', RAIL_TOP + 8.0 * mm, RAIL_TOP + 10.2 * mm))
    cut(ea, box(-7.2 * mm, 7.2 * mm, f - 18 * mm, f - 2 * mm, RAIL_TOP + 6 * mm, RAIL_TOP + 12 * mm)); bevel(ea, 0.4 * mm, 1); smooth(ea); mount(K.adopt(ea, 'optic', RCV))
    mount(K.obj(box(-0.75 * mm, 0.75 * mm, f - 14 * mm, f, RAIL_TOP + 10.2 * mm, RAIL_TOP + 11.7 * mm), 'optic', 'steel'))

# ===================================================================================== CHARGING HANDLE (part_handle): non-reciprocating, on the left
H_F, H_Y = F(1492), U(388)            # at rest: the front of its channel (the photo's handle at x 1474-1526)
H_TRAVEL = 0.100
def handle():
    """B&T's non-reciprocating handle: a stem through the channel and a lever standing out of the flank, a flat blade 22 mm out and 14 mm tall with a hooked lip at its
    front where the finger takes it. It stays put when the gun fires and is pulled back only by the hand."""
    ph = K.part('handle', (0, H_F, H_Y))
    o = K.obj(cyl(3.2 * mm, -(HWT + 6.0 * mm), -(HWT - 3.0 * mm), 'x', (H_F, H_Y), 16), 'base', 'steel', ph); smooth(o)
    st = K.tmp(box(-(HWT - 2.6 * mm), -(HWT - 3.0 * mm), H_F - 13 * mm, H_F + 4 * mm, H_Y - 3.0 * mm, H_Y + 3.0 * mm)); smooth(st); K.adopt(st, 'base', 'steel', ph)
    ar = K.tmp(prism([(-(HWT + 1.0 * mm), H_Y - 7.5 * mm), (-(HWT + 22.0 * mm), H_Y - 5.5 * mm), (-(HWT + 24.0 * mm), H_Y + 6.5 * mm), (-(HWT + 1.0 * mm), H_Y + 7.5 * mm)], 'z', H_F - 3.0 * mm, H_F + 4.0 * mm)) if False else None
    arm = K.tmp(rprism([(H_F - 4.0 * mm, H_Y - 8.0 * mm), (H_F + 5.0 * mm, H_Y - 8.0 * mm), (H_F + 5.0 * mm, H_Y + 8.0 * mm), (H_F - 4.0 * mm, H_Y + 8.0 * mm)], -(HWT + 1.0 * mm), -(HWT + 24.0 * mm)))
    bevel(arm, 1.0 * mm, 2, 35); smooth(arm); K.adopt(arm, 'base', 'black', ph)
    lip = K.tmp(rprism([(H_F + 0.0 * mm, H_Y - 8.0 * mm), (H_F + 14.0 * mm, H_Y - 8.0 * mm), (H_F + 14.0 * mm, H_Y + 8.0 * mm), (H_F + 0.0 * mm, H_Y + 8.0 * mm)], -(HWT + 20.0 * mm), -(HWT + 24.0 * mm)))
    bevel(lip, 1.0 * mm, 2, 35); smooth(lip); K.adopt(lip, 'base', 'black', ph)     # (the flange at the outer end, forward of the arm: the finger pulls on the arm's front face, the flange keeps it from sliding off)
    for k in range(3):   # grooves on the arm's face
        g = H_F - 1.5 * mm + k * 1.5 * mm
        o = K.obj(box(-(HWT + 1.2 * mm), -(HWT + 17.0 * mm), g, g + 0.5 * mm, H_Y - 6.9 * mm, H_Y + 6.9 * mm), 'base', 'gunmetal', ph)
    return ph

# ===================================================================================== MAGAZINE (part_mag): the MP5 family's, as models/mp5_kit.py draws it
def mag_at(t):
    sl = 2 * MAG_C * t; n = math.hypot(MAG_LEN, sl)
    return MAG_F + MAG_C * t * t, MAG_Y - MAG_LEN * t, MAG_LEN / n, sl / n
def mag_edge(k0, N=22, t0=0.0, t1=1.0):
    out = []
    for i in range(N + 1):
        t = t0 + (t1 - t0) * i / N; cf, cy, nf, ny = mag_at(t); out.append((cf + nf * MAG_D * k0, cy + ny * MAG_D * k0))
    return out
def magazine():
    pm = K.part('mag', (0, MAG_F, MAG_Y)); pm['check'] = {'w': MAG_W}
    HWm = MAG_W / 2
    body = K.tmp(rprism(mag_edge(0.5) + list(reversed(mag_edge(-0.5))), -HWm, HWm))
    cut(body, box(-HWm + 1.0 * mm, HWm - 1.0 * mm, MAG_F - MAG_D / 2 + 1.0 * mm, MAG_F + MAG_D / 2 - 1.0 * mm, MAG_Y - 4 * mm, MAG_Y + 0.01))
    wins = []
    for i in range(1, 6):
        t = i / 6 * 0.94
        cf, cy, nf, ny = mag_at(t)
        q = (cf - nf * MAG_D / 2, cy - ny * MAG_D / 2)
        ang = math.atan2(ny, nf)
        x = -2.6 * mm
        g = box(x - 2.4 * mm, x + 2.4 * mm, -1.4 * mm, 1.4 * mm, -2.6 * mm, 2.6 * mm); g.transform(Matrix.Translation((0, q[0], q[1])) @ Matrix.Rotation(ang, 4, 'X')); cut(body, g)
        wins.append((i - 1, t, q, ang, nf, ny))
    bevel(body, 0.9 * mm, 1, 30); smooth(body); K.adopt(body, 'mag', 'park', pm)
    for i, t, q, ang, nf, ny in wins:
        x = -2.6 * mm
        o = K.obj(box(x - 2.2 * mm, x + 2.2 * mm, -0.3 * mm, 0.3 * mm, -2.4 * mm, 2.4 * mm), 'mag', 'brass', pm)
        d = 1.0 * mm
        o.matrix_world = Matrix.Translation((0, q[0] + d * nf, q[1] + d * ny)) @ Matrix.Rotation(ang, 4, 'X')
        o['chk'] = {'role': 'hole', 'i': i, 't': round(t, 4), 'side': 1}
    for s in (-1, 1):
        a, b = mag_edge(-0.12, 16, 0.12, 0.93), mag_edge(0.12, 16, 0.12, 0.93)
        o = K.tmp(rprism(a + list(reversed(b)), *xs(s * HWm, s * (HWm + 0.7 * mm)))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    cf, cy, nf, ny = mag_at(1.0)
    fp = K.tmp(box(-HWm - 1.6 * mm, HWm + 1.6 * mm, -MAG_D / 2 - 2.0 * mm, MAG_D / 2 + 1.5 * mm, -5.0 * mm, 1.0 * mm))
    fp.data.transform(Matrix.Translation((0, cf, cy)) @ Matrix.Rotation(math.atan2(ny, nf), 4, 'X'))
    bevel(fp, 1.0 * mm, 2, 30); smooth(fp); K.adopt(fp, 'mag', 'park', pm)
    for s in (-1, 1):
        o = K.tmp(box(*xs(s * (HWm - 0.2 * mm), s * (HWm - 3.4 * mm)), MAG_F - MAG_D / 2 + 1.0 * mm, MAG_F + MAG_D / 2 - 9 * mm, MAG_Y - 2.0 * mm, MAG_Y + 1.0 * mm))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    h = MAG_F - 14.6 * mm
    def rnd(x, z, chk):
        c = K.obj(lathe([(h, 0.5 * mm), (h, 4.95 * mm), (h + 0.8 * mm, 4.95 * mm), (h + 1.1 * mm, 4.3 * mm), (h + 1.8 * mm, 4.3 * mm), (h + 2.2 * mm, 4.95 * mm), (h + 19.15 * mm, 4.8 * mm),
                         (h + 19.15 * mm, 0.5 * mm)], 18, (x, 0, z)), 'mag', 'brass', pm); smooth(c)
        b = K.obj(lathe([(h + 19.15 * mm, 0.5 * mm), (h + 19.15 * mm, 4.5 * mm), (h + 23.5 * mm, 4.5 * mm), (h + 27.5 * mm, 3.0 * mm), (h + 29.7 * mm, 1.0 * mm), (h + 29.7 * mm, 0.4 * mm)],
                        16, (x, 0, z)), 'mag', 'brass', pm); smooth(b)
        if chk: k = 2 if chk == 'second' else 0; c['chk'] = {'role': 'top', 'i': k}; b['chk'] = {'role': 'top', 'i': k + 1}
    rnd(2.6 * mm, MAG_Y - 3.5 * mm, True)
    rnd(-2.6 * mm, MAG_Y - 11.5 * mm, 'second')
    return pm

# ===================================================================================== ASSEMBLY
upper()
CARRIER = port_carrier(K, PORT[0], PORT[1], PORT_U[0], PORT_U[1], HW, x1=HW - 1.6 * mm, ax=0.0, az=0.0, head=0.026)   # (the bolt carrier in the port: part_carrier)
lower()
grip()
stock()
barrel_and_muzzle()
rear_flip(RS); front_flip(FS); fold_irons(RS, FS)
handle()
magazine()

for o in [o for o in coll.all_objects if o.type == 'MESH' and not o.name.startswith('tmp')]:
    smooth(o, 30)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me2 = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.remove(md); old = o.data; mats = list(old.materials); o.data = me2
    me2.materials.clear()
    for m in mats: me2.materials.append(m)
    bpy.data.meshes.remove(old)
for o in list(coll.all_objects):
    if o.name.startswith('tmp') or o.name.startswith('cutter'): bpy.data.objects.remove(o, do_unlink=True)
m = bpy.data.materials.get('m_c22b1e')

# ===================================================================================== info and anchors
GRIP_TOP = (F(1021), U(612))
info = {
    'sy': round(SY, 4), 'fSight': round(RS, 4), 'relief': 0.075,
    'muzzles': [[round(MUZ, 4), 0, 0]],
    'grip': [round(GRIP_TOP[0] - 0.040, 4), round(GRIP_TOP[1] - 0.040, 4), 0], 'support': [round(UP_F1 + 0.03, 4), -0.012, 0],
    'anim': {'handle': 'part_handle', 'carrier': 'part_carrier', 'mag': 'part_mag'},
    'carrier': {'travel': 0.075},
    'magAt': [round(MAG_F, 4), round(MAG_Y, 4)],
    'handle': {'f': round(H_F, 4), 'y': round(H_Y, 4), 'x': round(-(HWT + 16.0 * mm), 4), 'travel': H_TRAVEL, 'style': 'tab', 'recip': False,
               'grab': [round(H_F + 120.4 * mm, 4), round(H_Y - 0.6 * mm, 4), round(-(HWT + 24.1 * mm), 4)]},   # (seated by measurement in the game: the hand's origin is the palm, 120 mm ahead of the lever, so that with the 'tab' pose (fingers pointing back along the left flank) the index fingertip lands on the arm's front face)
    'port': [round((PORT[0] + PORT[1]) / 2, 4), round((PORT_U[0] + PORT_U[1]) / 2, 4), round(HW, 4)],
    'chamberAt': {'side': 'port', 'f': round(PORT[1] - 0.7 * mm - 0.72 * 0.026, 4), 'y': 0.0045, 'x': 0.0},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [round(MZ0, 4), 0, 0]},
}
anchors = {
    'mount_optic': [0.001, round(RAIL_U0, 4), 0], 'mount_optic_end': [round(UP_F1 - 0.002, 4), round(RAIL_U0, 4), 0],
    'mount_optic_rail': [0.001, round(RAIL_TOP, 4), 0], 'mount_optic_rail_end': [round(UP_F1 - 0.002, 4), round(RAIL_TOP, 4), 0],
    'mount_handguard': [round(UP_F1, 4), 0, 0], 'mount_handguard_end': [round(UP_F1 + 0.003, 4), 0, 0],
    'mount_barrel': [round(FEND, 4), 0, 0], 'mount_muzzle': [round(MZ0, 4), 0, 0],
    'mount_stock': [0, 0, 0], 'mount_grip': [round(GRIP_TOP[0], 4), round(GRIP_TOP[1], 4), 0],
    'mount_mag': [round(MAG_F, 4), round(MAG_Y, 4), 0],
    'mount_tac': [round(F(1555), 4), round(U(481), 4), round(HW + 3.0 * mm, 4)],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
