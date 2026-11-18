# The B&T APC9 K (the 4.3" / 110 mm barrel, the side-folding strut stock), modelled in Blender, fitted to take MP5 magazines.
#   Blender: exec(open(r'<repo>/models/apc9/build_apc9.py').read(), {'GUN_DIR': r'<repo>/models/apc9'})
#   or:      blender -b --factory-startup -P models/apc9/build_apc9.py
#
# What is real and what is the game's: B&T's APC9 / APC9K is a closed-bolt blowback 9x19 carbine with an upper that carries the Picatinny rail the whole
# way, a non-reciprocating charging handle in a channel on the side (reversible), a polymer lower with an AR-pattern grip, an ambidextrous paddle release in
# front of the guard, flip-up irons and a folding strut stock. B&T's own lowers take B&T MP9 magazines (or Glock / SIG P320 through other lowers); the lower
# here is NOT a B&T product: the user asked for an APC9 that takes MP5 magazines, so its well is made for the MP5's curved 30-round (the factory magazine is the
# MP5 family's own, drawn as models/mp5_kit.py draws it) and the rest of the gun is the reference's.
#
# Reference: Wikimedia Commons "B&T APC 9 K side profile.jpg" (the gun's right side, level, studio, 7952 x 5304; the 1920 px thumbnail was used, 1765 px from the butt's
# back to the muzzle) and "B&T APC 9 K angle.jpg" (the strut, the front end), CC BY-SA. This is the APC9K the photo shows (4.3" barrel, the upper's front is its forend):
# the whole gun is traced off it except the magazine. Scale 0.318 mm a pixel (the K's 562 mm overall with the stock out), checked against the butt plate (107 mm
# tall) and the grip (100 mm); the model laid over the photo in the same frame coincides to a few pixels (the silhouette's IoU 0.935 without the magazine).
# Charging handle: it is on the right in the photo; here it is on the LEFT (the support side for the right-handed shooter), the right channel stays empty.
#
# Frame (docs/models.md "Authored models"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the upper's rear face on the bore line (photo x 800, y 476).
import bpy, json, math, os
from mathutils import Matrix, Vector
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = os.path.basename(HERE)
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
SLICE = os.environ.get('APC9_SLICE', 'u')      # (which parts get slice_at_vertices: 'u' the upper only: on the lower and the magazine it cost more triangles than it saved)

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
MZ0 = UP_F1 + 0.010                  # the factory barrel's end: a muzzle device screws on (the K's barrel stub shows 10 mm ahead of its front plate)
MUZ = UP_F1 + 0.0442                 # the factory muzzle (a thread protector with its collar): the photo's x 1823, 560 mm overall with the stock out
SY = RAIL_TOP + 22.0 * mm            # the sight line: the front post's tip and the rear aperture's centre
RS = F(922)                          # the rear sight's pivot (fSight)
FS = F(1603)                         # the front sight's pivot
PORT = (F(1242), F(1363))            # the ejection port, forward
PORT_U = (U(479), U(422))            # ... its foot and top (the photo's window, "Cal. 9x19mm": the bolt and the chambered round show at its middle height, 8 mm over the bore as the MP5's do)
PORT_CZ = (PORT_U[0] + PORT_U[1]) / 2
RAIL_OUT = 6.5 * mm                  # how far the side rails' bars stand out of the flank
BR = 6.6 * mm

# ===================================================================================== UPPER (base)
def screw_head(sgn, fpx, upx, r, depth=1.0, base=0.0, slot='base', mat='gunmetal', parent=None):
    """A socket head cap screw standing out of a flank (side sgn) at photo (fpx, upx): a short cylinder, its rim chamfered once, a hex socket in its face.
    r, depth and base in mm (base: where its foot is, out from the gun's middle plane)."""
    h = K.tmp(cyl(r * mm, *xs(sgn * base * mm, sgn * (base + depth) * mm), 'x', (F(fpx), U(upx)), segs(r * mm)))
    if r >= 4: bevel(h, min(0.35, 0.25 * r, 0.3 * depth) * mm, 1, 40)                                                       # (a chamfer only on the big bosses: a 3 mm head is a few pixels)
    cut(h, cyl(0.42 * r * mm, *xs(sgn * (base + depth * 0.45) * mm, sgn * (base + depth + 0.5) * mm), 'x', (F(fpx), U(upx)), 6))
    smooth(h, 40); K.adopt(h, slot, mat, parent)

