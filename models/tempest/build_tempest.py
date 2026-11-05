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
#   BACK PANEL (base, titanium): small (85 mm): only the battery, the control board and the LCD; the buffer tube's boss on its rear face (mount_stock), the AR pistol
#     grip's seat under it (mount_grip), trigger and guard, a fire-mode dial, a screen on the rear face beside the tube (display_ammo:
#     the rounds left in each barrel), the hinge's outer knuckles at its front foot.
#   SIGHT RAIL (base): a low titanium beam from the back panel's top, 3 mm over the barrel block, 75 mm past the panel: for the reload the
#     front first runs forward on a carriage (part_pump) until the block's rear is out from under it, then drops on its hinge.
#   FRONT (part_brk: hinged under the back panel's front, between the grip and the foregrip; it drops for the reload, then the barrel
#     block is lifted up and out of it): the LOWER SUPPORT BODY (slot handguard, titanium): a cradle under and beside the barrels, side
#     rails (mount_tac, mount_tacL), a bottom rail for a foregrip (mount_fg), lightening slots, the hinge's centre knuckle; and the MUZZLE
#     DEVICE (slot muzzle, titanium): a six-bore block on two arms from the body, the barrels' muzzles seat in its rear face.
#   STOCK (slot stock): the buffer tube and a skeletal stock. GRIP (slot grip): an AR-pattern grip. OPTIC: low titanium irons.
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
MZ0, MZ1 = 0.560, 0.628        # the muzzle device
HG1 = 0.500                    # the lower body's front (its arms run on to the muzzle device)
RB, D, ZB = 8.5 * mm, 12.5 * mm, -26 * mm      # a barrel's radius; the 2 x 2's half spacing; the lower barrel's height
BORES = [(-D, D), (D, D), (0, 0), (-D, -D), (D, -D), (0, ZB)]
BORE = 5.0 * mm                                   # the bore's radius: the round's full width (10 mm)
OUT = circles_hull(BORES, RB + 5 * mm, 32)       # the block's plates' outline (x, z)
LOW = ZB - RB                                     # the lowest barrel's underside (-34.5 mm)
CH1 = 0.200                                       # the FIXED chassis's front: it runs on from the panel under the barrels to the hinge
HINGE = (CH1 - 0.002, -0.062)                     # (forward, up) of the hinge pin
OPEN = 25.0                                       # the front's drop for the reload, degrees
SLIDE = 0.085                                     # the front's run forward on its carriage before it drops (the block's rear clears the rail)
# the reload: the front (lower body, muzzle device and the barrel block in them) runs forward SLIDE on a carriage under the fixed chassis,
# so the barrel block's rear comes out from under the rail; then it drops OPEN degrees on the carriage's hinge, and the block lifts out.
# So the rail stays low, just over the block (checked below: RAIL_CLEAR, through the run, the drop and the lift)
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
# the CARRIAGE (part_pump: it runs forward SLIDE for the reload, carrying the front): a sled under the fixed chassis's floor whose lips
# wrap the floor's edges (it rides them like a dovetail), the hinge's two outer knuckles at its front (the body's centre knuckle between
# them), the pin through, flush caps
KN_R = 7 * mm
pcar = K.part('pump', (0, HINGE[0], HINGE[1]))
sl = K.tmp(box(-20 * mm, 20 * mm, CH1 - 0.092, CH1 - 0.022, -0.0595, -0.0542)); bevel(sl, 1 * mm, 2, 30); smooth(sl); K.adopt(sl, 'base', TI, pcar)
for s in (-1, 1):
    o = K.tmp(prism([(CH1 - 0.092, -0.0595), (CH1 - 0.022, -0.0595), (CH1 - 0.022, -0.046), (CH1 - 0.092, -0.046)], 'x', s * 27.2 * mm, s * 29 * mm))
    boolean(o, box(s * 20 * mm, s * 29 * mm, CH1 - 0.092, CH1 - 0.022, -0.0595, -0.0555), 'UNION')
    bevel(o, 0.8 * mm, 2, 30); smooth(o); K.adopt(o, 'base', TI, pcar)                               # its lip round the floor's edge
    kn = K.tmp(prism([(CH1 - 0.030, -0.0545), (HINGE[0], -0.0545), (HINGE[0], HINGE[1] - KN_R), (CH1 - 0.022, HINGE[1] - KN_R + 1 * mm)], 'x', s * 11 * mm, s * 25 * mm))
    boolean(kn, cyl(KN_R, s * 11 * mm, s * 25 * mm, 'x', HINGE, 28), 'UNION')
    bevel(kn, 1 * mm, 2, 30); cut(kn, cyl(3 * mm, -0.03, 0.03, 'x', HINGE, 18))
    smooth(kn); K.adopt(kn, 'base', TI, pcar)
    o = K.obj(cyl(4.2 * mm, s * 24.4 * mm, s * 25.3 * mm, 'x', HINGE, 20), 'base', 'steel', pcar); smooth(o)      # the pin's flush cap
