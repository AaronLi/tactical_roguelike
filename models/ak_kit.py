# The shared builder of the AK family (the stamped-receiver Kalashnikovs): models/<id>/build_<id>.py set CFG = {'variant': ...} and exec
# this. Each assembly (the receiver and its cover, the rear sight block and leaf, the gas tube, the handguards, the gas block, the front
# sight, the barrel, a muzzle device, a stock, the grip, a magazine, the railed dust cover (the optic mount), the bipod) is its own function, and a gun
# is the ones its variant picks: the KV-47 (game id ak: an AKM), the AK-74M (ak74) and the RPK (rpk) are built from the same parts.
#
# References (viewed on Wikimedia Commons, not downloaded):
#  - "AK74andAKS74U.jpg" (Sergey Sandalov, CC BY-SA 4.0; 945 x 576, right side, muzzle right): the AK-74 on top, the shared receiver,
#    handguards, gas system, front sight, grip, stock and magazine outlines are read off it in photo pixels: x forward, the receiver's
#    rear face at x 282; y down, the bore at y 84.5; 1.05 mm a pixel (the photo's 894 px butt to muzzle at the AK-74's 943 mm, checked
#    against its 379 mm sight radius). The numbers below are in millimetres from those pixels: f = (x - 282) * 1.05, u = (84.5 - y) * 1.05.
#  - "AKMS vs AK-47.JPEG" (US DoD, public domain; 2820 x 1850): the AKM's (AKMS's) front: its 45-degree gas block, slant compensator,
#    handguards and gas tube, the 7.62 magazine's curve.
#  - "7.62mm light machine gun RPK.png" (CC BY-SA 3.0) and "Soviet RPK.JPEG" (US DoD, public domain): the RPK's club-foot stock, its
#    heavy barrel, front sight at the muzzle, bipod behind it, the 40-round magazine.
# Real figures: AKM 880 mm overall, 415 mm barrel; AK-74M 943 mm; RPK 1040 mm, 590 mm barrel.
#
# Frame (docs/models.md "Authored models"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the back of the receiver (the
# rear trunnion's back face) on the bore line.
import bpy, json, math, os
from mathutils import Matrix
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py'), encoding='utf-8').read(), globals())
ID = os.path.basename(HERE)
C = globals()['CFG']
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
VAR = C.get('variant', 'akm')

def P(pts): return [(f * mm, u * mm) for f, u in pts]          # (forward, up) in mm -> metres
def xs(a, b): return tuple(sorted((a, b)))
def M_(v): return v * mm

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID

# ----------------------------------------------------------------------------------------------------- the variant's figures (mm)
V = {
    'akm':  dict(rcv='blued', furn='woodRed', grip='woodRed', panel='chequerWood', mag='park', mag_kind='762', mag_n=30,
                 stock='wood', butt=-246.0, inches=16.3, gas='45', muzzle='slant', barrel_end=620.0, fsb=(572.0, 606.0), barrel_r=(10.5, 8.6, 7.6),
                 hg='wood', cover_ribs=True),
    'ak74': dict(rcv='black', furn='polymer', grip='polymer', panel='polymer', mag='plum', mag_kind='545', mag_n=30,
                 stock='fold', butt=-259.0, inches=16.3, gas='90', muzzle='brake', barrel_end=620.0, fsb=(572.0, 606.0), barrel_r=(10.5, 8.6, 7.6),
                 hg='poly', cover_ribs=True),
    'rpk':  dict(rcv='blued', furn='woodRed', grip='woodRed', panel='chequerWood', mag='park', mag_kind='762', mag_n=40,
                 stock='club', butt=-237.0, inches=23.2, gas='45', muzzle='cap', barrel_end=800.0, fsb=(762.0, 786.0), barrel_r=(12.0, 11.0, 10.5),
                 hg='wood', cover_ribs=True, bipod=True),
}[VAR]
RCV, FURN = V['rcv'], V['furn']

HW = 15.5            # the receiver's half width (a 31 mm stamped box), its sheet 1 mm
WALL = 1.0
RF = 277.0           # the receiver's front (the front trunnion's face): mount_handguard
RTOP = 9.0           # the side walls' top (the dust cover's rails)
CV0, CV1, CVT = 14.0, 233.0, 35.0   # the dust cover: rear, front, top
CHW = 16.2           # the cover's half width (it sits over the walls)
SY = 45.0            # the sight line over the bore (the front post's tip, the rear notch's floor of light)
NOTCH_F = 232.0      # the rear notch's blade (its back face): info.fSight
MAG_F0, MAG_F1 = 152.0, 222.0       # the magazine opening in the receiver's floor
GAS0, GAS1 = 488.0, 530.0           # the gas block
TUBE_U, TUBE_R = 26.0, 8.4          # the gas tube's axis height and radius
HG_LO = (278.0, 428.0)              # the lower handguard
HG_UP = (325.0, 428.0)              # the upper handguard's wood/polymer
BE = V['barrel_end']                # the factory barrel's end (the thread's end): mount_muzzle
FS0, FS1 = V['fsb']                 # the front sight base
POST_F = (FS0 + FS1) / 2 + 1.0      # the front post

