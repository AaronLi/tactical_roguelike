# A six-barrel stacked-round rifle (the issue #37 design: electrically fired rounds stacked nose to tail in each barrel,
# reloaded by swapping the whole barrel block), modelled in Blender. AMMUNITION: not .277 Fury but a full-bore CASELESS TELESCOPED
# round: a sub-calibre bullet in a full-bore sabot, buried in a cylindrical block of propellant 10 mm across, so the rounds stack nose
# to tail in a 10 mm bore and each is fired by its own contact; the muzzle device's bores flare to strip the sabot's petals.
# Original design (the user's layout); cues from references for:
# Metal Storm's barrel pods (plain tubes in perforated plates, a breech of firing contacts, plain muzzles), raw bead-blasted titanium CNC
# parts (satin light grey, flat faces, filleted pockets, chamfers, counterbored screws, truss webs) and modern machined hinges
# (interleaved knuckles round an exposed pin with flush caps, thick leaves, countersunk screws).
#   Blender: exec(open(r'<repo>/models/tempest/build_tempest.py').read(), {'GUN_DIR': r'<repo>/models/tempest'})
#   or:      blender -b -P models/tempest/build_tempest.py
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the back panel's rear face, on the axis of the upper five barrels.
# The design:
#   BARREL BLOCK (part_mag, slot mag: the reload swaps it): six heavy steel barrels (r 8.5 mm, 18.5 in, running back to the panel): five as a 2 x 2 with one in the
#     centre, and one more centred below them; held by CNC titanium: a breech block (the firing contacts on its face, a pin each side
#     that sits in the cradle) and two pocketed clamp plates.
#   FIXED CHASSIS (base, titanium): runs on from the panel under the barrels' rear to the hinge (200 mm), with the hinge's outer knuckles.
#   BACK PANEL (base, titanium): small (85 mm): only the battery, the control board and the LCD; a vertical Picatinny section on its rear face (the stock's interface, mount_stock), the AR pistol
#     grip's seat under it (mount_grip), trigger and guard, a fire-mode dial, a screen on a wedge on its top left (display_ammo:
#     the rounds left in each barrel), the hinge's outer knuckles at its front foot.
#   SIGHT RAIL (base): a low titanium beam from the back panel's top, 3 mm over the barrel block, 75 mm past the panel: for the reload the
#     muzzle device first runs forward on its guide rods (part_pump), drawing the block out from under it; then the forend drops.
#   (the forend is two titanium ARMS from the hinge, along the barrels, down to a rod housing: see FOREND below)
#   FRONT (part_brk: hinged under the back panel's front, between the grip and the foregrip; it drops for the reload, then the barrel
#     block is lifted up and out of it): the LOWER SUPPORT BODY (slot handguard, titanium): a cradle under and beside the barrels, side
#     rails (mount_tac, mount_tacL), a bottom rail for a foregrip (mount_fg), lightening slots, the hinge's centre knuckle; and the MUZZLE
#     DEVICE (slot muzzle, titanium, part_pump: it slides): a six-bore block on two machined truss struts, each standing on a sleeve round
#     a steel guide rod that runs back into a bore in the forend's floor; the barrels' muzzles seat in its rear face.
#   STOCK (slot stock): a twin-rod telescoping stock on a folding adapter clamped to the rear rail. GRIP (slot grip): an AR-pattern grip. OPTIC: low titanium irons.
import bpy, json, math, os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = 'tempest'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
TI = TITANIUM
# COLOURWAYS: 'raw' (default): bare titanium everywhere, rails included, the barrels bead-blasted raw steel, only the grip and stock dark;
# 'dark': titanium frame, blued barrels, black rails.
COLOURWAY = os.environ.get('COLOURWAY', 'raw')
RAIL_M = TI if COLOURWAY == 'raw' else 'black'
BARREL_M = 'm_80838a' if COLOURWAY == 'raw' else 'blued'

coll, root = kit_collection(ID)
K = Kit(coll, root)

