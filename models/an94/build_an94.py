# The AN-94 "Abakan" (game id an94): the Nikonov 5.45 x 39 assault rifle as fielded, with its black polymer housing, the side-folding polymer stock, the
# ribbed and grooved forend, the rotary drum rear sight, the two-lobe muzzle device and the right-hand charging lever, in Blender.
#   Blender: exec(open(r'<repo>/models/an94/build_an94.py').read(), {'GUN_DIR': r'<repo>/models/an94'})
#   or:      blender -b -P models/an94/build_an94.py
# References (all viewed on Wikimedia Commons, not downloaded):
#  - "AN-94 Abakan (3).jpg" (Vitaly V. Kuzmin, CC BY-SA 4.0; 2249 x 1450, the right side, muzzle right, the rifle lying on a table and photographed from
#    above: a slight tilt, so heights read about 9 % high against lengths): the outline and the right side's detail. Read off its 1920-px thumbnail:
#    1901 px butt to muzzle = the published 943 mm (stock extended), 0.496 mm a pixel along the gun; heights are scaled 0.54 mm a pixel (the tilt:
#    checked against "Rifle AN-94.jpg", public domain, 500 x 197, a level right-side shot, and the magazine's length, which is the AK-74's).
#  - "AN-94 Abakan (4).jpg" and "(1).jpg" (same author and licence; the LEFT side, muzzle left): the recess and rod on the left, the left hinge plate, the
#    stippled panel, the same housing without a port.
#  - "АН-94 - Интерполитех-2009 01.jpg", "АН-94 - МВСВ-2008 01.jpg" and "02.jpg" (same author, CC BY-SA 4.0): the right side on the wall and in the hand,
#    from the muzzle end (the forend's width against the magazine's), the stock hinge and the latch.
#  - the prototype shots "Опытный образец автомата АН-94 ... Танковому Биатлону-2014" (same author): the grooved forend's flank and the trigger group.
# Real figures: 943 mm overall stock extended (728 folded), 405 mm barrel, 3.85 kg, 5.45 x 39 from AK-74 magazines (the AN-94's well cants it a few
# degrees to the right).
# What the photos show: the housing is polymer, a stepped hump over the trigger group carrying the rotary drum rear sight, the magazine well deep in
# the housing, the forend a ribbed upper over a deeper, grooved lower guard (a ledge where they meet). Ahead of it the barrel with its steel sleeve and the
# front sight (a hooded post) on the barrel's front, the muzzle device (two round lobes), and a gas tube under the barrel ending in a steel hanger. The
# charging lever is on the RIGHT: a long narrow slot along the top of the right flank with a bent steel lever standing out of its front end. A round
# plug, a steel magazine catch block and its round button show on the right flank; the left has a recess with a rod.
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

def hullc(cs, seg=12):
    """The convex outline round circles (x, z, r) of different radii, anticlockwise: a section with round shoulders and its flanks leaning in."""
    return hull2([(x + r * math.cos(2 * math.pi * i / seg), z + r * math.sin(2 * math.pi * i / seg)) for x, z, r in cs for i in range(seg)])

def multi(boxes):
    """Several closed meshes as one cutter mesh (one boolean for a row of slots)."""
    bm = bmesh.new()
    for bx in boxes: bm.from_mesh(bx); bpy.data.meshes.remove(bx)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

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

HW = 17.2                        # the housing's half width (34.4 mm: an AK's stamped receiver is 31, the AN-94's polymer housing a little over it; the photos' housing stands about the magazine's width)
FW = 19.0                        # the forend's lower guard's half width (38 mm); its rounded upper 1 mm less each side
FTOP = None                      # (set below)
GW = 13.0                        # the grip's half width (its stippled panels 1.5 mm in)
STW0, STW1 = 12.5, 14.8          # the stock's half width at the hinge and at the butt
TOP = UY(509)                    # the housing's top (28.1: the photo's flat top reads 24-28 mm over the bore; the drum stands above it)
FTOP = TOP - 2.3                 # (the forend's top: a little under the housing's, as in the photo)
SHELF = UY(598)                  # the underside behind the magazine well (-20)
WELL_B = UY(636)                 # the well's floor: the housing's lower band ahead of the shelf (-40.5)
SY = 40.0                        # the sight line: the front post's tip, the rear notch
DRUM_F = FX(668)                 # the drum's centre
MAG_F, MAG_Y = 159.0, 6.0        # the magazine's top (mount_mag)
MAG_LEN = 1.0                    # the photo's magazine is the kit's AK-74 magazine at full length (platform magFit.len)
CANT = 2.5                       # the magazine canted this many degrees to the right
PITCH = 1.2                      # and its foot swung this many degrees back (the photo's magazine stands straighter than the kit's)
FOOT_BACK = 3.0                 # and bent straighter: its foot this many mm further back than a rigid swing leaves it
HG0, HG1 = FX(1000), FX(1395)    # the forend
BORE_END = FX(1730)              # the barrel's front (the muzzle device screws on)
MUZ_END = FX(1913)               # the device's tip (the bullet leaves it)
POST_F = FX(1672)
PORT = (FX(756), FX(965), UY(578), UY(530))   # the ejection port's rear, front, bottom and top (mm): a plain cut in the right flank down past the bore, from the magazine's rear edge where it meets the housing (photo px 756) to the front at 965 (AK pattern: no cover, no hinge)
SLOT = (FX(807), FX(1027), UY(522), UY(513))  # the charging lever's slot along the top of the right flank: rear, front, bottom, top
print('anchors f: well', MAG_F, 'hg', HG0, HG1, 'barrel end', BORE_END, 'muzzle', MUZ_END, 'post', POST_F)