def upper():
    """The upper receiver (the APC9K's: its forend is the upper's front, ending in the plate with the side rails): the full-length Picatinny rail on a body with a ledge along
    each side (the photo's light band), the front's top corner sloping back, the long channel for the non-reciprocating charging handle down each flank (open on the left,
    where the handle is, an empty one on the right) with its two windows ahead, the ejection port (the photo's rounded window, with the bolt in it) on the right,
    two socket-head pins behind the front block, the two-screw plate at the back, a Picatinny side rail each side of the front (real slots, a screw in one),
    the forend's lower plate and the hand stop's lug."""
    half = [(0, UB), (HW - 2 * mm, UB), (HW, UB + 2 * mm), (HW, U(432)), (HW - 1.5 * mm, U(428)), (HWT + 1.5 * mm, U(420)), (HWT, U(414)), (HWT, RAIL_U0 - 2 * mm), (HWT - 2 * mm, RAIL_U0), (0, RAIL_U0)]
    full = half + [(-x, z) for x, z in reversed(half) if x > 0]
    up = K.tmp(prism(ccw([(x, z) for x, z in full]), 'y', 0.0, UP_F1))
    cut(up, rprism(PL([(1648, 330), (1700, 330), (1700, 446), (1688, 446)]), -0.04, 0.04))                              # (the front's top corner slopes back, photo (1648,335) to (1688,446))
    bevel(up, 0.8 * mm, 1, 35)                                                                                           # (one chamfer, before the small features)
    cut(up, port_pocket(PORT[0], PORT[1], PORT_U[0], PORT_U[1], HW + 2 * mm, 4.2 * mm, -2.0 * mm))                       # the ejection port (right): the photo's rounded window
    for s in (-1, 1):                                                                                                    # the handle's channel each side, and the windows ahead of it
        cut(up, prism(rounded((F(1150) + F(1535)) / 2, U(388), (F(1535) - F(1150)) / 2, 15 * S, 4.0 * mm, corner_segs(4.0 * mm)), 'x', *xs(s * (HWT - 3.0 * mm), s * (HWT + 1 * mm))))
        for a, b in ((1545, 1590), (1600, 1648)):
            cut(up, prism(rounded((F(a) + F(b)) / 2, U(388), (F(b) - F(a)) / 2, 12 * S, 2.0 * mm, corner_segs(2.0 * mm)), 'x', *xs(s * (HWT - 1.0 * mm), s * (HWT + 1 * mm))))
    if 'u' in SLICE: slice_at_vertices(up, 'y')
    smooth(up, 35); K.adopt(up, 'base', RCV)
    fb = K.tmp(prism(rounded(0, (UB + U(533)) / 2, 20.0 * mm, (UB - U(533)) / 2 + 1.0 * mm, 2.0 * mm, corner_segs(2.0 * mm)), 'y', F(1430), UP_F1)); bevel(fb, 0.8 * mm, 1, 35); smooth(fb, 35); K.adopt(fb, 'base', RCV)   # (the forend's lower plate, photo y 533)
    picatinny(K, 1.0 * mm, F(1648) - 1.0 * mm, RAIL_U0, 'base', RCV, lean=True)                                            # (the six-point dovetail: rule 6)
    for s in (-1, 1):    # the dark floor of each channel and window, so they read as openings
        o = K.obj(box(*xs(s * (HWT - 3.0 * mm + 0.05 * mm), s * (HWT - 3.2 * mm)), F(1150) + 2 * mm, F(1535) - 2 * mm, U(388) - 4.0 * mm, U(388) + 4.0 * mm), 'base', 'black'); smooth(o)
    # the port's inside (a black lining, the chamber's mouth, the feed ramp), at the window's height; the carrier is part_carrier
    port_inside(K, PORT[0], PORT[1], PORT_U[0], PORT_U[1], HW, mouth_r=4.2 * mm, ramp=12 * mm, az=PORT_CZ)
    # the two-screw plate on each flank behind the port (photo x 843-905, y 452-498)
    for s in (-1, 1):
        pl = K.tmp(prism(rounded((F(843) + F(905)) / 2, (U(452) + U(498)) / 2, (F(905) - F(843)) / 2, (U(452) - U(498)) / 2, 2.0 * mm, corner_segs(2.0 * mm)), 'x', *xs(s * (HW - 0.3 * mm), s * (HW + 1.1 * mm))))
        bevel(pl, 0.4 * mm, 1, 40); smooth(pl, 40); K.adopt(pl, 'base', RCV)
        for px in (858, 878): screw_head(s, px, 475, 1.9, 0.9, HW / mm + 1.0)
    # a Picatinny side rail each side of the front (the photo's, x 1485-1687, 21 mm across): bars with real slots between them, down to the flank
    SLOTS = (1520, 1552, 1585, 1617, 1652)
    edges = [1485] + [e for sx in SLOTS for e in (sx - 8, sx + 8)] + [1687]
    for s in (-1, 1):
        for a, b in zip(edges[::2], edges[1::2]):
            bar = K.tmp(box(*xs(s * (HW - 0.3 * mm), s * (HW + RAIL_OUT)), F(a), F(b), U(506), U(439))); bevel(bar, 0.4 * mm, 1, 35); smooth(bar, 35); K.adopt(bar, 'base', RCV)
        for px in (1495, 1630): screw_head(s, px, 471, 2.9, 1.2, (HW + RAIL_OUT) / mm - 0.2)                              # (the two socket screws on the rail's bars, photo (1495, 471) and (1630, 472))
        # the pins' heads (photo (1401, 451) (1455, 451) (1427, 494)); the takedown pin's boss is the lower's
        for px, py, r in ((1401, 451, 3.6), (1455, 451, 3.6), (1427, 494, 3.6)): screw_head(s, px, py, r, 1.2, HW / mm - 0.2)
    # the hand stop under the forend: a hooked lug (photo x 1598-1662, y 526-606) with its socket screw
    hs = K.tmp(rprism(PL([(1598, 526), (1662, 526), (1660, 556), (1642, 570), (1636, 596), (1630, 606), (1612, 606), (1608, 590), (1598, 570)]), -6.0 * mm, 6.0 * mm)); bevel(hs, 0.8 * mm, 1, 35); smooth(hs, 35); K.adopt(hs, 'base', RCV)
    for s in (-1, 1): screw_head(s, 1627, 545, 2.9, 1.2, 6.0)