# ---- stations (metres forward of the back panel's rear face) and the barrels ----
BP1 = 0.085                    # the back panel's front: it holds only the battery, the control board and the LCD
BR0, BR1 = BP1 + 0.002, 0.558  # barrels: breech face to muzzles (471 mm, 18.5 in: they run back to the panel)
BB1 = BR0 + 0.040              # the breech block's front
ROUND_L, FREE = 0.044, 0.120   # a round's length; the free bore ahead of the front round
ROUNDS = int((0.558 - BB1 - FREE) / ROUND_L)   # rounds in each barrel (7: 42 in the block)
MZ0, MZ1 = 0.560, 0.628        # the muzzle device
HG1 = 0.500                    # the lower body's front (its arms run on to the muzzle device)
RB, D, ZB = 8.5 * mm, 12.5 * mm, -26 * mm      # a barrel's radius; the 2 x 2's half spacing; the lower barrel's height
BORES = [(-D, D), (D, D), (0, 0), (-D, -D), (D, -D), (0, ZB)]
BORE = 5.0 * mm                                   # the bore's radius: the round's full width (10 mm)
# capacity: each barrel holds its rounds nose to tail from the breech block's front, leaving FREE of bore ahead of the front round (so the
# first shot has some barrel to accelerate in; each later one has more: the velocity rises as a barrel empties)
OUT = circles_hull(BORES, RB + 5 * mm, 32)       # the block's plates' outline (x, z)
LOW = ZB - RB                                     # the lowest barrel's underside (-34.5 mm)
CH1 = 0.200                                       # the FIXED chassis's front: it runs on from the panel under the barrels to the hinge
HINGE = (CH1 - 0.002, -0.062)                     # (forward, up) of the hinge pin
OPEN = 25.0                                       # the front's drop for the reload, degrees
SLIDE = 0.090                                     # the muzzle device's run forward (it draws the barrel block with it) before the drop
UNSEAT = 0.012                                    # then the block slides back this far in its cradle, off the muzzle device's seats
# the reload: the MUZZLE DEVICE runs forward SLIDE on two guide rods in the forend (part_pump), drawing the barrel block (its muzzles
# are seated in the device) until the block's rear is out from under the rail; the forend drops OPEN degrees on the fixed hinge; the
# block slides back UNSEAT off the seats and lifts out. So the rail stays low, just over the block (checked below: RAIL_CLEAR)
RAIL_B, RAIL_U, RAIL_F1 = 0.029, 0.037, BP1 + 0.075   # the beam's underside (3 mm over the breech block), its top, its front end

# ================================================== BACK PANEL (base, titanium) ==================================================
SCREWS = ((0.020, 0.006), (BP1 - 0.020, 0.006), (0.020, -0.030), (BP1 - 0.020, -0.030))
bp = K.tmp(prism([(0.0, -0.054), (BP1 - 0.014, -0.054), (BP1, -0.042), (BP1, 0.026), (BP1 - 0.006, 0.030), (0.012, 0.030), (0.0, 0.020)], 'x', -25 * mm, 25 * mm))
bevel(bp, 2.5 * mm, 3, 30)
for s in (-1, 1):   # a pocketed side panel each side (the electronics bay's lid), four counterbored screws in its corners
    cut(bp, prism(rounded(BP1 / 2, -0.012, BP1 / 2 - 0.012, 0.026, 5 * mm, 3), 'x', s * 23.6 * mm, s * 26 * mm))
    for f, z in SCREWS:
        cut(bp, cyl(1.9 * mm, s * 22.6 * mm, s * 24 * mm, 'x', (f, z), 12))
cut(bp, prism(circles_hull(BORES, RB + 4 * mm, 24), 'y', BP1 - 0.004, BP1 + 0.001))       # the dock in the front face (the contacts)
smooth(bp); K.adopt(bp, 'base', TI)
for s in (-1, 1):
    for f, z in SCREWS:
        o = K.obj(cyl(1.6 * mm, s * 22.9 * mm, s * 23.5 * mm, 'x', (f, z), 10), 'base', 'black')   # (the screw heads, down in their counterbores)
o = K.obj(prism(circles_hull(BORES, RB + 3.6 * mm, 24), 'y', BP1 - 0.004, BP1 - 0.0028), 'base', 'brass'); smooth(o)   # the contact plate
# the hinge (fixed): two outer knuckles under the fixed chassis's front (the forend's centre knuckle between them), the pin, flush caps
KN_R = 7 * mm
for s in (-1, 1):
    kn = K.tmp(prism([(CH1 - 0.030, -0.050), (HINGE[0], -0.050), (HINGE[0], HINGE[1] - KN_R), (CH1 - 0.022, HINGE[1] - KN_R + 1 * mm)], 'x', s * 11 * mm, s * 25 * mm))
    boolean(kn, cyl(KN_R, s * 11 * mm, s * 25 * mm, 'x', HINGE, 28), 'UNION')
    bevel(kn, 1 * mm, 2, 30); cut(kn, cyl(3 * mm, -0.03, 0.03, 'x', HINGE, 18))
    smooth(kn); K.adopt(kn, 'base', TI)
    o = K.obj(cyl(4.2 * mm, s * 24.4 * mm, s * 25.3 * mm, 'x', HINGE, 20), 'base', 'steel'); smooth(o)      # the pin's flush cap