o = K.obj(cyl(3 * mm, -24.5 * mm, 24.5 * mm, 'x', HINGE, 16), 'base', 'steel', pcar); smooth(o)                   # the pin
# the FIXED CHASSIS (base, titanium): from the panel's front to the hinge, under and beside the barrels' rear (the block's breech end
# lies in it); the carriage rides its floor
ch = K.tmp(prism([(BP1 - 0.004, -0.054), (CH1 - 0.006, -0.054), (CH1, -0.048), (CH1, 0.002), (CH1 - 0.008, 0.006), (BP1 - 0.004, 0.006)], 'x', -27 * mm, 27 * mm))
bevel(ch, 2 * mm, 2, 30)
cut(ch, prism(circles_hull(BORES, RB + 5.6 * mm, 24) + [(-RB - 5.6 * mm - D, 0.03), (RB + 5.6 * mm + D, 0.03)], 'y', BP1 - 0.01, CH1 + 0.01))   # its channel
# the same extrusion as the forend's rear: the cheeks down to a fluted side member, the floor up to a web (the hinge's leaves stay)
for s in (-1, 1):
    cut(ch, box(s * 19 * mm, s * 30 * mm, BP1 + 0.010, CH1 - 0.008, -0.034, 0.02))
    for z in (-0.0385, -0.0445):
        cut(ch, box(s * 26.3 * mm, s * 28 * mm, BP1 + 0.002, CH1 + 0.002, z - 1.2 * mm, z + 1.2 * mm))
    for f in (BP1 + 0.012, CH1 - 0.016):
        cut(ch, cyl(1.9 * mm, s * 25.6 * mm, s * 28 * mm, 'x', (f, -0.044), 12))                                              # counterbored screws
        o = K.obj(cyl(1.6 * mm, s * 25.9 * mm, s * 26.5 * mm, 'x', (f, -0.044), 10), 'base', 'black')
cut(ch, box(-9 * mm, 9 * mm, BP1 + 0.016, CH1 - 0.036, -0.06, -0.0365))   # a window through the floor
smooth(ch); K.adopt(ch, 'base', TI)
# the buffer tube's boss on the rear face, and the screen beside it (display_ammo: the game paints the rounds left per barrel)
o = K.obj(cyl(17 * mm, -0.010, 0.002, 'y', (0, 0), 28), 'base', TI); bevel(o, 1 * mm, 2); smooth(o)
scr = K.obj(box(-24 * mm, -10.5 * mm, -0.0012, 0.0005, 0.006, 0.024), 'base', 'glass'); scr.name = 'display_ammo'
o = K.obj(box(-25 * mm, -9.5 * mm, -0.0010, 0.004, 0.004, 0.026), 'base', 'rubber'); cut(o, box(-24 * mm, -10.5 * mm, -0.002, 0.005, 0.006, 0.024)); smooth(o)
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
picatinny(K, 0.012, RAIL_F1 - 0.002, RAIL_U, 'base', RAIL_M)
RAIL_TOP = RAIL_U + 5.6 * mm