# ===================================================================================== LOWER (base): body, guard, trigger, well, releases, selector
MAG_F, MAG_Y = F(1318), -12.0 * mm   # the magazine well's centre and the magazine's top (mount_mag): the MP5's 30-round, drawn as models/mp5_kit.py draws it
MAG_LEN, MAG_C, MAG_D, MAG_W = 0.180, 0.058, 0.032, 0.022
W_BK, W_FR = MAG_F - 17.5 * mm, MAG_F + 25.0 * mm   # the well's inside, back and front (the curved magazine drifts forward as it goes down)
W_HW = 12.5 * mm                                     # its inside half width (the magazine is 22 mm)
LW = 19.0 * mm                                       # the lower's half width
LIP = U(700)                                         # the well's mouth (the lower's underside)
def lower():
    """The polymer lower: the body with its trigger guard and the magazine well (hollow, for the MP5's curved magazine), the machined lines on its flank (two long slots along
    the top, a long diagonal recess, two slots either side of the bolt catch tab, the tab and its recess), the wing-shaped ambidextrous selector with its red and white
    position dots, the red 'fire' dash, the pin boss, the takedown pin's boss, the trigger and the paddle release along the guard."""
    body = K.tmp(rprism(PL([(800, 512), (1427, 512), (1427, 700), (1292, 700), (1270, 722), (1164, 724), (1021, 724), (1021, 624), (960, 604), (900, 598), (846, 592), (836, 560), (800, 540)]), -LW, LW))
    bevel(body, 1.2 * mm, 1, 35)                                                                                       # (one chamfer, before the features)
    cut(body, rprism(PL([(1045, 634), (1196, 634), (1204, 652), (1188, 700), (1160, 716), (1052, 716), (1044, 702)]), -LW - 1 * mm, LW + 1 * mm))          # the trigger guard's opening
    cut(body, box(-W_HW, W_HW, W_BK, W_FR, -0.09, UB + 0.01))                                                          # the magazine well, through
    D = 1.3 * mm                                                                                                       # (the machined lines' depth)
    for s in (-1, 1):
        def line(poly): cut(body, rprism(poly, s * (LW - D), s * (LW + 1 * mm)))
        for y in (518.5, 526.5):                                                                                       # the two long slots along the top
            line(PL([(990, y - 2.4), (1395, y - 2.4), (1395, y + 2.4), (990, y + 2.4)]))
        line(PL([(1090, 550), (1185, 550), (1185, 558), (1090, 558)]))                                                 # the slot above the pin boss
        line(PL([(1280, 550), (1395, 550), (1395, 558), (1280, 558)]))                                                 # the slot ahead of the tab
        line(PL([(1040, 543), (1050, 541), (1176, 592), (1166, 602)]))                                                 # the long diagonal recess
        line(PL([(1252, 553), (1275, 553), (1275, 590), (1252, 590)]))                                                 # the recess beside the tab
    if 'l' in SLICE: slice_at_vertices(body, 'y')
    smooth(body, 35); K.adopt(body, 'base', LOW)
    # the trigger
    t = K.tmp(rprism(PL([(1096, 634), (1112, 634), (1118, 660), (1120, 690), (1110, 710), (1100, 708), (1104, 690), (1100, 660)]), -3.2 * mm, 3.2 * mm)); bevel(t, 0.6 * mm, 1); smooth(t); K.adopt(t, 'base', 'black')
    for s in (-1, 1):
        # the ambidextrous paddle release along the guard's front and the well's lower edge (photo (1207,667) to (1368,633))
        p = K.tmp(rprism(PL([(1207, 667), (1366, 633), (1372, 640), (1366, 652), (1212, 686), (1204, 678)]), s * (LW - 0.2 * mm), s * (LW + 2.8 * mm))); bevel(p, 0.8 * mm, 1, 35); smooth(p, 35); K.adopt(p, 'base', 'black')
        # the wing-shaped selector lever (photo x 937-1008, y 553-596) with its pivot cap, textured: lighter than the lower
        wing = [(937, 556), (955, 553), (985, 556), (1002, 566), (1008, 580), (1000, 592), (982, 596), (962, 590), (948, 578), (940, 566)]
        sl = K.tmp(rprism(PL(wing), *xs(s * (LW - 0.2 * mm), s * (LW + 2.2 * mm)))); bevel(sl, 0.5 * mm, 1, 35); smooth(sl, 35); K.adopt(sl, 'base', 'gunmetal')
        o = K.tmp(cyl(1.2 * mm, *xs(s * (LW + 2.0 * mm), s * (LW + 2.6 * mm)), 'x', (F(988), U(571)), 8)); smooth(o); K.adopt(o, 'base', 'black')
        # the bolt catch's tab at the well's top front (photo x 1195-1247, y 553-590): a raised rectangle with a slit across it
        tab = K.tmp(prism(rounded((F(1195) + F(1247)) / 2, (U(553) + U(590)) / 2, (F(1247) - F(1195)) / 2, (U(553) - U(590)) / 2, 1.2 * mm, corner_segs(1.2 * mm)), 'x', *xs(s * (LW - 0.2 * mm), s * (LW + 2.4 * mm))))
        cut(tab, box(*xs(s * (LW + 1.7 * mm), s * (LW + 3 * mm)), F(1202), F(1240), U(570), U(572.5)))
        bevel(tab, 0.4 * mm, 1, 35); smooth(tab, 35); K.adopt(tab, 'base', 'black')
        screw_head(s, 1077, 596, 5.4, 1.2, LW / mm - 0.2)                                                              # (the pin boss, photo (1077, 596))
        screw_head(s, 1425, 543, 4.7, 1.4, LW / mm - 0.2)                                                              # (the takedown pin's boss, photo (1425, 543))
    # the red 'fire' dash, the red and white position dots (right side)
    o = K.tmp(prism(rounded((F(1028) + F(1052)) / 2, (U(589) + U(599)) / 2, (F(1052) - F(1028)) / 2, (U(589) - U(599)) / 2, 1.4 * mm, corner_segs(1.4 * mm)), 'x', LW - 0.1 * mm, LW + 0.5 * mm)); smooth(o); K.adopt(o, 'base', 'm_c22b1e')
    for px, py, m in ((921, 567, 'sightPaint'), (926, 608, 'm_c22b1e')):
        o = K.tmp(cyl(1.3 * mm, LW - 0.1 * mm, LW + 0.4 * mm, 'x', (F(px), U(py)), 8)); smooth(o); K.adopt(o, 'base', m)
    # the lower's rim where it meets the upper: a thin seam strip
    for s in (-1, 1):
        o = K.obj(box(*xs(s * (LW - 0.1 * mm), s * (LW + 0.4 * mm)), F(810), F(1420), UB - 0.6 * mm, UB + 0.2 * mm), 'base', 'gunmetal')