o = K.obj(cyl(3 * mm, -24.5 * mm, 24.5 * mm, 'x', HINGE, 16), 'base', 'steel'); smooth(o)                   # the pin
# the FIXED CHASSIS (base, titanium): from the panel's front to the hinge, under and beside the barrels' rear (the block's breech end
# lies in it); its floor carries the hinge's outer knuckles
ch = K.tmp(prism([(BP1 - 0.004, -0.054), (CH1 - 0.006, -0.054), (CH1, -0.048), (CH1, 0.002), (CH1 - 0.008, 0.006), (BP1 - 0.004, 0.006)], 'x', -27 * mm, 27 * mm))
bevel(ch, 2 * mm, 2, 30)
cut(ch, prism(circles_hull(BORES, RB + 5.6 * mm, 24) + [(-RB - 5.6 * mm - D, 0.03), (RB + 5.6 * mm + D, 0.03)], 'y', BP1 - 0.01, CH1 + 0.01))   # its channel
# the same extrusion as the forend's rear: the cheeks down to a fluted side member, the floor up to a web (the hinge's leaves stay)
for s in (-1, 1):
    cut(ch, box(s * 19 * mm, s * 30 * mm, BP1 + 0.010, CH1 + 0.010, -0.034, 0.02))
    for z in (-0.0385, -0.0445):
        cut(ch, box(s * 26.3 * mm, s * 28 * mm, BP1 + 0.002, CH1 + 0.002, z - 1.2 * mm, z + 1.2 * mm))
    for f in (BP1 + 0.012, CH1 - 0.016):
        cut(ch, cyl(1.9 * mm, s * 25.6 * mm, s * 28 * mm, 'x', (f, -0.044), 12))                                              # counterbored screws
        o = K.obj(cyl(1.6 * mm, s * 25.9 * mm, s * 26.5 * mm, 'x', (f, -0.044), 10), 'base', 'black')
cut(ch, box(-9 * mm, 9 * mm, BP1 + 0.016, CH1 - 0.036, -0.06, -0.0365))   # a window through the floor
smooth(ch); K.adopt(ch, 'base', TI)
# the buffer tube's boss on the rear face, and the screen beside it (display_ammo: the game paints the rounds left per barrel)
# the STOCK INTERFACE: a vertical Picatinny section on the rear face (a folding or fixed stock clamps on it)
SR0, SR1 = -0.034, 0.012
rr = picatinny(K, 0.0, SR1 - SR0, 0.0, 'base', RAIL_M)
rr.data.transform(Matrix.Translation((0, 0, SR0)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))       # (its length up the face, its top facing back)
# the AMMO SCREEN (display_ammo: the game paints the rounds left in each of the six barrels): on a wedge on the back panel's top left,
# beside the rail, tilted back towards the shooter's eye; a rubber bezel round it
SCR_F0, SCR_F1, SCR_X0, SCR_X1, SCR_RISE = 0.024, 0.072, -24.5 * mm, -12.5 * mm, 0.014
wd = K.tmp(prism([(SCR_F0, 0.0295), (SCR_F1, 0.0295), (SCR_F1, 0.030 + SCR_RISE)], 'x', SCR_X0, SCR_X1)); bevel(wd, 0.8 * mm, 2, 30); smooth(wd)
K.adopt(wd, 'base', TI)
tilt = math.atan2(SCR_RISE, SCR_F1 - SCR_F0)
def _on_wedge(me, lift):   # a flat thing lying on the wedge's slope (made flat at u 0 from SCR_F0, then tilted up about that edge)
    me.transform(Matrix.Translation((0, SCR_F0, 0.030 + lift)) @ Matrix.Rotation(tilt, 4, 'X') @ Matrix.Translation((0, -SCR_F0, 0))); return me
bz = K.tmp(_on_wedge(box(SCR_X0 + 0.5 * mm, SCR_X1 - 0.5 * mm, SCR_F0 + 0.004, SCR_F1 - 0.002, 0, 1.2 * mm), 0.0))
cut(bz, _on_wedge(box(SCR_X0 + 1.6 * mm, SCR_X1 - 1.6 * mm, SCR_F0 + 0.007, SCR_F1 - 0.005, 0.4 * mm, 0.004), 0.0)); smooth(bz); K.adopt(bz, 'base', 'rubber')
scr = K.obj(_on_wedge(box(SCR_X0 + 1.6 * mm, SCR_X1 - 1.6 * mm, SCR_F0 + 0.007, SCR_F1 - 0.005, 0, 0.6 * mm), 0.0), 'base', 'glass'); scr.name = 'display_ammo'
# the fire-mode dial (left side, over the grip): semi, low, high, double, sextuple
o = K.obj(cyl(7 * mm, -27.5 * mm, -24.5 * mm, 'x', (0.030, 0.012), 24), 'base', 'black'); smooth(o)
o = K.obj(box(-28.2 * mm, -27 * mm, 0.0285, 0.0315, 0.012, 0.0185), 'base', TI)
# the grip's seat and the trigger housing under the panel, the trigger and its guard
o = K.obj(prism([(0.000, -0.054), (0.065, -0.054), (0.065, -0.062), (0.006, -0.068)], 'x', -12 * mm, 12 * mm), 'base', TI); bevel(o, 1 * mm, 2); smooth(o)
o = K.obj(prism([(0.044, -0.060), (0.050, -0.060), (0.053, -0.078), (0.048, -0.083), (0.041, -0.072)], 'x', -2.5 * mm, 2.5 * mm), 'base', 'black'); bevel(o, 0.5 * mm, 1); smooth(o)
tg = K.tmp(prism([(0.020, -0.062), (0.078, -0.062), (0.078, -0.068), (0.068, -0.090), (0.028, -0.090)], 'x', -6 * mm, 6 * mm))
cut(tg, prism([(0.028, -0.058), (0.072, -0.058), (0.064, -0.085), (0.030, -0.085)], 'x', -0.01, 0.01))
bevel(tg, 1 * mm, 2); smooth(tg); K.adopt(tg, 'base', TI)

