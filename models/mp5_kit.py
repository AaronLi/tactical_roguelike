# The shared builder of the HK MP5 family (the MP5A2 and the MP5SD): models/<id>/build_<id>.py set CFG and exec this. The receiver, the
# trigger housing, the grip, the A2 stock, the magazine and the drum sight are the same on both; the front of the gun is each one's own: the
# MP5's cocking tube, slim handguard, front sight and three-lug barrel, or the MP5SD's ribbed handguard round its integral suppressor with the
# front sight on its collar (and the MP5SD's two other barrels, written beside it as variants: barrel_long.glb, barrel_open.glb).
#
# References (viewed, not downloaded):
#   the receiver, trigger housing, grip, magazine, handguard, sights and barrel: Wikimedia Commons "HK MP5 noBG.png" (an MP5A3, right side,
#   level, background cut away; Dybdal / Mattes, CC BY-SA 3.0), 1250 x 550 px. Scale: butt to muzzle 1146 px is the A3's 660 mm with its stock
#   out, 0.576 mm/px; the sight radius it then gives, 340 mm, is HK's figure. The numbers below marked as photo pixels are that photo's.
#   The A2's fixed stock: Commons "MP5 in U.S. Ordnance Museum.jpg" (an MP5A2 on a museum wall, left side, 2048 x 1536 px): muzzle to butt is
#   the A2's 680 mm (0.352 mm/px), placed on the A3's frame by the receiver's rear pin and the drum sight, which both photos show.
#   The MP5SD: Commons "MP5SD.JPG" (an SD3, right side, its muzzle cut off by the frame) and "MP5SD_EP.jpg" for the parts' layout: the ribbed
#   polymer handguard over the can's rear, the front sight on a collar at its front, the smooth tube on to the muzzle; the length is HK's
#   figures, the SD2 790 mm against the A2's 680 (the can ends 110 mm ahead of the MP5's muzzle).
#
# Frame (docs/models.md "Authored models"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the receiver's rear face (the end
# cap's back) on the bore line: photo pixel x 425, y 163.5.
import bpy, json, math, os
from mathutils import Matrix, Vector
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = os.path.basename(HERE)
C = globals()['CFG']
SD = C.get('sd', False)
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'

S = 0.576 * mm                    # metres per photo pixel ("HK MP5 noBG.png")
X0, Y0 = 425, 163.5               # the origin: the end cap's rear face; the bore line
def F(x): return (x - X0) * S
def U(y): return (Y0 - y) * S
def PL(pts): return [(F(x), U(y)) for x, y in pts]
def xs(a, b): return tuple(sorted((a, b)))

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID
RCV, HOUS, FURN = 'black', 'polymer', 'polymer'

# ---- stations (metres forward of the origin) ----
TOP = U(97)                       # the receiver's flat top (38.3 mm over the bore)
RBOT = U(197)                     # the receiver's underside, ahead of the trigger housing
HW = 20.5 * mm                    # the receiver's half width (the stamped tube is 41 mm across)
RF = F(871)                       # the receiver's front (where the handguard starts: mount_handguard)
SY = U(73)                        # the line of sight: the drum's axis and the front post's tip (52.1 mm over the bore)
DRUM_F = F(557)                   # the drum's axis: the rear sight (info.fSight)
CT_Z, CT_R = 30.0 * mm, 7.2 * mm  # the cocking tube over the barrel: its axis height and radius
HG0, HG1 = RF + 0.5 * mm, F(1083) # the slim handguard (MP5): from the receiver's face to 3 mm short of the front sight housing
FSH0 = HG1 + 3 * mm               # the front sight housing's rear (mount_handguard_end: the furthest a handguard reaches)
FSH1 = F(1142)                    # ... and its front, where the barrel's three-lug end starts (mount_muzzle)
POST_F = F(1121.5)                # the front post
MUZ = F(1202)                     # the MP5's muzzle
BR_R = 7.8 * mm                   # the barrel's radius under the handguard and through the front sight housing
HANDLE_F = F(977)                 # the cocking lever at rest, at the front of its slot
HANDLE_TRAVEL = 0.053             # its pull back to the receiver's face
# the MP5SD's front: its can ends 110 mm ahead of the MP5's muzzle (HK: the SD2 is 790 mm to the A2's 680); its ribbed handguard is a bit over half of it
SD_END = MUZ + 0.110
SD_HG1 = RF + 0.166               # the ribbed handguard's front, where the front sight's collar is
SD_POST = SD_HG1 - 14 * mm           # the front sight: on the cocking tube's end, over the ribbed handguard's front (as MP5SD.JPG shows it)
SD_R, SD_HGR = 24.0 * mm, 27.5 * mm   # the can's tube and the ribbed handguard round it (inside the clamp-on rail mount's 31 mm collar)

def side_pair(fn):
    for s in (-1, 1): fn(s)