def grip():
    """B&T's grip (an AR-pattern pistol grip: a flat back strap with deep slats pressed across it, finger slats down the front, a hooked toe); its front top is mount_grip."""
    pts = PL([(1021, 612), (1021, 724), (990, 740), (973, 780), (955, 820), (937, 860), (919, 900), (913, 922), (924, 936), (934, 946), (928, 953), (884, 946), (837, 925), (794, 905), (755, 882), (759, 860), (781, 820), (804, 780), (830, 740), (859, 700), (878, 660), (870, 620), (849, 600), (900, 588), (960, 602)])   # (the photo's grip outline, read off its silhouette every 20 px; the toe hooks forward at its front)
    gp = K.tmp(rprism(pts, -15.0 * mm, 15.0 * mm))
    bevel(gp, 2.2 * mm, 1, 30)                                                                                           # (one chamfer, before the slats)
    d = (0.914, 0.405)                                                                                                    # (the slats run square to the grip's axis: down to the right in the photo)
    def rear_edge(y):
        P = [(879, 660), (873, 680), (859, 700), (844, 720), (830, 740), (817, 760), (804, 780), (792, 800), (781, 820), (770, 840), (759, 860), (755, 880)]
        for (xa, ya), (xb, yb) in zip(P, P[1:]):
            if ya <= y <= yb: return (xa + (xb - xa) * (y - ya) / (yb - ya), y)
        return P[-1]
    def front_edge(y):
        P = [(990, 740), (981, 760), (973, 780), (964, 800), (955, 820), (946, 840), (937, 860), (928, 880), (919, 900)]
        for (xa, ya), (xb, yb) in zip(P, P[1:]):
            if ya <= y <= yb: return (xa + (xb - xa) * (y - ya) / (yb - ya), y)
        return P[-1]
    def slat(c, half, thick, depth, s):
        n = (-d[1], d[0])
        a = (c[0] - d[0] * half, c[1] - d[1] * half); b = (c[0] + d[0] * half, c[1] + d[1] * half)
        poly = PL([(a[0] - n[0] * thick, a[1] - n[1] * thick), (b[0] - n[0] * thick, b[1] - n[1] * thick), (b[0] + n[0] * thick, b[1] + n[1] * thick), (a[0] + n[0] * thick, a[1] + n[1] * thick)])
        return rprism(poly, s * (15.0 * mm - depth), s * (15.0 * mm + 1.0 * mm))
    def joined(mes):
        bm = bmesh.new()
        for me in mes: bm.from_mesh(me); bpy.data.meshes.remove(me)
        out = bpy.data.meshes.new('tmp'); bm.to_mesh(out); bm.free(); return out
    for s in (-1, 1):                                      # (one cutter a side: every slat of it together)
        cs = []
        for y in range(700, 886, 12):                       # the back strap's deep slats, from its edge in over the side
            e = rear_edge(y); cs.append(slat((e[0] + d[0] * 40, e[1] + d[1] * 40), 44, 2.2, 2.2 * mm, s))
        for y in range(752, 904, 12):                       # the finger slats down the front
            e = front_edge(y); cs.append(slat((e[0] - d[0] * 24, e[1] - d[1] * 24), 30, 2.2, 1.8 * mm, s))
        for k in range(0, len(cs), 4): cut(gp, joined(cs[k:k + 4]))
    tidy(gp); smooth(gp, 30); K.adopt(gp, 'grip', LOW)
    for s in (-1, 1): screw_head(s, 885, 700, 2.4, 1.0, 14.0, slot='grip')                                                # (the medallion's screw each side)