# ================================================== SIGHT RAIL (base): a short beam ==================================================
beam = K.tmp(prism([(0.006, RAIL_B), (RAIL_F1 - 0.010, RAIL_B), (RAIL_F1, RAIL_U - 0.003), (RAIL_F1, RAIL_U), (0.006, RAIL_U)], 'x', -11 * mm, 11 * mm))
bevel(beam, 1 * mm, 2, 30)
cut(beam, prism(rounded((BP1 + RAIL_F1) / 2 - 0.004, (RAIL_B + RAIL_U) / 2, 0.026, 0.0022, 2 * mm, 2), 'x', -0.02, 0.02))   # a window through its overhang
smooth(beam); K.adopt(beam, 'base', TI)
top_rail = picatinny(K, 0.012, RAIL_F1 - 0.002, RAIL_U, 'base', RAIL_M)
RAIL_TOP = RAIL_U + 5.6 * mm
# the REAR SIGHT is the rail itself: a groove cut along the middle of its top, its rear end the notch
GROOVE_W, GROOVE_D = 2.6 * mm, 1.6 * mm
cut(top_rail, box(-GROOVE_W / 2, GROOVE_W / 2, 0.0, RAIL_F1 + 0.01, RAIL_TOP - GROOVE_D, RAIL_TOP + 0.01))

# ================================================== IRONS: rudimentary ==================================================
# the rear sight is the rail's centre groove (above); the front sight a notched fin on the muzzle device's top (it slides with it).
# Both notches' floors on the sight line SY, the groove's floor. (No optic-slot meshes: an optic on the rail is the gun's only optic part.)
SY = RAIL_TOP - GROOVE_D

# ================================================== STOCK and GRIP ==================================================
# the STOCK (slot stock): a folding adapter clamped on the rear rail (its hinge on the left: it folds along the gun's left side), two
# telescoping rods, a cheek piece riding them, a polymer buttplate with a QD socket and a ribbed rubber pad
RH = 5.6 * mm                                                       # (the rail stands this far behind the face)
ad = K.tmp(prism([(-RH, -0.038), (-0.032, -0.038), (-0.036, -0.030), (-0.036, 0.010), (-0.032, 0.016), (-RH, 0.016)], 'x', -13 * mm, 13 * mm))
bevel(ad, 2 * mm, 2, 30)
cut(ad, box(-11 * mm, 11 * mm, -RH - 0.001, -RH + 0.002, SR0 - 0.001, SR1 + 0.001))               # (it sits over the rail)
smooth(ad); K.adopt(ad, 'stock', 'black')
o = K.obj(cyl(6 * mm, -0.038, 0.016, 'z', (-13 * mm, -0.020), 20), 'stock', 'black'); smooth(o)        # the fold hinge (left)
o = K.obj(cyl(3.5 * mm, 13 * mm, 15.5 * mm, 'x', (-0.020, -0.012), 14), 'stock', 'steel'); smooth(o)   # the clamp's lock button (right)
for x in (-8 * mm, 8 * mm):                                                                          # the rods
    o = K.obj(cyl(5 * mm, -0.250, -0.034, 'y', (x, -0.008), 16), 'stock', 'black'); smooth(o)
ck = K.tmp(prism([(-0.150, 0.010), (-0.160, 0.024), (-0.236, 0.030), (-0.240, 0.012), (-0.240, -0.018), (-0.150, -0.018)], 'x', -16 * mm, 16 * mm))
bevel(ck, 2.5 * mm, 3, 30)
for x in (-8 * mm, 8 * mm): cut(ck, cyl(5.2 * mm, -0.30, -0.10, 'y', (x, -0.008), 16))
smooth(ck); K.adopt(ck, 'stock', 'polymer')                                                          # the cheek piece
bt = K.tmp(prism([(-0.238, 0.034), (-0.262, 0.036), (-0.266, -0.092), (-0.244, -0.094), (-0.238, -0.040)], 'x', -17 * mm, 17 * mm))
bevel(bt, 3 * mm, 3, 30)
cut(bt, prism(rounded(-0.252, -0.060, 0.006, 0.018, 3 * mm, 2), 'x', -0.03, 0.03))                 # a lightening window
for x in (-8 * mm, 8 * mm): cut(bt, cyl(5.2 * mm, -0.30, -0.10, 'y', (x, -0.008), 16))
smooth(bt); K.adopt(bt, 'stock', 'polymer')                                                          # the buttplate
o = K.obj(cyl(5 * mm, -17.6 * mm, -15 * mm, 'x', (-0.252, -0.025), 16), 'stock', 'steel'); smooth(o)   # its QD sling socket
pad = K.tmp(prism([(-0.264, 0.036), (-0.278, 0.036), (-0.280, 0.030), (-0.280, -0.090), (-0.278, -0.096), (-0.264, -0.096)], 'x', -17.5 * mm, 17.5 * mm))
bevel(pad, 3 * mm, 3, 30)
for i in range(7): cut(pad, box(-0.03, 0.03, -0.283, -0.277, -0.084 + i * 0.018, -0.080 + i * 0.018))   # its ribs
smooth(pad); K.adopt(pad, 'stock', 'rubber')
GRIP_SEAT = (0.006, -0.062)
gp = K.tmp(prism([(0.006, -0.060), (0.038, -0.060), (0.028, -0.083), (0.020, -0.093), (0.016, -0.108), (0.000, -0.160), (-0.028, -0.160),
                  (-0.034, -0.152), (-0.026, -0.108), (-0.018, -0.068)], 'x', -14 * mm, 14 * mm))