# ================================================== IRONS (optic): low titanium sights at the rail's ends ==================================================
SY = RAIL_TOP + 13 * mm
o = K.tmp(prism([(0.016, RAIL_TOP), (0.040, RAIL_TOP), (0.036, SY + 3 * mm), (0.022, SY + 3 * mm)], 'x', -8 * mm, 8 * mm))
bevel(o, 0.8 * mm, 2); cut(o, cyl(1.6 * mm, 0.010, 0.050, 'y', (0, SY), 16)); cut(o, box(-5 * mm, 5 * mm, 0.010, 0.050, RAIL_TOP + 2 * mm, SY - 4 * mm))
smooth(o); K.adopt(o, 'optic', TI)
FS0 = RAIL_F1 - 0.026
o = K.tmp(prism([(FS0, RAIL_TOP), (FS0 + 0.022, RAIL_TOP), (FS0 + 0.018, SY + 4 * mm), (FS0 + 0.004, SY + 4 * mm)], 'x', -8 * mm, 8 * mm))
bevel(o, 0.8 * mm, 2); cut(o, box(-5.5 * mm, 5.5 * mm, FS0 - 0.01, FS0 + 0.03, SY - 4 * mm, SY + 5 * mm))
smooth(o); K.adopt(o, 'optic', TI)
o = K.obj(box(-0.9 * mm, 0.9 * mm, FS0 + 0.009, FS0 + 0.013, SY - 5 * mm, SY), 'optic', TI)
o = K.obj(cyl(0.8 * mm, FS0 + 0.0135, FS0 + 0.014, 'y', (0, SY - 0.8 * mm), 10), 'optic', 'tritium')

# ================================================== STOCK and GRIP ==================================================
o = K.obj(lathe([(-0.002, 14.5 * mm), (-0.008, 14.5 * mm), (-0.010, 15.5 * mm), (-0.014, 15.5 * mm), (-0.016, 14.5 * mm), (-0.205, 14.5 * mm), (-0.208, 13 * mm)], 24), 'stock', 'black')
for f in (-0.060, -0.090, -0.120, -0.150, -0.180):
    cut(o, cyl(1.8 * mm, -0.02, -0.01, 'z', (0, f), 10))
smooth(o)
st = K.tmp(prism([(-0.105, 0.018), (-0.270, 0.022), (-0.285, 0.020), (-0.288, -0.085), (-0.270, -0.088), (-0.250, -0.060), (-0.200, -0.030),
                  (-0.105, -0.022)], 'x', -16 * mm, 16 * mm))
bevel(st, 2 * mm, 2, 30)
cut(st, cyl(15.2 * mm, -0.30, -0.10, 'y', (0, 0), 24))
cut(st, prism([(-0.215, -0.030), (-0.262, -0.030), (-0.268, -0.072), (-0.255, -0.072)], 'x', -0.03, 0.03))
smooth(st); K.adopt(st, 'stock', 'polymer')
o = K.obj(prism([(-0.282, 0.024), (-0.300, 0.024), (-0.300, -0.090), (-0.282, -0.090)], 'x', -17 * mm, 17 * mm), 'stock', 'rubber'); bevel(o, 2 * mm, 2); smooth(o)
GRIP_SEAT = (0.006, -0.062)
gp = K.tmp(prism([(0.006, -0.060), (0.038, -0.060), (0.028, -0.083), (0.020, -0.093), (0.016, -0.108), (0.000, -0.160), (-0.028, -0.160),
                  (-0.034, -0.152), (-0.026, -0.108), (-0.018, -0.068)], 'x', -14 * mm, 14 * mm))
bevel(gp, 3 * mm, 3, 30); smooth(gp); K.adopt(gp, 'grip', 'stipple')

# ================================================== FRONT (part_brk): lower support body + muzzle device ==================================================
pbrk = K.part('brk', (0, HINGE[0], HINGE[1]))
pbrk.parent = pcar; pbrk.matrix_parent_inverse = pcar.matrix_world.inverted()          # (the front rides the carriage)
FLOOR, CH = -0.070, LOW - 1.5 * mm                       # the body's underside; the channel's floor (under the lowest barrel)
TAC0, TAC1, FG0, FG1 = HG1 - 0.140, HG1 - 0.012, HG1 - 0.200, HG1 - 0.012      # short rails where a light and a foregrip go
body = K.tmp(prism([(CH1 + 0.003, -0.054), (CH1 + 0.016, FLOOR), (HG1 - 0.010, FLOOR), (HG1, FLOOR + 0.010), (HG1, 0.006), (CH1 + 0.003, 0.006)],
                   'x', -27 * mm, 27 * mm))