# ----------------------------------------------------------------------------------------------------- RECEIVER (base)
def receiver():
    """The stamped receiver: a 1 mm sheet box (open on top under the cover), the rear trunnion filling its back and the front trunnion its
    front; the magazine opening in its floor (as wide as the inside: the magazine stands in the box between its walls), the ejection
    port in the right wall, the magazine-guide dimple pressed into each side, the trunnions' rivets and the trigger group's pins."""
    prof = P([(0, -40), (143, -40), (151, -35), (RF, -35), (RF, RTOP), (0, RTOP)])
    rc = K.tmp(prism(prof, 'x', -HW * mm, HW * mm))
    # the hollow: the inside of the box between the trunnions (the rear trunnion 14 mm, the front one 52 mm), up through the open top
    cut(rc, prism(P([(14, -39), (143, -39), (151, -34), (225, -34), (225, 30), (14, 30)]), 'x', -(HW - WALL) * mm, (HW - WALL) * mm))
    cut(rc, box(-(HW - WALL) * mm, (HW - WALL) * mm, MAG_F0 * mm, MAG_F1 * mm, -0.06, -0.020))          # (the magazine opening)
    cut(rc, box((HW - 2.0) * mm, (HW + 1) * mm, 166 * mm, 229 * mm, -2 * mm, (RTOP + 1) * mm))          # (the ejection port, right)
    cut(rc, box(-10.5 * mm, 10.5 * mm, 70 * mm, 104 * mm, -0.06, -0.035))                              # (the trigger's slot)
    for s in (-1, 1):   # the magazine-guide dimple: an oval pressed in each side over the magazine
        cut(rc, prism(rounded(177 * mm, -19 * mm, 10.5 * mm, 3.6 * mm, 3.5 * mm, 4), 'x', *xs(s * (HW - 0.5) * mm, s * (HW + 1) * mm)))
    bevel(rc, 0.8 * mm, 1, 30); smooth(rc); K.adopt(rc, 'base', RCV)
    # the trunnions' rivets (both sides), the trigger group's pins (the axis pins' heads) and the selector's axis (left: its nut)
    for f, u, r in ((6, -8, 2.4), (6, -30, 2.4), (238, -6, 2.2), (252, -6, 2.2), (245, -24, 2.2), (204, -19, 2.2), (60, -22, 2.3), (82, -14, 2.3)):
        for s in (-1, 1):
            o = K.obj(cyl(r * mm, *xs(s * (HW - 0.3) * mm, s * (HW + 0.7) * mm), 'x', (f * mm, u * mm), 10), 'base', RCV); smooth(o)
    o = K.obj(cyl(4.0 * mm, -(HW + 1.2) * mm, -(HW - 0.3) * mm, 'x', (50 * mm, -13 * mm), 16), 'base', RCV); smooth(o)
    # the selector (right): its boss on the axis, the long lever running forward and up along the side to its finger tab under the cover
    o = K.obj(cyl(6.0 * mm, (HW - 0.3) * mm, (HW + 1.6) * mm, 'x', (50 * mm, -13 * mm), 20), 'base', RCV); smooth(o)
    o = K.tmp(prism(P([(46, -18.5), (54, -18.5), (150, 1.5), (156, 2.5), (158, 8.5), (146, 8.5), (140, 6.0), (46, -8.0)]), 'x', (HW + 0.6) * mm, (HW + 2.0) * mm))
    bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    o = K.tmp(prism(P([(150, 3.0), (158, 3.0), (158, 8.5), (150, 8.5)]), 'x', (HW + 1.5) * mm, (HW + 4.0) * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    # the trigger guard: a stamped strap from behind the grip's front to the magazine catch, its opening rounded; the trigger in it
    tg = K.tmp(prism(P([(70, -39.5), (142, -34.5), (142, -66), (137, -72), (128, -73), (84, -73), (76, -69), (73, -58)]), 'x', -4.2 * mm, 4.2 * mm))
    cut(tg, prism(rounded(108 * mm, -55 * mm, 26 * mm, 12 * mm, 6 * mm, 4), 'x', -0.01, 0.01))
    bevel(tg, 1.0 * mm, 2, 30); smooth(tg); K.adopt(tg, 'base', RCV)
    o = K.tmp(prism(P([(92, -36), (100, -36), (103, -46), (104, -56), (101, -64), (97, -66), (99, -57), (98, -48), (94, -42)]), 'x', -2.6 * mm, 2.6 * mm))
    bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    # the magazine catch: the paddle hanging behind the magazine, its pivot boss
    o = K.tmp(prism(P([(143, -34.5), (151, -34.5), (152, -48), (150, -62), (144, -64), (142, -50)]), 'x', -6.5 * mm, 6.5 * mm))
    bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    o = K.obj(cyl(2.6 * mm, -7.5 * mm, 7.5 * mm, 'x', (147 * mm, -41 * mm), 12), 'base', 'steel'); smooth(o)

CV_BOT = 5.0                 # the cover's skirts: down outside the receiver's walls to here (4 mm below their top): no daylight under it
def cover_shape(d, bot, f1, f0=None):
    """The dust cover's solid shape grown by d (mm; negative: inside it): its side profile (the rear end stepped down round the spring
    guide's button) across its section (square-bottomed, rounded over the top), from its rear (CV0 - d, or f0) to f1, down to bot.
    A closed mesh (for a boolean): returned as a working object."""
    f0 = CV0 - d if f0 is None else f0
    o = K.tmp(prism(P([(f0, bot), (f0, 22 + 0.4 * d), (CV0 + 6 - 0.4 * d, 31 + d), (CV0 + 16, CVT + d), (f1, CVT + d), (f1, bot)]), 'x', -0.03, 0.03))
    w, top, lo = HW + 0.8 + d, CVT + d, bot - 20.0
    boolean(o, prism(rounded(0, (top + lo) / 2 * mm, w * mm, (top - lo) / 2 * mm, (8 + d) * mm, 5), 'y', f0 * mm - 0.01, f1 * mm + 0.01), 'INTERSECT')
    return o

def mesh_of(o):
    """A working object's mesh, the object gone (a cutter for cut())."""
    me = o.data; bpy.data.objects.remove(o, do_unlink=True); return me

def port_skirt_cut(o, x0):
    """The right skirt cut back to the walls' top over the ejection port and the handle's travel (the handle runs there)."""
    cut(o, box((HW - 0.3) * mm, (x0 + 1) * mm, 136 * mm, (CV1 + 2) * mm, (CV_BOT - 1) * mm, (RTOP + 0.2) * mm))

def dust_cover():
    """The dust cover: a pressed steel lid over the receiver's top, rounded across, its skirts down outside the receiver's walls, closed at
    its rear (stepped down round the recoil spring guide's button, which stands through it) and its front; its pressed transverse
    stiffening ribs; the button."""
    cv = cover_shape(0.0, CV_BOT, CV1)
    cut(cv, mesh_of(cover_shape(-0.8, CV_BOT - 10, CV1 - 1.5)))       # (a pressed lid: hollow, 0.8 mm, open only underneath)
    port_skirt_cut(cv, HW + 0.8)
    bevel(cv, 0.4 * mm, 1, 30); smooth(cv); K.adopt(cv, 'base', RCV)
    if V['cover_ribs']:
        for f in (40, 62, 84, 106, 128):   # the ribs: low ridges across its top, down to the shoulders
            rb = cover_shape(0.4, RTOP + 12, f + 1.6, f0=f - 1.6)          # (0.4 mm proud: inside the railed cover, which is 0.5)
            bevel(rb, 0.3 * mm, 1, 30); smooth(rb); K.adopt(rb, 'base', RCV)
    o = K.obj(lathe([(6 * mm, 4.6 * mm), (CV0 * mm + 1 * mm, 4.6 * mm), (CV0 * mm + 1 * mm, 3.4 * mm)], 18, (0, 0, 16 * mm)), 'base', 'steel'); smooth(o)
    o = K.obj(lathe([(4.5 * mm, 0.0003), (4.5 * mm, 3.2 * mm), (6.5 * mm, 4.6 * mm)], 18, (0, 0, 16 * mm)), 'base', 'steel'); smooth(o)

# ----------------------------------------------------------------------------------------------------- REAR SIGHT (block: base; leaf: optic)
def rear_sight_block():
    """The rear sight block on the front trunnion: its base, the leaf spring's hump, the gas tube's seat at its front and the tube's lock
    lever on the right."""
    o = K.tmp(prism(P([(226, RTOP - 1), (318, RTOP - 1), (318, 19), (314, 25), (300, 33), (288, 34.5), (276, 33), (238, 31), (229, 28), (226, 22)]), 'x', -11 * mm, 11 * mm))
    bevel(o, 1.0 * mm, 2, 30); smooth(o); K.adopt(o, 'base', RCV)
    o = K.obj(cyl(3.0 * mm, -12.5 * mm, 12.5 * mm, 'x', (289 * mm, 31 * mm), 14), 'base', 'steel'); smooth(o)           # the leaf's hinge pin
    o = K.tmp(prism(P([(300, 14), (312, 14), (314, 24), (306, 26)]), 'x', 11 * mm, 14.5 * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)   # the tube lock
    o = K.obj(cyl(2.6 * mm, 11 * mm, 15.5 * mm, 'x', (306 * mm, 19 * mm), 12), 'base', 'steel'); smooth(o)

def rear_leaf():
    """The tangent leaf (the irons, slot optic): hinged at the block's front, rising back to the notch blade at its rear end; the range
    slider round it with its catch. The notch's floor is a little under the sight line, its shoulders over it (the post's tip is held
    level with the notch's top, the light either side)."""
    rpk = VAR == 'rpk'
    lf = K.tmp(prism(P([(NOTCH_F + 1, SY - 7.0), (NOTCH_F + 1, SY - 2.8), (290, 34.8), (290, 31.0)]), 'x', -6.5 * mm, 6.5 * mm))
    bevel(lf, 0.4 * mm, 1); smooth(lf); K.adopt(lf, 'optic', RCV)
    bl = K.tmp(box(-9.0 * mm, 9.0 * mm, (NOTCH_F) * mm, (NOTCH_F + 2.6) * mm, (SY - 7.5) * mm, (SY + 0.9) * mm))
    cut(bl, box(-0.9 * mm, 0.9 * mm, (NOTCH_F - 1) * mm, (NOTCH_F + 4) * mm, (SY - 2.2) * mm, (SY + 3) * mm))     # (the U notch: 1.8 mm across)
    cut(bl, cyl(0.9 * mm, (NOTCH_F - 1) * mm, (NOTCH_F + 4) * mm, 'y', (0, (SY - 2.2) * mm), 12))
    bevel(bl, 0.3 * mm, 1); smooth(bl); K.adopt(bl, 'optic', RCV)
    # the slider round the leaf, a third of the way up it, its catch button on top
    t = 0.45; fs = NOTCH_F + 1 + t * (290 - NOTCH_F - 1); us = (SY - 2.8) + t * (34.8 - (SY - 2.8))
    o = K.tmp(prism(P([(fs - 5, us - 5.5), (fs + 5, us - 6.0), (fs + 5, us + 1.0), (fs - 5, us + 1.5)]), 'x', -8.5 * mm, 8.5 * mm))
    bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'optic', RCV)
    o = K.obj(cyl(2.2 * mm, -10.5 * mm, 10.5 * mm, 'x', (fs * mm, (us - 2) * mm), 12), 'optic', 'steel'); smooth(o)
    if rpk:   # the RPK's windage drum on the leaf's left, by the notch
        o = K.obj(cyl(4.0 * mm, -14 * mm, -9.0 * mm, 'x', ((NOTCH_F + 6) * mm, (SY - 5) * mm), 16), 'optic', RCV); smooth(o)

# ----------------------------------------------------------------------------------------------------- HANDGUARDS
def handguards(a=None, b=None, m=None, poly=None):
    """The handguards (slot handguard): the upper one round the gas tube (half round over a flat underside) and the lower one under the
    barrel, deep at its heel against the receiver, its sides grooved for the fingers; the retainer band at their front (b to b + 7). AKM /
    RPK in laminated wood, the AK-74M's in black polymer (the lower with its ribs). a, b: the lower's rear and front (the factory's by
    default: a longer one is the catalogue's long two-piece handguards, models/ak_parts.py); m its material; poly the AK-74M's ribs."""
    a = HG_LO[0] if a is None else a; b = HG_LO[1] if b is None else b
    m = FURN if m is None else m; poly = (V['hg'] == 'poly') if poly is None else poly
    up = K.tmp(prism(rounded(0, (TUBE_U + 1.5) * mm, 12.6 * mm, 11.4 * mm, 6.5 * mm, 5), 'y', HG_UP[0] * mm, b * mm))
    cut(up, box(-0.03, 0.03, HG_UP[0] * mm - 0.01, b * mm + 0.01, 0, (TUBE_U - 9.0) * mm))
    cut(up, cyl((TUBE_R + 0.3) * mm, HG_UP[0] * mm - 0.01, b * mm + 0.01, 'y', (0, TUBE_U * mm), 20))
    if poly:
        for k in range(int((b - HG_UP[0] - 20) // 17)):   # the AK-74M's upper: pressed ribs along its top
            f = HG_UP[0] + 14 + k * 17; cut(up, box(-0.03, 0.03, f * mm, (f + 7) * mm, (TUBE_U + 11.4) * mm, 0.06))
    bevel(up, 1.2 * mm, 2, 30); smooth(up); K.adopt(up, 'handguard', m)
    lo = K.tmp(prism(P([(a, 13), (b, 13), (b, -17), (b - 4, -18.5), (334, -21.5), (329, -33), (322, -35.5), (a + 4, -35.5), (a, -31)]), 'x', -21 * mm, 21 * mm))
    boolean(lo, prism([(-15 * mm, 13.5 * mm), (15 * mm, 13.5 * mm), (21 * mm, 4 * mm), (21 * mm, -26 * mm), (16 * mm, -37 * mm), (-16 * mm, -37 * mm), (-21 * mm, -26 * mm), (-21 * mm, 4 * mm)], 'y', a * mm - 0.01, b * mm + 0.01), 'INTERSECT')
    cut(lo, cyl(12.5 * mm, a * mm - 0.01, b * mm + 0.01, 'y', (0, 0), 24))
    cut(lo, box(-12.5 * mm, 12.5 * mm, a * mm - 0.01, b * mm + 0.01, 0, 0.02))
    for s in (-1, 1):   # the finger grooves along each side
        cut(lo, prism(rounded(((336 + b - 8) / 2) * mm, -7 * mm, ((b - 8 - 336) / 2) * mm, 5.5 * mm, 5 * mm, 4), 'x', *xs(s * 19.6 * mm, s * 23 * mm)))
    if poly:
        for k in range(int((b - 350) // 12)):   # the AK-74M's: ribs along its underside
            f = 340 + k * 12; cut(lo, box(-12 * mm, 12 * mm, f * mm, (f + 5) * mm, -0.04, -20.5 * mm))
    bevel(lo, 1.8 * mm, 2, 30); smooth(lo); K.adopt(lo, 'handguard', m)
    if poly:   # its heat shield (a thin steel liner showing at the top edges)
        o = K.tmp(prism([(-13.5 * mm, 12.6 * mm), (13.5 * mm, 12.6 * mm), (13.5 * mm, 13.6 * mm), (-13.5 * mm, 13.6 * mm)], 'y', (a + 6) * mm, (b - 4) * mm)); K.adopt(o, 'handguard', 'steel')
    # the retainer band: a steel ring round the barrel and the handguard's front, its lever on the right
    rt = K.tmp(prism(P([(b, 13.5), (b + 7, 13.5), (b + 7, -19.5), (b, -19.5)]), 'x', -20 * mm, 20 * mm))
    boolean(rt, prism(rounded(0, -3 * mm, 20 * mm, 16.5 * mm, 9 * mm, 5), 'y', b * mm - 0.01, (b + 7) * mm + 0.01), 'INTERSECT')
    cut(rt, prism(rounded(0, -3 * mm, 18.5 * mm, 15.0 * mm, 8 * mm, 5), 'y', b * mm - 0.01, (b + 2) * mm))
    bevel(rt, 0.5 * mm, 1, 30); smooth(rt); K.adopt(rt, 'handguard', RCV)
    o = K.tmp(prism(P([(b + 1, -2), (b + 6, -2), (b + 7, -9), (b + 3, -11)]), 'x', 19.5 * mm, 22.0 * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'handguard', RCV)

def handguard_dropin(kind):
    """A drop-in aluminium lower handguard for a foregrip (the catalogue's AK quad rail and AK M-LOK handguards, models/ak_parts.py; the
    general shape of the Polish-made drop-in rails, no markings): it takes the factory lower's place between the receiver's front and the
    front retainer, under the issue gas tube cover (the upper, here in black polymer, comes with it): an eight-sided channel under the
    barrel, its heel stepped down into the rear retainer like the wooden one, its front in the retainer band. kind 'rail': a Picatinny rail
    at 3, 6 and 9 o'clock; 'mlok': M-LOK slots (32 x 7 mm on a 40 mm pitch) down each side and along its bottom. Returns its rails."""
    a, b = HG_LO
    W, B, T, ch = 19.0, -24.0, 12.8, 6.0
    # the upper: the issue gas tube cover
    up = K.tmp(prism(rounded(0, (TUBE_U + 1.5) * mm, 12.6 * mm, 11.4 * mm, 6.5 * mm, 5), 'y', HG_UP[0] * mm, b * mm))
    cut(up, box(-0.03, 0.03, HG_UP[0] * mm - 0.01, b * mm + 0.01, 0, (TUBE_U - 9.0) * mm))
    cut(up, cyl((TUBE_R + 0.3) * mm, HG_UP[0] * mm - 0.01, b * mm + 0.01, 'y', (0, TUBE_U * mm), 20))
    bevel(up, 1.2 * mm, 2, 30); smooth(up); K.adopt(up, 'handguard', 'polymer')
    # the lower: an open-topped channel round the barrel, its heel deeper at the rear (into the rear retainer)
    lo = K.tmp(prism(P([(a, T), (b, T), (b, B), (a + 50, B), (a + 44, -34), (a + 4, -34), (a, -30)]), 'x', -W * mm, W * mm))
    boolean(lo, prism([(x * mm, u * mm) for x, u in [(-W + ch, -36), (W - ch, -36), (W, -36 + ch), (W, T), (-W, T), (-W, -36 + ch)]], 'y', a * mm - 0.01, b * mm + 0.01), 'INTERSECT')
    cut(lo, cyl(12.8 * mm, a * mm - 0.01, b * mm + 0.01, 'y', (0, 0), 24))
    cut(lo, prism(rounded(0, -6 * mm, (W - 2.6) * mm, 14 * mm, 4 * mm, 4), 'y', (a + 6) * mm, (b - 4) * mm))      # (hollow: 2.6 mm walls)
    f0, f1 = a + 56, b - 4                                       # (the rails / slots: ahead of the heel, short of the retainer)
    if kind == 'mlok':
        n = int((f1 - f0 + 8) / 40)
        for k in range(n):
            f = f0 + 18 + k * 40
            if f + 16 > f1: break
            for sx in (-1, 1): cut(lo, prism(rounded(f * mm, -6 * mm, 16 * mm, 3.5 * mm, 3.4 * mm, 4), 'x', *xs(sx * (W - 4) * mm, sx * (W + 1) * mm)))
            cut(lo, prism(rounded(0, f * mm, 3.5 * mm, 16 * mm, 3.4 * mm, 4), 'z', (B - 1) * mm, (B + 4) * mm))
    else:   # (lightening holes along the lower chamfers between the rails)
        for f in range(int(f0 + 10), int(f1 - 8), 22):
            for sx in (-1, 1):
                g = prism(rounded(f * mm, 0, 6 * mm, 1.8 * mm, 1.7 * mm, 2), 'x', -0.004, 0.004)
                g.transform(Matrix.Translation((sx * (W - ch / 2) * mm, 0, (B + ch / 2) * mm)) @ Matrix.Rotation(-sx * math.pi / 4, 4, 'Y')); cut(lo, g)
    bevel(lo, 0.7 * mm, 1, 30); smooth(lo); K.adopt(lo, 'handguard', 'black')
    if kind == 'rail':
        picatinny(K, f0 * mm, f1 * mm, B * mm, 'handguard', 'black', axis='bottom')
        for s_, ax in ((1, 'right'), (-1, 'left')): picatinny(K, f0 * mm, f1 * mm, -6 * mm, 'handguard', 'black', axis=ax, x0=s_ * W * mm)
    # the rear retainer's lip round its heel, the front retainer band and its lever
    rr = K.tmp(prism(P([(a, T + 0.5), (a + 4, T + 0.5), (a + 4, -34.5), (a, -34.5)]), 'x', -(W + 0.6) * mm, (W + 0.6) * mm))
    cut(rr, cyl(12.8 * mm, a * mm - 0.01, (a + 5) * mm, 'y', (0, 0), 24)); bevel(rr, 0.4 * mm, 1); smooth(rr); K.adopt(rr, 'handguard', RCV)
    rt = K.tmp(prism(P([(b, 13.5), (b + 7, 13.5), (b + 7, -25.5), (b, -25.5)]), 'x', -20 * mm, 20 * mm))
    boolean(rt, prism(rounded(0, -6 * mm, 20 * mm, 19.5 * mm, 9 * mm, 5), 'y', b * mm - 0.01, (b + 7) * mm + 0.01), 'INTERSECT')
    cut(rt, prism(rounded(0, -6 * mm, 18.5 * mm, 18.0 * mm, 8 * mm, 5), 'y', b * mm - 0.01, (b + 2) * mm))
    cut(rt, cyl(12.5 * mm, b * mm - 0.01, (b + 8) * mm, 'y', (0, 0), 24))
    bevel(rt, 0.5 * mm, 1, 30); smooth(rt); K.adopt(rt, 'handguard', RCV)
    o = K.tmp(prism(P([(b + 1, -2), (b + 6, -2), (b + 7, -9), (b + 3, -11)]), 'x', 19.5 * mm, 22.0 * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'handguard', RCV)
    sp = [round((f0 - RF) * mm, 4), round((f1 - RF) * mm, 4)]
    r = {'bottom': sp, 'left': sp, 'right': sp}
    if kind == 'mlok': r['kind'] = 'mlok'
    return r

def handguard_quad_ak(L):
    """An AK quad rail (the catalogue's Northmark 8.0" quad rail, models/ak_parts.py): one aluminium tube round the barrel and the gas tube
    from the receiver's front, L long, its corners chamfered, oval lightening holes along them; a Picatinny rail on top (low: its top
    3 mm under the sight line), under it and on each side; the clamp band at its front. Returns the rails' spans from its rear."""
    a, b = RF + 0.5, RF + L * 1000
    T, B, W, ch = 36.0, -22.0, 19.5, 6.0
    sec = [(-W + ch, B), (W - ch, B), (W, B + ch), (W, T - ch), (W - ch, T), (-W + ch, T), (-W, T - ch), (-W, B + ch)]
    hg = K.tmp(prism([(x * mm, u * mm) for x, u in sec], 'y', a * mm, b * mm))
    cut(hg, prism(rounded(0, (T + B) / 2 * mm, (W - 2.6) * mm, ((T - B) / 2 - 2.6) * mm, 5 * mm, 4), 'y', a * mm - 0.01, b * mm + 0.01))
    n = int((L * 1000 - 40) / 26)
    for k in range(n):
        f = a + 22 + k * 26
        for sx in (-1, 1):
            for uz, ang in ((T - ch / 2, sx * math.pi / 4), (B + ch / 2, -sx * math.pi / 4)):
                g = prism(rounded(f * mm, 0, 7 * mm, 1.8 * mm, 1.7 * mm, 2), 'x', -0.004, 0.004)
                g.transform(Matrix.Translation((sx * (W - ch / 2) * mm, 0, uz * mm)) @ Matrix.Rotation(ang, 4, 'Y')); cut(hg, g)
    bevel(hg, 0.6 * mm, 1, 30); smooth(hg); K.adopt(hg, 'handguard', 'black')
    r0, r1 = a + 2, b - 9
    picatinny(K, r0 * mm, r1 * mm, T * mm, 'handguard', 'black')
    picatinny(K, (r0 + 10) * mm, r1 * mm, B * mm, 'handguard', 'black', axis='bottom')
    for s_, ax in ((1, 'right'), (-1, 'left')): picatinny(K, (r0 + 12) * mm, r1 * mm, (T + B) / 2 * mm, 'handguard', 'black', axis=ax, x0=s_ * W * mm)
    bd = K.tmp(prism([(x * 1.08 * mm, ((u - (T + B) / 2) * 1.08 + (T + B) / 2) * mm) for x, u in sec], 'y', (b - 7) * mm, b * mm))
    cut(bd, prism([(x * mm, u * mm) for x, u in sec], 'y', (b - 8) * mm, (b + 1) * mm))
    bevel(bd, 0.4 * mm, 1, 30); smooth(bd); K.adopt(bd, 'handguard', 'black')
    for s_ in (-1, 1):
        o = K.obj(cyl(2.6 * mm, *xs(s_ * 21.0 * mm, s_ * 22.4 * mm), 'x', ((b - 3.5) * mm, -8 * mm), 14), 'handguard', 'steel'); smooth(o)
    sp = lambda f0, f1: [round((f0 - RF) * mm, 4), round((f1 - RF) * mm, 4)]
    return {'top': sp(r0, r1), 'bottom': sp(r0 + 10, r1), 'left': sp(r0 + 12, r1), 'right': sp(r0 + 12, r1)}

# ----------------------------------------------------------------------------------------------------- THE BARREL AND WHAT RIDES ON IT
# The barrel carries its gas block, the gas tube, the front sight base with the post, the cleaning rod, the muzzle thread (and on the RPK
# the bipod's collar): slot barrel, so another barrel brings its own. The factory barrel is the model's; each other length is a variant
# beside it (models/<id>/barrel_<len>.glb, variant_json slot barrel: js/parts.ts <id>.br.<name>, avBarrel), drawn whole in its place.
# The receiver keeps only the barrel's shank in the trunnion and under the handguard (base, to BASE_END: every length reaches it).
# The gas system: on 16" and longer the gas port is where the AKM's is (a fixed distance from the chamber), so the gas block, the tube
# and the handguard room are the factory's whatever the length, and only the front sight base moves (14 mm behind the barrel's end).
# On 12.5" and shorter there is no room for both: the gas block and front sight are ONE block (the AK-104/105's), its gas port as far
# back as the handguard allows, the tube shortened to it; the handguard room is then that block's rear (each variant's note gives it).
BASE_END = 410.0             # the barrel's base part ends here (under the handguard): ahead of it each barrel is its own
SHORT_IN = 12.5              # barrels this long and shorter take the combined gas block and front sight
BP_DROP = -41.0              # the RPK bipod's legs: folded back at this height, under the lower handguard
def gas_block(a, b, slot):
    """The gas block: the AKM's (and RPK's) with its front sloped back at 45 degrees over the gas port, the AK-74's square-fronted; the
    gas cylinder's seat round the tube's front, the bayonet lug under it."""
    m = 'park' if RCV == 'blued' else RCV
    if V['gas'] == '45':
        prof = [(a, -11), (b, -11), (b, 4), (b - 22, TUBE_U + 9.5), (a, TUBE_U + 9.5)]
    else:
        prof = [(a, -11), (b, -11), (b, TUBE_U + 9.5), (a, TUBE_U + 9.5)]
    gb = K.tmp(prism(P(prof), 'x', -10.5 * mm, 10.5 * mm))
    sec = prism(circles_hull([(0, 0), (0, TUBE_U * mm)], 10.5 * mm, 28), 'y', a * mm - 0.01, b * mm + 0.01)
    boolean(gb, sec, 'INTERSECT')
    cut(gb, cyl(V['barrel_r'][1] * mm, a * mm - 0.01, b * mm + 0.01, 'y', (0, 0), 24))
    bevel(gb, 0.8 * mm, 1, 30); smooth(gb); K.adopt(gb, slot, m)
    o = K.tmp(prism(P([(b - 24, -10), (b - 2, -10), (b - 2, -19.5), (b - 20, -19.5)]), 'x', -4.2 * mm, 4.2 * mm))        # the bayonet lug
    cut(o, cyl(3.2 * mm, -0.01, 0.01, 'x', ((b - 11) * mm, -15.5 * mm), 12))
    boolean(o, cyl(5.0 * mm, (b - 24) * mm, (b - 2) * mm, 'y', (0, -15.5 * mm), 16), 'UNION'); cut(o, cyl(3.1 * mm, (b - 25) * mm, (b - 1) * mm, 'y', (0, -15.5 * mm), 12))
    bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, slot, m)
    o = K.obj(cyl(1.6 * mm, -11 * mm, 11 * mm, 'x', ((a + 8) * mm, (TUBE_U - 2) * mm), 10), slot, 'steel'); smooth(o)   # (the tube's pin)

def combo_block(a, b, pf, br, slot):
    """The short barrels' gas block and front sight in one (the AK-104/105's): the gas block's body round the barrel and the tube's front,
    the hood and post standing straight on its top, the post's tip on the sight line."""
    m = 'park' if RCV == 'blued' else RCV
    gb = K.tmp(prism(P([(a, -11), (b, -11), (b, 2), (b - 6, TUBE_U + 9.5), (a, TUBE_U + 9.5)]), 'x', -10.5 * mm, 10.5 * mm))
    boolean(gb, prism(circles_hull([(0, 0), (0, TUBE_U * mm)], 10.5 * mm, 28), 'y', a * mm - 0.01, b * mm + 0.01), 'INTERSECT')
    cut(gb, cyl(br * mm, a * mm - 0.01, b * mm + 0.01, 'y', (0, 0), 24))
    bevel(gb, 0.8 * mm, 1, 30); smooth(gb); K.adopt(gb, slot, m)
    o = K.obj(cyl(1.6 * mm, -11 * mm, 11 * mm, 'x', ((a + 8) * mm, (TUBE_U - 2) * mm), 10), slot, 'steel'); smooth(o)
    sight_head(pf, slot)

def sight_head(pf, slot):
    """The hood (a ring open at the top) round the post, the post on its windage drum with its tip on the sight line."""
    HR, HC = 10.5, SY - 3.0
    hd = K.tmp(cyl(HR * mm, (pf - 6.5) * mm, (pf + 6.5) * mm, 'y', (0, HC * mm), 28))
    cut(hd, cyl((HR - 1.8) * mm, (pf - 7) * mm, (pf + 7) * mm, 'y', (0, HC * mm), 28))
    cut(hd, box(-4.5 * mm, 4.5 * mm, (pf - 7) * mm, (pf + 7) * mm, (HC + 4) * mm, (HC + 12) * mm))   # (open at the top)
    cut(hd, box(-0.03, 0.03, (pf - 7) * mm, (pf + 7) * mm, (SY - 20) * mm, (SY - 12.6) * mm))         # (its foot sits on the tower)
    bevel(hd, 0.4 * mm, 1, 30); smooth(hd); K.adopt(hd, slot, RCV)
    o = K.obj(cyl(3.2 * mm, -6.8 * mm, 6.8 * mm, 'x', (pf * mm, (SY - 11) * mm), 16), slot, 'steel'); smooth(o)        # the post's windage drum
    o = K.obj(cyl(1.0 * mm, (SY - 11) * mm, SY * mm, 'z', (0, pf * mm), 12), slot, RCV); smooth(o)                     # the post

def front_sight(a, b, pf, br, slot):
    """The front sight base pinned to the barrel's front: its collar, the tower to the hood, the cleaning rod's lug under it; the head."""
    m = 'park' if RCV == 'blued' else RCV
    fb = K.tmp(lathe([(a * mm, (br + 3.6) * mm), (b * mm, (br + 3.6) * mm)], 28))
    boolean(fb, prism(P([(a + 4, 0), (b - 3, 0), (pf + 6, SY - 13), (pf - 6, SY - 13)]), 'x', -7.0 * mm, 7.0 * mm), 'UNION')
    boolean(fb, prism(P([(a + 3, -br - 2), (b - 2, -br - 2), (b - 2, -20), (a + 6, -20)]), 'x', -5.0 * mm, 5.0 * mm), 'UNION')    # (the rod's lug)
    cut(fb, cyl(br * mm, a * mm - 0.01, b * mm + 0.01, 'y', (0, 0), 28))
    cut(fb, cyl(3.4 * mm, (a - 1) * mm, (b + 1) * mm, 'y', (0, -15.5 * mm), 12))
    bevel(fb, 0.6 * mm, 1, 30); smooth(fb); K.adopt(fb, slot, m)
    sight_head(pf, slot)
    for q in (a + 7, b - 7):   # the taper pins
        o = K.obj(cyl(1.4 * mm, -(br + 3.8) * mm, (br + 3.8) * mm, 'x', (q * mm, (br + 1.0) * mm), 10), slot, 'steel'); smooth(o)

def barrel_base():
    """The barrel's shank: in the trunnion and on under the handguard to BASE_END (base: the same on every barrel)."""
    r0, r1, r2 = V['barrel_r']
    o = K.obj(lathe([(250 * mm, r0 * mm), ((RF + 30) * mm, r0 * mm), ((RF + 60) * mm, r1 * mm), (BASE_END * mm, r1 * mm)], 24), 'base', 'park' if RCV == 'blued' else RCV); smooth(o)

def barrel_assembly(E, inches, slot='barrel'):
    """The barrel from BASE_END to its end E (the thread's end: mount_muzzle) and what rides on it. Returns its figures."""
    r0, r1, r2 = V['barrel_r']
    m = 'park' if RCV == 'blued' else RCV
    short = inches <= SHORT_IN + 1e-6
    fs1 = E - 14.0                                               # (the sight base's front: the thread ahead of it, as the factory's)
    if short:
        c0 = min(438.0, E - 14.0 - 42.0); c1 = c0 + 40.0          # (the combined block: right ahead of the factory handguard, or as far forward as the barrel lets it)
        gas_front, pf, hg_end = c0, c0 + 25.0, c0
        br = r1
        o = K.obj(lathe([((BASE_END - 1) * mm, r1 * mm), (fs1 * mm, r1 * mm), (fs1 * mm, 7.0 * mm), (E * mm, 7.0 * mm), (E * mm, 3.0 * mm), ((E - 3) * mm, 2.8 * mm)], 24), slot, m); smooth(o)
        combo_block(c0, c1, pf, br, slot)
    else:
        gas_front, hg_end = GAS0, GAS0
        fs0 = fs1 - 34.0; pf = (fs0 + fs1) / 2 + 1.0; br = r2
        o = K.obj(lathe([((BASE_END - 1) * mm, r1 * mm), (GAS1 * mm, r1 * mm), ((GAS1 + 8) * mm, r2 * mm), (fs1 * mm, r2 * mm), (fs1 * mm, 7.0 * mm), (E * mm, 7.0 * mm),
                         (E * mm, 3.0 * mm), ((E - 3) * mm, 2.8 * mm)], 24), slot, m); smooth(o)
        gas_block(GAS0, GAS1, slot)
        front_sight(fs0, fs1, pf, br, slot)
        o = K.obj(lathe([((HG_LO[1] + 2) * mm, 3.0 * mm), ((fs1 - 3) * mm, 3.0 * mm), ((fs1 - 1) * mm, 3.6 * mm), (fs1 * mm, 3.6 * mm)], 12, (0, 0, -15.5 * mm)), slot, 'steel'); smooth(o)
        if V.get('bipod'):   # the RPK bipod's collar behind the sight base, its bracket down to the legs' hinges under the handguard's line
            bp = fs0 - 16.0
            o = K.obj(lathe([((bp - 9) * mm, br * mm), ((bp - 9) * mm, (br + 3.2) * mm), ((bp + 9) * mm, (br + 3.2) * mm), ((bp + 9) * mm, br * mm)], 28), slot, RCV); smooth(o)
            o = K.tmp(box(-6 * mm, 6 * mm, (bp - 8) * mm, (bp + 8) * mm, (BP_DROP + 2) * mm, -(br + 1) * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, slot, RCV)
            o = K.tmp(box(-15 * mm, 15 * mm, (bp - 9) * mm, (bp + 9) * mm, (BP_DROP - 5) * mm, (BP_DROP + 5) * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, slot, RCV)
    # the gas tube: from the rear sight block to the gas block, its vents near its front, its ferrules (the upper handguard between them)
    gt = K.tmp(lathe([(310 * mm, TUBE_R * mm), ((gas_front + 6) * mm, TUBE_R * mm), ((gas_front + 6) * mm, 0.0003)], 24, (0, 0, TUBE_U * mm)))
    for f in (gas_front - 48, gas_front - 36, gas_front - 24):
        if f > HG_UP[1] + 8: cut(gt, cyl(1.9 * mm, -0.02, 0.02, 'x', (f * mm, TUBE_U * mm), 10))
    smooth(gt); K.adopt(gt, slot, RCV)
    for f0, f1 in ((318, 325), (min(428, gas_front - 5), min(433, gas_front))):
        o = K.obj(lathe([(f0 * mm, (TUBE_R + 1.5) * mm), (f1 * mm, (TUBE_R + 1.5) * mm)], 24, (0, 0, TUBE_U * mm)), slot, RCV); smooth(o)
    return {'E': E, 'post': pf, 'fs1': fs1, 'short': short, 'hg_end': hg_end, 'bipod_f': (fs1 - 34.0 - 16.0) if (V.get('bipod') and not short) else None}

# ----------------------------------------------------------------------------------------------------- MUZZLE DEVICES (factory: muzzle)
def muzzle():
    """The factory muzzle device, from the front sight base over the thread: the AKM's slant compensator (its face cut back at the top so
    the gas lifts the muzzle down), the AK-74's two-chamber brake, the RPK's thread protector. Returns where the bullet leaves it."""
    m = 'park' if RCV == 'blued' else RCV
    k = V['muzzle']; a = FS1 + 1.0
    if k == 'slant':
        L = 27.0
        o = K.tmp(lathe([(a * mm, 10.5 * mm), ((a + L) * mm, 10.5 * mm), ((a + L) * mm, 4.4 * mm), (a * mm, 4.4 * mm)], 28))
        cut(o, prism(P([(a + L - 11, 12), (a + L + 2, 12), (a + L + 2, -3)]), 'x', -0.02, 0.02))       # (the slant: the top cut back)
        cut(o, box(-1.6 * mm, 1.6 * mm, (a + 6) * mm, (a + 13) * mm, 3 * mm, 12 * mm))               # (the vent slot on top)
        smooth(o); K.adopt(o, 'muzzle', m)
        return a + L
    if k == 'brake':
        L = 77.0
        o = K.tmp(lathe([(a * mm, 10.0 * mm), ((a + 6) * mm, 11.0 * mm), ((a + L - 2) * mm, 11.0 * mm), ((a + L) * mm, 10.2 * mm), ((a + L) * mm, 3.4 * mm), (a * mm, 3.4 * mm)], 28))
        for sx in (-1, 1):   # the front chamber's big windows, left and right; the rear chamber's small ports
            cut(o, prism(rounded((a + L - 14) * mm, 0, 6.0 * mm, 4.6 * mm, 2.5 * mm, 3), 'x', *xs(sx * 5.5 * mm, sx * 13 * mm)))
            cut(o, cyl(1.6 * mm, *xs(sx * 5.5 * mm, sx * 13 * mm), 'x', ((a + 44) * mm, 0), 10))
        for dx in (-4.5, 0.0, 4.5):   # three vents in the top of the rear chamber
            cut(o, cyl(1.3 * mm, 5.0 * mm, 0.02, 'z', (dx * mm, (a + 38) * mm), 10))
        smooth(o); K.adopt(o, 'muzzle', m)
        if k == 'brake':   # the collar behind its chambers
            r_ = K.obj(lathe([((a + 22) * mm, 11.0 * mm), ((a + 23) * mm, 11.6 * mm), ((a + 26) * mm, 11.6 * mm), ((a + 27) * mm, 11.0 * mm)], 28), 'muzzle', m); smooth(r_)
        return a + L
    L = 16.0   # the RPK's thread protector: a short knurled cap
    o = K.tmp(lathe([(a * mm, 9.0 * mm), ((a + L - 1) * mm, 9.0 * mm), ((a + L) * mm, 8.0 * mm), ((a + L) * mm, 3.0 * mm), (a * mm, 3.0 * mm)], 24))
    for i in range(12):
        g = box(-0.8 * mm, 0.8 * mm, (a + 2) * mm, (a + L - 3) * mm, 8.4 * mm, 10 * mm); g.transform(Matrix.Rotation(i * math.pi / 6, 4, 'Y')); cut(o, g)
    smooth(o); K.adopt(o, 'muzzle', m)
    return a + L

# ----------------------------------------------------------------------------------------------------- GRIP (factory: grip)
GRIP_TOP = (71.0, -40.0)    # its front top, under the receiver: mount_grip
def grip():
    """The pistol grip: its front straight and raked back, its back swelling a little into the palm, the bottom square with its screw;
    chequered panels let into its sides (wood: chequered; the AK-74M's polymer: grooved)."""
    pts = P([(72, -37), (69, -44), (61, -70), (50, -104), (42, -134), (38, -140), (2, -140), (-3, -134), (0, -100), (9, -70), (15, -50), (19, -37)])
    gp = K.tmp(prism(pts, 'x', -13.5 * mm, 13.5 * mm))
    boolean(gp, prism([(-10.5 * mm, 0.0), (10.5 * mm, 0.0), (10.5 * mm, -46 * mm), (13.5 * mm, -70 * mm), (13.0 * mm, -0.2), (-13.0 * mm, -0.2), (-13.5 * mm, -70 * mm), (-10.5 * mm, -46 * mm)], 'y', -0.1, 0.2), 'INTERSECT')
    panel = P([(61, -52), (55, -76), (46, -106), (40, -127), (8, -127), (9, -98), (15, -72), (22, -52)])
    for s in (-1, 1): cut(gp, prism(panel, 'x', *xs(s * 12.0 * mm, s * 16 * mm)))
    bevel(gp, 2.4 * mm, 2, 30); smooth(gp); K.adopt(gp, 'grip', V['grip'])
    for s in (-1, 1):
        pn = K.tmp(prism(panel, 'x', *xs(s * 11.6 * mm, s * 12.5 * mm)))
        if V['grip'] == 'polymer':
            for k in range(8):
                cut(pn, prism(P([(0, -55 - k * 9), (70, -55 - k * 9 + 4), (70, -55 - k * 9 + 6), (0, -55 - k * 9 + 2)]), 'x', *xs(s * 12.1 * mm, s * 13 * mm)))
        bevel(pn, 0.4 * mm, 1); smooth(pn); K.adopt(pn, 'grip', V['panel'] if V['panel'] != 'polymer' else 'polymer')
    o = K.obj(cyl(4.5 * mm, -141.5 * mm, -139.5 * mm, 'z', (0, 20 * mm), 16), 'grip', 'steel'); smooth(o)              # the grip screw's head

# ----------------------------------------------------------------------------------------------------- STOCKS (factory: stock)
def _stock_body(outline, hw_front, hw_butt, butt_f, mat, groove=False):
    st = K.tmp(prism(P(outline), 'x', -max(hw_front, hw_butt) * mm - 0.002, max(hw_front, hw_butt) * mm + 0.002))
    boolean(st, prism([(-hw_front * mm, 2 * mm), (hw_front * mm, 2 * mm), (hw_butt * mm, butt_f * mm), (-hw_butt * mm, butt_f * mm)], 'z', -0.2, 0.05), 'INTERSECT')
    if groove:   # the AK-74's lightening groove down each side
        for s in (-1, 1):
            g = prism(rounded(-170 * mm, -38 * mm, 62 * mm, 4.5 * mm, 4.4 * mm, 4), 'x', *xs(s * 13.4 * mm, s * 25 * mm)); cut(st, g)
    bevel(st, 3.0 * mm, 2, 30); smooth(st); K.adopt(st, 'stock', mat)
    return st

def stock():
    k = V['stock']; B = V['butt']
    sc = -B / 254.0                       # (the photo's stock, 254 mm, to this gun's)
    S_ = lambda pts: [(f * sc, u) for f, u in pts]
    if k in ('wood', 'fold'):
        # the outline off the AK-74 photo: the comb straight back from the receiver's top with its dip at the wrist, the butt square, the
        # underside sweeping down from the receiver's bottom to the toe
        out = S_([(0, 1), (-70, -17), (-81, -15.5), (-97, -6), (-251, -6), (-254, -10), (-254, -98), (-249, -102), (-181, -86), (-139, -71),
                  (-86, -58), (-34, -46), (0, -37)])
        if k == 'wood':
            _stock_body(out, 13.0, 19.5, B, FURN)
            # the steel butt plate with its trap door's hinge and the rear sling swivel
            bp = K.tmp(prism(P([(B - 3.2, -6), (B + 0.3, -6), (B + 0.3, -102), (B - 3.2, -102)]), 'x', -19.8 * mm, 19.8 * mm))
            bevel(bp, 1.2 * mm, 2, 30); smooth(bp); K.adopt(bp, 'stock', 'park')
            o = K.obj(cyl(2.0 * mm, -20.5 * mm, -19.5 * mm, 'x', ((B - 1.6) * mm, -20 * mm), 10), 'stock', 'steel'); smooth(o)
            sw = K.tmp(prism(rounded((-180 * sc) * mm, -95 * mm, 7 * mm, 6 * mm, 3 * mm, 3), 'x', -1.2 * mm, 1.2 * mm))
            cut(sw, prism(rounded((-180 * sc) * mm, -96 * mm, 4.5 * mm, 3.5 * mm, 2 * mm, 3), 'x', -0.01, 0.01)); smooth(sw); K.adopt(sw, 'stock', 'steel')
            # the stock's tang over the receiver's rear (its screw)
            o = K.obj(cyl(3.0 * mm, -14.2 * mm, 14.2 * mm, 'x', (-12 * mm, -18 * mm), 14), 'stock', 'steel'); smooth(o)
        else:
            # the AK-74M's: the same outline in black polymer, its grooves, a rubber butt pad, the hinge block at the receiver (it folds to the
            # left) with its latch button
            out2 = [(f, u) for f, u in out]
            st = _stock_body([(min(f, -22), u) for f, u in out2], 12.0, 18.5, B + 7, FURN, groove=True)
            pad = K.tmp(prism(P([(B + 8, -5), (B + 1, -5), (B, -9), (B, -99), (B + 1, -103), (B + 8, -103)]), 'x', -19.3 * mm, 19.3 * mm))
            for k_ in range(9): cut(pad, box(-0.03, 0.03, (B - 1) * mm, (B + 1.0) * mm, (-14 - k_ * 10) * mm, (-10 - k_ * 10) * mm))
            bevel(pad, 1.2 * mm, 2, 30); smooth(pad); K.adopt(pad, 'stock', 'rubber')
            hb = K.tmp(prism(P([(0, 2), (-24, -10), (-24, -40), (0, -38)]), 'x', -14.0 * mm, 14.0 * mm))
            bevel(hb, 1.0 * mm, 1, 30); smooth(hb); K.adopt(hb, 'stock', RCV)
            o = K.obj(cyl(4.2 * mm, -36 * mm, 2 * mm, 'z', (-15.5 * mm, -10 * mm), 16), 'stock', RCV); smooth(o)               # the hinge's knuckle (left)
            o = K.obj(cyl(3.0 * mm, 14 * mm, 15.6 * mm, 'x', (-12 * mm, -26 * mm), 14), 'stock', 'steel'); smooth(o)        # the latch button
            o = K.obj(cyl(1.4 * mm, -38 * mm, 4 * mm, 'z', (-15.5 * mm, -10 * mm), 8), 'stock', 'steel'); smooth(o)
    else:
        # the RPK's club foot: the comb straight, the underside dropping from the wrist into a deep toe that juts forward ('the club')
        out = [(0, 1), (-60, -6), (-200, -8), (-234, -8), (-237, -12), (-237, -134), (-232, -140), (-136, -142), (-126, -137), (-121, -126),
               (-117, -88), (-112, -72), (-104, -64), (-60, -54), (-28, -46), (0, -37)]
        _stock_body(out, 13.5, 20.0, B, FURN)
        bp = K.tmp(prism(P([(B - 3.2, -9), (B + 0.3, -9), (B + 0.3, -138), (B - 3.2, -138)]), 'x', -20.3 * mm, 20.3 * mm))
        bevel(bp, 1.2 * mm, 2, 30); smooth(bp); K.adopt(bp, 'stock', 'park')
        o = K.obj(cyl(2.0 * mm, -21 * mm, -20 * mm, 'x', ((B - 1.6) * mm, -24 * mm), 10), 'stock', 'steel'); smooth(o)
        sw = K.tmp(prism(rounded(-180 * mm, -146 * mm, 7 * mm, 6 * mm, 3 * mm, 3), 'x', -1.2 * mm, 1.2 * mm))
        cut(sw, prism(rounded(-180 * mm, -147 * mm, 4.5 * mm, 3.5 * mm, 2 * mm, 3), 'x', -0.01, 0.01)); smooth(sw); K.adopt(sw, 'stock', 'steel')
        o = K.obj(cyl(3.0 * mm, -14.2 * mm, 14.2 * mm, 'x', (-12 * mm, -18 * mm), 14), 'stock', 'steel'); smooth(o)

# ----------------------------------------------------------------------------------------------------- MAGAZINE (part_mag)
# The curved magazine on the recipe's own centreline (tools/models/recipes.ts mag(), 'curved'): its top at mount_mag, LEN down, the
# centreline running forward C * t^2, the body D deep square to it (here D0 at the top widening to D1 at the floor), W wide. Read off
# the AK-74 photo (the 5.45: its back at the receiver x 425-430, its floor's corners at (492, 288) and (553, 250)) and the AKMS photo
# (the 7.62: further forward at the floor). Each its own top at the receiver's opening, the rounds level in its open top.
MAGS = {
    '762':  dict(F=184.0, Y=-8.0, LEN=196.0, C=112.0, D0=60.0, D1=67.0, W=28.0, case=38.6, oal=56.0, rim=5.65, body=5.6, neck=4.3, bul=3.95),
    '545':  dict(F=184.0, Y=-8.0, LEN=188.0, C=78.0, D0=60.0, D1=64.0, W=26.0, case=39.8, oal=57.0, rim=5.0, body=4.95, neck=3.15, bul=2.8),
}
def magazine():
    mk = dict(MAGS[V['mag_kind']])
    if V['mag_n'] == 40: mk.update(LEN=258.0, C=160.0, D1=72.0)      # (the RPK's 40-round: longer and more curved)
    F0, Y0, LEN, CC, D0, D1, W = mk['F'], mk['Y'], mk['LEN'], mk['C'], mk['D0'], mk['D1'], mk['W']
    HWm = W / 2
    def at(t):
        sl = 2 * CC * t; n = math.hypot(LEN, sl)
        return F0 + CC * t * t, Y0 - LEN * t, LEN / n, sl / n
    def edge(k0, N=24, t0=0.0, t1=1.0):
        out = []
        for i in range(N + 1):
            t = t0 + (t1 - t0) * i / N; cf, cy, nf, ny = at(t); d = D0 + (D1 - D0) * t; out.append(((cf + nf * d * k0) * mm, (cy + ny * d * k0) * mm))
        return out
    pm = K.part('mag', (0, F0 * mm, Y0 * mm)); pm['check'] = {'w': round(W * mm, 4)}
    body = K.tmp(prism(edge(0.5) + list(reversed(edge(-0.5))), 'x', -HWm * mm, HWm * mm))
    cut(body, box(-(HWm - 1.0) * mm, (HWm - 1.0) * mm, (F0 - D0 / 2 + 1.0) * mm, (F0 + D0 / 2 - 1.0) * mm, (Y0 - 5) * mm, (Y0 + 10) * mm))   # (open at the top)
    # the witness holes: five down the BACK face (toward the shooter), none on the front; each a slot with a round's brass in it, its own
    # mesh at the face's tilt
    wins = []
    for i in range(1, 6):
        t = i / 6 * 0.92
        cf, cy, nf, ny = at(t); d = D0 + (D1 - D0) * t
        q = (cf - nf * d / 2, cy - ny * d / 2); ang = math.atan2(ny, nf); x = -3.0
        g = box((x - 2.4) * mm, (x + 2.4) * mm, -1.4 * mm, 1.4 * mm, -2.6 * mm, 2.6 * mm); g.transform(Matrix.Translation((0, q[0] * mm, q[1] * mm)) @ Matrix.Rotation(ang, 4, 'X')); cut(body, g)
        wins.append((i - 1, t, q, ang, nf, ny, x))
    bevel(body, 0.9 * mm, 1, 30); smooth(body); K.adopt(body, 'mag', V['mag'], pm)
    for i, t, q, ang, nf, ny, x in wins:
        o = K.obj(box((x - 2.2) * mm, (x + 2.2) * mm, -0.3 * mm, 0.3 * mm, -2.4 * mm, 2.4 * mm), 'mag', 'brass', pm)
        o.matrix_world = Matrix.Translation((0, (q[0] + 1.0 * nf) * mm, (q[1] + 1.0 * ny) * mm)) @ Matrix.Rotation(ang, 4, 'X')
        o['chk'] = {'role': 'hole', 'i': i, 't': round(t, 4), 'side': 1}
    # the pressed ribs down each side, below the receiver, following the curve (a steel magazine's three; the polymer one's two)
    t0 = 0.24 if V['mag_n'] == 30 else 0.19
    for k0 in ((-0.25, 0.0, 0.25) if V['mag'] != 'plum' else (-0.18, 0.18)):
        a, b = edge(k0 - 0.035, 18, t0, 0.95), edge(k0 + 0.035, 18, t0, 0.95)
        for s in (-1, 1):
            o = K.tmp(prism(a + list(reversed(b)), 'x', *xs(s * (HWm - 0.3) * mm, s * (HWm + 0.7) * mm))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'mag', V['mag'], pm)
    # the floorplate, square to the centreline at the foot, standing out round the body
    cf, cy, nf, ny = at(1.0)
    fp = K.tmp(box(-(HWm + 1.4) * mm, (HWm + 1.4) * mm, -(D1 / 2 + 2.5) * mm, (D1 / 2 + 2.0) * mm, -4.5 * mm, 1.0 * mm))
    fp.data.transform(Matrix.Translation((0, cf * mm, cy * mm)) @ Matrix.Rotation(math.atan2(ny, nf), 4, 'X'))
    bevel(fp, 1.0 * mm, 2, 30); smooth(fp); K.adopt(fp, 'mag', V['mag'], pm)
    # the lugs: the front hook into the front trunnion, the rear one the catch takes (both inside the receiver)
    o = K.tmp(box(-6 * mm, 6 * mm, (F0 + D0 / 2 - 1) * mm, (F0 + D0 / 2 + 3.5) * mm, (Y0 - 14) * mm, (Y0 - 7) * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'mag', V['mag'], pm)
    o = K.tmp(box(-5 * mm, 5 * mm, (F0 - D0 / 2 - 1.5) * mm, (F0 - D0 / 2 + 1) * mm, (Y0 - 30) * mm, (Y0 - 24) * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'mag', V['mag'], pm)
    # the feed lips: each wall's top turned in over the rounds, along its back two thirds
    for s in (-1, 1):
        o = K.tmp(box(*xs(s * (HWm - 0.2) * mm, s * (HWm - 3.4) * mm), (F0 - D0 / 2 + 1.0) * mm, (F0 + D0 / 2 - 16) * mm, (Y0 - 2.0) * mm, (Y0 + 0.5) * mm))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'mag', 'steel' if V['mag'] == 'plum' else V['mag'], pm)
    # the top two rounds, staggered either side, level, their heads against the back wall; the top one is the magazine check's
    h = F0 - D0 / 2 + 1.4
    def rnd(x, z, chk):
        cs, oal, rim, bd, nk, bl = mk['case'], mk['oal'], mk['rim'], mk['body'], mk['neck'], mk['bul']
        c = K.obj(lathe([(h * mm, 0.0004), (h * mm, rim * mm), ((h + 1.2) * mm, rim * mm), ((h + 1.5) * mm, (rim - 0.6) * mm), ((h + 2.6) * mm, (rim - 0.6) * mm),
                         ((h + 3.0) * mm, bd * mm), ((h + cs * 0.78) * mm, bd * 0.92 * mm), ((h + cs * 0.86) * mm, nk * mm), ((h + cs) * mm, nk * mm), ((h + cs) * mm, 0.0004)],
                        18, (x * mm, 0, z * mm)), 'mag', 'brass', pm); smooth(c)
        b = K.obj(lathe([((h + cs) * mm, 0.0004), ((h + cs) * mm, bl * mm), ((h + cs + (oal - cs) * 0.3) * mm, bl * mm), ((h + cs + (oal - cs) * 0.75) * mm, bl * 0.62 * mm),
                         ((h + oal) * mm, bl * 0.15 * mm), ((h + oal) * mm, 0.0004)], 14, (x * mm, 0, z * mm)), 'mag', 'brass', pm); smooth(b)
        if chk: c['chk'] = {'role': 'top', 'i': 0}; b['chk'] = {'role': 'top', 'i': 1}
    r = mk['rim']
    rnd(r * 0.55, Y0 + 0.9 - r, True)
    rnd(-r * 0.55, Y0 + 0.9 - r - 2 * r * 0.83, False)
    return mk

# ----------------------------------------------------------------------------------------------------- CHARGING HANDLE (part_handle)
HANDLE = (232.0, 11.0)       # the knob's centre (forward, up), on the right
def handle():
    """The bolt carrier's handle (part_handle: it runs back with the carrier on every shot): the knob on its stem out of the right side at
    the front of the ejection port, and the carrier's flank seen through the port."""
    ph = K.part('handle', (0, HANDLE[0] * mm, HANDLE[1] * mm))
    m = 'park' if RCV == 'blued' else RCV
    o = K.tmp(box(10.5 * mm, 13.8 * mm, 150 * mm, 238 * mm, -1.5 * mm, 8.5 * mm)); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel', ph)   # the carrier's flank
    o = K.tmp(prism(P([(224, 5), (236, 5), (236, 15), (226, 15)]), 'x', 13.5 * mm, 23 * mm)); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'base', m, ph)
    o = K.obj(cyl(5.2 * mm, 21 * mm, 27.5 * mm, 'x', (HANDLE[0] * mm, HANDLE[1] * mm), 20), 'base', m, ph); bevel(o, 1.4 * mm, 2, 30); smooth(o)
    return ph

# ----------------------------------------------------------------------------------------------------- RAILED DUST COVER (slot optic, extras.mount)
# The gun's optic mount (docs/models.md "Authored models"; the MP5's claw mount is the other): a railed dust cover, the Picatinny top
# cover that takes the issue cover's place: a steel lid of the cover's shape a hair larger (it hides the issue one), its rear end stepped
# down round the spring guide's button the same way, a Picatinny rail along its top. Drawn only under a rail sight (never with the irons),
# the sight standing on its rail top at the platform's optF (mount_optic_rail .. mount_optic_rail_end). Its rail's top is 3.9 mm under
# the sight line: it would not block the irons either (looked through with it in place: models/ak_parts.py's note).
RC0, RC1 = 38.0, 226.0        # the rail's ends
RC_T = CVT + 0.5              # the railed cover's top (the rail's base)
RC_RT = RC_T + 5.6            # the rail's top
def railed_cover():
    def mount(o): o['mount'] = True; return o
    cv = cover_shape(0.5, CV_BOT, CV1 + 0.5)                          # (the issue cover's shape 0.5 mm larger, closed at both ends)
    cut(cv, mesh_of(cover_shape(0.02, CV_BOT - 10, CV1 + 0.02)))      # (hollow: the issue cover inside it)
    port_skirt_cut(cv, HW + 1.3)
    bevel(cv, 0.3 * mm, 1, 30); smooth(cv); mount(K.adopt(cv, 'optic', RCV))
    mount(picatinny(K, RC0 * mm, RC1 * mm, RC_T * mm, 'optic', 'black'))
    for f in (RC0 + 8, RC1 - 8):    # the rail's screws into the lid, beside it
        for s_ in (-1, 1):
            o = K.obj(cyl(1.6 * mm, (RC_T - 0.5) * mm, (RC_T + 0.6) * mm, 'z', (s_ * 12.4 * mm, f * mm), 10), 'optic', 'steel'); smooth(o); mount(o)

# ----------------------------------------------------------------------------------------------------- BIPOD (the RPK's: part_bipod)
def bipod(hinge_f):
    """The RPK's bipod legs (part_bipod; the collar they hinge on is the barrel's, barrel_assembly): two legs hinged under the collar either
    side, drawn folded back under the barrel below the handguard's line (group_ nodes with extras.leg: deployed each turns down 90 degrees
    about its hinge and splays out). Each leg: a tube, its knuckle, the pointed foot plate. Its hinges stand 64 mm behind mount_muzzle: with
    another barrel the game moves part_bipod by that barrel's end against the factory one (the collar comes with the barrel)."""
    BP_F, hz = hinge_f, BP_DROP
    pb = K.part('bipod', (11.5 * mm, BP_F * mm, hz * mm))
    LL = 300.0
    for i, s in enumerate((1, -1)):
        hx = s * 11.5
        g = bpy.data.objects.new('group_%d' % (i + 1), None); coll.objects.link(g); g.parent = pb
        bpy.context.view_layer.update()
        g.matrix_parent_inverse = pb.matrix_world.inverted(); g.location = (hx * mm, BP_F * mm, hz * mm)
        g['leg'] = {'deploy': [round(math.pi / 2, 4), round(s * 0.26, 4), 0.0]}
        bpy.context.view_layer.update()
        o = K.obj(cyl(4.2 * mm, (hx - 4) * mm, (hx + 4) * mm, 'x', (BP_F * mm, hz * mm), 16), 'base', RCV, g); smooth(o)           # the knuckle
        o = K.obj(lathe([((BP_F - LL + 30) * mm, 3.6 * mm), ((BP_F - 4) * mm, 3.6 * mm)], 14, ((hx - s * 2.5) * mm, 0, hz * mm)), 'base', RCV, g); smooth(o)
        o = K.obj(lathe([((BP_F - LL + 30) * mm, 3.0 * mm), ((BP_F - LL + 4) * mm, 3.0 * mm), ((BP_F - LL) * mm, 1.0 * mm)], 12, ((hx - s * 2.5) * mm, 0, hz * mm)), 'base', 'steel', g); smooth(o)
        ft = K.tmp(prism(P([(BP_F - LL + 22, hz + 3), (BP_F - LL + 46, hz + 3), (BP_F - LL + 52, hz - 1), (BP_F - LL + 46, hz - 4), (BP_F - LL + 22, hz - 4)]),
                         'x', *xs((hx - s * 1.0) * mm, (hx + s * 5) * mm)))
        bevel(ft, 0.6 * mm, 1); smooth(ft); K.adopt(ft, 'base', RCV, g)
    return pb

# ===================================================================================================== ASSEMBLY
receiver()
dust_cover()
rear_sight_block()
rear_leaf()
handguards()
barrel_base()
FB = barrel_assembly(BE, V['inches'])
MUZ = muzzle()
grip()
stock()
MK = magazine()
ph = handle()
if V.get('bipod'): bipod(FB['bipod_f'])
railed_cover()               # (last: the meshes before it keep their names)
for o in list(coll.all_objects):
    if o.name.startswith('tmp') or o.name.startswith('cutter'): bpy.data.objects.remove(o, do_unlink=True)
# viewing colours for the materials blender_kit does not know (the game replaces every material by its name)
for n, c in (('wood', (0.35, 0.18, 0.08, 1)), ('woodRed', (0.32, 0.09, 0.04, 1)), ('chequerWood', (0.26, 0.07, 0.03, 1)), ('plum', (0.22, 0.06, 0.07, 1))):
    m = bpy.data.materials.get(n)
    if m: m.diffuse_color = c

# ===================================================================================================== info and anchors
HG_END = GAS0                # the furthest a handguard reaches: the gas block's back (hgMax = this - mount_handguard - 3 mm)
info = {
    'sy': round(SY * mm, 4), 'fSight': round(NOTCH_F * mm, 4), 'relief': 0.17,
    'muzzles': [[round(MUZ * mm, 4), 0, 0]],
    'grip': [0.042, -0.08, 0], 'support': [round((HG_LO[0] + HG_LO[1]) / 2 * mm + 0.02, 4), -0.026, 0],
    'anim': dict({'handle': 'part_handle', 'mag': 'part_mag'}, **({'bipod': 'part_bipod'} if V.get('bipod') else {})),
    'magAt': [round(MK['F'] * mm, 4), round(MK['Y'] * mm, 4)],
    'handle': {'f': round(HANDLE[0] * mm, 4), 'y': round(HANDLE[1] * mm, 4), 'x': 0.0255, 'travel': 0.085, 'recip': True, 'style': 'ak'},
    'port': [round((166 + 229) / 2 * mm, 4), round(4 * mm, 4), round(HW * mm, 4)],
    'chamberAt': {'side': 'right', 'f': round(222 * mm, 4), 'y': 0.0, 'x': round((HW - 2.5) * mm, 4)},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [round(BE * mm, 4), 0, 0]},
}
anchors = {
    'mount_optic': [round(CV0 * mm, 4), round(CVT * mm, 4), 0], 'mount_optic_end': [round(CV1 * mm, 4), round(CVT * mm, 4), 0],
    'mount_optic_rail': [round(RC0 * mm, 4), round(RC_RT * mm, 4), 0], 'mount_optic_rail_end': [round(RC1 * mm, 4), round(RC_RT * mm, 4), 0],
    'mount_handguard': [round(RF * mm, 4), 0, 0], 'mount_handguard_end': [round(HG_END * mm, 4), 0, 0],
    'mount_barrel': [round(GAS1 * mm, 4), 0, 0], 'mount_muzzle': [round(BE * mm, 4), 0, 0],
    'mount_stock': [0, -0.002, 0], 'mount_grip': [round(GRIP_TOP[0] * mm, 4), round(GRIP_TOP[1] * mm, 4), 0],
    'mount_mag': [round(MK['F'] * mm, 4), round(MK['Y'] * mm, 4), 0],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
if EXPORT:
    with open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'source': 'authored', 'sights': {'builtin': ['notch'], 'rail': []}}, indent=2) + '\n')
# ---- the other barrel lengths: variants beside the model (models/<id>/barrel_<len>.glb; js/parts.ts <id>.br.<len>, avBarrel). Each is its
# barrel from BASE_END to its end, the gas tube, the gas block and front sight (or the combined block), the rod, the RPK's bipod collar:
# its end the factory end moved by the length's difference (the shared barrels' rule), so the muzzle device seats as on the factory one.
also, figures = [], {}
def fig(d, inches):
    return {'inches': inches, 'mount_muzzle': round(d['E'] * mm, 4), 'post_f': round(d['post'] * mm, 4), 'post_tip': round(SY * mm, 4),
            'hg_room': round((d['hg_end'] - RF - 3.0) * mm, 4), 'mount_handguard_end': round(d['hg_end'] * mm, 4), 'gas': 'combined block' if d['short'] else 'factory gas block',
            'muzzle_device_front': round((d['E'] + MUZ - BE) * mm, 4), 'bipod_hinge_f': round(d['bipod_f'] * mm, 4) if d['bipod_f'] else None}
figures['factory'] = fig(FB, V['inches'])
for inches in C.get('barrels', []):
    name = 'barrel_' + ('%g' % inches).replace('.', '_')
    E = BE + (inches - V['inches']) * 25.4
    vc, vr, KV = kit_variant(ID, name, 'barrel', {})
    K_main = K; K = KV
    d = barrel_assembly(E, inches)
    K = K_main
    for o in list(vc.all_objects):
        if o.name.startswith('tmp') or o.name.startswith('cutter'): bpy.data.objects.remove(o, do_unlink=True)
    figures[name] = fig(d, inches)
    note = '%g" barrel: %s; the handguard room to %.1f mm (hgMax %.4f)%s' % (inches, figures[name]['gas'], d['hg_end'], figures[name]['hg_room'],
            ('; the bipod hinges %.1f mm behind mount_muzzle (move part_bipod with the barrel end)' % (d['E'] - d['bipod_f'])) if d['bipod_f'] else '')
    vr['variant_json'] = json.dumps({'gun': ID, 'slot': 'barrel', 'of': 'factory', 'info': {'muzzles': [[round(E * mm, 4), 0, 0]]}, 'note': note})
    also.append(vc)
    if EXPORT: export_glb(vc, os.path.join(HERE, name + '.glb'))
def open_edges(objs):
    """The meshes with non-manifold edges (open, or more than two faces on an edge): name -> count."""
    import bmesh as _bm
    out = {}
    for o in objs:
        b = _bm.new(); b.from_mesh(o.data); n = sum(1 for e in b.edges if not e.is_manifold); b.free()
        if n: out[o.name] = n
    return out
OPEN = open_edges([o for c in (coll, *also) for o in c.all_objects if o.type == 'MESH'])
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'open_meshes': OPEN, 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT, also=tuple(also)), 'info': info, 'anchors': anchors, 'barrels': figures,
          'magFit': {'len': MK['LEN'], 'c': MK['C'], 'd0': MK['D0'], 'd1': MK['D1'], 'w': MK['W']}}
print('RESULT', json.dumps(result))
