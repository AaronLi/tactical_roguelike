# The AN-94 "Abakan" (game id an94): the Nikonov 5.45 x 39 assault rifle as fielded, with its black polymer housing, the side-folding polymer stock, the
# ribbed forend, the rotary drum rear sight, the offset two-lobe muzzle device and the left-hand charging bar, in Blender.
#   Blender: exec(open(r'<repo>/models/an94/build_an94.py').read(), {'GUN_DIR': r'<repo>/models/an94'})
#   or:      blender -b -P models/an94/build_an94.py
# References (all viewed on Wikimedia Commons, not downloaded):
#  - "AN-94 Abakan (3).jpg" (Vitaly V. Kuzmin, CC BY-SA 4.0; 2249 x 1450, the right side, muzzle right, the rifle lying on a table and photographed from
#    above: a slight tilt, so heights read about 9 % high against lengths): the outline and the right side's detail. Read off its 1920-px thumbnail:
#    1901 px butt to muzzle = the published 943 mm (stock extended), 0.496 mm a pixel along the gun; heights are scaled 0.54 mm a pixel (the tilt:
#    checked against "Rifle AN-94.jpg", public domain, 500 x 197, a level right-side shot, and the magazine's length, which is the AK-74's).
#  - "AN-94 Abakan (4).jpg" and "(1).jpg" (same author and licence; the LEFT side, muzzle left): the charging bar in its channel on the left, the
#    left hinge plate, the stippled panel, the same housing without a port.
#  - "АН-94 - Интерполитех-2009 01.jpg" (same author, CC BY-SA 4.0): the right side on the wall, the stock hinge and the latch.
# Real figures: 943 mm overall stock extended (728 folded), 405 mm barrel, 3.85 kg, 5.45 x 39 from AK-74 magazines (the AN-94's well cants it a few
# degrees to the right).
# What the photos show: the housing is polymer, a stepped hump over the trigger group carrying the rotary drum rear sight, the magazine well deep in
# the housing, the forend ribbed (vent slots along its top, finger grooves down its sides). Ahead of it the barrel with its steel sleeve and the
# front sight (a hooded post) on the barrel's front, the muzzle device (two round lobes, set above the bore), and a gas tube under the barrel ending
# in a steel bracket. The charging bar is a long steel rod in a channel on the LEFT, a thumb hook at its rear.
#
# Frame (docs/models.md "Authored models"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the back of the housing on the bore line.
# Photo pixels (the thumbnail): f = (x - 486) * 0.496 mm, u = (561 - y) * 0.54 mm.
import bpy, bmesh, json, math, os
from mathutils import Matrix
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
ID = 'an94'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
SX, SU = 0.496, 0.54
def FX(x): return (x - 486) * SX
def UY(y): return (561 - y) * SU
def PP(pts): return [(FX(x) * mm, UY(y) * mm) for x, y in pts]          # photo pixels -> (forward, up) metres
def P(pts): return [(f * mm, u * mm) for f, u in pts]                   # (forward, up) in mm -> metres
def xs(a, b): return tuple(sorted((a, b)))

# ---- the magazine: the AK-74's (models/ak_kit.py, the family's: its other magazines seat at mount_mag), borrowed by running the AK builder into a scratch collection
os.environ['GUN_EXPORT'] = '0'
ag = {'GUN_DIR': os.path.join(MODELS, 'ak74'), 'CFG': {'variant': 'ak74'}}
exec(open(os.path.join(MODELS, 'ak_kit.py'), encoding='utf-8').read(), ag)
os.environ['GUN_EXPORT'] = '1' if EXPORT else '0'
scratch = ag['coll']
borrow = [o for o in scratch.all_objects if o.name == 'part_mag' or (o.parent and o.parent.name == 'part_mag')]
bpy.context.view_layer.update()
Wold = {o: o.matrix_world.copy() for o in borrow}
for o in list(borrow):
    for c in list(o.users_collection): c.objects.unlink(o)