bevel(body, 2 * mm, 3, 30)
cut(body, prism(circles_hull(BORES, RB + 1.5 * mm, 24) + [(-RB - 1.5 * mm - D, 0.03), (RB + 1.5 * mm + D, 0.03)], 'y', CH1 - 0.01, HG1 + 0.01))  # the cradle's channel
for s in (-1, 1):
    for i in range(4):   # lightening slots in the cheeks above the side rails
        f = CH1 + 0.040 + i * 0.068
        cut(body, prism(rounded(f, -0.010, 0.024, 0.0055, 3 * mm, 2), 'x', s * 18 * mm, s * 28 * mm))
    for i in range(6):   # and a row of pockets along the floor's sides
        f = CH1 + 0.030 + i * 0.048
        cut(body, prism(rounded(f, -0.061, 0.016, 0.004, 2 * mm, 2), 'x', s * 25.5 * mm, s * 28 * mm))
# behind the rails the body is an EXTRUSION, not a block: the cheeks cut down to a slim side member (a fluted profile, like extruded
# aluminium but titanium), the floor raised to a thin web under the channel, from just ahead of the knuckle to the rails
X0, X1 = CH1 + 0.020, TAC0 - 0.006
EXU = -0.034                                                        # the side members' top (just over the lowest barrels' axis)
for s_ in (-1, 1):
    cut(body, box(s_ * 19 * mm, s_ * 30 * mm, X0, X1, EXU, 0.02))
    for z in (EXU - 0.0045, EXU - 0.0105):                          # the extrusion's flutes along its outside
        cut(body, box(s_ * 26.3 * mm, s_ * 28 * mm, X0 - 0.004, X1 + 0.004, z - 1.2 * mm, z + 1.2 * mm))
cut(body, box(-0.03, 0.03, X0, FG0 - 0.008, FLOOR - 0.01, -0.050))   # the floor up to a web
cut(body, box(-9 * mm, 9 * mm, X0 + 0.010, FG0 - 0.018, -0.051, CH + 0.0005))   # and a long window through it
# the hinge's centre knuckle: a round boss on the body's rear foot between the panel's knuckles, bored for the pin
boolean(body, cyl(KN_R, -10.6 * mm, 10.6 * mm, 'x', HINGE, 28), 'UNION')
cut(body, box(-11 * mm, -10.6 * mm, CH1 - 0.02, CH1 + 0.02, -0.08, -0.04)); cut(body, box(10.6 * mm, 11 * mm, CH1 - 0.02, CH1 + 0.02, -0.08, -0.04))
cut(body, box(-25.5 * mm, -11 * mm, CH1 - 0.012, CH1 + 0.010, HINGE[1] - KN_R - 1 * mm, -0.050))   # (room for the outer knuckles)
cut(body, box(11 * mm, 25.5 * mm, CH1 - 0.012, CH1 + 0.010, HINGE[1] - KN_R - 1 * mm, -0.050))
cut(body, cyl(3.1 * mm, -0.03, 0.03, 'x', HINGE, 18))
smooth(body); K.adopt(body, 'handguard', TI, pbrk)
picatinny(K, TAC0, TAC1, -0.034, 'handguard', RAIL_M, pbrk, 'right', 27 * mm)
picatinny(K, TAC0, TAC1, -0.034, 'handguard', RAIL_M, pbrk, 'left', -27 * mm)
picatinny(K, FG0, FG1, FLOOR, 'handguard', RAIL_M, pbrk, 'bottom')
# the two arms from the body's front to the muzzle device: truss-webbed titanium
for s in (-1, 1):
    a = K.tmp(prism([(HG1 - 0.020, FLOOR + 0.004), (HG1 - 0.004, FLOOR + 0.004), (MZ0 + 0.012, -0.040), (MZ0 + 0.012, 0.006), (MZ0 - 0.010, 0.006), (HG1 - 0.020, -0.020)],
                    'x', s * 21 * mm, s * 27 * mm))
    bevel(a, 1.5 * mm, 2, 30)
    cut(a, prism([(HG1 + 0.006, -0.050), (HG1 + 0.040, -0.034), (HG1 + 0.006, -0.026)], 'x', -0.03, 0.03))
    cut(a, prism([(HG1 + 0.014, -0.016), (HG1 + 0.048, -0.040), (HG1 + 0.048, -0.004), (HG1 + 0.020, -0.004)], 'x', -0.03, 0.03))
    smooth(a); K.adopt(a, 'handguard', TI, pbrk)
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
smooth(mzd); K.adopt(mzd, 'muzzle', TI, pbrk)