def loft(rings):
    """A closed mesh skinned through rings of points (each the same count, in order round), capped at both ends."""
    bm = bmesh.new(); R = [[bm.verts.new(p) for p in ring] for ring in rings]; n = len(rings[0])
    for A, B in zip(R, R[1:]):
        for i in range(n): bm.faces.new((A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]))
    bm.faces.new(R[0]); bm.faces.new(list(reversed(R[-1])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def rprism(pts, x0, x1):          # a side profile (forward, up) extruded across x0..x1
    return prism(pts, 'x', *xs(x0, x1))

# ===================================================================================== RECEIVER (base)
def receiver():
    """The stamped receiver: a tube with a narrow rounded top (the cocking tube's housing pressed into it) over straight sides, closed at the
    back by the end cap; the long groove pressed into each side at the bore line, the recessed panel behind the port, the weld seam under them,
    the ejection port on the right with the bolt in it, the rear sight's welded base and the bump at its back."""
    sec = [(0, TOP), (8.0 * mm, TOP), (11.5 * mm, TOP - 1.1 * mm), (14.0 * mm, TOP - 3.8 * mm), (15.0 * mm, TOP - 7.5 * mm), (17.5 * mm, TOP - 10.0 * mm),
           (20.0 * mm, TOP - 12.4 * mm), (HW, TOP - 15.0 * mm), (HW, RBOT + 2.5 * mm), (HW - 1.2 * mm, RBOT + 0.4 * mm), (HW - 3.0 * mm, RBOT)]
    full = sec + [(-x, z) for x, z in reversed(sec) if x > 0]
    rc = K.tmp(prism(ccw([(x, z) for x, z in full]), 'y', F(440), RF))
    # the front face: its lower edge rounded back (the tube's end is a pressing)
    cut(rc, rprism([(RF - 5 * mm, RBOT - 1), (RF + 1, RBOT - 1), (RF + 1, RBOT + 6 * mm)], -0.03, 0.03))
    for s in (-1, 1):
        cut(rc, prism(rounded((F(503) + F(773)) / 2, U(157.5), (F(773) - F(503)) / 2, 5.5 * S, 5.0 * S, 3), 'x', *xs(s * (HW - 1.3 * mm), s * (HW + 1 * mm))))   # the long groove
        cut(rc, prism(rounded((F(560) + F(704)) / 2, U(135), (F(704) - F(560)) / 2, 9.0 * S, 2.5 * mm, 3), 'x', *xs(s * (HW - 0.7 * mm), s * (HW + 1 * mm))))  # the panel behind the port
    cut(rc, prism(rounded((F(707) + F(775)) / 2, U(129), (F(775) - F(707)) / 2, 15 * S, 4.5 * mm, 4), 'x', HW - 5.5 * mm, HW + 1 * mm))                   # the ejection port (right)
    bevel(rc, 0.8 * mm, 1, 35); smooth(rc); K.adopt(rc, 'base', RCV)
    # the bolt in the port, its extractor's slot
    o = K.obj(box(HW - 5.6 * mm, HW - 4.8 * mm, F(709), F(773), U(141), U(117)), 'base', 'gunmetal')
    o = K.obj(box(HW - 5.0 * mm, HW - 4.4 * mm, F(752), F(770), U(132), U(127)), 'base', 'black')
    # the end cap: a little proud of the tube all round, its top-back corner sloping down to the stock (photo 418-440)
    ec = K.tmp(prism(ccw([(x * 1.03, z + (0.6 * mm if z > 0 else -0.6 * mm)) for x, z in full]), 'y', 0.0, F(441)))
    boolean(ec, rprism(PL([(425, 112), (430, 101), (441, 93), (442, 93), (442, 205), (425, 205)]), -0.03, 0.03), 'INTERSECT')
    bevel(ec, 1.0 * mm, 2, 35); smooth(ec); K.adopt(ec, 'base', RCV)
    o = K.obj(cyl(3.6 * mm, -HW - 0.6 * mm, HW + 0.6 * mm, 'x', (F(433), U(140)), 14), 'base', 'steel'); smooth(o)       # the end cap's pin
    # the weld seam along each side, under the groove
    for s in (-1, 1):
        o = K.obj(box(*xs(s * HW, s * (HW + 0.45 * mm)), F(442), RF - 2 * mm, U(173), U(170.5)), 'base', 'gunmetal')
        for f in (F(662), F(686)):    # the two rivets in the panel
            o = K.obj(cyl(1.7 * mm, *xs(s * (HW - 0.8 * mm), s * (HW + 0.3 * mm)), 'x', (f, U(136)), 10), 'base', 'steel'); smooth(o)
    # the claw mount's four recesses along the top edges (the HK claw mount clamps there)
    for f in (F(600), F(640), F(780), F(820)):
        for s in (-1, 1):
            o = K.obj(box(*xs(s * 12.6 * mm, s * 14.4 * mm), f - 2.5 * mm, f + 2.5 * mm, TOP - 3.6 * mm, TOP - 1.4 * mm), 'base', 'gunmetal')

# ===================================================================================== COCKING TUBE AND LEVER
# The HK slap handle: a lever on the LEFT of the cocking tube, at 10 o'clock, riding in a slot along the tube and folded forward along it at rest. A reload pulls it
# back the length of the slot and turns it up about the tube into the notch cut at the slot's rear (it locks the bolt open: the HK "slap" position), then slaps it
# back down, out of the notch, and the bolt runs home. The part's node (part_handle) has its origin ON the tube's axis, so a turn about it is the turn up into the notch.
HANDLE_ROT = math.radians(30)     # the lever's place round the tube: 30 degrees above its left side (10 o'clock, seen from behind)
HANDLE_LOCK = math.radians(32)    # how far it turns up from there into the notch
def about_tube(me, a):
    """A mesh turned about the cocking tube's axis by a (positive: the left side turns up)."""
    me.transform(Matrix.Translation((0, 0, CT_Z)) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Translation((0, 0, -CT_Z))); return me

def cocking_tube(f1, slot='base', parent=None):
    """The cocking tube from inside the receiver's top forward to f1, its slot down the left side at 10 o'clock with, at its back, the notch (up and round from
    the slot) where the lever is turned to hold the bolt open."""
    ct = K.tmp(cyl(CT_R, RF - 0.012, f1, 'y', (0, CT_Z), 20))
    if f1 > HANDLE_F:
        cut(ct, about_tube(box(-CT_R - 1 * mm, -CT_R + 3.5 * mm, RF + 4 * mm, HANDLE_F + 4 * mm, CT_Z - 2.6 * mm, CT_Z + 2.6 * mm), HANDLE_ROT))
        for k in range(5):      # the way up from the slot to the notch, and the notch (a wider cut, at the slot's rear)
            cut(ct, about_tube(box(-CT_R - 1 * mm, -CT_R + 3.5 * mm, RF + 4 * mm, RF + 12 * mm, CT_Z - 2.6 * mm, CT_Z + 2.6 * mm), HANDLE_ROT + HANDLE_LOCK * k / 4))
    smooth(ct); K.adopt(ct, slot, RCV, parent)
    return ct

def cocking_lever():
    """The slap handle (part_handle, its origin on the tube's axis): a stem out of the slot, a flat lever on it folded forward along the tube with its thumb
    tab turned out at the tip, grooved on its face."""
    ph = K.part('handle', (0, HANDLE_F, CT_Z))
    f, xo = HANDLE_F, CT_R                        # (built at 9 o'clock, then turned to 10)
    def put(o, mat):
        about_tube(o.data, HANDLE_ROT); K.adopt(o, 'base', mat, ph)
    st = K.tmp(cyl(3.3 * mm, -xo - 5.2 * mm, -xo + 1.6 * mm, 'x', (f, CT_Z), 18)); bevel(st, 0.5 * mm, 1); smooth(st); put(st, 'black')
    bl = K.tmp(rprism([(f - 4.5 * mm, CT_Z - 3.8 * mm), (f + 9 * mm, CT_Z - 3.8 * mm), (f + 27 * mm, CT_Z - 2.4 * mm), (f + 30.5 * mm, CT_Z + 0.2 * mm), (f + 27 * mm, CT_Z + 3.0 * mm),
                       (f + 9 * mm, CT_Z + 4.6 * mm), (f - 4.5 * mm, CT_Z + 4.6 * mm)], -xo - 7.8 * mm, -xo - 5.0 * mm))
    for k in range(4):   # the grooves across its face
        g = f + 8 * mm + k * 4.2 * mm
        cut(bl, box(-xo - 8.2 * mm, -xo - 7.0 * mm, g, g + 1.5 * mm, CT_Z - 5 * mm, CT_Z + 6 * mm))
    bevel(bl, 0.8 * mm, 2, 35); smooth(bl); put(bl, 'black')
    tb = K.tmp(box(-xo - 12.4 * mm, -xo - 7.4 * mm, f + 21 * mm, f + 30.5 * mm, CT_Z - 2.8 * mm, CT_Z + 2.4 * mm)); bevel(tb, 1.0 * mm, 2, 35); smooth(tb); put(tb, 'black')
    g = Vector((-xo - 10.0 * mm, f + 26 * mm, CT_Z)); g = Matrix.Translation((0, 0, CT_Z)) @ Matrix.Rotation(HANDLE_ROT, 4, 'Y') @ Matrix.Translation((0, 0, -CT_Z)) @ g
    return ph, [round(g.y, 4), round(g.z, 4), round(g.x, 4)]

# ===================================================================================== TRIGGER HOUSING (base) AND GRIP (factory: grip)
MW0, MW1 = F(747), F(815.5)       # the magazine well's inside, back and front (the magazine's back and front edges, 1 mm clear)
MW_HW = 12.0 * mm                 # its inside half width (the magazine is 22 mm across)
HHW = 16.5 * mm                   # the housing's half width
def housing():
    """The polymer trigger housing (the SEF group): from the receiver's back to its magazine well, the well hollow, the trigger guard moulded on
    it, the grip seated under it (its own slot); the paddle magazine release behind the well, the push button on the right, the selector each
    side, the pins."""
    pts = PL([(440, 186), (821, 186), (821, 262), (816, 268), (706, 268), (600, 268), (600, 250), (531, 250), (520, 236), (505, 222), (490, 218), (446, 218), (440, 212)])
    hs = K.tmp(rprism(pts, -HHW, HHW))
    cut(hs, box(-MW_HW, MW_HW, MW0, MW1, U(300), U(150)))                                    # the magazine well: through, from its mouth up into the receiver
    cut(hs, box(-HHW - 1 * mm, -MW_HW - 1.6 * mm, F(760), F(810), U(232), U(196)))            # the catch's pocket each side
    cut(hs, box(MW_HW + 1.6 * mm, HHW + 1 * mm, F(760), F(810), U(232), U(196)))
    bevel(hs, 1.4 * mm, 2, 35); smooth(hs); K.adopt(hs, 'base', HOUS)
    # the trigger guard: a loop from the grip's front strap to the housing in front of the trigger
    g = K.tmp(rprism(PL([(598, 266), (598, 322), (612, 336), (676, 336), (694, 326), (708, 300), (708, 266)]), -6.0 * mm, 6.0 * mm))
    cut(g, rprism(PL([(608, 260), (608, 318), (618, 327), (672, 327), (688, 320), (698, 298), (698, 260)]), -0.02, 0.02))
    bevel(g, 1.2 * mm, 2, 35); smooth(g); K.adopt(g, 'base', HOUS)
    # the trigger: a curved steel blade
    t = K.tmp(rprism(PL([(638, 266), (652, 266), (654, 280), (660, 300), (662, 318), (657, 321), (650, 302), (642, 282)]), -3.2 * mm, 3.2 * mm)); bevel(t, 0.6 * mm, 1); smooth(t); K.adopt(t, 'base', 'black')
    # the paddle release, behind the well: a lever hanging down and forward
    p = K.tmp(rprism(PL([(726, 266), (748, 266), (748, 280), (744, 293), (734, 296), (729, 286)]), -7.0 * mm, 7.0 * mm)); bevel(p, 1.0 * mm, 2, 35); smooth(p); K.adopt(p, 'base', 'black')
    # the catch's plates each side and the push button on the right
    for s in (-1, 1):
        o = K.tmp(rprism(PL([(760, 196), (809, 196), (809, 222), (797, 232), (760, 232)]), *xs(s * (MW_HW + 1.7 * mm), s * (HHW - 0.6 * mm)))); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', 'gunmetal')
    o = K.obj(cyl(3.0 * mm, HHW - 1.0 * mm, HHW + 1.4 * mm, 'x', (F(786), U(214)), 16), 'base', 'black'); smooth(o)
    # the selector each side (an ambidextrous lever round its spindle), the pins through the housing
    for s in (-1, 1):
        o = K.obj(cyl(4.6 * mm, *xs(s * HHW, s * (HHW + 1.2 * mm)), 'x', (F(592), U(205)), 18), 'base', 'black'); smooth(o)
        sl = K.tmp(rprism(PL([(584, 198), (598, 194), (622, 214), (617, 236), (603, 239), (586, 217)]), *xs(s * (HHW + 1.0 * mm), s * (HHW + 3.2 * mm)))); bevel(sl, 0.8 * mm, 2, 35); smooth(sl); K.adopt(sl, 'base', 'black')
        for (px, py, r) in ((472, 206, 4.6), (737, 222, 4.4), (737, 243, 4.0)):
            o = K.obj(cyl(r * mm, *xs(s * (HHW - 0.4 * mm), s * (HHW + 1.0 * mm)), 'x', (F(px), U(py)), 16), 'base', 'steel'); smooth(o)

def grip():
    """The HK pistol grip (the SEF housing's): a flat-sided grip raked back, a finger groove under the guard, the front strap straight to the
    toe, the back strap swelling into the palm; its front top is mount_grip. A pebbled panel let into each flat side."""
    pts = PL([(531, 248), (601, 248), (601, 322), (595, 330), (588, 334), (582, 342), (576, 352), (566, 370), (556, 389), (550, 404), (547, 418), (543, 428), (530, 426),
              (510, 415), (488, 401), (472, 391), (463, 382), (464, 372), (472, 360), (484, 341), (498, 318), (512, 296), (522, 276), (530, 262)])
    gp = K.tmp(rprism(pts, -15.5 * mm, 15.5 * mm))
    for s in (-1, 1): cut(gp, rprism(PL([(536, 290), (588, 290), (585, 338), (568, 368), (553, 398), (548, 416), (490, 396), (500, 360), (516, 330), (528, 306)]), *xs(s * 14.7 * mm, s * 16 * mm)))
    bevel(gp, 4.5 * mm, 4, 30); smooth(gp); K.adopt(gp, 'grip', FURN)
    for s in (-1, 1):
        o = K.tmp(rprism(PL([(538, 293), (585, 293), (582, 337), (566, 366), (552, 395), (547, 412), (494, 394), (503, 360), (518, 331), (530, 308)]), *xs(s * 14.4 * mm, s * 15.1 * mm)))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'grip', 'stipple')

# ===================================================================================== A2 FIXED STOCK (factory: stock)
# the museum photo's pixels (muzzle left, butt right) to the gun's frame: forward through the A3 photo by the drum (museum x 1130 = A3 x 542) at
# 0.6103 A3 pixels to one museum pixel; up from its bore line (612 at the receiver's back, the photo tilted 0.7 degrees) at 0.352 mm/px
def SF(mx): return F(542 + (1130 - mx) * 0.6103)
def SU(mx, my): return (612 - (mx - 1250) * 0.01205 - my) * 0.352 * mm
def SL(pts): return [(SF(x), SU(x, y)) for x, y in pts]
def stock_a2():
    """The A2 fixed stock: a polymer shell whose front sleeves over the receiver's back and the housing's rear pin, its top sloping down from the
    receiver's to a level comb, deepening to the butt; the butt plate's rubber pad; the sling loop on the left side."""
    pts = [(1222, 497), (1275, 497), (1300, 510), (1325, 524), (1350, 539), (1375, 553), (1400, 566), (1425, 577), (1450, 586), (1475, 591), (1500, 595), (1550, 597), (1650, 599),
           (1750, 599), (1850, 601), (1950, 604), (1965, 606), (1972, 612), (1972, 925), (1950, 933), (1900, 925), (1850, 903), (1800, 885), (1750, 862), (1700, 842), (1650, 821),
           (1600, 800), (1550, 781), (1500, 760), (1450, 739), (1425, 730), (1400, 721), (1375, 716), (1350, 715), (1300, 718), (1262, 724), (1240, 700), (1222, 650)]
    # lofted along its length: a rounded section between the profile's top and bottom at each station, as wide as the receiver at the front
    # (it sleeves over it) and narrowing to the butt, the comb's top rounded off fuller behind the front (the cheek line), then cut to the
    # profile (the butt's and the front's shapes)
    top = sorted(SL(pts[:18])); bot = sorted(SL(pts[19:36]))
    def at(line, f):
        if f <= line[0][0]: return line[0][1]
        for (f0, z0), (f1, z1) in zip(line, line[1:]):
            if f0 <= f <= f1: return z0 + (z1 - z0) * (f - f0) / (f1 - f0)
        return line[-1][1]
    rings, f, fA, fB = [], SF(1995), SF(1440), SF(1340)
    while True:
        k = 0 if f < fA else 1 if f > fB else (f - fA) / (fB - fA)          # (0 behind the comb's start, 1 at the front)
        hw = 20.8 * mm + 2.2 * mm * min(1, (f - SF(1995)) / (SF(1500) - SF(1995)))
        zt, zb = at(top, f) - 0.2 * mm, at(bot, f) + 0.2 * mm
        rt, rb = (13.0 - 7.0 * k) * mm, 8.0 * mm
        sec = []
        for cx, cz, a0, r in ((hw - rt, zt - rt, 0, rt), (-hw + rt, zt - rt, 90, rt), (-hw + rb, zb + rb, 180, rb), (hw - rb, zb + rb, 270, rb)):
            for j in range(7): a = math.radians(a0 + 90 * j / 6); sec.append((cx + r * math.cos(a), f, cz + r * math.sin(a)))
        rings.append(sec)
        if f >= SF(1205): break
        f = min(SF(1205), f + 6 * mm)
    st = K.tmp(loft(rings))
    boolean(st, rprism(SL(pts), -0.03, 0.03), 'INTERSECT')
    # the sling loop's pocket on the left
    LP = SL([(1650, 700), (1790, 700), (1790, 745), (1650, 745)])
    cut(st, rprism(LP, -0.03, -19.5 * mm))
    bevel(st, 3.0 * mm, 3, 30); smooth(st); K.adopt(st, 'stock', FURN)
    # the rubber butt pad
    bp = K.tmp(rprism(SL([(1968, 606), (1984, 608), (1986, 622), (1980, 680), (1973, 760), (1971, 840), (1975, 900), (1974, 928), (1966, 936), (1960, 933), (1962, 610)]), -20.8 * mm, 20.8 * mm))
    bevel(bp, 2.0 * mm, 2, 30); smooth(bp); K.adopt(bp, 'stock', 'rubber')
    # the sling loop: a steel bar across the pocket, its plate's two screws
    (fa, za), (fb, zb) = SL([(1665, 722)])[0], SL([(1775, 722)])[0]
    o = K.obj(cyl(2.2 * mm, fa, fb, 'y', (-21.5 * mm, (za + zb) / 2), 12), 'stock', 'steel'); smooth(o)
    for mx in (1620, 1820):
        f, z = SL([(mx, 722)])[0]
        o = K.obj(cyl(3.2 * mm, -21.9 * mm, -20.2 * mm, 'x', (f, z), 14), 'stock', 'steel'); smooth(o)
    # the rear pin's housing pin through the stock's front (the same pin as the housing's)
    o = K.obj(cyl(4.0 * mm, -23.4 * mm, 23.4 * mm, 'x', (F(472), U(206)), 14), 'stock', 'steel'); smooth(o)

# ===================================================================================== DRUM REAR SIGHT (factory: optic)
def rear_drum():
    """HK's rotary diopter sight (Commons "HK MP5 noBG.png": a small drum between two protective ears on a base clamped to the receiver's top). The drum turns
    on a cross axis (it is knurled round its rim, its four settings marked on its left face): the large aperture (a ghost ring, countersunk both ways) is
    the one in use, the V notch is cut across its top, the two smaller apertures are on the drum's other faces. The ears stand either side of it, rounded
    behind, sloping down to the front, a screw through each at the drum's axis; the windage screw on the base behind."""
    R, DW = 9.0 * mm, 14.0 * mm                           # the drum's radius and width
    EX0, EX1 = DW / 2 + 0.4 * mm, DW / 2 + 3.2 * mm       # the ears' inside and outside
    b = K.tmp(rprism(PL([(500, 97.5), (506, 93.5), (582, 93.5), (588, 97.5)]), -11.0 * mm, 11.0 * mm)); bevel(b, 0.7 * mm, 1); smooth(b); K.adopt(b, 'optic', RCV)
    # the ears: a profile about the drum's axis (forward, up from it)
    EAR = [(-17.0, -11.4), (-17.0, -1.5), (-15.4, 3.6), (-11.5, 7.6), (-5.5, 9.8), (2.0, 10.4), (9.5, 8.6), (12.8, 3.6), (13.6, -2.0), (13.6, -11.4)]
    for s in (-1, 1):
        ear = K.tmp(rprism([(DRUM_F + a * mm, SY + z * mm) for a, z in EAR], *xs(s * EX0, s * EX1)))
        bevel(ear, 0.9 * mm, 2, 35); smooth(ear); K.adopt(ear, 'optic', RCV)
        o = K.obj(cyl(3.0 * mm, *xs(s * EX1, s * (EX1 + 0.9 * mm)), 'x', (DRUM_F, SY), 16), 'optic', 'steel'); smooth(o)                  # the axle's screw head
        o = K.obj(box(*xs(s * (EX1 + 0.7 * mm), s * (EX1 + 1.0 * mm)), DRUM_F - 2.4 * mm, DRUM_F + 2.4 * mm, SY - 0.5 * mm, SY + 0.5 * mm), 'optic', 'black')   # its slot
    # the windage screw behind the drum, on the right: a knurled head on the base's rear
    o = K.obj(cyl(3.2 * mm, 11.0 * mm, 14.2 * mm, 'x', (DRUM_F - 14.0 * mm, TOP + 3.0 * mm), 18), 'optic', 'steel'); smooth(o)
    o = K.obj(box(13.6 * mm, 14.5 * mm, DRUM_F - 14.0 * mm - 0.5 * mm, DRUM_F - 14.0 * mm + 0.5 * mm, TOP + 0.4 * mm, TOP + 5.6 * mm), 'optic', 'black')
    # the drum: a cylinder across the gun (axis X), the aperture through it along the sight line
    dr = K.tmp(cyl(R, -DW / 2, DW / 2, 'x', (DRUM_F, SY), 36))
    cut(dr, lathe([(DRUM_F - R - 1 * mm, 4.6 * mm), (DRUM_F - 3 * mm, 3.3 * mm), (DRUM_F + 3 * mm, 3.3 * mm), (DRUM_F + R + 1 * mm, 4.6 * mm)], 28, (0, 0, SY)))
    # the V notch across the drum's top, and two smaller apertures on its other faces: a blind hole each (down the bottom, and across the top's side)
    cut(dr, prism([(-3.6 * mm, SY + R + 1 * mm), (3.6 * mm, SY + R + 1 * mm), (0.0, SY + R - 4.2 * mm)], 'y', DRUM_F - R - 1 * mm, DRUM_F + R + 1 * mm))
    cut(dr, cyl(1.6 * mm, SY - R - 1 * mm, SY - R + 4.5 * mm, 'z', (0, DRUM_F), 14))
    for k in range(18):   # the knurl: a flat every 20 degrees round the rim, across its width
        a = 2 * math.pi * k / 18
        g = box(-DW / 2 - 1 * mm, DW / 2 + 1 * mm, -0.55 * mm, 0.55 * mm, R - 0.5 * mm, R + 1 * mm); g.transform(Matrix.Translation((0, DRUM_F, SY)) @ Matrix.Rotation(a, 4, 'X')); cut(dr, g)
    smooth(dr); K.adopt(dr, 'optic', 'black')
    # the four settings' marks on the drum's left face: a pip each, a ring of them round the axis at 90 degrees (the one at the rear is the one in use)
    for k in range(4):
        a = math.pi + k * math.pi / 2
        o = K.obj(cyl(0.8 * mm, -DW / 2 - 0.5 * mm, -DW / 2, 'x', (DRUM_F + 6.0 * mm * math.cos(a), SY + 6.0 * mm * math.sin(a))), 'optic', 'steel'); smooth(o)

# ===================================================================================== FRONT SIGHT
def front_sight(post_f, base_f0, base_f1, slot, bottom, collar=None):
    """The hooded front post: its housing from base_f0 to base_f1 round the cocking tube's end (down to `bottom`), the ring hood on it, the post
    in the hood with its tip on the sight line; `collar` (r, f0, f1): a clamp ring round the barrel or the can under it."""
    hs = K.tmp(rprism([(base_f0, CT_Z + CT_R - 0.6 * mm), (base_f1 - 3 * mm, CT_Z + CT_R - 0.6 * mm), (base_f1, CT_Z + 2 * mm), (base_f1, bottom + 3 * mm), (base_f1 - 4 * mm, bottom),
                       (base_f0, bottom)], -9.5 * mm, 9.5 * mm))
    bevel(hs, 1.2 * mm, 2, 35); smooth(hs); K.adopt(hs, slot, RCV)
    if collar:
        r, f0, f1 = collar
        o = K.obj(lathe([(f0, r - 1.2 * mm), (f0 + 1 * mm, r), (f1 - 1 * mm, r), (f1, r - 1.2 * mm)], 28), slot, RCV); smooth(o)
    HR = 11.8 * mm
    hd = K.tmp(cyl(HR, post_f - 5.5 * mm, post_f + 5.5 * mm, 'y', (0, SY), 28))
    boolean(hd, box(-6 * mm, 6 * mm, post_f - 5.5 * mm, post_f + 5.5 * mm, CT_Z + CT_R - 1.5 * mm, SY - 6 * mm), 'UNION')
    cut(hd, cyl(HR - 2.4 * mm, post_f - 6 * mm, post_f + 6 * mm, 'y', (0, SY), 28))
    bevel(hd, 0.6 * mm, 1, 35); smooth(hd); K.adopt(hd, slot, RCV)
    # the post: a blade from the hood's floor to the sight line, flat-topped
    o = K.tmp(rprism([(post_f - 1.6 * mm, SY - HR + 1.6 * mm), (post_f + 1.6 * mm, SY - HR + 1.6 * mm), (post_f + 1.0 * mm, SY), (post_f - 1.0 * mm, SY)], -0.9 * mm, 0.9 * mm))
    boolean(o, rprism([(post_f - 2.4 * mm, SY - HR + 0.5 * mm), (post_f + 2.4 * mm, SY - HR + 0.5 * mm), (post_f + 2.4 * mm, SY - 6.5 * mm), (post_f - 2.4 * mm, SY - 6.5 * mm)], -2.4 * mm, 2.4 * mm), 'UNION')
    smooth(o); K.adopt(o, slot, 'black')
    # the housing's cross pin
    o = K.obj(cyl(1.6 * mm, -9.8 * mm, 9.8 * mm, 'x', ((base_f0 + base_f1) / 2, CT_Z - 4 * mm), 12), slot, 'steel'); smooth(o)

# ===================================================================================== MP5 FRONT: HANDGUARD, BARREL, THREE LUGS
def handguard_slim(slot='handguard', shell='polymer'):
    """The slim handguard: an oval polymer forend under the cocking tube (a channel along its top for it), a smooth ring at each end, the
    pebbled bands along its sides above and below a plain groove."""
    sec = rounded(0, (U(123.5) + U(192)) / 2, 17.5 * mm, (U(123.5) - U(192)) / 2, 7.0 * mm, 4)
    hg = K.tmp(prism(sec, 'y', HG0, HG1))
    cut(hg, cyl(CT_R + 0.6 * mm, HG0 - 0.01, HG1 + 0.01, 'y', (0, CT_Z), 20))
    cut(hg, cyl(BR_R + 1.5 * mm, HG1 - 6 * mm, HG1 + 0.01, 'y', (0, 0), 20))      # (the front is open round the barrel)
    bands = [(U(128), U(152)), (U(169), U(185))]
    for s in (-1, 1):
        for z1, z0 in bands: cut(hg, box(*xs(s * 16.9 * mm, s * 19 * mm), HG0 + 9 * mm, HG1 - 8 * mm, z0, z1))
        cut(hg, box(*xs(s * 17.1 * mm, s * 19 * mm), HG0 + 9 * mm, HG1 - 8 * mm, U(167), U(154)))         # the plain groove between them
    bevel(hg, 1.2 * mm, 2, 30); smooth(hg); K.adopt(hg, slot, shell)
    for s in (-1, 1):
        for z1, z0 in bands:
            o = K.obj(box(*xs(s * 17.0 * mm, s * 17.4 * mm), HG0 + 9.3 * mm, HG1 - 8.3 * mm, z0 + 0.3 * mm, z1 - 0.3 * mm), slot, 'stipple')
    # under the front: the bottom band
    o = K.obj(box(-8 * mm, 8 * mm, HG0 + 9.3 * mm, HG1 - 8.3 * mm, U(192) - 0.3 * mm, U(192) + 0.2 * mm), slot, 'stipple')

def handguard_trirail(slot='handguard', f0=None, f1=None):
    """The clamp-on tri-rail forend (the railed MP5 handguard: a Picatinny rail under it and one each side): an aluminium shell the slim forend's size with the
    channel for the cocking tube along its top, a clamp ring at each end with its pinch screws, the three rails on its bottom and flats. Its length is the slim's:
    from the receiver's face to the front sight housing."""
    f0, f1 = HG0 if f0 is None else f0, HG1 if f1 is None else f1
    zb, zt = U(192), U(123.5)                                     # the shell's bottom and top
    sec = rounded(0, (zb + zt) / 2, 17.5 * mm, (zt - zb) / 2, 6.0 * mm, 4)
    hg = K.tmp(prism(sec, 'y', f0, f1))
    cut(hg, cyl(CT_R + 0.6 * mm, f0 - 0.01, f1 + 0.01, 'y', (0, CT_Z), 20))
    cut(hg, cyl(BR_R + 1.5 * mm, f1 - 6 * mm, f1 + 0.01, 'y', (0, 0), 20))
    bevel(hg, 1.0 * mm, 2, 30); smooth(hg); K.adopt(hg, slot, 'black')
    zc = (zb + zt) / 2
    for fa, fb in ((f0, f0 + 9 * mm), (f1 - 9 * mm, f1)):         # the clamp rings, a little proud
        ring = K.tmp(prism([(x * 1.0, z) for x, z in rounded(0, zc, 18.3 * mm, (zt - zb) / 2 + 0.8 * mm, 6.6 * mm, 4)], 'y', fa, fb))
        cut(ring, cyl(CT_R + 0.6 * mm, fa - 0.01, fb + 0.01, 'y', (0, CT_Z), 20)); cut(ring, cyl(BR_R + 1.5 * mm, fa - 0.01, fb + 0.01, 'y', (0, 0), 20))
        bevel(ring, 0.8 * mm, 2, 35); smooth(ring); K.adopt(ring, slot, 'black')
        for s in (-1, 1):                                         # the pinch screw each side
            o = K.tmp(cyl(2.6 * mm, *xs(s * 18.2 * mm, s * 20.2 * mm), 'x', ((fa + fb) / 2, zc - 9 * mm), 14)); cut(o, cyl(1.2 * mm, *xs(s * 19.6 * mm, s * 20.6 * mm), 'x', ((fa + fb) / 2, zc - 9 * mm), 6))
            smooth(o); K.adopt(o, slot, 'steel')
    r0, r1 = f0 + 12 * mm, f1 - 5 * mm
    picatinny(K, r0, r1, zb, slot, 'black', axis='bottom')
    picatinny(K, r0, r1, zc, slot, 'black', axis='right', x0=17.5 * mm - 0.6 * mm)
    picatinny(K, r0, r1, zc, slot, 'black', axis='left', x0=-17.5 * mm + 0.6 * mm)

def mp5_front():
    cocking_tube(FSH0 + 6 * mm)
    o = K.obj(lathe([(RF - 0.002, BR_R), (FSH1 - 2 * mm, BR_R)], 20), 'base', 'park'); smooth(o)          # the barrel under the handguard and in the housing (stays with any barrel)
    front_sight(POST_F, FSH0, FSH1, 'base', U(183))
    handguard_slim()
    # slot barrel: the factory barrel from the front of its housing to the lugs (another barrel is the shared one ending where its length ends)
    o = K.obj(lathe([(FSH1 - 8 * mm, BR_R), (FSH1, BR_R), (FSH1, 7.2 * mm), (FSH1 + 0.5 * mm, 7.2 * mm)], 20), 'barrel', 'park'); smooth(o)
    # slot muzzle: the three-lug end (the factory "three-lug" device): its body, the lugs, the crown with the bore
    tl = K.tmp(lathe([(FSH1, 7.2 * mm), (MUZ - 1.5 * mm, 7.2 * mm), (MUZ, 6.2 * mm), (MUZ, 4.6 * mm), (MUZ - 0.012, 4.6 * mm)], 24))
    cut(tl, lathe([(FSH1 + 12 * mm, 7.6 * mm), (FSH1 + 13 * mm, 6.5 * mm), (FSH1 + 15 * mm, 6.5 * mm), (FSH1 + 16 * mm, 7.6 * mm)], 24))   # (the groove ahead of the lugs)
    smooth(tl); K.adopt(tl, 'muzzle', 'park')
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3
        lg = K.tmp(box(-3.6 * mm, 3.6 * mm, FSH1 + 1.0 * mm, FSH1 + 10.0 * mm, 6.6 * mm, 9.3 * mm))
        lg.data.transform(Matrix.Rotation(a - math.pi / 2, 4, 'Y'))
        bevel(lg, 0.6 * mm, 1); smooth(lg); K.adopt(lg, 'muzzle', 'park')

# ===================================================================================== MP5SD FRONT: RIBBED HANDGUARD, CAN, FRONT SIGHT
def sd_front(slot, can_end, open_barrel=False):
    """The MP5SD's front (all of it the barrel slot: what an SD barrel brings): the cocking tube's front half, the ribbed polymer handguard
    round the can's rear (a channel along its top for the tube), the clamp collar at its front with the front sight on it, the can's smooth
    tube to `can_end`, its front cap with the bore. open_barrel: the conversion barrel instead, the MP5's front."""
    if open_barrel:
        o = K.obj(lathe([(HANDLE_F + 6 * mm, CT_R), (FSH0 + 6 * mm, CT_R)], 20), slot, RCV); smooth(o)
        o = K.obj(lathe([(RF + 0.5 * mm, BR_R), (FSH1, BR_R), (FSH1, 7.0 * mm), (FSH1 + 13 * mm, 7.0 * mm), (FSH1 + 13 * mm, 6.2 * mm), (can_end - 0.6 * mm, 6.2 * mm),
                         (can_end, 5.6 * mm), (can_end, 4.6 * mm), (can_end - 0.01, 4.6 * mm)], 20), slot, 'park'); smooth(o)
        front_sight(POST_F, FSH0, FSH1, slot, U(183))
        handguard_slim(slot)
        return
    o = K.obj(lathe([(HANDLE_F + 6 * mm, CT_R), (SD_POST + 6 * mm, CT_R)], 20), slot, RCV); smooth(o)
    # the ribbed handguard: a smooth band at each end, the ribs between
    prof, f = [(RF + 0.5 * mm, SD_HGR - 1.5 * mm), (RF + 1.5 * mm, SD_HGR)], RF + 9 * mm
    prof.append((f, SD_HGR))
    while f + 4.2 * mm < SD_HG1 - 6 * mm:
        prof += [(f + 1.0 * mm, SD_HGR - 1.6 * mm), (f + 2.2 * mm, SD_HGR - 1.6 * mm), (f + 3.2 * mm, SD_HGR)]
        f += 4.2 * mm
    prof += [(f, SD_HGR), (SD_HG1 - 1 * mm, SD_HGR), (SD_HG1, SD_HGR - 1.2 * mm)]
    hg = K.tmp(lathe(prof, 32))
    cut(hg, cyl(CT_R + 0.8 * mm, RF - 0.01, SD_HG1 + 0.01, 'y', (0, CT_Z), 20))
    smooth(hg, 50); K.adopt(hg, slot, 'polymer')
    # the can: its tube from inside the handguard to its front cap, the bore
    o = K.obj(lathe([(RF + 2 * mm, SD_R), (can_end - 2.5 * mm, SD_R), (can_end - 0.5 * mm, SD_R - 1.2 * mm), (can_end, SD_R - 3.2 * mm), (can_end, 5.4 * mm), (can_end - 0.006, 5.4 * mm)], 32), slot, 'black'); smooth(o)
    front_sight(SD_POST, SD_POST - 13 * mm, SD_POST + 9 * mm, slot, CT_Z - CT_R - 1.0 * mm)
    o = K.obj(lathe([(SD_HG1 - 0.5 * mm, SD_R + 0.8 * mm), (SD_HG1 + 4 * mm, SD_R + 0.8 * mm), (SD_HG1 + 5 * mm, SD_R)], 32), slot, 'black'); smooth(o)   # (the can's shoulder where it leaves the handguard)

# ===================================================================================== MAGAZINE (part_mag)
# The curved 30-round magazine on the recipe's centreline (tools/models/recipes.ts mag(), 'curved': the shared MP5 magazines in js/parts.ts
# MAG_FAMS.mp5 are drawn on the same one), fitted to the photographed magazine's edges (photo 765-850 back, 815-895 front): its top at mount_mag,
# len down, the centreline running forward c * t^2, the body d deep square to it, w wide.
MAG_F, MAG_Y = F(777.07), -12.0 * mm
MAG_LEN, MAG_C, MAG_D, MAG_W = 0.180, 0.058, 0.032, 0.022
def mag_at(t):
    """[forward, up] of the centreline at t (0 top, 1 the floor), and its normal toward the front."""
    sl = 2 * MAG_C * t; n = math.hypot(MAG_LEN, sl)
    return MAG_F + MAG_C * t * t, MAG_Y - MAG_LEN * t, MAG_LEN / n, sl / n
def mag_edge(k0, N=22, t0=0.0, t1=1.0):
    out = []
    for i in range(N + 1):
        t = t0 + (t1 - t0) * i / N; cf, cy, nf, ny = mag_at(t); out.append((cf + nf * MAG_D * k0, cy + ny * MAG_D * k0))
    return out
def magazine(parent_slot='mag'):
    pm = K.part('mag', (0, MAG_F, MAG_Y)); pm['check'] = {'w': MAG_W}
    HWm = MAG_W / 2
    body = K.tmp(rprism(mag_edge(0.5) + list(reversed(mag_edge(-0.5))), -HWm, HWm))
    cut(body, box(-HWm + 1.0 * mm, HWm - 1.0 * mm, MAG_F - MAG_D / 2 + 1.0 * mm, MAG_F + MAG_D / 2 - 1.0 * mm, MAG_Y - 4 * mm, MAG_Y + 0.01))   # (open at the top: the follower's well)
    # the witness holes: five down the BACK face (toward the shooter), none on the front; each a slot with a brass round showing, its own mesh at the face's tilt
    wins = []
    for i in range(1, 6):
        t = i / 6 * 0.94
        cf, cy, nf, ny = mag_at(t)
        q = (cf - nf * MAG_D / 2, cy - ny * MAG_D / 2)
        ang = math.atan2(ny, nf)            # (the rotation about X that stands Z up the face)
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
    # the pressed rib down each side, following the curve
    for s in (-1, 1):
        a, b = mag_edge(-0.12, 16, 0.12, 0.93), mag_edge(0.12, 16, 0.12, 0.93)
        o = K.tmp(rprism(a + list(reversed(b)), *xs(s * HWm, s * (HWm + 0.7 * mm)))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    # the floor plate, square to the centreline at the foot
    cf, cy, nf, ny = mag_at(1.0)
    fp = K.tmp(box(-HWm - 1.6 * mm, HWm + 1.6 * mm, -MAG_D / 2 - 2.0 * mm, MAG_D / 2 + 1.5 * mm, -5.0 * mm, 1.0 * mm))
    fp.data.transform(Matrix.Translation((0, cf, cy)) @ Matrix.Rotation(math.atan2(ny, nf), 4, 'X'))
    bevel(fp, 1.0 * mm, 2, 30); smooth(fp); K.adopt(fp, 'mag', 'park', pm)
    # the feed lips: each wall's top turned in over the rounds
    for s in (-1, 1):
        o = K.tmp(box(*xs(s * (HWm - 0.2 * mm), s * (HWm - 3.4 * mm)), MAG_F - MAG_D / 2 + 1.0 * mm, MAG_F + MAG_D / 2 - 9 * mm, MAG_Y - 2.0 * mm, MAG_Y + 1.0 * mm))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    # the top two rounds (9 x 19: the case 19.15 mm, the bullet to 29.7 mm), staggered; the top one is the magazine check's
    h = MAG_F - 14.6 * mm
    def rnd(x, z, chk):
        c = K.obj(lathe([(h, 0.5 * mm), (h, 4.95 * mm), (h + 0.8 * mm, 4.95 * mm), (h + 1.1 * mm, 4.3 * mm), (h + 1.8 * mm, 4.3 * mm), (h + 2.2 * mm, 4.95 * mm), (h + 19.15 * mm, 4.8 * mm),
                         (h + 19.15 * mm, 0.5 * mm)], 18, (x, 0, z)), 'mag', 'brass', pm); smooth(c)
        b = K.obj(lathe([(h + 19.15 * mm, 0.5 * mm), (h + 19.15 * mm, 4.5 * mm), (h + 23.5 * mm, 4.5 * mm), (h + 27.5 * mm, 3.0 * mm), (h + 29.7 * mm, 1.0 * mm), (h + 29.7 * mm, 0.4 * mm)],
                        16, (x, 0, z)), 'mag', 'brass', pm); smooth(b)
        if chk: c['chk'] = {'role': 'top', 'i': 0}; b['chk'] = {'role': 'top', 'i': 1}
    rnd(2.6 * mm, MAG_Y - 3.5 * mm, True)
    rnd(-2.6 * mm, MAG_Y - 11.5 * mm, False)
    return pm

# ===================================================================================== CLAW MOUNT (the gun's optic mount: slot optic, extras.mount)
# The receiver has no rail: a Picatinny sight goes on a claw-mount rail, the pattern of B&T's low-profile MP5 mount (BT-21241: 138 mm long,
# 40 mm across its clamps, 23.5 mm tall at most, 98 g; viewed, not downloaded, on its makers' and dealers' pages, with HK's own STANAG claw
# mount on an MP5 for the claws and the locking lever): an aluminium deck the length of it with the rail along its top, lightened by a groove
# down each side, and at each end a clamp block straddling the receiver's top, its claws hooked into the pair of recesses pressed there (four
# recesses a side: receiver() above). The right jaw is the block's own, held by two cap screws; the left one is a separate jaw closed by a
# throw lever lying along the side (the rear lever pointing forward, the front one back). It is the gun's OPTIC MOUNT (docs/models.md
# "Authored models": slot optic with extras.mount): drawn whenever a rail sight is fitted, never with the drum and post alone; the sight stands
# on its rail top at the platform's optF (mount_optic_rail .. mount_optic_rail_end).
CLAW_REC = (F(600), F(640), F(780), F(820))          # the recesses (receiver(): their fore-and-aft centres)
CM_LEN = 138 * mm
CM0 = (CLAW_REC[0] + CLAW_REC[3]) / 2 - CM_LEN / 2  # the mount's rear and front, centred over the recesses
CM1 = CM0 + CM_LEN
CM_BLK = 36 * mm                                     # a clamp block's length (each covers one pair of recesses)
CM_RT = TOP + 17.5 * mm                              # the rail's top: where the sight's foot stands (21.7 mm over the claws' tips)
CM_DECK = CM_RT - 5.6 * mm                           # the deck's top, under the rail (blender_kit picatinny: 5.6 mm tall)
CM_CLAW = TOP - 4.2 * mm                             # the claws' tips, under the recesses
def claw_mount():
    def mount(o): o['mount'] = True; return o
    # the deck: its underside arched clear of the receiver's rounded top, its sides chamfered up to the rail
    deck = [(-15.0 * mm, TOP - 1.0 * mm), (-12.5 * mm, TOP - 1.0 * mm), (-9.5 * mm, TOP + 0.8 * mm), (9.5 * mm, TOP + 0.8 * mm), (12.5 * mm, TOP - 1.0 * mm),
            (15.0 * mm, TOP - 1.0 * mm), (15.0 * mm, CM_DECK - 2.0 * mm), (13.0 * mm, CM_DECK), (-13.0 * mm, CM_DECK), (-15.0 * mm, CM_DECK - 2.0 * mm)]
    dk = K.tmp(prism(ccw(deck), 'y', CM0, CM1))
    for s in (-1, 1):   # the lightening groove down each side, between the blocks
        cut(dk, box(*xs(s * 13.6 * mm, s * 16 * mm), CM0 + CM_BLK + 5 * mm, CM1 - CM_BLK - 5 * mm, TOP + 3.0 * mm, TOP + 7.5 * mm))
    bevel(dk, 0.7 * mm, 2, 35); smooth(dk); mount(K.adopt(dk, 'optic', 'black'))
    # the rail along the top, the full length
    mount(picatinny(K, CM0 + 1.5 * mm, CM1 - 1.5 * mm, CM_DECK, 'optic', 'black'))
    for b0 in (CM0, CM1 - CM_BLK):
        b1 = b0 + CM_BLK
        rec = [f for f in CLAW_REC if b0 < f < b1]
        # the block: right jaw and bridge in one, down to the claws on the right; on the left only down to the jaw's top (the jaw is separate)
        blk = [(-17.0 * mm, TOP + 1.2 * mm), (-15.2 * mm, TOP + 1.2 * mm), (-15.2 * mm, TOP - 1.0 * mm), (-12.5 * mm, TOP - 1.0 * mm), (-9.5 * mm, TOP + 0.8 * mm),
               (9.5 * mm, TOP + 0.8 * mm), (12.5 * mm, TOP - 1.0 * mm), (15.2 * mm, TOP - 1.0 * mm), (15.2 * mm, CM_CLAW), (20.0 * mm, CM_CLAW),
               (20.0 * mm, CM_DECK - 3.5 * mm), (16.5 * mm, CM_DECK), (-16.5 * mm, CM_DECK), (-20.0 * mm, CM_DECK - 3.5 * mm), (-20.0 * mm, TOP + 4.5 * mm), (-17.0 * mm, TOP + 4.5 * mm)]
        bk = K.tmp(prism(ccw(blk), 'y', b0, b1))
        bevel(bk, 0.8 * mm, 2, 35); smooth(bk); mount(K.adopt(bk, 'optic', 'black'))
        # the left jaw: a plate from under the block's left side down to the claws, a step in its top where the block overhangs it
        jw = K.tmp(prism(ccw([(-20.0 * mm, CM_CLAW), (-15.2 * mm, CM_CLAW), (-15.2 * mm, TOP + 0.8 * mm), (-17.4 * mm, TOP + 0.8 * mm), (-17.4 * mm, TOP + 4.1 * mm), (-20.0 * mm, TOP + 4.1 * mm)]),
                         'y', b0 + 1.5 * mm, b1 - 1.5 * mm))
        bevel(jw, 0.6 * mm, 2, 35); smooth(jw); mount(K.adopt(jw, 'optic', 'gunmetal'))
        # the claws: a finger off each jaw's inside into each recess (receiver(): x 12.6 to 14.4 mm, 1.4 to 3.6 mm under the top)
        for f in rec:
            for s in (-1, 1):
                o = K.tmp(box(*xs(s * 12.9 * mm, s * 15.6 * mm), f - 2.1 * mm, f + 2.1 * mm, TOP - 3.4 * mm, TOP - 1.6 * mm)); bevel(o, 0.4 * mm, 1); smooth(o)
                mount(K.adopt(o, 'optic', 'black' if s > 0 else 'gunmetal'))
        # the right jaw's two cap screws (hex sockets), on its outside face
        for f in (b0 + 9 * mm, b1 - 9 * mm):
            o = K.tmp(cyl(2.8 * mm, 20.0 * mm - 0.2 * mm, 21.4 * mm, 'x', (f, TOP + 2.0 * mm), 18))
            cut(o, cyl(1.3 * mm, 20.6 * mm, 21.6 * mm, 'x', (f, TOP + 2.0 * mm), 6)); smooth(o); mount(K.adopt(o, 'optic', 'steel'))
        # the deck's screws into the block, on the shoulders beside the rail
        for s in (-1, 1):
            o = K.tmp(cyl(1.9 * mm, CM_DECK - 0.3 * mm, CM_DECK + 0.9 * mm, 'z', (s * 13.6 * mm, (b0 + b1) / 2), 14))
            cut(o, cyl(0.9 * mm, CM_DECK + 0.3 * mm, CM_DECK + 1.0 * mm, 'z', (s * 13.6 * mm, (b0 + b1) / 2), 6)); smooth(o); mount(K.adopt(o, 'optic', 'steel'))
        # the throw lever on the left jaw: its pivot boss at the block's middle, the arm lying along the side toward the mount's middle,
        # a finger tab turned out at its tip
        fc, zc, d = (b0 + b1) / 2, TOP + 0.5 * mm, 1 if b0 == CM0 else -1
        o = K.obj(cyl(4.2 * mm, -22.4 * mm, -19.8 * mm, 'x', (fc, zc), 20), 'optic', 'black'); smooth(o); mount(o)
        o = K.obj(cyl(1.6 * mm, -22.9 * mm, -22.2 * mm, 'x', (fc, zc), 12), 'optic', 'steel'); smooth(o); mount(o)
        tip = fc + d * 30 * mm
        arm = K.tmp(rprism([(fc, zc - 3.6 * mm), (tip, zc - 1.6 * mm), (tip + d * 3.0 * mm, zc + 0.4 * mm), (tip, zc + 2.6 * mm), (fc, zc + 3.6 * mm)] if d > 0 else
                           [(fc, zc + 3.6 * mm), (tip, zc + 2.6 * mm), (tip + d * 3.0 * mm, zc + 0.4 * mm), (tip, zc - 1.6 * mm), (fc, zc - 3.6 * mm)], -22.2 * mm, -20.2 * mm))
        bevel(arm, 0.6 * mm, 2, 35); smooth(arm); mount(K.adopt(arm, 'optic', 'black'))
        o = K.tmp(box(-24.6 * mm, -20.6 * mm, *xs(tip - d * 4.0 * mm, tip + d * 1.5 * mm), zc - 1.4 * mm, zc + 2.4 * mm)); bevel(o, 0.7 * mm, 2, 35); smooth(o); mount(K.adopt(o, 'optic', 'black'))

# ===================================================================================== ASSEMBLY
receiver()
housing()
grip()
stock_a2()
rear_drum()
ph, grab = cocking_lever()
magazine()
if SD:
    cocking_tube(HANDLE_F + 6 * mm)          # (the base's half: from the receiver to past the lever's slot; the rest is the SD's front)
    sd_front('barrel', SD_END)
    END, MOUNT_MUZZLE, MOUNT_BARREL, POST = SD_END, SD_END, HG0 + 3.5 * mm, SD_POST
    FSH0 = HG0 + 3 * mm      # (no handguard: the can starts at the receiver, so a handguard has no room, hgMax 0)
else:
    mp5_front()
    END, MOUNT_MUZZLE, MOUNT_BARREL, POST = MUZ, FSH1, FSH1 - 8 * mm, POST_F
claw_mount()                                 # (last: the meshes before it keep their names)

# ===================================================================================== info and anchors
info = {
    'sy': round(SY, 4), 'fSight': round(DRUM_F, 4), 'relief': 0.075,
    'muzzles': [[round(END, 4), 0, 0]],
    'grip': [0.058, -0.082, 0], 'support': [0.36 if SD else 0.31, -0.028, 0],
    'anim': {'handle': 'part_handle', 'mag': 'part_mag'},
    'magAt': [round(MAG_F, 4), round(MAG_Y, 4)],
    'handle': {'f': round(HANDLE_F, 4), 'y': round(CT_Z, 4), 'x': round(-CT_R, 4), 'travel': HANDLE_TRAVEL, 'style': 'tube', 'recip': False, 'grab': grab, 'lock': round(HANDLE_LOCK, 4)},
    'port': [round((F(707) + F(775)) / 2, 4), round(U(129), 4), round(HW, 4)],
    'chamberAt': {'side': 'right', 'f': round(F(760), 4), 'y': round(U(129), 4), 'x': round(HW - 4.8 * mm, 4)},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [round(MOUNT_MUZZLE, 4), 0, 0]},
}
anchors = {
    'mount_optic': [round(F(512), 4), round(TOP, 4), 0], 'mount_optic_end': [round(F(798), 4), round(TOP, 4), 0],   # (the claw mount's span on the receiver's top)
    'mount_optic_rail': [round(CM0, 4), round(CM_RT, 4), 0], 'mount_optic_rail_end': [round(CM1, 4), round(CM_RT, 4), 0],    # (the claw mount's rail: where a sight stands)
    'mount_handguard': [round(HG0, 4), 0, 0], 'mount_handguard_end': [round(FSH0, 4), 0, 0],
    'mount_barrel': [round(MOUNT_BARREL, 4), 0, 0], 'mount_muzzle': [round(MOUNT_MUZZLE, 4), 0, 0],
    'mount_stock': [0, -0.002, 0], 'mount_grip': [round(F(601), 4), round(U(248), 4), 0],
    'mount_mag': [round(MAG_F, 4), round(MAG_Y, 4), 0],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
for o in list(coll.all_objects):
    if o.name.startswith('tmp') or o.name.startswith('cutter'): bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]

# ---- the MP5SD's other barrels: variants beside the model (models/mp5sd/barrel_<name>.glb; js/parts.ts mp5sd.br.<name>) ----
also = []
if SD:
    for name, end, op, note in (('barrel_long', SD_END + 0.060, False, 'the extended integral barrel: the can 60 mm longer'),
                                ('barrel_open', FSH1 + 0.014, True, 'the unsuppressed conversion: the MP5 front, a threaded barrel')):
        vc, vr, KV = kit_variant(ID, name, 'barrel', {'info': {'muzzles': [[round(end, 4), 0, 0]]}, 'note': note})
        K_main = K; K = KV
        sd_front('barrel', end, open_barrel=op)
        K = K_main
        for o in list(vc.all_objects):
            if o.name.startswith('tmp') or o.name.startswith('cutter'): bpy.data.objects.remove(o, do_unlink=True)
        also.append(vc)
        if EXPORT: export_glb(vc, os.path.join(HERE, name + '.glb'))

result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT, also=tuple(also)), 'info': info, 'anchors': anchors}
print('RESULT', json.dumps(result))