bevel(gp, 3 * mm, 3, 30); smooth(gp); K.adopt(gp, 'grip', 'stipple')

# ================================================== FRONT (part_brk): lower support body + muzzle device ==================================================
pbrk = K.part('brk', (0, HINGE[0], HINGE[1]))
# the FOREND (slot handguard, titanium): no block. A hinge base (the centre knuckle and a cross plate) and two ARMS that rise from it
# to the barrels' height, run along beside them (a rail on each's outside), and descend at the front to the ROD HOUSING: a cross member
# under the barrels that carries the muzzle device's guide rods (and a short rail under it for a foregrip)
ROD_X, ROD_U, ROD_R, ROD0 = 16 * mm, -0.0445, 4 * mm, HG1 - 0.150
AX0, AX1, AW = 23 * mm, 29.5 * mm, 0.022                          # the arms' inner and outer faces; their depth on the run
RUN_U = -0.006                                                    # the run's centre height (the barrels' axis, nearly)
HS0 = HG1 - 0.072                                                 # the rod housing's rear (long enough under it for a vertical grip)
FLOOR = ROD_U - 0.008                                             # its underside
TAC0, TAC1, FG0, FG1 = CH1 + 0.060, HS0 - 0.040, HS0 + 0.004, HG1 - 0.004      # the arms' rails; the housing's rail
def band(path, w):
    """The outline of a band of width w round a polyline (mitred joins), as one polygon."""
    L, R = [], []
    n = len(path)
    for i in range(n):
        p = path[i]
        ds = []
        if i > 0: ds.append((p[0] - path[i - 1][0], p[1] - path[i - 1][1]))
        if i < n - 1: ds.append((path[i + 1][0] - p[0], path[i + 1][1] - p[1]))
        nrm = [(-d[1] / math.hypot(*d), d[0] / math.hypot(*d)) for d in ds]
        nx, ny = sum(q[0] for q in nrm), sum(q[1] for q in nrm); l = math.hypot(nx, ny); nx, ny = nx / l, ny / l
        k = 1.0 / max(0.3, nx * nrm[0][0] + ny * nrm[0][1])            # (the mitre's lengthening)
        L.append((p[0] + nx * w / 2 * k, p[1] + ny * w / 2 * k)); R.append((p[0] - nx * w / 2 * k, p[1] - ny * w / 2 * k))
    return L + list(reversed(R))
ARM = [(CH1 + 0.006, HINGE[1] - 0.002), (CH1 + 0.042, RUN_U), (HS0 - 0.022, RUN_U), (HS0 + 0.006, ROD_U), (HG1, ROD_U)]
for s_ in (-1, 1):
    a = K.tmp(prism(band(ARM, AW), 'x', s_ * AX0, s_ * AX1))
    bevel(a, 1.5 * mm, 2, 30)
    smooth(a); K.adopt(a, 'handguard', TI, pbrk)
    picatinny(K, TAC0, TAC1, RUN_U, 'handguard', RAIL_M, pbrk, 'right' if s_ > 0 else 'left', s_ * AX1)