# ================================================== BARREL BLOCK (part_mag, inside part_brk) ==================================================
MAG_AT = (BR0, 0.0)
pm = K.part('mag', (0, MAG_AT[0], MAG_AT[1]))
pm.parent = pbrk; pm.matrix_parent_inverse = pbrk.matrix_world.inverted()
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
for f0 in (0.352, BR1 - 0.024):   # clamp plates: titanium, pocketed between the barrels
    cp = K.tmp(prism(circles_hull(BORES, RB + 4.5 * mm, 16), 'y', f0, f0 + 0.012))
    bevel(cp, 1.2 * mm, 2, 30)
    for x, z in BORES: cut(cp, cyl(RB + 0.05 * mm, f0 - 0.01, f0 + 0.022, 'y', (x, z), 16))
    for x, z in ((0, D + 9 * mm), (-D - 9 * mm, 0), (D + 9 * mm, 0), (-D * 0.95, ZB + 3 * mm), (D * 0.95, ZB + 3 * mm)):
        cut(cp, cyl(2.4 * mm, f0 - 0.01, f0 + 0.022, 'y', (x, z), 12))
    smooth(cp); K.adopt(cp, 'mag', TI, pm)

# ================================================== info and anchors ==================================================
info = {
    'sy': round(SY, 4), 'fSight': 0.028, 'relief': 0.10,
    'muzzles': [[MZ1, round(z, 4), round(x, 4)] for x, z in BORES],
    'grip': [0.000, -0.105, 0], 'support': [0.330, -0.095, 0],
    'anim': {'carriage': 'part_pump', 'brk': 'part_brk', 'mag': 'part_mag'},
    'magAt': [MAG_AT[0], MAG_AT[1]],
}
anchors = {
    'mount_optic': [0.012, round(RAIL_TOP, 4), 0], 'mount_optic_end': [round(RAIL_F1 - 0.002, 4), round(RAIL_TOP, 4), 0],
    'mount_handguard': [CH1, 0, 0], 'mount_handguard_end': [HG1, 0, 0],
    'mount_barrel': [BR0, 0, 0], 'mount_muzzle': [MZ0, 0, 0],
    'mount_stock': [0, 0, 0], 'mount_grip': [GRIP_SEAT[0], GRIP_SEAT[1], 0], 'mount_mag': [MAG_AT[0], MAG_AT[1], 0],
    'mount_tac': [round((TAC0 + TAC1) / 2, 4), -0.034, 0.027 + 0.0056], 'mount_tacL': [round((TAC0 + TAC1) / 2, 4), -0.034, -0.027 - 0.0056],
    'mount_fg': [round((FG0 + FG1) / 2, 4), round(FLOOR - 0.0056, 4), 0],
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
# ---- the reload's clearance: the block's top (its breech end's top edge and the barrels' tops) swept as the front drops OPEN degrees,
# then lifted along the cradle's up; nothing of it may come inside the rail beam's underside (the beam spans f 0.006 .. RAIL_F1) ----
def _rot(f, u, a):   # about the hinge after the run forward
    a = math.radians(a); hf = HINGE[0] + SLIDE; df, du = f + SLIDE - hf, u - HINGE[1]
    return hf + df * math.cos(a) + du * math.sin(a), HINGE[1] - df * math.sin(a) + du * math.cos(a)
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
for t in range(0, 101):                                                    # the lift
    for f0, u0 in TOPS:
        f, u = _rot(f0, u0, OPEN); f += up[0] * t * 0.001; u += up[1] * t * 0.001
        if inrail(f): RAIL_CLEAR = min(RAIL_CLEAR, RAIL_B - u)
root['hinge_json'] = json.dumps({'sequence': [
    {'part': 'part_pump', 'move': [SLIDE, 0, 0], 'note': 'the front runs forward on its carriage: the block\'s rear comes out from under the rail'},
    {'part': 'part_brk', 'axis': 'x', 'at': [HINGE[0], HINGE[1], 0], 'rotate_deg': -OPEN, 'note': 'it drops on the carriage\'s hinge'},
    {'part': 'part_mag', 'move': [0, 0.10, 0], 'frame': 'part_brk', 'note': 'the barrel block lifts straight up out of the cradle'}]})

meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb_ = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
       [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
per = sorted(((tris_of([o]), o.name) for o in meshes), reverse=True)[:6]
result = {'rail_clear_mm': round(RAIL_CLEAR * 1000, 2), 'meshes': len(meshes), 'tris': tris_of(meshes), 'top': per, 'bounds_mm': [[round(x * 1000, 1) for x in b] for b in bb_],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