# ===================================================================================== STOCK (factory: stock): the hinge block, the strut, the butt plate
def stock():
    """The strut stock: the hinge block (a vertical slot through it, the round boss, the fold latch's tab below), the wide flat strut with its detent notches along the top, the oval butt plate with its two windows and a hub with two screws."""
    hb = K.tmp(rprism(PL([(800, 338), (729, 440), (740, 458), (738, 530), (750, 560), (785, 580), (849, 600), (849, 512), (800, 512)]), -20.0 * mm, 20.0 * mm)); bevel(hb, 1.5 * mm, 1, 35)
    cut(hb, prism(rounded(F(777), U(474), 2.5 * mm, 7.9 * mm, 2.4 * mm, corner_segs(2.4 * mm)), 'x', -25 * mm, 25 * mm))                      # the vertical slot through the block (photo x 770-785, y 450-500)
    smooth(hb, 35); K.adopt(hb, 'stock', LOW)
    for s in (-1, 1):
        o = K.tmp(cyl(3.8 * mm, *xs(s * 19.6 * mm, s * 20.6 * mm), 'x', (F(820), U(525)), segs(3.8 * mm))); smooth(o); K.adopt(o, 'stock', 'gunmetal')               # (the round boss, photo (820, 525))
    tb = K.tmp(rprism(PL([(718, 538), (745, 538), (745, 558), (718, 558)]), -6.0 * mm, 6.0 * mm)); bevel(tb, 1.0 * mm, 1, 35); smooth(tb, 35); K.adopt(tb, 'stock', 'black')     # (the fold latch's tab, photo (718-745, 538-558))
    st = K.tmp(rprism(PL([(790, 450), (125, 450), (125, 498), (790, 498)]), -13.0 * mm, 13.0 * mm)); bevel(st, 1.0 * mm, 1, 35)
    for a, b in ((520, 538), (620, 642)): cut(st, box(-14 * mm, 14 * mm, F(a), F(b), U(456), U(449)))                      # the detent notches along the strut's top (photo x 520-538 and 620-642, 2 mm deep)
    smooth(st, 35); K.adopt(st, 'stock', 'black')
    # the butt: an oval plate with two long windows, a hub block on the strut with two screws
    ob = K.tmp(prism(rounded(0, (U(329) + U(672)) / 2, 18.0 * mm, (U(329) - U(672)) / 2, 11.0 * mm, corner_segs(11.0 * mm)), 'y', F(61), F(139))); bevel(ob, 1.8 * mm, 1, 35)
    cut(ob, prism(rounded(0, U(395), 6.0 * mm, 28.0 * mm, 4.0 * mm, corner_segs(4.0 * mm)), 'y', F(61) - 1 * mm, F(139) + 1 * mm)); cut(ob, prism(rounded(0, U(600), 6.0 * mm, 30.0 * mm, 4.0 * mm, corner_segs(4.0 * mm)), 'y', F(61) - 1 * mm, F(139) + 1 * mm))
    smooth(ob, 35); K.adopt(ob, 'stock', 'rubber')
    hub = K.tmp(box(-12.0 * mm, 12.0 * mm, F(61) + 3 * mm, F(150), U(440), U(505))); bevel(hub, 1.2 * mm, 1, 35); smooth(hub, 35); K.adopt(hub, 'stock', 'black')
    for s in (-1, 1):
        for px in (73, 94): screw_head(s, px + 6 * mm / S, 473, 2.4, 1.2, 12.0, slot='stock')