# the hinge base: the centre knuckle (between the chassis's two), and a cross plate to both arms' feet
hb = K.tmp(prism([(CH1 - 0.004, -0.058), (CH1 + 0.030, -0.058), (CH1 + 0.030, -0.072), (CH1 - 0.004, -0.072)], 'x', -AX1, AX1))
boolean(hb, cyl(KN_R, -10.6 * mm, 10.6 * mm, 'x', HINGE, 28), 'UNION')
bevel(hb, 1.5 * mm, 2, 30)
cut(hb, box(-25.5 * mm, -10.6 * mm, CH1 - 0.012, CH1 + 0.010, HINGE[1] - KN_R - 1 * mm, -0.050))   # (room for the outer knuckles)
cut(hb, box(10.6 * mm, 25.5 * mm, CH1 - 0.012, CH1 + 0.010, HINGE[1] - KN_R - 1 * mm, -0.050))
cut(hb, cyl(3.1 * mm, -0.03, 0.03, 'x', HINGE, 18))
cut(hb, prism(rounded(CH1 + 0.017, -0.065, 0.008, 0.0035, 2 * mm, 2), 'x', -0.012, 0.012))
smooth(hb); K.adopt(hb, 'handguard', TI, pbrk)
# the rod housing: a cross member under the barrels between the arms' feet, bored for the two guide rods, a pocket between them
hs = K.tmp(prism([(HS0, FLOOR), (HG1, FLOOR), (HG1, LOW - 2 * mm), (HS0, LOW - 2 * mm)], 'x', -AX1, AX1))
bevel(hs, 1.5 * mm, 2, 30)
for s_ in (-1, 1): cut(hs, cyl(ROD_R + 0.3 * mm, HS0 - 0.01, HG1 + 0.01, 'y', (s_ * ROD_X, ROD_U), 16))
cut(hs, prism(rounded((HS0 + HG1) / 2, (FLOOR + LOW) / 2 - 0.001, 0.014, 0.0035, 2 * mm, 2), 'x', -0.009, 0.009))
smooth(hs); K.adopt(hs, 'handguard', TI, pbrk)
picatinny(K, FG0, FG1, FLOOR, 'handguard', RAIL_M, pbrk, 'bottom')
# the CENTRE ARM: a third titanium member under the barrels, from the hinge base forward and up to the rod housing (the junction of
# the side arms, the centre arm and the guide rods, and where a vertical grip mounts); three filleted lightening slots along it
CA0, CA1, CAW = (CH1 + 0.024, -0.066), (HS0 + 0.006, FLOOR + 0.004), 0.011
ca = K.tmp(prism(band([CA0, CA1], CAW), 'x', -5 * mm, 5 * mm))
boolean(ca, prism(band([CA0, (CA0[0] + 0.004, CA0[1])], CAW + 0.004), 'x', -5 * mm, 5 * mm), 'UNION')
bevel(ca, 1.2 * mm, 2, 30)
ang = math.atan2(CA1[1] - CA0[1], CA1[0] - CA0[0]); Lc = math.hypot(CA1[0] - CA0[0], CA1[1] - CA0[1])
for i in range(3):
    t = (i + 0.5) / 3; cx, cy = CA0[0] + (CA1[0] - CA0[0]) * t, CA0[1] + (CA1[1] - CA0[1]) * t
    sl = [(cx + x * math.cos(ang) - y * math.sin(ang), cy + x * math.sin(ang) + y * math.cos(ang)) for x, y in rounded(0, 0, Lc / 3 / 2 - 0.006, CAW / 2 - 0.0028, 2 * mm, 3)]
    cut(ca, prism(sl, 'x', -0.01, 0.01))
smooth(ca); K.adopt(ca, 'handguard', TI, pbrk)
# ---- the SLIDING FRONT (part_pump, inside the forend): the muzzle device on its two truss arms, a yoke under it, and two steel guide
# rods running back into the forend's floor; it runs forward SLIDE for the reload, drawing the barrel block ----
ppump = K.part('pump', (0, MZ0, 0))
ppump.parent = pbrk; ppump.matrix_parent_inverse = pbrk.matrix_world.inverted()
# the struts: a machined truss each side: an outer triangle (from its foot over the guide rod up to the muzzle device's top) split by
# one diagonal; the two pockets are the triangles inset by a constant web (3.5 mm on the outside members, 3.5 mm across the diagonal,
# 4 mm where it meets the device), every corner filleted 1.5 mm (the cutter's radius)
WEB, FIL = 4.5 * mm, 2.0 * mm
SX0, SX1 = 22.5 * mm, 30 * mm                                       # the struts' inner and outer faces (7.5 mm plates, clear of the barrels'
                                                                    # front clamp band; the outer face flush with the device's side)
FL = 0.005                                                          # the flange screwed to the device's rear face
TA, TB, TC = (HG1 + 0.004, ROD_U - 0.005), (MZ0 - FL, ROD_U - 0.005), (MZ0 - FL, 0.004)
TM = (TA[0] + (TB[0] - TA[0]) * 0.52, TA[1])
for s_ in (-1, 1):
    a = K.tmp(prism([TA, TB, TC], 'x', s_ * SX0, s_ * SX1))
    boolean(a, box(s_ * SX0, s_ * SX1, MZ0 - FL, MZ0, ROD_U - 0.005, 0.004), 'UNION')          # the flange, flat on the device's rear face
    bevel(a, 1 * mm, 2, 30)
    for z in (ROD_U + 0.004, -0.006):                                                     # its two counterbored screws
        cut(a, cyl(2.2 * mm, MZ0 - FL - 0.001, MZ0 - FL + 0.0015, 'y', (s_ * (SX0 + SX1) / 2, z), 12))
        o = K.obj(cyl(1.8 * mm, MZ0 - FL - 0.0005, MZ0 - FL + 0.002, 'y', (s_ * (SX0 + SX1) / 2, z), 10), 'muzzle', 'black', ppump)
    for tri, ws in (([TA, TM, TC], [WEB, WEB / 2, WEB]), ([TM, TB, TC], [WEB, WEB, WEB / 2])):
        cut(a, prism(fillet_poly(inset_poly(tri, ws), FIL, 3), 'x', -0.03, 0.03))
    smooth(a); K.adopt(a, 'muzzle', TI, ppump)
    # the guide rod, and the sleeve round it that the strut's foot stands on: from the forend's mouth to under the device, chamfered
    o = K.obj(lathe([(ROD0, ROD_R - 0.6 * mm), (ROD0 + 0.002, ROD_R), (MZ0 + 0.008, ROD_R)], 16, (s_ * ROD_X, 0, ROD_U)), 'muzzle', 'steel', ppump); smooth(o)
    sv = K.tmp(lathe([(HG1 + 0.003, 5.2 * mm), (HG1 + 0.005, 6.5 * mm), (MZ0 + 0.008, 6.5 * mm), (MZ0 + 0.010, 5.2 * mm)], 20, (s_ * ROD_X, 0, ROD_U)))
    smooth(sv); K.adopt(sv, 'muzzle', TI, ppump)
    # a boss from the sleeve's front up into the device's underside
    o = K.tmp(box(s_ * (ROD_X - 5 * mm), s_ * (ROD_X + 5 * mm), MZ0 - 0.002, MZ0 + 0.010, ROD_U, ZB - RB - 4 * mm)); bevel(o, 1 * mm, 2, 30); smooth(o)
    K.adopt(o, 'muzzle', TI, ppump)