def rivet(x, f, u, r=1.5, h=0.9, slot='base'):
    """A domed steel head on a flank: x the flank's surface (signed), forward f, up u (mm)."""
    s = 1 if x >= 0 else -1
    o = K.tmp(cyl(r * mm, *xs(x * mm - s * 0.2 * mm, x * mm + s * h * mm), 'x', (f * mm, u * mm), 10)); bevel(o, 0.35 * mm, 1); smooth(o); K.adopt(o, slot, 'steel')

# ----------------------------------------------------------------------------------------------------- HOUSING (base)
def housing():
    """The housing: the stepped hump over the trigger group, the magazine well, the flat top to the forend; its section a rounded box. The well is
    hollow and tall enough for the canted magazine. On the right: the ejection port (a pocket lined black, the carrier in it), the charging lever's slot along
    the top, the round plug, the magazine catch block and its button, the selector, rivets, the seam; on the left a recess with a rod; the steel hinge plates at the
    back on both sides."""
    prof = PP([(486, 556), (530, 544), (572, 540), (590, 524), (600, 509), (1000, 509), (1000, 636), (760, 636), (760, 598), (500, 598), (486, 590)])
    h = K.tmp(prism(prof, 'x', -HW * mm, HW * mm))
    sec = hullc([(s_ * (HW - 7.0) * mm, (TOP - 7.0) * mm, 7.0 * mm) for s_ in (-1, 1)] + [(s_ * (HW - 4.0) * mm, (WELL_B + 4.0) * mm, 4.0 * mm) for s_ in (-1, 1)], 14)
    boolean(h, prism(sec, 'y', -0.01, HG0 * mm + 0.01), 'INTERSECT')       # (the housing's section: a flat top between round shoulders, the flanks upright, where the controls stand)
    cut(h, box(-14.0 * mm, 15.9 * mm, (MAG_F - 34) * mm, (MAG_F + 36) * mm, (WELL_B - 2) * mm, 8 * mm))        # (the well: hollow round the canted magazine)
    tidy(h, 1e-6, False); bevel(h, 0.8 * mm, 1, 30)                                                       # (the body's chamfer once, then the port, slot, recess and plug: no chamfer of their own)
    pa, pb, pu0, pu1 = PORT
    cut(h, prism(rounded((pa + pb) / 2 * mm, (pu0 + pu1) / 2 * mm, (pb - pa) / 2 * mm, (pu1 - pu0) / 2 * mm, 2.2 * mm, 4), 'x', -2.0 * mm, (HW + 1) * mm))       # (the port, right)
    cut(h, box((HW - 3.5) * mm, (HW + 1) * mm, SLOT[0] * mm, SLOT[1] * mm, SLOT[2] * mm, SLOT[3] * mm))          # (the lever's slot, right)
    cut(h, box(-(HW + 1) * mm, -(HW - 3.0) * mm, 36 * mm, 166 * mm, -7.5 * mm, 1.5 * mm))                        # (the left recess)
    cut(h, cyl(7.0 * mm, (HW - 0.6) * mm, (HW + 1) * mm, 'x', (FX(724) * mm, UY(536) * mm), 24))               # (the round plug's recess, right)
    cut(h, cyl(1.6 * mm, (HW - 1.4) * mm, (HW + 1) * mm, 'x', (FX(1018) * mm, UY(538) * mm), 12))              # (the small hole)
    slice_at_vertices(h, 'y'); tidy(h); smooth(h); K.adopt(h, 'base', HP)
    # the openings read dark: the slot's floor, the plug's disc, the left recess's floor, the small hole's
    for o in (K.tmp(box((HW - 3.7) * mm, (HW - 3.3) * mm, (SLOT[0] + 1) * mm, (SLOT[1] - 1) * mm, (SLOT[2] + 0.3) * mm, (SLOT[3] - 0.3) * mm)),
              K.tmp(cyl(6.6 * mm, (HW - 0.9) * mm, (HW - 0.5) * mm, 'x', (FX(724) * mm, UY(536) * mm), 24)),
              K.tmp(box(-(HW - 3.3) * mm, -(HW - 2.9) * mm, 37 * mm, 165 * mm, -7 * mm, 1.0 * mm)),
              K.tmp(cyl(1.2 * mm, (HW - 1.7) * mm, (HW - 1.2) * mm, 'x', (FX(1018) * mm, UY(538) * mm), 10))):
        smooth(o); K.adopt(o, 'base', 'rubber')
    # the port's lining (the carrier uncovers it): a thin black shell, the chamber's mouth at its front wall and the feed ramp
    pc, pu, ph, pv = (pa + pb) / 2, (pu0 + pu1) / 2, (pb - pa) / 2, (pu1 - pu0) / 2
    tub = K.tmp(prism(rounded(pc * mm, pu * mm, (ph - 0.15) * mm, (pv - 0.15) * mm, 2.0 * mm, 4), 'x', -2.0 * mm, (HW - 0.3) * mm))
    cut(tub, prism(rounded(pc * mm, pu * mm, (ph - 0.6) * mm, (pv - 0.6) * mm, 1.8 * mm, 4), 'x', -1.55 * mm, (HW + 1) * mm)); smooth(tub); K.adopt(tub, 'base', 'black')
    o = K.obj(lathe([((pb - 4.6) * mm, 5.6 * mm), ((pb - 0.7) * mm, 5.6 * mm)], 24, (0, 0, 0)), 'base', 'gunmetal'); smooth(o)
    o = K.tmp(prism([((pb - 24) * mm, -2.6 * mm), ((pb - 1.0) * mm, 1.0 * mm), ((pb - 1.0) * mm, -2.6 * mm)], 'x', -7.0 * mm, 7.0 * mm)); smooth(o); K.adopt(o, 'base', 'gunmetal')
    # panel seams (thin dark inlays): the long seam along the right flank, the hump's edge on both sides
    for s_ in (-1, 1):
        o = K.tmp(box(*xs(s_ * (HW - 0.05) * mm, s_ * (HW + 0.22) * mm), FX(520) * mm, FX(750) * mm, UY(571) * mm, (UY(571) + 0.7) * mm)); K.adopt(o, 'base', 'rubber')
        o = K.tmp(box(*xs(s_ * (HW - 0.05) * mm, s_ * (HW + 0.22) * mm), FX(742) * mm, (FX(742) + 0.7) * mm, UY(598) * mm, UY(556) * mm)); K.adopt(o, 'base', 'rubber')
    # rivets and screw heads (right: the photo's; left: mirrored places)
    for px, py in ((838, 583), (672, 560), (716, 558), (790, 590), (562, 586), (610, 590)):
        rivet(HW, FX(px), UY(py), 1.5)
        rivet(-HW, FX(px + 14), UY(py + 6), 1.5)
    # the magazine catch: the steel L-block on the right at the well's front and the square recess with its round button below it
    o = K.tmp(prism(P([(FX(910), UY(593)), (FX(928), UY(593)), (FX(928), UY(580)), (FX(921), UY(580)), (FX(921), UY(572)), (FX(910), UY(572))]), 'x', HW * mm, (HW + 2.6) * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
    o = K.tmp(box(HW * mm, (HW + 0.4) * mm, (FX(933) - 6.5) * mm, (FX(933) + 6.5) * mm, (UY(620) - 6.0) * mm, (UY(620) + 6.0) * mm)); K.adopt(o, 'base', 'rubber')
    o = K.obj(cyl(3.6 * mm, (HW + 0.3) * mm, (HW + 1.9) * mm, 'x', (FX(933) * mm, UY(620) * mm), 16), 'base', 'steel'); smooth(o)
    # the selector, right: its boss on the axis by the trigger guard's front and the lever running down along the housing, its edge ridged
    o = K.obj(cyl(5.0 * mm, HW * mm, (HW + 2.0) * mm, 'x', (FX(728) * mm, UY(612) * mm), 18), 'base', 'black'); smooth(o)
    o = K.tmp(prism(PP([(716, 606), (740, 606), (748, 668), (738, 690), (726, 690)]), 'x', (HW + 1.5) * mm, (HW + 3.5) * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')
    for k_ in range(6):
        o = K.tmp(box((HW + 3.4) * mm, (HW + 3.9) * mm, FX(728) * mm - 4.2 * mm, FX(728) * mm + 5.0 * mm, UY(640 + k_ * 7) * mm, (UY(640 + k_ * 7) + 1.2) * mm)); K.adopt(o, 'base', 'rubber')
    # the housing's rear: the steel hinge plates (both sides) the stock's pins go through, a pin through them, the latch button on the right
    for s in (-1, 1):
        o = K.tmp(prism(PP([(470, 570), (502, 566), (504, 642), (478, 646)]), 'x', *xs(s * (HW - 3.6) * mm, s * (HW + 0.8) * mm))); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
        o = K.obj(cyl(2.6 * mm, *xs(s * (HW - 0.8) * mm, s * (HW + 0.9) * mm), 'x', (FX(488) * mm, UY(594) * mm), 14), 'base', 'steel'); smooth(o)
    o = K.obj(cyl(3.2 * mm, (HW - 0.6) * mm, (HW + 2.2) * mm, 'x', (FX(510) * mm, UY(594) * mm), 14), 'base', 'steel'); smooth(o)      # (the latch button, right: the photo's second boss)
    o = K.obj(cyl(1.7 * mm, (HW + 2.0) * mm, (HW + 3.0) * mm, 'x', (FX(510) * mm, UY(594) * mm), 10), 'base', 'rubber'); smooth(o)
    # the retaining wire along the right of the forend's upper flank
    o = K.obj(cyl(0.9 * mm, FX(1040) * mm, FX(1210) * mm, 'y', ((FW - 0.6 + 0.7) * mm, 11.0 * mm), 8), 'base', 'steel'); smooth(o)
    # the steel collar where the forend meets the housing
    o = K.obj(lathe([(HG0 * mm - 1.5 * mm, 10.8 * mm), (HG0 * mm + 1.5 * mm, 10.8 * mm)], 24), 'base', 'steel'); smooth(o)

# ----------------------------------------------------------------------------------------------------- THE BARREL GROUP AND THE LOWER TUBE
def barrel_base():
    """What stays when another barrel or handguard is fitted: the barrel's shank under the forend, the gas tube ahead of it and the bracket that hangs from its end to the
    front sight base. Under the forend, hidden in it, a second tube and a gas block ahead of the forend: an AK's upper handguard (the standard furniture fits this gun)
    is a cover round a gas tube, and with none under it the cover floated."""
    o = K.obj(lathe([((PORT[1] - 0.5) * mm, 8.4 * mm), ((HG1 + 4) * mm, 8.4 * mm)], 16), 'base', 'black'); smooth(o)
    TU = UY(606)                                                    # the gas tube's axis (below the barrel)
    o = K.obj(lathe([((HG1 - 4) * mm, 8.4 * mm), (FX(1560) * mm, 8.4 * mm)], 24, (0, 0, TU * mm)), 'base', 'steel'); smooth(o)
    o = K.obj(lathe([(FX(1556) * mm, 9.0 * mm), (FX(1568) * mm, 9.0 * mm)], 24, (0, 0, TU * mm)), 'base', 'steel'); smooth(o)     # (the collar the bracket clamps)
    # the AK furniture's bearer: a tube over the barrel as an AK's gas tube is, inside the AN-94 forend (its top 0.6 mm under the forend's ribs), and a block closing its front
    TA = 18.0
    o = K.obj(lathe([((PORT[1] + 1.0) * mm, 5.8 * mm), ((HG1 + 3) * mm, 5.8 * mm)], 16, (0, 0, TA * mm)), 'base', 'steel'); smooth(o)
    gb = K.tmp(prism(hullc([(0, 0, 9.6 * mm), (0, TA * mm, 5.8 * mm)], 20), 'y', (HG1 + 2.5) * mm, (HG1 + 11.5) * mm)); bevel(gb, 0.5 * mm, 1, 30); smooth(gb); K.adopt(gb, 'base', 'black')
    # the bracket: a thin plate hung from the tube's end up to the sight base's foot (the photos: a thick lug, its lower edge sloping down to a rounded point and up to the front)
    br = K.tmp(prism(PP([(1558, 592), (1640, 592), (1648, 584), (1692, 584), (1692, 600), (1676, 610), (1652, 622), (1618, 640), (1600, 648), (1584, 646), (1566, 636), (1558, 630)]), 'x', -3.0 * mm, 3.0 * mm))
    tidy(br, 1e-6, False); bevel(br, 1.0 * mm, 1, 30)
    cut(br, cyl(2.4 * mm, -0.02, 0.02, 'x', (FX(1640) * mm, UY(606) * mm), 12))                   # (its hole)
    tidy(br); smooth(br); K.adopt(br, 'base', 'black')
    o = K.tmp(box(-3.4 * mm, 3.4 * mm, FX(1612) * mm, FX(1648) * mm, UY(590) * mm, (UY(590) + 3.0) * mm)); K.adopt(o, 'base', 'steel')    # (the rail on the hanger's top)
    for s_ in (-1, 1): rivet(s_ * 3.0, FX(1572), UY(618), 1.2, 0.7)

def barrel():
    """The barrel (slot barrel): its steel sleeve from the forend's front, then the black barrel to the front sight and the thread."""
    o = K.obj(lathe([(HG1 * mm, 9.2 * mm), (FX(1495) * mm, 9.2 * mm), (FX(1495) * mm, 8.6 * mm)], 24), 'barrel', 'steel'); smooth(o)
    o = K.obj(lathe([((HG1 - 2) * mm, 8.4 * mm), (FX(1495) * mm, 8.4 * mm), (FX(1500) * mm, 8.2 * mm), (BORE_END * mm, 8.2 * mm)], 24), 'barrel', 'black'); smooth(o)

# ----------------------------------------------------------------------------------------------------- FOREND (handguard)
def forend():
    """The forend (slot handguard): a rounded shroud over a deeper grooved lower guard (a ledge where they meet), the lower's bottom at the photo's y 652 behind and
    625 ahead of the step: the finger grooves down the lower flanks, a row of small slots in each upper flank, ribs wrapping over the top and shoulders (dark floors), the
    steel collar. The upper's section is round over the top (the photos from the muzzle end show a half-round cover, ribbed), 5 mm over the housing's top."""
    top = FTOP
    bot = UY(652)
    zl = UY(583)                                                                                 # (where the lower guard's top is: the ledge)
    UW = FW - 1.0                                                                                # (the upper's half width)
    RT = 9.5                                                                                     # (its shoulder radius: nearly a half round)
    def usec(d=0.0):
        return hullc([(s_ * (UW - RT) * mm, (top - RT) * mm, (RT - d) * mm) for s_ in (-1, 1)] + [(s_ * (UW - 1.0) * mm, (zl + 1.0) * mm, (1.0 - d * 0.0) * mm) for s_ in (-1, 1)], 16)
    up = K.tmp(prism(usec(), 'y', HG0 * mm, HG1 * mm))
    side = [(HG0, zl + 4.0), (HG1, zl + 4.0), (HG1, UY(622)), (FX(1230), UY(626)), (FX(1170), UY(652)), (HG0, UY(652))]
    lo = K.tmp(prism(P(side), 'x', -FW * mm, FW * mm))
    boolean(lo, prism(rounded(0, (zl + 4.0 + bot) / 2 * mm, FW * mm, (zl + 4.0 - bot) / 2 * mm, 9 * mm, 5), 'y', HG0 * mm - 0.01, HG1 * mm + 0.01), 'INTERSECT')
    boolean(up, lo.data.copy(), 'UNION')
    bpy.data.objects.remove(lo, do_unlink=True)
    fo = up
    cut(fo, cyl(9.8 * mm, HG0 * mm - 0.01, HG1 * mm + 0.01, 'y', (0, 0), 24))                       # (the barrel passes through)
    tidy(fo, 1e-6, False); bevel(fo, 0.7 * mm, 1, 30)                                        # (the body's chamfer once, before the grooves, slots and ribs: they get none of their own; after the bore, which a boolean can't cut cleanly through the chamfer)
    def bot_at(f): return UY(652) if f < FX(1170) else (UY(626) if f > FX(1230) else UY(652) + (f - FX(1170)) / (FX(1230) - FX(1170)) * (UY(626) - UY(652)))
    gs, f = [], HG0 + 30
    while f + 2.2 < HG1 - 8:                                                                     # (finer grooves, 11.5 mm apart)
        for s_ in (-1, 1): gs.append(box(*xs(s_ * (FW - 1.1) * mm, s_ * (FW + 1) * mm), f * mm, (f + 2.2) * mm, (bot_at(f) + 3) * mm, (zl - 3) * mm))
        f += 11.5
    cut(fo, multi(gs))
    sl = []
    for k in range(16):                                                                          # (the upper flank's slots: 16 small squares at 10.8 px)
        f = 1212 + k * 10.8
        for s_ in (-1, 1): sl.append(box(*xs(s_ * (UW - 2.8) * mm, s_ * (UW + 1) * mm), FX(f) * mm, FX(f + 5.4) * mm, (top - 9.8) * mm, (top - 5.8) * mm))
    cut(fo, multi(sl))
    # the ribs: slabs 2.4 mm wide every 4.8 mm, each cut only through the outer 1.4 mm of the round section (a slab less the section reduced by 1.4 mm all round)
    rb, f = [], HG0 + 12
    while f + 2.4 < HG1 - 6:
        rb.append(box(-30 * mm, 30 * mm, f * mm, (f + 2.4) * mm, (zl + 3.0) * mm, (top + 2) * mm)); f += 4.8
    rc = K.tmp(multi(rb))
    boolean(rc, prism(hullc([(s_ * (UW - RT) * mm, (top - RT) * mm, (RT - 1.4) * mm) for s_ in (-1, 1)] + [(s_ * (UW - 1.4) * mm, (zl - 3) * mm, 0.4 * mm) for s_ in (-1, 1)], 16), 'y', HG0 * mm - 0.05, HG1 * mm + 0.05), 'DIFFERENCE')
    cut(fo, rc.data.copy()); bpy.data.objects.remove(rc, do_unlink=True)
    for s_ in (-1, 1):                                                                           # (a line along each flat flank under the slots: they sit in a band of their own and the faces between the ribs stay short cells)
        slice_faces(fo, [((s_ * UW * mm, 0, 0), (s_, 0, 0), (0, 0, (top - 11.3) * mm), (0, 0, 1))])
    strip_ngons(fo, 'y', passes=1)
    tidy(fo); smooth(fo); K.adopt(fo, 'handguard', HP)
    fl = []   # the slots' dark floors (a strip over each floor) and the grooves': one mesh
    for s_ in (-1, 1): fl.append(box(*xs(s_ * (UW - 2.8) * mm, s_ * (UW - 2.4) * mm), FX(1211) * mm, FX(1385) * mm, (top - 9.8) * mm, (top - 5.8) * mm))
    f = HG0 + 30
    while f + 2.2 < HG1 - 8:
        for s_ in (-1, 1): fl.append(box(*xs(s_ * (FW - 1.15) * mm, s_ * (FW - 0.75) * mm), (f + 0.2) * mm, (f + 2.0) * mm, (bot_at(f) + 4) * mm, (zl - 3) * mm))
        f += 11.5
    o = K.tmp(multi(fl)); K.adopt(o, 'handguard', 'rubber')
    o = K.obj(lathe([((HG1 - 0.5) * mm, 10.2 * mm), ((HG1 + 2.5) * mm, 10.2 * mm)], 24), 'handguard', 'steel'); smooth(o)      # (the front: a steel collar round the sleeve)

# ----------------------------------------------------------------------------------------------------- GRIP (factory: grip) AND TRIGGER GROUP
def grip():
    """The pistol grip (slot grip): raked back, a palm swell and a flared heel, three finger grooves down the front, the stippled panels each side (dimpled); the
    trigger guard (a rectangular steel loop) and the trigger are the housing's."""
    pts = PP([(520, 584), (590, 584), (592, 640), (590, 690), (582, 740), (574, 788), (578, 820), (568, 838), (484, 836), (478, 820), (486, 796), (494, 720), (504, 630), (512, 605)])
    gp = K.tmp(prism(pts, 'x', -GW * mm, GW * mm))
    boolean(gp, prism([(-GW * mm, 14 * mm), (GW * mm, 14 * mm), ((GW - 1.8) * mm, -150 * mm), (-(GW - 1.8) * mm, -150 * mm)], 'y', FX(470) * mm, FX(620) * mm), 'INTERSECT')   # (narrower toward the heel)
    tidy(gp, 0.1 * mm, False); bevel(gp, 4.2 * mm, 2, 30)                                          # (the round once, then the grooves and the panels' recesses: no round of their own)
    for u in (668, 706, 744):                                                                      # (finger grooves in the front edge)
        cut(gp, cyl(3.6 * mm, -0.03, 0.03, 'x', (FX(594 - (u - 640) * 0.04 + 3.4) * mm, UY(u) * mm), 14))
    for s in (-1, 1):
        cut(gp, prism(PP([(545, 650), (578, 650), (566, 800), (505, 800), (515, 700)]), 'x', *xs(s * (GW - 1.5) * mm, s * (GW + 1.5) * mm)))
    tidy(gp); smooth(gp); K.adopt(gp, 'grip', HP)
    for s in (-1, 1):
        pn = K.tmp(prism(PP([(545, 650), (578, 650), (566, 800), (505, 800), (515, 700)]), 'x', *xs(s * (GW - 1.8) * mm, s * (GW - 0.5) * mm)))
        dm = []                                                                                    # (the stipple: a grid of dimples about 4 mm apart, a third deep)
        for i in range(7):
            for j in range(11):
                f = FX(505) + 2.5 + i * 4.3 + (j % 2) * 2.15; u = UY(790) + 2.5 + j * 5.9
                dm.append(cyl(0.75 * mm, *xs(s * (GW - 1.1) * mm, s * (GW + 0.3) * mm), 'x', (f * mm, u * mm), 4))
        cut(pn, multi(dm)); tidy(pn)
        smooth(pn, 1); K.adopt(pn, 'grip', 'stipple')
    o = K.obj(cyl(4.6 * mm, FX(521) * mm, FX(525) * mm, 'y', (0, UY(837) * mm), 14), 'grip', 'steel'); smooth(o)           # (the grip screw's head at the heel)

def trigger_group():
    """The trigger group's block under the housing, the trigger guard (a rectangular loop hung from the housing) and the trigger."""
    tb = K.tmp(prism(PP([(598, 597), (736, 597), (736, 636), (702, 641), (604, 641)]), 'x', -12.5 * mm, 12.5 * mm)); bevel(tb, 1.2 * mm, 2, 30); smooth(tb); K.adopt(tb, 'base', HP)
    tg = K.tmp(prism(PP([(622, 596), (724, 596), (724, 692), (622, 692)]), 'x', -2.4 * mm, 2.4 * mm))
    cut(tg, prism(PP([(628, 590), (718, 590), (718, 685), (628, 685)]), 'x', -0.01, 0.01))
    bevel(tg, 0.6 * mm, 1, 30); smooth(tg); K.adopt(tg, 'base', 'black')
    o = K.tmp(prism(PP([(640, 600), (655, 600), (668, 664), (657, 673), (646, 640)]), 'x', -2.0 * mm, 2.0 * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')

# ----------------------------------------------------------------------------------------------------- STOCK (factory: stock)
STOCK_ANCH = {'butt': (FX(20) * mm, UY(720) * mm, 0), 'cheek': (FX(300) * mm, UY(578) * mm, 0)}
def stock():
    """The side-folding polymer stock (slot stock): a plain tapering wedge from the housing's back to the butt, its underside sweeping down to the toe, the rubber butt
    pad on its back, a slot under it by the hinge, the sling loop; the steel hinge plates are the housing's."""
    out = PP([(58, 593), (100, 591), (486, 578), (486, 636), (450, 660), (400, 674), (300, 699), (200, 732), (100, 766), (70, 779), (48, 786), (30, 788), (16, 780), (22, 752), (28, 700), (40, 645)])
    st = K.tmp(prism(out, 'x', -(STW1 + 1) * mm, (STW1 + 1) * mm))
    boolean(st, prism([(-STW0 * mm, FX(486) * mm), (STW0 * mm, FX(486) * mm), (STW1 * mm, FX(8) * mm), (-STW1 * mm, FX(8) * mm)], 'z', -0.2, 0.05), 'INTERSECT')       # (narrow at the hinge, wider at the butt)
    tidy(st, 0.1 * mm, False); bevel(st, 4.5 * mm, 2, 30)                                                                                                 # (the round once, then the slot: no round of its own)
    for s in (-1, 1): cut(st, prism(PP([(335, 688), (445, 668), (445, 676), (335, 697)]), 'x', *xs(s * (STW0 - 1.5) * mm, s * 20 * mm)))                   # (the slot under it, both sides)
    tidy(st); smooth(st); K.adopt(st, 'stock', HP)
    for s in (-1, 1):
        o = K.tmp(prism(PP([(337, 689), (443, 669.5), (443, 674.5), (337, 694.5)]), 'x', *xs(s * (STW0 - 1.8) * mm, s * (STW0 - 1.2) * mm))); K.adopt(o, 'stock', 'rubber')
    pad = K.tmp(prism(PP([(40, 645), (28, 700), (22, 752), (16, 780), (32, 790), (39, 784), (37, 752), (43, 700), (53, 645)]), 'x', -(STW1 + 0.3) * mm, (STW1 + 0.3) * mm))
    boolean(pad, prism([(-(STW1 + 0.3) * mm, FX(486) * mm), ((STW1 + 0.3) * mm, FX(486) * mm), ((STW1 + 0.3) * mm, FX(0) * mm), (-(STW1 + 0.3) * mm, FX(0) * mm)], 'z', -0.2, 0.05), 'INTERSECT')
    gv = []      # (the pad's back face: eight fine horizontal ribs, as the photos' pad has)
    for k_ in range(8):
        yp = 668 + k_ * 12.5; xf = 40 + (yp - 645) * (16 - 40) / (780 - 645)
        gv.append(box(-(STW1 + 1) * mm, (STW1 + 1) * mm, FX(xf) * mm - 1.4 * mm, FX(xf) * mm + 0.7 * mm, UY(yp) * mm, (UY(yp) + 1.2) * mm))
    tidy(pad, 0.1 * mm, False); bevel(pad, 2.6 * mm, 2, 30)
    cut(pad, multi(gv))
    tidy(pad); smooth(pad); K.adopt(pad, 'stock', 'rubber')
    ring = K.tmp(cyl(5.2 * mm, -0.9 * mm, 0.9 * mm, 'x', (FX(437) * mm, UY(686) * mm), 18))
    cut(ring, cyl(3.5 * mm, -0.02, 0.02, 'x', (FX(437) * mm, UY(686) * mm), 18)); smooth(ring); K.adopt(ring, 'stock', 'steel')
    o = K.tmp(box(-7 * mm, 7 * mm, FX(437) * mm - 4 * mm, FX(437) * mm + 4 * mm, UY(666) * mm, UY(652) * mm)); K.adopt(o, 'stock', 'steel')

# ----------------------------------------------------------------------------------------------------- MUZZLE DEVICE (factory: muzzle)
def muzzle():
    """The AN-94's muzzle device (slot muzzle): a neck over the thread and two round lobes (their axis 1.5 mm over the bore), a vent across each lobe, the bore's
    exit a hole low in the face, the thread nut."""
    f0 = BORE_END
    ZC = 1.5
    mz = K.tmp(lathe([(f0 * mm, 8.2 * mm), ((f0 + 8) * mm, 8.6 * mm), ((f0 + 24) * mm, 9.0 * mm), (FX(1782) * mm, 9.5 * mm), (FX(1786) * mm, 12.5 * mm), (FX(1800) * mm, 13.6 * mm),
                      (FX(1818) * mm, 13.6 * mm), (FX(1826) * mm, 11.2 * mm), (FX(1838) * mm, 11.0 * mm), (FX(1846) * mm, 14.0 * mm), (FX(1862) * mm, 14.6 * mm), (FX(1876) * mm, 13.8 * mm),
                      (FX(1884) * mm, 9.0 * mm), (MUZ_END * mm, 7.2 * mm), (MUZ_END * mm, 0.0004)], 28, (0, 0, ZC * mm)))
    cut(mz, cyl(2.8 * mm, f0 * mm - 0.01, MUZ_END * mm + 0.01, 'y', (0, 0), 14))                    # (the bore)
    for fc in (FX(1809), FX(1854)):                                                                  # (a vent across each lobe)
        cut(mz, cyl(2.0 * mm, -0.02, 0.02, 'x', (fc * mm, (ZC + 14.0) * mm), 12))
        cut(mz, cyl(2.0 * mm, -0.02, 0.02, 'x', (fc * mm, (ZC - 14.0) * mm), 12))
    tidy(mz); smooth(mz); K.adopt(mz, 'muzzle', 'black')
    o = K.obj(lathe([(f0 * mm, 9.4 * mm), ((f0 + 4.5) * mm, 9.4 * mm)], 24, (0, 0, ZC * mm)), 'muzzle', 'steel'); smooth(o)   # (the thread nut)
    return MUZ_END

# ----------------------------------------------------------------------------------------------------- IRONS (factory: optic)
NOTCH_F = DRUM_F - 9.0
def irons():
    """The rotary drum rear sight on the housing's hump (a knurled drum with its rear blade and its U notch) and the front sight: a block on the barrel with the post
    standing in a protecting ring."""
    dr = K.tmp(cyl(13.0 * mm, (TOP - 2) * mm, (SY - 2.2) * mm, 'z', (0, DRUM_F * mm), 32))
    bevel(dr, 0.6 * mm, 1, 30)                                                                                              # (the chamfer once, then the notches)
    for k in range(24):      # (the drum's rim: crenellations)
        a = k * math.pi / 12
        g = box(-0.9 * mm, 0.9 * mm, -2.2 * mm, 2.2 * mm, (SY - 7.0) * mm, (SY - 1.9) * mm); g.transform(Matrix.Translation((0, DRUM_F * mm + 0.0, 0)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 13.0 * mm, 0)))
        cut(dr, g)
    tidy(dr); smooth(dr); K.adopt(dr, 'optic', 'black')
    o = K.obj(cyl(4.0 * mm, (SY - 2.4) * mm, (SY - 1.4) * mm, 'z', (0, DRUM_F * mm), 14), 'optic', 'steel'); smooth(o)        # (the drum's cap screw)
    bl = K.tmp(box(-8.5 * mm, 8.5 * mm, NOTCH_F * mm, (NOTCH_F + 2.8) * mm, (SY - 2.5) * mm, (SY + 1.8) * mm))
    cut(bl, box(-1.3 * mm, 1.3 * mm, (NOTCH_F - 1) * mm, (NOTCH_F + 4) * mm, (SY - 1.5) * mm, (SY + 3) * mm))
    cut(bl, cyl(1.3 * mm, (NOTCH_F - 1) * mm, (NOTCH_F + 4) * mm, 'y', (0, (SY - 1.5) * mm), 12))
    bevel(bl, 0.3 * mm, 1); smooth(bl); K.adopt(bl, 'optic', 'steel')
    for s in (-1, 1):        # (the little ears either side of the drum)
        o = K.tmp(box(*xs(s * 9.0 * mm, s * 11.5 * mm), (DRUM_F - 3) * mm, (DRUM_F + 3) * mm, (TOP - 1) * mm, (TOP + 5.5) * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'optic', 'black')
    # the front sight: the block clamped on the barrel, the tower and the ring are the irons' (slot optic; a shorter barrel leaves them where the factory one ended)
    pf = POST_F
    bk = K.tmp(prism(hullc([(0, 0, 10.2 * mm), (-3.4 * mm, -12.8 * mm, 3.2 * mm), (3.4 * mm, -12.8 * mm, 3.2 * mm)], 20), 'y', (pf - 14) * mm, (pf + 25) * mm))
    bevel(bk, 0.6 * mm, 1, 30); smooth(bk); K.adopt(bk, 'optic', 'black')     # (solid: with a shorter barrel it still sits on the bracket)
    HC = SY - 3.5
    rg = K.tmp(cyl(8.3 * mm, (pf - 3.5) * mm, (pf + 3.5) * mm, 'y', (0, HC * mm), segs(8.3 * mm)))
    cut(rg, cyl(6.2 * mm, (pf - 4) * mm, (pf + 4) * mm, 'y', (0, HC * mm), segs(6.2 * mm)))
    cut(rg, box(-4.2 * mm, 4.2 * mm, (pf - 4) * mm, (pf + 4) * mm, (HC + 5) * mm, (HC + 12) * mm))      # (open at the top)
    tidy(rg, 1e-6, False); bevel(rg, 0.4 * mm, 1, 30); tidy(rg); smooth(rg); K.adopt(rg, 'optic', 'black')
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

# ----------------------------------------------------------------------------------------------------- CHARGING LEVER (part_handle, on the RIGHT)
LEV_F = FX(1035)                  # the lever's place at the slot's front end (the bent steel hook in the photo)
LEV_U = (SLOT[2] + SLOT[3]) / 2   # the slot's height
LEV_TRAVEL = 0.075                # the slot's run
def handle():
    """The right-hand charging lever (part_handle): a bent steel lever standing out of the front end of its slot along the top of the right flank, its slide in the
    slot; it is not reciprocating: it stays forward when the gun fires and is pulled back to charge."""
    ph = K.part('handle', (0, LEV_F * mm, LEV_U * mm))
    sl = K.tmp(box((HW - 3.4) * mm, (HW - 0.3) * mm, (LEV_F - 16) * mm, (LEV_F + 0.5) * mm, (LEV_U - 2.0) * mm, (LEV_U + 2.0) * mm)); bevel(sl, 0.4 * mm, 1); smooth(sl); K.adopt(sl, 'base', 'steel', ph)     # (the slide in its slot)
    st = K.tmp(prism([(-3.0 * mm, -2.0 * mm), (3.6 * mm, -2.0 * mm), (3.6 * mm, 8.5 * mm), (1.6 * mm, 13.5 * mm), (-2.6 * mm, 15.5 * mm), (-4.2 * mm, 12.5 * mm), (-0.9 * mm, 9.5 * mm), (-0.9 * mm, 4.0 * mm), (-3.0 * mm, 4.0 * mm)],
                     'x', (HW + 1.0) * mm, (HW + 3.4) * mm))                                           # (the lever: up out of the slot, the hook bent back at its top; frame: forward, up from the slide's centre)
    st.data.transform(Matrix.Translation((0, LEV_F * mm, LEV_U * mm))); bevel(st, 0.4 * mm, 1); smooth(st); K.adopt(st, 'base', 'steel', ph)
    o = K.tmp(box((HW - 0.3) * mm, (HW + 1.2) * mm, (LEV_F - 3.0) * mm, (LEV_F + 3.6) * mm, (LEV_U - 2.0) * mm, (LEV_U + 2.0) * mm)); smooth(o); K.adopt(o, 'base', 'steel', ph)
    return ph

# ----------------------------------------------------------------------------------------------------- BOLT CARRIER (part_carrier, in the port)
CARRIER_TRAVEL = 0.075                # (the lever's run: the handle rides on the carrier)
def carrier():
    """The bolt carrier seen through the ejection port (part_carrier: it runs back and home with every shot, back with the hand's pull on a charge, held back on an empty
    magazine): the kit's AK pattern (port_carrier, body 'box'): a milled carrier block running forward into the steel bolt head, which has its locking-lug ring, chamfered face and the
    extractor claw and covers the chambered round's case until the carrier is drawn back. No ribs, no plate; the head is 30 mm of the port's 103."""
    pa, pb, pu0, pu1 = PORT
    return port_carrier(K, pa * mm, pb * mm, pu0 * mm, pu1 * mm, HW * mm, x0=3.0 * mm, body='box', ax=0.0, az=0.0, head=0.030, rh=5.2 * mm)

# ----------------------------------------------------------------------------------------------------- THE MAGAZINE (part_mag, borrowed)
def magazine():
    """The AK-74's 30-round magazine (the family's: the kit's top at 184 / -8 moved to this well's), canted CANT degrees to the right about its top, its foot swung back
    PITCH degrees and bent FOOT_BACK mm straighter than the kit's curve."""
    pm = [o for o in borrow if o.name == 'part_mag'][0]
    for o in borrow: coll.objects.link(o)
    pm.parent = root; pm.matrix_parent_inverse = Matrix.Identity(4); pm.matrix_world = Matrix.Translation((0, MAG_F * mm, MAG_Y * mm))
    bpy.context.view_layer.update()
    Td = Matrix.Translation((0, (MAG_F - 184.0) * mm, (MAG_Y + 8.0) * mm))
    Rc = Matrix.Translation((0, MAG_F * mm, MAG_Y * mm)) @ Matrix.Rotation(-math.radians(CANT), 4, 'Y') @ Matrix.Rotation(-math.radians(PITCH), 4, 'X') @ Matrix.Translation((0, -MAG_F * mm, -MAG_Y * mm))
    Sc = Matrix.Translation((0, MAG_F * mm, MAG_Y * mm)) @ Matrix.Diagonal((1.0, 1.0, MAG_LEN, 1.0)) @ Matrix.Translation((0, -MAG_F * mm, -MAG_Y * mm))
    L = 235.0
    def straighten(v):    # (a vertex moves back as the cube of its depth below the top: the foot most)
        d = max(0.0, (MAG_Y * mm - v.z) / (L * mm)); v.y -= FOOT_BACK * mm * d ** 3
    for o in borrow:
        if o is pm: continue
        W = Wold[o]; ident = max(abs(W[i][j] - (1.0 if i == j else 0.0)) for i in range(3) for j in range(3)) < 1e-6
        o.parent = pm; o.matrix_parent_inverse = Matrix.Identity(4)
        if o.get('chk') is not None and not ident:       # (a witness hole: tilted to the face, moved with the scaled magazine, not stretched)
            full = Rc @ Sc @ Td @ W
            R3 = Rc.to_3x3() @ W.to_3x3()
            from mathutils import Vector
            t = Vector(full.translation); d = max(0.0, (MAG_Y * mm - t.z) / (L * mm)); t.y -= FOOT_BACK * mm * d ** 3
            o.matrix_world = Matrix.Translation(t) @ R3.to_4x4()
        elif o.get('chk') is not None:                    # (a round: moved, not scaled)
            o.data.transform(Rc @ Td @ W)
            for v in o.data.vertices: straighten(v.co)
            o.matrix_world = Matrix.Identity(4)
        else:                                             # (the body: its vertices carry the scale)
            o.data.transform(Rc @ Sc @ Td @ W)
            for v in o.data.vertices: straighten(v.co)
            o.matrix_world = Matrix.Identity(4)
            tidy(o)                                       # (the kit's n-gons, round the rib slots, triangulated by Blender's beauty rule, not fanned from one corner)
        for i_, m_ in enumerate(list(o.data.materials)):
            if m_ and m_.name == 'plum': o.data.materials[i_] = kit_mat('polymer')
        K.n += 1; o.name = '%s_%d' % (o.get('slot', 'mag'), K.n)
    bpy.context.view_layer.update()
    return pm

# ===================================================================================================== ASSEMBLY
housing()
forend()
barrel_base()
barrel()
grip()
trigger_group()
stock()
MUZ = muzzle()
irons()
railed_mount()
ph = handle()
pk = carrier()
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
    'anim': {'handle': 'part_handle', 'carrier': 'part_carrier', 'mag': 'part_mag'},
    'carrier': {'travel': CARRIER_TRAVEL},
    'magAt': [r4(MAG_F * mm), r4(MAG_Y * mm)],
    'handle': {'f': r4(LEV_F * mm), 'y': r4(LEV_U * mm), 'x': r4((HW + 2.2) * mm), 'travel': LEV_TRAVEL, 'recip': False, 'style': 'ak', 'grab': [r4(LEV_F * mm + 0.002), r4(LEV_U * mm + 0.011), r4((HW + 2.8) * mm)]},
    'port': [r4((PORT[0] + PORT[1]) / 2 * mm), r4((PORT[2] + PORT[3]) / 2 * mm), r4(HW * mm)],
    'chamberAt': {'side': 'port', 'f': r4((PORT[1] - 6.0) * mm), 'y': 0.0, 'x': 0.0},     # (a real port: the game draws no plate or bolt face over it; the round shows in it when the carrier is back)
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
g = globals()            # (models/an94_parts.py cuts the furniture parts out of this build)