for o in list(scratch.all_objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.collections.remove(scratch)
for o in list(bpy.data.objects):
    if o.name == 'ak74' and o.type == 'EMPTY' and o not in borrow: bpy.data.objects.remove(o, do_unlink=True)

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID
HP = 'polymer'                   # the housing, stock, grip and forend: black polymer

HW = 20.0                        # the housing's half width
TOP = UY(505)                    # the housing's top (31.0)
SHELF = UY(598)                  # the underside behind the magazine well (-20)
WELL_B = UY(608)                 # the well's floor: the housing's underside ahead of the shelf (the photo shows the table under it)
SY = 40.0                        # the sight line: the front post's tip, the rear notch
DRUM_F = FX(668)                 # the drum's centre
MAG_F, MAG_Y = 159.0, 6.0        # the magazine's top (mount_mag)
MAG_LEN = 1.0                    # the photo's magazine is the kit's AK-74 magazine at full length (platform magFit.len)
CANT = 4.0                       # the magazine canted this many degrees to the right
PITCH = 3.0                      # and its foot swung this many degrees back (the photo's magazine stands straighter than the kit's)
HG0, HG1 = FX(1000), FX(1395)    # the forend
BORE_END = FX(1730)              # the barrel's front (the muzzle device screws on)
MUZ_END = FX(1913)               # the device's tip (the bullet leaves it)
POST_F = FX(1672)
print('anchors f: well', MAG_F, 'hg', HG0, HG1, 'barrel end', BORE_END, 'muzzle', MUZ_END, 'post', POST_F)

# ----------------------------------------------------------------------------------------------------- HOUSING (base)
def housing():
    """The housing: the stepped hump over the trigger group, the magazine well, the flat top to the forend; its section a rounded box. The well is
    hollow (walls 5 mm) and tall enough for the canted magazine; the ejection port on the right and the charging bar's channel on the left have dark
    floors; the selector, the magazine catch and the steel block on the right."""
    prof = PP([(486, 556), (530, 544), (572, 540), (590, 522), (600, 505), (1000, 505), (1000, 608), (760, 608), (760, 598), (500, 598), (486, 590)])
    h = K.tmp(prism(prof, 'x', -HW * mm, HW * mm))
    boolean(h, prism(rounded(0, (TOP + WELL_B) / 2 * mm, HW * mm, (TOP - WELL_B) / 2 * mm + 0.001, 6 * mm, 5), 'y', -0.01, HG0 * mm + 0.01), 'INTERSECT')
    # the well: hollow round the canted magazine
    cut(h, box(-15.5 * mm, 18.5 * mm, (MAG_F - 34) * mm, (MAG_F + 36) * mm, (WELL_B - 2) * mm, 8 * mm))
    # the ejection port (right): a pocket with a dark floor; the left channel for the charging bar (dark floor)
    cut(h, box((HW - 4.5) * mm, (HW + 1) * mm, FX(812) * mm, FX(1003) * mm, UY(524) * mm, UY(513) * mm))
    cut(h, box(-(HW + 1) * mm, -(HW - 4.0) * mm, 36 * mm, 166 * mm, -7.5 * mm, 1.5 * mm))
    bevel(h, 0.8 * mm, 1, 30); smooth(h); K.adopt(h, 'base', HP)
    o = K.tmp(box((HW - 4.7) * mm, (HW - 4.3) * mm, FX(813) * mm, FX(1002) * mm, (UY(524) + 0.3) * mm, (UY(513) - 0.3) * mm)); K.adopt(o, 'base', 'rubber')       # (the port's floor)
    # the bolt carrier's flank seen through the port
    o = K.tmp(box(-(HW - 4.3) * mm, -(HW - 3.9) * mm, 37 * mm, 165 * mm, -7 * mm, 1.0 * mm)); K.adopt(o, 'base', 'rubber')         # (the channel's floor)
    # the steel block and the magazine catch's round tab on the right (front of the well)
    o = K.tmp(box(HW * mm, (HW + 3.0) * mm, FX(907) * mm, FX(923) * mm, UY(596) * mm, UY(576) * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
    o = K.obj(cyl(3.6 * mm, HW * mm, (HW + 2.4) * mm, 'x', (FX(934) * mm, UY(620) * mm), 16), 'base', 'steel'); smooth(o)
    # the selector, right: its boss on the axis by the trigger guard's front and the lever running down along the housing
    o = K.obj(cyl(5.0 * mm, HW * mm, (HW + 2.0) * mm, 'x', (FX(728) * mm, UY(612) * mm), 18), 'base', 'black'); smooth(o)
    o = K.tmp(prism(PP([(716, 606), (740, 606), (748, 668), (738, 690), (726, 690)]), 'x', (HW + 1.5) * mm, (HW + 3.5) * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')
    # the housing's rear: the steel hinge plates (both sides) the stock's pins go through, with the latch button on the right
    for s in (-1, 1):
        o = K.tmp(prism(PP([(474, 580), (500, 576), (502, 638), (480, 640)]), 'x', *xs(s * 14.4 * mm, s * 17.4 * mm))); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
    o = K.obj(cyl(3.2 * mm, 17.0 * mm, 20.0 * mm, 'x', (FX(488) * mm, UY(594) * mm), 14), 'base', 'steel'); smooth(o)
    # the wire catch standing on the housing's top at its front, and the wire along its right side
    wire = K.obj(cyl(0.9 * mm, TOP * mm - 1 * mm, (TOP + 9.5) * mm, 'z', (4 * mm, FX(1032) * mm), 8), 'base', 'steel'); smooth(wire)
    o = K.obj(cyl(0.9 * mm, FX(1032) * mm, FX(1044) * mm, 'y', (4 * mm, (TOP + 9.0) * mm), 8), 'base', 'steel'); smooth(o)
    o = K.obj(cyl(0.9 * mm, FX(1040) * mm, FX(1200) * mm, 'y', ((HW + 3.0) * mm, (TOP - 3.5) * mm), 8), 'base', 'steel'); smooth(o)

# ----------------------------------------------------------------------------------------------------- THE BARREL GROUP AND THE LOWER TUBE
def barrel_base():
    """What stays when another barrel is fitted: the barrel's shank under the forend, the gas tube under it and its steel bracket forward."""
    o = K.obj(lathe([((HG0 - 50) * mm, 8.4 * mm), ((HG1 + 4) * mm, 8.4 * mm)], 24), 'base', 'black'); smooth(o)
    TU = UY(606)                                                    # the gas tube's axis
    o = K.obj(lathe([((HG0 - 40) * mm, 8.4 * mm), (FX(1500) * mm, 8.4 * mm)], 24, (0, 0, TU * mm)), 'base', 'steel'); smooth(o)
    br = K.tmp(prism(PP([(1500, 590), (1690, 590), (1690, 610), (1650, 622), (1590, 643), (1560, 632), (1500, 622)]), 'x', -4.2 * mm, 4.2 * mm))
    cut(br, cyl(2.4 * mm, -0.02, 0.02, 'x', (FX(1640) * mm, UY(603) * mm), 12))                   # (its hole)
    bevel(br, 0.6 * mm, 1, 30); smooth(br); K.adopt(br, 'base', 'black')

def barrel():
    """The barrel (slot barrel): its steel sleeve from the forend's front, then the black barrel to the front sight and the thread."""
    o = K.obj(lathe([(HG1 * mm, 9.2 * mm), (FX(1495) * mm, 9.2 * mm), (FX(1495) * mm, 8.6 * mm)], 24), 'barrel', 'steel'); smooth(o)
    o = K.obj(lathe([((HG1 - 2) * mm, 8.4 * mm), (FX(1495) * mm, 8.4 * mm), (FX(1500) * mm, 8.2 * mm), (BORE_END * mm, 8.2 * mm)], 24), 'barrel', 'black'); smooth(o)

# ----------------------------------------------------------------------------------------------------- FOREND (handguard)
def multi(boxes):
    """Several boxes as one cutter mesh (one boolean for a row of slots)."""
    bm = bmesh.new()
    for bx in boxes: bm.from_mesh(bx); bpy.data.meshes.remove(bx)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def forend():
    """The forend (slot handguard), a rounded body from the housing's front to the barrel's sleeve: the polymer guard's lower half bulges under the barrel (its
    bottom at the photo's y 652 behind, 625 ahead of the step), the finger grooves down its sides, the transverse ribs along the top, a row of small slots in each
    upper flank (dark floors), the steel collar at the front."""
    top = TOP
    bot = UY(652)
    side = [(HG0, top), (HG1, top), (HG1, UY(622)), (FX(1230), UY(626)), (FX(1170), UY(652)), (HG0, UY(652))]
    fo = K.tmp(prism(P(side), 'x', -24.0 * mm, 24.0 * mm))
    boolean(fo, prism(rounded(0, (top + bot) / 2 * mm, 24 * mm, (top - bot) / 2 * mm, 9 * mm, 5), 'y', HG0 * mm - 0.01, HG1 * mm + 0.01), 'INTERSECT')
    cut(fo, cyl(9.8 * mm, HG0 * mm - 0.01, HG1 * mm + 0.01, 'y', (0, 0), 24))                       # (the barrel passes through)
    # finger grooves: down each flank's lower half, 8.6 mm apart
    gs = []
    f = HG0 + 40
    while f + 3.2 < HG1 - 8:
        for s_ in (-1, 1): gs.append(box(*xs(s_ * 22.6 * mm, s_ * 25 * mm), f * mm, (f + 3.2) * mm, (bot - 1) * mm, (top - 29) * mm))
        f += 17.0
    cut(fo, multi(gs))
    def bot_at(f): return UY(652) if f < FX(1170) else (UY(626) if f > FX(1230) else UY(652) + (f - FX(1170)) / (FX(1230) - FX(1170)) * (UY(626) - UY(652)))
    # the upper flank's slots: 16 small squares at 10.8 px
    sl = []
    for k in range(16):
        f = 1212 + k * 10.8
        for s_ in (-1, 1): sl.append(box(*xs(s_ * 21.6 * mm, s_ * 25 * mm), FX(f) * mm, FX(f + 5.4) * mm, (top - 12.5) * mm, (top - 7.5) * mm))
    cut(fo, multi(sl))
    # the ribs across the top
    rb = []
    f = HG0 + 12
    while f + 3.0 < HG1 - 6:
        rb.append(box(-26 * mm, 26 * mm, f * mm, (f + 3.0) * mm, (top - 1.4) * mm, (top + 1) * mm)); f += 6.0
    cut(fo, multi(rb))
    bevel(fo, 1.0 * mm, 2, 30); smooth(fo); K.adopt(fo, 'handguard', HP)
    for s_ in (-1, 1):   # the slots' dark floors (a strip over each floor)
        o = K.tmp(box(*xs(s_ * 21.5 * mm, s_ * 21.9 * mm), FX(1211) * mm, FX(1385) * mm, (top - 12.5) * mm, (top - 7.5) * mm)); K.adopt(o, 'handguard', 'rubber')
    f = HG0 + 40
    while f + 3.2 < HG1 - 8:   # (and the grooves')
        for s_ in (-1, 1):
            o = K.tmp(box(*xs(s_ * 22.5 * mm, s_ * 22.9 * mm), (f + 0.2) * mm, (f + 3.0) * mm, (bot_at(f) + 8) * mm, (top - 29) * mm)); K.adopt(o, 'handguard', 'rubber')
        f += 17.0
    # the front: a steel collar round the sleeve
    o = K.obj(lathe([((HG1 - 0.5) * mm, 10.2 * mm), ((HG1 + 2.5) * mm, 10.2 * mm)], 24), 'handguard', 'steel'); smooth(o)

# ----------------------------------------------------------------------------------------------------- GRIP (factory: grip) AND TRIGGER GROUP
def grip():
    """The pistol grip: raked back, its panels stippled; the trigger guard (a rectangular steel loop) and the trigger with it."""
    pts = PP([(520, 598), (590, 598), (592, 640), (580, 720), (568, 800), (566, 822), (487, 822), (490, 790), (496, 720), (505, 630), (512, 605)])
    gp = K.tmp(prism(pts, 'x', -16.0 * mm, 16.0 * mm))
    for s in (-1, 1):
        cut(gp, prism(PP([(545, 650), (578, 650), (566, 800), (505, 800), (515, 700)]), 'x', *xs(s * 14.4 * mm, s * 17 * mm)))
    bevel(gp, 2.6 * mm, 2, 30); smooth(gp); K.adopt(gp, 'grip', HP)
    for s in (-1, 1):
        pn = K.tmp(prism(PP([(545, 650), (578, 650), (566, 800), (505, 800), (515, 700)]), 'x', *xs(s * 14.0 * mm, s * 15.2 * mm)))
        bevel(pn, 0.5 * mm, 1); smooth(pn); K.adopt(pn, 'grip', 'stipple')
    o = K.obj(cyl(4.6 * mm, FX(521) * mm, FX(525) * mm, 'y', (0, UY(823) * mm), 14), 'grip', 'steel'); smooth(o)           # (the grip screw's head at the heel)
    # the trigger group's block under the housing, ahead of the grip's tang (black in both photos behind the trigger)
    tb = K.tmp(prism(PP([(598, 597), (736, 597), (736, 644), (702, 650), (604, 650)]), 'x', -12.5 * mm, 12.5 * mm)); bevel(tb, 1.2 * mm, 2, 30); smooth(tb); K.adopt(tb, 'base', HP)
    # the trigger guard: a rectangular loop hung from the housing
    tg = K.tmp(prism(PP([(622, 596), (724, 596), (724, 692), (622, 692)]), 'x', -2.4 * mm, 2.4 * mm))
    cut(tg, prism(PP([(628, 590), (718, 590), (718, 685), (628, 685)]), 'x', -0.01, 0.01))
    bevel(tg, 0.6 * mm, 1, 30); smooth(tg); K.adopt(tg, 'base', 'black')
    o = K.tmp(prism(PP([(640, 600), (655, 600), (668, 664), (657, 673), (646, 640)]), 'x', -2.0 * mm, 2.0 * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')

# ----------------------------------------------------------------------------------------------------- STOCK (factory: stock)
STOCK_ANCH = {'butt': (FX(20) * mm, UY(700) * mm, 0), 'cheek': (FX(300) * mm, UY(578) * mm, 0)}
def stock():
    """The side-folding polymer stock: a plain tapering wedge from the housing's back to the butt, its underside sweeping down to the toe, the sling loop
    under it; the hinge block at its front (the steel plates are the housing's)."""
    out = PP([(58, 584), (100, 580), (486, 578), (486, 626), (450, 646), (350, 668), (250, 692), (150, 727), (100, 745), (70, 758), (50, 770), (30, 772), (14, 765), (22, 740), (28, 690), (40, 640)])
    st = K.tmp(prism(out, 'x', -20.0 * mm, 20.0 * mm))
    boolean(st, prism([(-14 * mm, FX(486) * mm), (14 * mm, FX(486) * mm), (19 * mm, FX(8) * mm), (-19 * mm, FX(8) * mm)], 'z', -0.2, 0.05), 'INTERSECT')
    bevel(st, 3.0 * mm, 2, 30); smooth(st); K.adopt(st, 'stock', HP)
    ring = K.tmp(cyl(5.2 * mm, -0.9 * mm, 0.9 * mm, 'x', (FX(437) * mm, UY(668) * mm), 18))
    cut(ring, cyl(3.5 * mm, -0.02, 0.02, 'x', (FX(437) * mm, UY(668) * mm), 18)); smooth(ring); K.adopt(ring, 'stock', 'steel')
    o = K.tmp(box(-9 * mm, 9 * mm, FX(437) * mm - 4 * mm, FX(437) * mm + 4 * mm, UY(646) * mm, UY(632) * mm)); K.adopt(o, 'stock', 'steel')

# ----------------------------------------------------------------------------------------------------- MUZZLE DEVICE (factory: muzzle)
def muzzle():
    """The AN-94's muzzle device: a neck over the thread and two round lobes, set above the bore (the lobes are centred 8.5 mm over it), the bore's
    exit a hole low in the face."""
    f0 = BORE_END
    ZC = 4.0                                                                                          # (the lobes' axis: 4 mm over the bore)
    mz = K.tmp(lathe([(f0 * mm, 8.2 * mm), ((f0 + 8) * mm, 8.6 * mm), ((f0 + 24) * mm, 9.0 * mm), (FX(1782) * mm, 9.5 * mm), (FX(1786) * mm, 12.5 * mm), (FX(1800) * mm, 13.6 * mm),
                      (FX(1818) * mm, 13.6 * mm), (FX(1826) * mm, 11.2 * mm), (FX(1838) * mm, 11.0 * mm), (FX(1846) * mm, 14.0 * mm), (FX(1862) * mm, 14.6 * mm), (FX(1876) * mm, 13.8 * mm),
                      (FX(1884) * mm, 9.0 * mm), (MUZ_END * mm, 7.2 * mm), (MUZ_END * mm, 0.0004)], 28, (0, 0, ZC * mm)))
    cut(mz, cyl(2.8 * mm, f0 * mm - 0.01, MUZ_END * mm + 0.01, 'y', (0, 0), 14))                    # (the bore)
    for fc in (FX(1809), FX(1854)):                                                                  # (a vent across each lobe)
        cut(mz, cyl(2.0 * mm, -0.02, 0.02, 'x', (fc * mm, (ZC + 14.0) * mm), 12))
    smooth(mz); K.adopt(mz, 'muzzle', 'black')
    return MUZ_END

# ----------------------------------------------------------------------------------------------------- IRONS (factory: optic)
NOTCH_F = DRUM_F - 9.0
def irons():
    """The rotary drum rear sight on the housing's hump (a drum with its rear blade and its U notch) and the front sight: a block on the barrel with the post
    standing in a protecting ring."""
    dr = K.tmp(cyl(13.0 * mm, (TOP - 2) * mm, (SY - 2.2) * mm, 'z', (0, DRUM_F * mm), 28))
    for k in range(12):      # (the drum's rim: crenellations)
        a = k * math.pi / 6
        g = box(-1.1 * mm, 1.1 * mm, -2.6 * mm, 2.6 * mm, (SY - 6.0) * mm, (SY - 1.9) * mm); g.transform(Matrix.Translation((0, DRUM_F * mm + 0.0, 0)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 13.0 * mm, 0)))
        cut(dr, g)
    bevel(dr, 0.6 * mm, 1, 30); smooth(dr); K.adopt(dr, 'optic', 'black')
    bl = K.tmp(box(-8.5 * mm, 8.5 * mm, NOTCH_F * mm, (NOTCH_F + 2.8) * mm, (SY - 2.5) * mm, (SY + 1.8) * mm))
    cut(bl, box(-1.3 * mm, 1.3 * mm, (NOTCH_F - 1) * mm, (NOTCH_F + 4) * mm, (SY - 1.5) * mm, (SY + 3) * mm))
    cut(bl, cyl(1.3 * mm, (NOTCH_F - 1) * mm, (NOTCH_F + 4) * mm, 'y', (0, (SY - 1.5) * mm), 12))
    bevel(bl, 0.3 * mm, 1); smooth(bl); K.adopt(bl, 'optic', 'steel')
    for s in (-1, 1):        # (the little ears either side of the drum)
        o = K.tmp(box(*xs(s * 9.0 * mm, s * 11.5 * mm), (DRUM_F - 3) * mm, (DRUM_F + 3) * mm, (TOP - 1) * mm, (TOP + 5.5) * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
    # the front sight: the block clamped on the barrel, the tower and post, the ring
    pf = POST_F
    bk = K.tmp(prism(P([(pf - 9, -7), (pf + 9, -7), (pf + 9, 8), (pf - 9, 8)]), 'x', -8.0 * mm, 8.0 * mm))
    boolean(bk, prism(circles_hull([(0, 0.5 * mm)], 8.0 * mm, 24), 'y', (pf - 10) * mm, (pf + 10) * mm), 'INTERSECT')
    cut(bk, cyl(5.8 * mm, (pf - 11) * mm, (pf + 11) * mm, 'y', (0, 0), 20))
    bevel(bk, 0.5 * mm, 1, 30); smooth(bk); K.adopt(bk, 'optic', 'black')
    HC = SY - 3.5
    rg = K.tmp(cyl(8.3 * mm, (pf - 3.5) * mm, (pf + 3.5) * mm, 'y', (0, HC * mm), 28))
    cut(rg, cyl(6.2 * mm, (pf - 4) * mm, (pf + 4) * mm, 'y', (0, HC * mm), 28))
    cut(rg, box(-4.2 * mm, 4.2 * mm, (pf - 4) * mm, (pf + 4) * mm, (HC + 5) * mm, (HC + 12) * mm))      # (open at the top)
    bevel(rg, 0.4 * mm, 1, 30); smooth(rg); K.adopt(rg, 'optic', 'black')
    o = K.obj(cyl(2.4 * mm, 6 * mm, (HC - 6.5) * mm, 'z', (0, pf * mm), 12), 'optic', 'black'); smooth(o)           # (the tower)
    o = K.obj(cyl(0.9 * mm, (HC - 6.5) * mm, SY * mm, 'z', (0, pf * mm), 10), 'optic', 'steel'); smooth(o)          # (the post)
    for s in (-1, 1):   # the ring's two feet
        o = K.tmp(box(*xs(s * 5.8 * mm, s * 8.3 * mm), (pf - 3.5) * mm, (pf + 3.5) * mm, (HC - 6.0) * mm, (HC - 0.5) * mm)); K.adopt(o, 'optic', 'black')

RC0, RC1 = DRUM_F + 5.0, HG0 - 6.0          # the optic rail's ends
RC_T = TOP + 3.5
RC_RT = RC_T + 5.6
def railed_mount():
    """The optic mount (slot optic, extras.mount: drawn only under a real sight): a plate on the housing's top with a Picatinny rail along it."""
    def mount(o): o['mount'] = True; return o
    pl = K.tmp(box(-14.5 * mm, 14.5 * mm, (RC0 - 2) * mm, (RC1 + 2) * mm, (TOP - 1.0) * mm, RC_T * mm)); bevel(pl, 0.8 * mm, 1, 30); smooth(pl); mount(K.adopt(pl, 'optic', 'black'))
    mount(picatinny(K, RC0 * mm, RC1 * mm, RC_T * mm, 'optic', 'black'))
    for f in (RC0 + 8, RC1 - 8):
        for s_ in (-1, 1):
            o = K.obj(cyl(1.6 * mm, (RC_T - 0.5) * mm, (RC_T + 0.6) * mm, 'z', (s_ * 11.4 * mm, f * mm), 10), 'optic', 'steel'); smooth(o); mount(o)

# ----------------------------------------------------------------------------------------------------- CHARGING BAR (part_handle, on the LEFT)
HOOK_U = -3.0
BAR0, BAR1 = 40.0, 158.0                         # the bar's rear (the hook) and its pointed tip
BAR_X = -(HW - 2.0)
def handle():
    """The left-hand charging bar (part_handle): a long steel rod in its channel with a thumb hook at the rear and a pointed tip, the clip on it. It is not
    reciprocating: it stays forward when the gun fires and is pulled back to charge."""
    ph = K.part('handle', (0, BAR0 * mm, HOOK_U * mm))
    o = K.obj(lathe([(BAR0 * mm, 1.7 * mm), ((BAR1 - 8) * mm, 1.7 * mm), (BAR1 * mm, 0.4 * mm)], 12, (BAR_X * mm, 0, HOOK_U * mm)), 'base', 'steel', ph); smooth(o)
    hk = K.tmp(box(*xs((BAR_X + 1.5) * mm, -(HW + 5.5) * mm), (BAR0 - 0.5) * mm, (BAR0 + 3.5) * mm, (HOOK_U - 2.0) * mm, (HOOK_U + 9.0) * mm)); bevel(hk, 0.6 * mm, 1); smooth(hk); K.adopt(hk, 'base', 'steel', ph)
    cp = K.tmp(box(*xs((BAR_X - 1.6) * mm, -(HW + 1.2) * mm), 92 * mm, 112 * mm, (HOOK_U - 5.0) * mm, (HOOK_U + 2.0) * mm)); bevel(cp, 0.5 * mm, 1); smooth(cp); K.adopt(cp, 'base', 'steel', ph)
    return ph

# ----------------------------------------------------------------------------------------------------- THE MAGAZINE (part_mag, borrowed)
def magazine():
    """The AK-74's 30-round magazine (the family's: the kit's top at 184 / -8 moved to this well's), canted CANT degrees to the right about its top."""
    pm = [o for o in borrow if o.name == 'part_mag'][0]
    for o in borrow: coll.objects.link(o)
    pm.parent = root; pm.matrix_parent_inverse = Matrix.Identity(4); pm.matrix_world = Matrix.Translation((0, MAG_F * mm, MAG_Y * mm))
    bpy.context.view_layer.update()
    Td = Matrix.Translation((0, (MAG_F - 184.0) * mm, (MAG_Y + 8.0) * mm))
    Rc = Matrix.Translation((0, MAG_F * mm, MAG_Y * mm)) @ Matrix.Rotation(-math.radians(CANT), 4, 'Y') @ Matrix.Rotation(-math.radians(PITCH), 4, 'X') @ Matrix.Translation((0, -MAG_F * mm, -MAG_Y * mm))
    Sc = Matrix.Translation((0, MAG_F * mm, MAG_Y * mm)) @ Matrix.Diagonal((1.0, 1.0, MAG_LEN, 1.0)) @ Matrix.Translation((0, -MAG_F * mm, -MAG_Y * mm))
    for o in borrow:
        if o is pm: continue
        W = Wold[o]; ident = (W.to_3x3() - Matrix.Identity(3)).median_type if False else max(abs(W[i][j] - (1.0 if i == j else 0.0)) for i in range(3) for j in range(3)) < 1e-6
        o.parent = pm; o.matrix_parent_inverse = Matrix.Identity(4)
        if o.get('chk') is not None and not ident:       # (a witness hole: tilted to the face, moved with the scaled magazine, not stretched)
            full = Rc @ Sc @ Td @ W
            R3 = Rc.to_3x3() @ W.to_3x3()
            o.matrix_world = Matrix.Translation(full.translation) @ R3.to_4x4()
        elif o.get('chk') is not None:                    # (a round: moved, not scaled)
            o.data.transform(Rc @ Td @ W); o.matrix_world = Matrix.Identity(4)
        else:                                             # (the body: its vertices carry the scale)
            o.data.transform(Rc @ Sc @ Td @ W); o.matrix_world = Matrix.Identity(4)
        K.n += 1; o.name = '%s_%d' % (o.get('slot', 'mag'), K.n)
    bpy.context.view_layer.update()
    return pm

# ===================================================================================================== ASSEMBLY
housing()
forend()
barrel_base()
barrel()
grip()
stock()
MUZ = muzzle()
irons()
railed_mount()
ph = handle()
pm = magazine()
pm['check'] = pm.get('check') or {'w': 0.026}
bpy.context.view_layer.update()
for o in list(coll.all_objects):
    if o.name.startswith('tmp') or o.name.startswith('cutter'): bpy.data.objects.remove(o, do_unlink=True)

# flat faces shade flat, edges hard at 30 degrees: normals weighted by face area
for o in [o for o in coll.all_objects if o.type == 'MESH']:
    smooth(o, 30)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    _apply(o, md)
for n, c in (('stipple', (0.05, 0.05, 0.055, 1)),):
    m = bpy.data.materials.get(n)
    if m: m.diffuse_color = c

# ===================================================================================================== info and anchors
r4 = lambda v: round(v, 4)
info = {
    'sy': r4(SY * mm), 'fSight': r4(NOTCH_F * mm), 'relief': 0.15,
    'muzzles': [[r4(MUZ * mm), 0, 0]],
    'grip': [0.026, -0.08, 0], 'support': [r4((HG0 + HG1) / 2 * mm + 0.02), -0.012, 0],
    'anim': {'handle': 'part_handle', 'mag': 'part_mag'},
    'magAt': [r4(MAG_F * mm), r4(MAG_Y * mm)],
    'handle': {'f': r4(BAR0 * mm), 'y': r4(HOOK_U * mm), 'x': r4(-(HW + 3.0) * mm), 'travel': 0.060, 'recip': False, 'style': 'bar', 'grab': [r4(BAR0 * mm + 0.002), r4(HOOK_U * mm + 0.004), r4(-(HW + 4.0) * mm)]},
    'port': [r4(FX(907) * mm), r4(UY(518) * mm), r4(HW * mm)],
    'chamberAt': {'side': 'right', 'f': r4(197 * mm), 'y': 0.0, 'x': r4((HW - 2.5) * mm)},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [r4(BORE_END * mm), 0, 0]},
}
anchors = {
    'mount_optic': [r4(FX(600) * mm), r4(TOP * mm), 0], 'mount_optic_end': [r4((HG0 - 2) * mm), r4(TOP * mm), 0],
    'mount_optic_rail': [r4(RC0 * mm), r4(RC_RT * mm), 0], 'mount_optic_rail_end': [r4(RC1 * mm), r4(RC_RT * mm), 0],
    'mount_handguard': [r4(HG0 * mm), 0, 0], 'mount_handguard_end': [r4((HG1 + 14.5) * mm), 0, 0],
    'mount_barrel': [r4((HG1 + 16.0) * mm), 0, 0], 'mount_muzzle': [r4(BORE_END * mm), 0, 0],
    'mount_stock': [0, r4(UY(578) * mm - 0.003), 0], 'mount_grip': [r4(FX(590) * mm), r4(SHELF * mm), 0],
    'mount_mag': [r4(MAG_F * mm), r4(MAG_Y * mm), 0],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
if EXPORT:
    with open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'source': 'authored', 'sights': {'builtin': ['notch'], 'rail': []}}, indent=2) + '\n')
def open_edges(objs):
    import bmesh as _bm
    out = {}
    for o in objs:
        b = _bm.new(); b.from_mesh(o.data); n = sum(1 for e in b.edges if not e.is_manifold); b.free()
        if n: out[o.name] = n
    return out
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'open_meshes': open_edges(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT), 'info': info, 'anchors': anchors}
print('RESULT', json.dumps(result))