# the muzzle device: a six-bore titanium block, chamfered nose, side ports along each row, the muzzles' seats in its rear face
mzd = K.tmp(prism(circles_hull(BORES, RB + 9 * mm, 16), 'y', MZ0, MZ1))
bevel(mzd, 3 * mm, 2, 30)
for x, z in BORES:
    cut(mzd, lathe([(MZ0 + 0.008, BORE + 0.4 * mm), (MZ1 - 0.006, BORE + 1.6 * mm), (MZ1 + 0.002, BORE + 2.4 * mm), (MZ1 + 0.01, BORE + 2.4 * mm)],
                   16, (x, 0, z)))                                                          # the bores, flaring forward (the sabot's petals peel off)
    cut(mzd, cyl(RB + 0.3 * mm, MZ0 - 0.01, MZ0 + 0.010, 'y', (x, z), 16))                  # the muzzles' seats
for z in (D, 0.0, -D, ZB):
    for i in range(2):
        f = MZ0 + 0.024 + i * 0.016
        cut(mzd, box(-0.05, 0.05, f, f + 0.007, z - 3.2 * mm, z + 3.2 * mm))                 # side ports, through (petals and gas out)
smooth(mzd); K.adopt(mzd, 'muzzle', TI, ppump)
fin = K.tmp(prism([(MZ0 + 0.026, D + RB + 6 * mm), (MZ1 - 0.008, D + RB + 6 * mm), (MZ1 - 0.012, SY + 3.5 * mm), (MZ0 + 0.032, SY + 3.5 * mm)], 'x', -3 * mm, 3 * mm))
bevel(fin, 0.6 * mm, 2, 30); cut(fin, box(-1.0 * mm, 1.0 * mm, MZ0, MZ1 + 0.01, SY, SY + 0.01))       # the front sight: a fin with a notch
smooth(fin); K.adopt(fin, 'muzzle', TI, ppump)

# ================================================== BARREL BLOCK (part_mag, inside part_brk) ==================================================
MAG_AT = (BR0, 0.0)
pm = K.part('mag', (0, MAG_AT[0], MAG_AT[1]))
pm.parent = ppump; pm.matrix_parent_inverse = ppump.matrix_world.inverted()     # (drawn forward with the muzzle device)
for x, z in BORES:
    o = K.tmp(lathe([(BR0 + 0.030, RB), (BR1 - 0.004, RB), (BR1, RB - 1 * mm), (BR1, BORE), (BR1 - 0.02, BORE)], 16, (x, 0, z)))
    smooth(o); K.adopt(o, 'mag', BARREL_M, pm)
bb = K.tmp(prism(circles_hull(BORES, RB + 5 * mm, 16), 'y', BR0, BB1))
bevel(bb, 1.5 * mm, 2, 30)
for s in (-1, 1): cut(bb, prism(rounded(BR0 + 0.020, -0.010, 0.011, 0.012, 2 * mm, 2), 'x', s * 23 * mm, s * 27 * mm))     # side pockets
smooth(bb); K.adopt(bb, 'mag', TI, pm)
for x, z in BORES:   # the firing contacts on its rear face
    o = K.obj(cyl(3.5 * mm, BR0 - 0.0008, BR0 + 0.001, 'y', (x, z), 12), 'mag', 'brass', pm)
o = K.obj(cyl(3.5 * mm, -29 * mm, 29 * mm, 'x', (BR0 + 0.020, -0.004), 16), 'mag', 'steel', pm); smooth(o)   # the cradle pins
for f0, rim in ((0.352, 1.2 * mm), (BR1 - 0.024, 1.2 * mm)):   # clamp plates: titanium, pocketed; the front one a slim band (the struts pass it)
    cp = K.tmp(prism(circles_hull(BORES, RB + rim, 16), 'y', f0, f0 + 0.012))
    bevel(cp, 1.2 * mm, 2, 30)
    for x, z in BORES: cut(cp, cyl(RB + 0.05 * mm, f0 - 0.01, f0 + 0.022, 'y', (x, z), 16))
    for x, z in (((0, D + 9 * mm), (-D - 9 * mm, 0), (D + 9 * mm, 0), (-D * 0.95, ZB + 3 * mm), (D * 0.95, ZB + 3 * mm)) if rim > 3 * mm else ()):
        cut(cp, cyl(2.4 * mm, f0 - 0.01, f0 + 0.022, 'y', (x, z), 12))
    smooth(cp); K.adopt(cp, 'mag', TI, pm)