# ===================================================================================== BARREL and MUZZLE (slots barrel, muzzle)
def barrel_and_muzzle():
    """The K's barrel stub from the upper's front plate, and the muzzle: a plain tube with the collar of its thread protector (photo x 1717-1750) and a chamfered end."""
    o = K.obj(lathe([(UP_F1 - 1.0 * mm, BR), (MZ0, BR)], segs(BR)), 'barrel', 'park'); smooth(o)
    CR, TR = 9.4 * mm, 7.0 * mm
    mz = K.tmp(lathe([(MZ0, TR), (MZ0 + 8.0 * mm, TR), (MZ0 + 9.0 * mm, CR), (MZ0 + 19.5 * mm, CR), (MZ0 + 21.0 * mm, TR), (MUZ - 1.2 * mm, TR), (MUZ, TR - 1.2 * mm), (MUZ, 3.2 * mm), (MUZ - 0.01, 3.2 * mm)], segs(CR)))
    smooth(mz, 40); K.adopt(mz, 'muzzle', 'park')

# ===================================================================================== IRONS (slot optic): the flip-up rear dial sight and front post, upright; folded as the mount
def rear_flip(f):
    base = K.tmp(prism([(f - 14 * mm, RAIL_TOP), (f + 12 * mm, RAIL_TOP), (f + 10 * mm, RAIL_TOP + 8 * mm), (f - 12 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm)); bevel(base, 0.8 * mm, 1); smooth(base); K.adopt(base, 'optic', RCV)
    o = K.obj(cyl(3.6 * mm, 9.5 * mm, 12.0 * mm, 'x', (f, RAIL_TOP + 4.5 * mm), segs(3.6 * mm)), 'optic', 'steel'); smooth(o)            # (the pivot's hex socket screw)
    lf = K.tmp(prism([(-4.5 * mm, RAIL_TOP + 7 * mm), (4.5 * mm, RAIL_TOP + 7 * mm), (4.5 * mm, SY - 5 * mm), (-4.5 * mm, SY - 5 * mm)], 'y', f - 1.6 * mm, f + 1.6 * mm))
    boolean(lf, cyl(7.0 * mm, f - 2.6 * mm, f + 2.6 * mm, 'y', (0, SY), segs(7.0 * mm)), 'UNION')
    cut(lf, cyl(3.4 * mm, f - 0.01, f + 0.01, 'y', (0, SY), segs(3.4 * mm)))
    tidy(lf); smooth(lf); K.adopt(lf, 'optic', RCV)                                                                  # (a thin plate: no chamfer, rule 5)

def front_flip(f):
    base = K.tmp(prism([(f - 20 * mm, RAIL_TOP), (f + 8 * mm, RAIL_TOP), (f + 7 * mm, RAIL_TOP + 8 * mm), (f - 18 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm)); bevel(base, 0.8 * mm, 1); smooth(base); K.adopt(base, 'optic', RCV)
    o = K.obj(cyl(3.6 * mm, 9.5 * mm, 12.0 * mm, 'x', (f, RAIL_TOP + 4.5 * mm), segs(3.6 * mm)), 'optic', 'steel'); smooth(o)
    ea = K.tmp(prism([(f - 4 * mm, RAIL_TOP + 6 * mm), (f + 2 * mm, RAIL_TOP + 6 * mm), (f + 1 * mm, SY + 5 * mm), (f - 3 * mm, SY + 5 * mm)], 'x', -9.0 * mm, 9.0 * mm))
    cut(ea, box(-7.2 * mm, 7.2 * mm, f - 0.01, f + 0.01, SY - 12 * mm, SY + 6 * mm)); bevel(ea, 0.5 * mm, 1); smooth(ea); K.adopt(ea, 'optic', RCV)
    K.obj(box(-0.75 * mm, 0.75 * mm, f - 1.6 * mm, f + 0.2 * mm, SY - 12.5 * mm, SY), 'optic', 'steel')

def fold_irons(rs, fs_):
    """Both sights folded flat BACK toward the shooter over their bases (the photo's state, 14 mm over the rail): the optic's mount piece, drawn only under a real optic
    (extras.mount). The rear one is a housing with its knurled dial at the back; the front one a longer housing with the post laid along its top."""
    def mount(o): o['mount'] = True; return o
    f = rs
    base = K.tmp(prism([(f - 14 * mm, RAIL_TOP), (f + 12 * mm, RAIL_TOP), (f + 10 * mm, RAIL_TOP + 8 * mm), (f - 12 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm)); bevel(base, 0.8 * mm, 1); smooth(base); mount(K.adopt(base, 'optic', RCV))
    mount(smooth(K.obj(cyl(3.6 * mm, 9.5 * mm, 12.0 * mm, 'x', (f, RAIL_TOP + 4.5 * mm), segs(3.6 * mm)), 'optic', 'steel')))
    hs = K.tmp(box(-8.0 * mm, 8.0 * mm, f - 36 * mm, f + 3 * mm, RAIL_TOP + 7.5 * mm, RAIL_TOP + 14.0 * mm)); bevel(hs, 0.8 * mm, 1, 35); smooth(hs, 35); mount(K.adopt(hs, 'optic', RCV))
    dl = K.tmp(cyl(7.2 * mm, -8.0 * mm, 8.0 * mm, 'x', (f - 31 * mm, RAIL_TOP + 7.0 * mm), segs(7.2 * mm))); bevel(dl, 0.5 * mm, 1, 40); smooth(dl, 40); mount(K.adopt(dl, 'optic', RCV))
    f = fs_
    base = K.tmp(prism([(f - 20 * mm, RAIL_TOP), (f + 8 * mm, RAIL_TOP), (f + 7 * mm, RAIL_TOP + 8 * mm), (f - 18 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm)); bevel(base, 0.8 * mm, 1); smooth(base); mount(K.adopt(base, 'optic', RCV))
    mount(smooth(K.obj(cyl(3.6 * mm, 9.5 * mm, 12.0 * mm, 'x', (f, RAIL_TOP + 4.5 * mm), segs(3.6 * mm)), 'optic', 'steel')))
    hs = K.tmp(box(-8.5 * mm, 8.5 * mm, f - 50 * mm, f + 5 * mm, RAIL_TOP + 7.5 * mm, RAIL_TOP + 14.0 * mm)); bevel(hs, 0.8 * mm, 1, 35); smooth(hs, 35); mount(K.adopt(hs, 'optic', RCV))
    mount(K.obj(box(-0.75 * mm, 0.75 * mm, f - 46 * mm, f - 4 * mm, RAIL_TOP + 14.0 * mm, RAIL_TOP + 15.5 * mm), 'optic', 'steel'))

# ===================================================================================== CHARGING HANDLE (part_handle): non-reciprocating, on the left
H_F, H_Y = F(1492), U(388)            # at rest: the front of its channel (the photo's handle at x 1474-1526)
H_TRAVEL = 0.100
def handle():
    """B&T's non-reciprocating handle: a stem through the channel and a lever standing out of the flank, a flat blade 22 mm out and 14 mm tall with a hooked lip at its
    front where the finger takes it. It stays put when the gun fires and is pulled back only by the hand."""
    ph = K.part('handle', (0, H_F, H_Y))
    o = K.obj(cyl(3.2 * mm, -(HWT + 6.0 * mm), -(HWT - 3.0 * mm), 'x', (H_F, H_Y), segs(3.2 * mm)), 'base', 'steel', ph); smooth(o)
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
    bevel(body, 0.9 * mm, 1, 30)
    if 'm' in SLICE: slice_at_vertices(body, 'y')
    smooth(body); K.adopt(body, 'mag', 'park', pm)
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
CARRIER = port_carrier(K, PORT[0], PORT[1], PORT_U[0], PORT_U[1], HW, x1=HW - 1.6 * mm, ax=0.0, az=PORT_CZ, head=0.026, body='box')   # (the bolt carrier in the port: part_carrier)
lower()
grip()
stock()
barrel_and_muzzle()
rear_flip(RS); front_flip(FS); fold_irons(RS, FS)
handle()
magazine()

for o in [o for o in coll.all_objects if o.type == 'MESH' and not o.name.startswith('tmp')]:
    tidy(o, 1e-6, True); smooth(o, 30)
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
    'grip': [round(GRIP_TOP[0] - 0.040, 4), round(GRIP_TOP[1] - 0.040, 4), 0], 'support': [round(UP_F1 - 0.04, 4), -0.016, 0],
    'anim': {'handle': 'part_handle', 'carrier': 'part_carrier', 'mag': 'part_mag'},
    'carrier': {'travel': 0.075},
    'magAt': [round(MAG_F, 4), round(MAG_Y, 4)],
    'handle': {'f': round(H_F, 4), 'y': round(H_Y, 4), 'x': round(-(HWT + 16.0 * mm), 4), 'travel': H_TRAVEL, 'style': 'tab', 'recip': False,
               'grab': [round(H_F + 111.5 * mm, 4), round(H_Y - 42.3 * mm, 4), round(-(HWT + 24.1 * mm), 4)]},   # (seated by measurement in the game: the hand's origin is the palm, 112 mm ahead of the lever and 42 mm below it, so that with the 'tab' pose (fingers pointing back and up along the left flank) the index fingertip lands on the arm's front face)
    'port': [round((PORT[0] + PORT[1]) / 2, 4), round((PORT_U[0] + PORT_U[1]) / 2, 4), round(HW, 4)],
    'chamberAt': {'side': 'port', 'f': round(PORT[1] - 0.7 * mm - 0.72 * 0.026, 4), 'y': round(PORT_CZ + 0.0045, 4), 'x': 0.0},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [round(MZ0, 4), 0, 0]},
}
anchors = {
    'mount_optic': [0.001, round(RAIL_U0, 4), 0], 'mount_optic_end': [round(UP_F1 - 0.002, 4), round(RAIL_U0, 4), 0],
    'mount_optic_rail': [0.001, round(RAIL_TOP, 4), 0], 'mount_optic_rail_end': [round(UP_F1 - 0.002, 4), round(RAIL_TOP, 4), 0],
    'mount_handguard': [round(UP_F1, 4), 0, 0], 'mount_handguard_end': [round(UP_F1 + 0.003, 4), 0, 0],
    'mount_barrel': [round(UP_F1 + 0.004, 4), 0, 0], 'mount_muzzle': [round(MZ0, 4), 0, 0],
    'mount_stock': [0, 0, 0], 'mount_grip': [round(GRIP_TOP[0], 4), round(GRIP_TOP[1], 4), 0],
    'mount_mag': [round(MAG_F, 4), round(MAG_Y, 4), 0],
    'mount_tac': [round(F(1590), 4), round(U(472.5), 4), round(HW + RAIL_OUT, 4)],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