# ================================================== info and anchors ==================================================
info = {
    'sy': round(SY, 4), 'fSight': 0.017, 'relief': 0.10,
    'barrels': {'n': 6, 'rounds_each': ROUNDS, 'round_mm': [10, ROUND_L * 1000], 'free_bore_mm': round(FREE * 1000)},
    'muzzles': [[MZ1, round(z, 4), round(x, 4)] for x, z in BORES],
    'grip': [0.000, -0.105, 0], 'support': [0.330, -0.095, 0],
    'anim': {'front': 'part_pump', 'brk': 'part_brk', 'mag': 'part_mag'},
    'magAt': [MAG_AT[0], MAG_AT[1]],
}
anchors = {
    'mount_optic': [0.012, round(RAIL_TOP, 4), 0], 'mount_optic_end': [round(RAIL_F1 - 0.002, 4), round(RAIL_TOP, 4), 0],
    'mount_handguard': [CH1, 0, 0], 'mount_handguard_end': [HG1, 0, 0],
    'mount_barrel': [BR0, 0, 0], 'mount_muzzle': [MZ0, 0, 0],
    'mount_stock': [0, round((SR0 + SR1) / 2, 4), 0], 'mount_grip': [GRIP_SEAT[0], GRIP_SEAT[1], 0], 'mount_mag': [MAG_AT[0], MAG_AT[1], 0],
    'mount_tac': [round((TAC0 + TAC1) / 2, 4), -0.034, 0.027 + 0.0056], 'mount_tacL': [round((TAC0 + TAC1) / 2, 4), -0.034, -0.027 - 0.0056],
    'mount_fg': [round((FG0 + FG1) / 2, 4), round(FLOOR - 0.0056, 4), 0],
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
# ---- the reload's clearance: the block's top (its breech end's top edge and the barrels' tops) swept as the front drops OPEN degrees,
# then lifted along the cradle's up; nothing of it may come inside the rail beam's underside (the beam spans f 0.006 .. RAIL_F1) ----
def _rot(f, u, a, back=0.0):   # the block's point after the run forward (and `back` slid back off the seats), the forend dropped `a` degrees
    a = math.radians(a); df, du = f + SLIDE - back - HINGE[0], u - HINGE[1]
    return HINGE[0] + df * math.cos(a) + du * math.sin(a), HINGE[1] - df * math.sin(a) + du * math.cos(a)
TOPS = [(BR0 + i * 0.01, D + RB + 5 * mm) for i in range(15)]
up = (math.sin(math.radians(OPEN)), math.cos(math.radians(OPEN)))
inrail = lambda f: 0.006 <= f <= RAIL_F1
RAIL_CLEAR = 1.0
for t in range(0, 101):                                                    # the run forward (level)
    for f0, u0 in TOPS:
        if inrail(f0 + SLIDE * t / 100): RAIL_CLEAR = min(RAIL_CLEAR, RAIL_B - u0)
for a in range(0, int(OPEN) + 1):                                         # the drop
    for f0, u0 in TOPS:
        f, u = _rot(f0, u0, a)
        if inrail(f): RAIL_CLEAR = min(RAIL_CLEAR, RAIL_B - u)
for t in range(0, 101):                                                    # the slide back off the seats
    for f0, u0 in TOPS:
        f, u = _rot(f0, u0, OPEN, UNSEAT * t / 100)
        if inrail(f): RAIL_CLEAR = min(RAIL_CLEAR, RAIL_B - u)
for t in range(0, 101):                                                    # the lift
    for f0, u0 in TOPS:
        f, u = _rot(f0, u0, OPEN, UNSEAT); f += up[0] * t * 0.001; u += up[1] * t * 0.001
        if inrail(f): RAIL_CLEAR = min(RAIL_CLEAR, RAIL_B - u)
root['hinge_json'] = json.dumps({'sequence': [
    {'part': 'part_pump', 'move': [SLIDE, 0, 0], 'note': 'the muzzle device runs forward on its guide rods, drawing the barrel block out from under the rail'},
    {'part': 'part_brk', 'axis': 'x', 'at': [HINGE[0], HINGE[1], 0], 'rotate_deg': -OPEN, 'note': 'the forend drops on the fixed hinge'},
    {'part': 'part_mag', 'move': [-UNSEAT, 0, 0], 'frame': 'part_brk', 'note': 'the block slides back off the muzzle device\'s seats'},
    {'part': 'part_mag', 'move': [0, 0.10, 0], 'frame': 'part_brk', 'note': 'and lifts straight up out of the cradle'}]})

meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb_ = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
       [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
per = sorted(((tris_of([o]), o.name) for o in meshes), reverse=True)[:6]
result = {'rail_clear_mm': round(RAIL_CLEAR * 1000, 2), 'meshes': len(meshes), 'tris': tris_of(meshes), 'top': per, 'bounds_mm': [[round(x * 1000, 1) for x in b] for b in bb_],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
