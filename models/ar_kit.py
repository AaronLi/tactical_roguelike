# The shared builder of the AR family (AR-15 / AR-10 pattern guns): models/<id>/build_<id>.py set CFG and exec this. Each assembly
# (the lower, the upper, the charging handle, a stock, a grip, a handguard, the barrel, a muzzle device, the sights, a magazine) is
# its own function: a gun is the ones its CFG picks, seated on each other's anchors, so the M4's lower is the HK416's lower.
#
# Reference: the Mk 18 Mod 1 (CQBR) side-on studio photograph on IMFDB (MK18MOD1.jpg, 1672 x 558, right side, muzzle right): its
# outlines were read off it in photo pixels (the numbers below are those pixels), scaled from the A2 flash hider (22 mm across =
# 50 px) and checked against the 9.5" rail (239 mm measured, 241 mm real) and the buffer tube (28.4 mm measured, 29.2 mm real).
# The HK416's stock and grip: the HK416N photograph on Wikimedia Commons (HK416N.png, Dybdal, CC BY-SA 2.0; 1920 px wide, 0.487
# mm/px, its upper's rear at x 555, its bore at y 315). The M4's six-position stock: M4A1-flattop.png on Commons (public domain;
# 0.965 mm/px, its upper's rear at x 247, its bore at y 159.5).
#
# Frame (docs/models.md "Authored models"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the back of the upper
# receiver on the bore line (Mk 18 photo pixel x 490, y 117).
import bpy, json, math, os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = os.path.basename(HERE)
C = globals()['CFG']
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'

S = 0.437 * mm                          # metres per Mk 18 photo pixel
X0, Y0 = 490, 117                       # the origin: the upper's rear face, the bore line
RX, RY = C.get('rx', 1.0), C.get('ry', 1.0)    # the receivers' scale (an AR-10's are longer and a little taller)
def F(x): return (x - X0) * S * RX      # receiver pixels (scaled with the receivers)
def U(y): return (Y0 - y) * S * RY
def PL(pts): return [(F(x), U(y)) for x, y in pts]
def RL(pts, x0, y0, at):                # furniture pixels, unscaled, relative to the photo point (x0, y0), placed at `at` (forward, up)
    return [(at[0] + (x - x0) * S, at[1] + (y0 - y) * S) for x, y in pts]

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID
RCV = 'black'                            # anodised receivers and rails
FURN = C.get('furniture', 'polymer')
HW_UP, HW_LO = 11.3 * mm * RY, 11.0 * mm * RY
HW_MW = 14.3 * mm * RY                   # the magazine well's half width (wider than the trigger pocket: 28.6 mm across)
RAIL_U0 = U(61)                          # the flat-top rail's base (the receiver's top)
RAIL_TOP = RAIL_U0 + 5.6 * mm
UP_F1 = F(962)                           # the upper's front face
NUT_R = 16.5 * mm * RY                   # the barrel nut's radius (an AR-10's is larger)

def side_pair(fn):
    for s in (-1, 1): fn(s)

def xs(a, b): return tuple(sorted((a, b)))

# ===================================================================================== LOWER RECEIVER (base)
# a dedicated 9 mm lower's Glock well: raked like a Glock's grip (the magazine's bottom 20 degrees back of its top, the rounds lying level
# at its top), its back wall the trigger guard's front: the well's outer back passes through the guard's top front corner (photo 787, 242)
GRK = math.radians(20)
GD, GHM = 32.5 * mm, 11.15 * mm                 # (the magazine: its depth front to back, its half width)
GWO = GD / 2 + 0.6 * mm + 1.8 * mm              # (the shell's outer half depth, square to its axis: the magazine, clearance, the wall)
GHW = GHM + 0.6 * mm + 1.8 * mm                 # (its half width)
GFW = 8 * mm                                    # (the well set this far forward of the trigger guard's front at the top; a web fills between)
GDEP = 52 * mm                                  # (the well's depth below the magazine's top, square to it: its mouth well below the guard)
GT = (F(787) + GFW + GWO / math.cos(GRK) + (U(232) - U(242)) * math.tan(GRK), U(232))   # (the magazine's top, centred on its axis)
def grot(T):
    """The rake: turns what was built upright about the magazine's top T (its bottom goes back)."""
    return Matrix.Translation((0, T[0], T[1])) @ Matrix.Rotation(-GRK, 4, 'X') @ Matrix.Translation((0, -T[0], -T[1]))

def lower(mw='ar15'):
    """The AR-15 lower: buffer tower, pin bosses, the trigger pocket's sides, the magazine well with its flared lip and the magazine
    release's fence, the trigger guard, the controls. mw 'glock': a dedicated 9 mm lower instead, its well a narrow one fitted to a Glock
    magazine (no block, no AR-15 well), the lower's underside running flat ahead of it to the pivot lug. Returns its anchors."""
    # the side profile: the buffer tower, the takedown boss, the underside running flat under the tower then dropping steeply into the
    # grip (a concave fillet), the trigger pocket's floor, the magazine well's rear wall, its flared lip sloping up to the front, the
    # well's front and the pivot lug
    if mw == 'glock':
        lo = K.tmp(prism(PL([(476, 90), (500, 90), (502, 152), (945, 152), (962, 157), (967, 170), (962, 186), (950, 200), (945, 212), (930, 218), (900, 232),
                             (787, 242), (645, 242), (556, 242), (552, 228), (545, 216), (533, 207), (516, 202), (494, 201), (478, 193)]), 'x', -HW_LO, HW_LO))
    else:
        lo = K.tmp(prism(PL([(476, 90), (500, 90), (502, 152), (945, 152), (962, 157), (967, 170), (962, 186), (950, 200), (945, 212), (944, 268), (948, 278),
                             (787, 318), (785, 250), (771, 242), (645, 242), (556, 242), (552, 228), (545, 216), (533, 207), (516, 202), (494, 201), (478, 193)]), 'x', -HW_LO, HW_LO))
    bevel(lo, 0.9 * mm, 1, 30); smooth(lo); K.adopt(lo, 'base', RCV)
    if mw == 'glock':
        lower_glock_well(); lower_rest()
        return {'grip': (F(642), U(242)), 'mag': GT, 'stock': (0.0, 0.0)}
    lower_ar15_well(); lower_rest()
    return {'grip': (F(642), U(242)), 'mag': (F(866), U(232)), 'stock': (0.0, 0.0)}

def lower_glock_well():
    """The dedicated 9 mm lower's well: a narrow shell fitted to a Glock magazine, raked like a Glock's grip (built upright round the
    magazine, then turned about its top), set a little ahead of the trigger guard with a web filling between them, reaching on down past
    the guard; the mouth square to it, funnelled and lipped for a fast reload; the magazine catch's button behind its top on the right."""
    T0, T1 = GT; M = grot(GT)
    sh = K.tmp(box(-GHW, GHW, T0 - GWO, T0 + GWO, T1 - GDEP, T1 + 48 * mm))
    cut(sh, box(-GHM - 0.6 * mm, GHM + 0.6 * mm, T0 - GD / 2 - 0.6 * mm, T0 + GD / 2 + 0.6 * mm, T1 - 0.06, T1 + 0.06))
    cut(sh, prism([(T0 - GD / 2 - 0.6 * mm, T1 - GDEP + 7 * mm), (T0 + GD / 2 + 0.6 * mm, T1 - GDEP + 7 * mm), (T0 + GWO - 0.8 * mm, T1 - GDEP - 0.1 * mm), (T0 - GWO + 0.8 * mm, T1 - GDEP - 0.1 * mm)],
                  'x', -GHW + 0.8 * mm, GHW - 0.8 * mm))                                                    # (the mouth's funnel)
    sh.data.transform(M)
    boolean(sh, box(-0.05, 0.05, T0 - 0.1, T0 + 0.1, T1 - 0.2, U(154)), 'INTERSECT')                   # (its top inside the lower)
    bevel(sh, 1.0 * mm, 1, 30); smooth(sh); K.adopt(sh, 'base', RCV)
    for s_ in (-1, 1):   # the mouth's lip, standing out a little round its sides
        o = K.tmp(box(*xs(s_ * (GHW - 0.5 * mm), s_ * (GHW + 1.0 * mm)), T0 - GWO - 0.6 * mm, T0 + GWO + 0.6 * mm, T1 - GDEP - 0.6 * mm, T1 - GDEP + 6 * mm))
        o.data.transform(M); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    # the web: fills the wedge between the trigger guard's front (photo x 787) and the well's raked back, from the lower down to where they meet
    zb = U(242); fb = F(787) + GFW; dz = GFW / math.tan(GRK)
    o = K.tmp(prism([(F(787) - 1.0 * mm, zb + 1.0 * mm), (fb + 1.0 * mm, zb + 1.0 * mm), (F(787) - 1.0 * mm, zb - dz - 1.0 * mm / math.tan(GRK))], 'x', -GHW + 0.6 * mm, GHW - 0.6 * mm))
    bevel(o, 0.8 * mm, 1, 30); smooth(o); K.adopt(o, 'base', RCV)
    o = K.tmp(prism(rounded(F(787) - 6 * mm, U(212), 6 * mm, 8 * mm, 3 * mm, 3), 'x', HW_LO - 0.5 * mm, HW_LO + 1.6 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    o = K.obj(cyl(3.6 * mm, HW_LO + 1.2 * mm, HW_LO + 2.6 * mm, 'x', (F(787) - 6 * mm, U(212)), 16), 'base', 'steel'); smooth(o)        # the catch's button

def lower_ar15_well():
    # the magazine well: a wider shell round the well, from the lower's top edge down to its mouth, hollow for the magazine
    mw = K.tmp(prism(PL([(783, 154), (946, 154), (946, 268), (950, 278), (787, 318), (783, 300)]), 'x', -HW_MW, HW_MW))
    cut(mw, box(-HW_MW + 2.3 * mm, HW_MW - 2.3 * mm, F(789), F(940), U(330), U(232)))
    bevel(mw, 1.0 * mm, 1, 30); smooth(mw); K.adopt(mw, 'base', RCV)
    for s in (-1, 1):
        # the well's flared lip: a band round its mouth standing out a little
        o = K.tmp(prism(PL([(785, 304), (946, 264), (950, 276), (948, 282), (787, 320)]), 'x', *xs(s * (HW_MW - 0.5 * mm), s * (HW_MW + 1.2 * mm))))
        bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
        # the ridge along the well's top edge (both sides), running back over the magazine release
        o = K.tmp(prism(rounded(F(848), U(167), 97 * S, 9 * S, 6 * S, 3), 'x', *xs(s * (HW_MW - 0.5 * mm), s * (HW_MW + 1.0 * mm))))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    # the magazine release's fence (right): the vertical rib behind the well, the rim round the button, the button
    o = K.tmp(prism(rounded(F(808), U(222), 7 * S, 46 * S, 6.5 * S, 3), 'x', HW_MW - 0.5 * mm, HW_MW + 1.4 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    # (the button sits behind the well, on the lower's own side: its rim is a boss out to the well's face)
    o = K.tmp(prism(rounded(F(771), U(210), 21 * S, 25 * S, 7 * S, 3), 'x', HW_LO - 0.5 * mm, HW_MW + 1.4 * mm))
    cut(o, prism(rounded(F(771), U(210), 15 * S, 19 * S, 5 * S, 3), 'x', HW_MW - 1.5 * mm, HW_MW + 3 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    o = K.obj(cyl(4.3 * mm, HW_MW - 1.6 * mm, HW_MW + 0.2 * mm, 'x', (F(768), U(208)), 16), 'base', 'steel'); smooth(o)

def bolt_catch():
    """The bolt catch (left), behind the magazine well and over the trigger guard's front: a raised boss on the lower, the paddle (part_catch) pinned
    in it by a roll pin, its upper arm the release and its raised pad, cut across with serrations, the lock: a paddle about 10 x 25 mm whose pad
    stands 3.8 mm off the receiver. The catch is steel (phosphated) against the anodised lower. Its pivot is the pin; turned about it (the
    node's x), the catch's upper arm tips back as the bolt is held open (js/vmanim.ts). The right end of the pin shows in the lower's boss."""
    cx, cy = F(753), U(196)
    o = K.tmp(prism(rounded(cx, U(197), 10.5 * mm, 17 * mm * RY, 4.5 * mm, 3), 'x', -HW_LO - 0.9 * mm, -HW_LO + 0.5 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)   # (the boss)
    o = K.tmp(prism(rounded(cx, U(197), 3.0 * mm, 3.0 * mm, 1.4 * mm, 2), 'x', HW_LO - 0.5 * mm, HW_LO + 0.5 * mm)); smooth(o); K.adopt(o, 'base', 'steel')                         # (the pin's end, right)
    pc = K.part('catch', (0, cx, cy))
    o = K.tmp(prism(PL([(745, 167), (761, 167), (763, 175), (763, 198), (768, 202), (768, 223), (763, 229), (743, 229), (738, 223), (738, 202), (743, 198), (743, 175)]), 'x', -HW_LO - 1.9 * mm, -HW_LO - 0.4 * mm))
    bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', 'gunmetal', pc)                                                            # (the paddle: the release arm, the pad's wider foot)
    pad = K.tmp(prism(PL([(740, 203), (766, 203), (766, 222), (762, 227), (744, 227), (740, 222)]), 'x', -HW_LO - 3.8 * mm, -HW_LO - 1.5 * mm))
    for k in range(5): cut(pad, box(-HW_LO - 4.0 * mm, -HW_LO - 2.9 * mm, F(736), F(770), U(206.5 + 3.8 * k) - 0.9 * mm, U(206.5 + 3.8 * k)))
    bevel(pad, 0.35 * mm, 1); smooth(pad); K.adopt(pad, 'base', 'gunmetal', pc)                                                     # (the raised, serrated pad)
    o = K.obj(cyl(1.5 * mm, -HW_LO - 2.3 * mm, -HW_LO + 0.3 * mm, 'x', (cx, cy), 12), 'base', 'steel', pc); smooth(o)                  # (the roll pin)

def lower_rest():
    # the trigger guard: the rear post at the grip, the bar, the rounded front against the well; its opening rounded at the corners
    tg = K.tmp(prism(PL([(646, 242), (787, 242), (787, 302), (781, 315), (769, 321), (660, 321), (648, 314), (646, 302)]), 'x', -5.0 * mm, 5.0 * mm))
    cut(tg, prism(rounded(F(715), U(274), 53 * S, 31 * S, 14 * S, 4), 'x', -0.01, 0.01))
    bevel(tg, 1.2 * mm, 2, 30); smooth(tg); K.adopt(tg, 'base', RCV)
    for x, y in ((657, 313), (772, 312)):
        for s in (-1, 1): o = K.obj(cyl(1.6 * mm, *xs(s * 4.6 * mm, s * 5.3 * mm), 'x', (F(x), U(y)), 8), 'base', 'steel'); smooth(o)
    o = K.tmp(prism(PL([(712, 236), (722, 236), (727, 252), (730, 272), (729, 296), (723, 295), (720, 274), (716, 252)]), 'x', -2.4 * mm, 2.4 * mm))
    bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')                                                   # the trigger
    # the pins (both sides): takedown, pivot, hammer, trigger; the selector (its shaft's end right, its lever left); the bolt catch (left)
    for x, y, r in ((562, 175, 5.2), (958, 172, 4.5), (687, 213, 2.0), (735, 196, 2.0)):
        for s in (-1, 1):
            o = K.obj(cyl(r * mm, *xs(s * HW_LO, s * (HW_LO + 0.8 * mm)), 'x', (F(x), U(y)), 14 if r > 3 else 8), 'base', 'steel'); smooth(o)
    o = K.obj(cyl(5.5 * mm, HW_LO, HW_LO + 1.2 * mm, 'x', (F(620), U(202)), 16), 'base', RCV); smooth(o)
    o = K.tmp(prism(PL([(612, 196), (664, 192), (668, 202), (614, 210)]), 'x', -HW_LO - 1.8 * mm, -HW_LO)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    o = K.obj(cyl(5.5 * mm, -HW_LO - 1.2 * mm, -HW_LO, 'x', (F(620), U(202)), 16), 'base', RCV); smooth(o)
    bolt_catch()
    # the receiver extension (buffer tube), its castle nut and the end plate's sling loop
    o = K.obj(cyl(14.6 * mm, F(120), F(470), 'y', (0, 0), 24), 'base', RCV); smooth(o)
    cn = K.tmp(cyl(16.8 * mm, F(470), F(492), 'y', (0, 0), 24))
    for k in range(8):
        g = box(-2 * mm, 2 * mm, F(468), F(476), 15.0 * mm, 18 * mm); g.transform(Matrix.Rotation(k * math.pi / 4, 4, 'Y')); cut(cn, g)
    smooth(cn); K.adopt(cn, 'base', RCV)
    o = K.tmp(prism(PL([(474, 168), (492, 168), (494, 206), (486, 210), (474, 200)]), 'x', -3.5 * mm, 3.5 * mm))
    cut(o, prism(PL([(479, 176), (488, 176), (488, 200), (479, 198)]), 'x', -0.01, 0.01)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')

# ===================================================================================== UPPER RECEIVER (base)
def upper(fa=True, deflector=True, port=(755, 925)):
    """The flat-top upper: its section rounded at the shoulders, the bolt carrier's round housing standing out of its sides behind the
    port, the ejection port with its closed dust cover, the forward assist and the brass deflector; the rail on top."""
    prof = PL([(497, 150), (497, 66), (503, 61), (UP_F1 / (S * RX) + X0, 61), (UP_F1 / (S * RX) + X0, 152), (512, 152)])
    up = K.tmp(prism(prof, 'x', -HW_UP, HW_UP))
    sec = [(-HW_UP + 2.6 * mm, RAIL_U0 + 0.001), (HW_UP - 2.6 * mm, RAIL_U0 + 0.001), (HW_UP, RAIL_U0 - 5 * mm), (HW_UP, U(155)), (-HW_UP, U(155)), (-HW_UP, RAIL_U0 - 5 * mm)]
    boolean(up, prism(sec, 'y', -0.05, UP_F1 + 0.01), 'INTERSECT')
    boolean(up, cyl(HW_UP + 0.8 * mm, F(522), F(752), 'y', (0, U(122)), 28), 'UNION')                 # the bolt carrier's housing
    cut(up, box(HW_UP - 1.4 * mm, HW_UP + 2 * mm, F(port[0]), F(port[1]), U(140), U(92)))              # the ejection port's recess
    cut(up, box(-6.5 * mm, 6.5 * mm, F(490), F(586), RAIL_U0 - 3.5 * mm, RAIL_U0 + 0.01))               # the charging handle's channel
    bevel(up, 0.7 * mm, 1, 30); smooth(up); K.adopt(up, 'base', RCV)
    picatinny(K, F(586), UP_F1, RAIL_U0, 'base', RCV)
    # the dust cover (closed), its stiffening rib and the hinge rod along its foot
    o = K.tmp(box(HW_UP - 1.2 * mm, HW_UP - 0.2 * mm, F(port[0] + 2), F(port[1] - 2), U(141), U(91))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    o = K.tmp(box(HW_UP - 0.4 * mm, HW_UP + 0.6 * mm, F(port[0] + 45), F(port[1] - 45), U(122), U(112))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    o = K.obj(cyl(1.3 * mm, F(port[0] - 3), F(port[1] + 3), 'y', (HW_UP - 0.3 * mm, U(143)), 8), 'base', 'steel'); smooth(o)
    if deflector:
        o = K.tmp(prism(PL([(722, 126), (722, 74), (736, 70), (752, 90), (752, 126)]), 'x', HW_UP - 0.5 * mm, HW_UP + 4.5 * mm)); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'base', RCV)
    if fa:   # the forward assist: its housing out of the upper's right shoulder, its plunger's grooved button facing back
        o = K.obj(lathe([(F(698), 8.0 * mm), (F(738), 8.0 * mm), (F(750), 5.5 * mm)], 18, (HW_UP - 0.5 * mm, 0, U(93))), 'base', RCV); smooth(o)
        bt = K.tmp(cyl(6.8 * mm, F(684), F(699), 'y', (HW_UP - 0.5 * mm, U(93)), 18))
        for k in range(3): cut(bt, box(HW_UP - 8 * mm, HW_UP + 8 * mm, F(686 + 4 * k), F(686 + 4 * k) + 0.6 * mm, U(93) + 6.0 * mm, U(93) + 8 * mm))
        smooth(bt); K.adopt(bt, 'base', 'steel')
    # the barrel nut (the upper's front)
    o = K.obj(lathe([(UP_F1 - 0.5 * mm, NUT_R), (UP_F1 + 0.016, NUT_R)], 24), 'base', 'park'); smooth(o)

# ===================================================================================== CHARGING HANDLE (part_ch)
def charging_handle():
    pch = K.part('ch', (0, F(511), U(65)))
    o = K.tmp(prism(PL([(511, 79), (511, 58), (517, 52), (561, 52), (567, 58), (567, 79)]), 'x', -6.2 * mm, 6.2 * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', RCV, pch)
    o = K.tmp(prism([(-17 * mm, F(511)), (17 * mm, F(511)), (14 * mm, F(524)), (-14 * mm, F(524))], 'z', U(76), U(57)))
    bevel(o, 1.2 * mm, 2, 30); smooth(o); K.adopt(o, 'base', RCV, pch)                                                # its T handle
    o = K.tmp(prism([(-21 * mm, F(511) + 1 * mm), (-14 * mm, F(511)), (-14 * mm, F(530)), (-21 * mm, F(524))], 'z', U(74), U(60)))
    bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'base', RCV, pch)                                                    # the latch (left)
    return [F(512), U(60), 0]

# ===================================================================================== STOCKS (factory: stock)
def stock_sopmod():
    """A SOPMOD-pattern stock (the Mk 18's): a deep body round the buffer tube, battery tubes either side of the cheek, a sling slot,
    the adjustment lever under it, a rubber butt pad."""
    HWs = 13.5 * mm
    pts = [(14, 96), (24, 88), (60, 86), (440, 84), (444, 120), (440, 191), (424, 200), (404, 237), (332, 247), (210, 303), (150, 304), (100, 339), (70, 364),
           (48, 379), (26, 378), (16, 366), (12, 325)]
    st = K.tmp(prism([((x - X0) * S, (Y0 - y) * S) for x, y in pts], 'x', -HWs, HWs))
    for s_ in (-1, 1):   # below the housing round the tube the body narrows to a web (a step down each side)
        cut(st, prism([((x - X0) * S, (Y0 - y) * S) for x, y in [(30, 200), (430, 200), (430, 400), (30, 400)]], 'x', *xs(s_ * 8.5 * mm, s_ * (HWs + 1 * mm))))
    cut(st, cyl(14.9 * mm, -0.3, -0.005, 'y', (0, 0), 24))
    cut(st, prism(rounded((152 - X0) * S, (Y0 - 182) * S, 38 * S, 6 * S, 5 * S, 3), 'x', -0.03, 0.03))                 # the sling slot
    bevel(st, 1.6 * mm, 2, 30); smooth(st); K.adopt(st, 'stock', FURN)
    for s in (-1, 1):   # the battery tubes, their caps at the back
        o = K.tmp(lathe([((70 - X0) * S, 0.0005), ((70 - X0) * S + 2 * mm, 8.0 * mm), ((398 - X0) * S, 8.0 * mm), ((404 - X0) * S, 0.0005)], 16, (s * 11.5 * mm, 0, (Y0 - 112) * S)))
        smooth(o); K.adopt(o, 'stock', FURN)
        o = K.tmp(lathe([((58 - X0) * S, 0.0005), ((58 - X0) * S, 7.0 * mm), ((70 - X0) * S + 1 * mm, 8.3 * mm), ((70 - X0) * S + 1 * mm, 0.0005)], 16, (s * 11.5 * mm, 0, (Y0 - 112) * S)))
        smooth(o); K.adopt(o, 'stock', 'rubber')
    o = K.tmp(prism([((x - X0) * S, (Y0 - y) * S) for x, y in [(16, 96), (60, 92), (60, 378), (26, 378), (16, 366)]], 'x', -HWs, HWs)); bevel(o, 1.6 * mm, 2, 30); smooth(o); K.adopt(o, 'stock', FURN)
    o = K.tmp(prism([((x - X0) * S, (Y0 - y) * S) for x, y in [(6, 112), (16, 96), (16, 368), (6, 330)]], 'x', -HWs - 0.5 * mm, HWs + 0.5 * mm))
    bevel(o, 1.2 * mm, 2, 30); smooth(o); K.adopt(o, 'stock', 'rubber')
    o = K.tmp(prism([((x - X0) * S, (Y0 - y) * S) for x, y in [(306, 252), (332, 250), (330, 266), (306, 266)]], 'x', -5 * mm, 5 * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'stock', FURN)

def stock_m4(dx=-0.024):
    """The six-position carbine stock (from M4A1-flattop.png: 0.965 mm/px, its upper's rear at x 247, bore y 159.5; the photo has it
    collapsed, its front at x 236), drawn out `dx` (one position) along the tube: a round sleeve over the tube with two rows of slots
    down each side, a narrower web below it sweeping down to the toe, the sling slot, the adjustment lever under the front, a butt plate."""
    S2, X2, Y2 = 0.965 * mm, 247, 159.5
    P2 = lambda pts: [((x - X2) * S2 + dx, (Y2 - y) * S2) for x, y in pts]
    V = lambda y: (Y2 - y) * S2
    HW = 19.0 * mm
    pts = [(34, 140), (40, 138), (232, 139), (236, 143), (236, 190), (232, 196), (210, 197), (208, 222), (190, 224), (160, 228), (130, 236), (112, 240),
           (106, 246), (104, 258), (92, 272), (76, 288), (60, 300), (48, 306), (40, 304), (38, 280), (35, 210)]
    st = K.tmp(prism(P2(pts), 'x', -HW, HW))
    # the section: the sleeve round over the top, straight sides below it
    boolean(st, prism([(-11 * mm, V(137) + 0.002), (11 * mm, V(137) + 0.002), (17 * mm, V(144)), (HW, V(154)), (HW, V(320)), (-HW, V(320)), (-HW, V(154)), (-17 * mm, V(144))],
                      'y', -0.4, 0.1), 'INTERSECT')
    # below the sleeve the body steps in to a web, flaring back out to the full width at the butt
    for sg in (-1, 1):
        cut(st, prism(P2([(100, 194), (240, 194), (240, 330), (100, 330)]), 'x', *xs(sg * 13.5 * mm, sg * (HW + 1 * mm))))
        cut(st, prism(P2([(66, 330), (100, 204), (101, 204), (101, 330)]), 'x', *xs(sg * 13.5 * mm, sg * (HW + 1 * mm))))
        # the two rows of slots along the sleeve
        for x0, x1 in ((46, 76), (82, 116), (122, 156), (162, 194), (200, 230)):
            for y0, y1 in ((164, 171), (176, 183)):
                cut(st, prism(rounded((x0 + x1) / 2 * S2 - X2 * S2 + dx, V((y0 + y1) / 2), (x1 - x0) / 2 * S2, (y1 - y0) / 2 * S2, 3 * S2, 3), 'x', *xs(sg * (HW - 1.6 * mm), sg * (HW + 1 * mm))))
    cut(st, cyl(14.9 * mm, -0.4, 0.0, 'y', (0, 0), 24))                                                                  # the tube's bore
    cut(st, prism(rounded((44 + 88) / 2 * S2 - X2 * S2 + dx, V(197), 22 * S2, 4 * S2, 3.5 * S2, 3), 'x', -0.03, 0.03))     # the sling slot
    bevel(st, 1.4 * mm, 2, 30); smooth(st); K.adopt(st, 'stock', FURN)
    # the butt plate: a thin plate across the back, a little proud
    o = K.tmp(prism(P2([(31, 142), (36, 139), (38, 139), (40, 304), (36, 306), (34, 300)]), 'x', -HW - 0.3 * mm, HW + 0.3 * mm)); bevel(o, 1.0 * mm, 2, 30); smooth(o); K.adopt(o, 'stock', FURN)
    # the adjustment lever: a housing under the front of the web, the lever hanging below it, its pin
    o = K.tmp(prism(P2([(160, 222), (200, 220), (200, 232), (164, 234)]), 'x', -6 * mm, 6 * mm)); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'stock', FURN)
    o = K.tmp(prism(P2([(166, 230), (176, 230), (178, 246), (168, 248)]), 'x', -4 * mm, 4 * mm)); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'stock', FURN)
    o = K.obj(cyl(1.4 * mm, -6.4 * mm, 6.4 * mm, 'x', P2([(194, 226)])[0], 10), 'stock', 'steel'); smooth(o)

def stock_hk():
    """The HK416's slim stock (from HK416N.png: 0.487 mm/px, its upper's rear at x 555, bore y 315)."""
    S3, X3, Y3 = 0.487 * mm, 555, 315
    P3 = lambda pts: [((x - X3) * S3, (Y3 - y) * S3) for x, y in pts]
    pts = [(12, 346), (16, 318), (24, 293), (36, 277), (48, 256), (56, 254), (84, 251), (100, 244), (108, 248), (120, 266), (452, 269), (452, 365), (404, 368),
           (388, 379), (376, 401), (372, 411), (360, 417), (300, 416), (264, 419), (200, 473), (140, 525), (128, 530), (72, 530), (28, 526), (20, 498), (16, 480), (12, 452)]
    st = K.tmp(prism(P3(pts), 'x', -16 * mm, 16 * mm))
    cut(st, cyl(14.9 * mm, -0.3, 0.0, 'y', (0, 0), 24))
    for k in range(5):   # the stepped ribs down its butt
        f0 = (30 + k * 18 - X3) * S3
        for s in (-1, 1): cut(st, box(*xs(s * 14.5 * mm, s * 17 * mm), f0, f0 + 9 * S3, (Y3 - 520) * S3, (Y3 - 300) * S3))
    cut(st, prism(P3([(180, 330), (330, 330), (330, 385), (250, 400), (190, 440)]), 'x', -0.03, 0.03))                   # the lightening window
    bevel(st, 1.4 * mm, 2, 30); smooth(st); K.adopt(st, 'stock', FURN)
    o = K.tmp(prism(P3([(8, 330), (22, 300), (22, 527), (10, 470)]), 'x', -16.5 * mm, 16.5 * mm)); bevel(o, 1.2 * mm, 2, 30); smooth(o); K.adopt(o, 'stock', 'rubber')

# ===================================================================================== GRIPS (factory: grip)
def grip_a2(at):
    """The A2 grip, `at` its front top (the lower's photo point 642, 242): its front falling straight to the finger swell, the swell, the
    back sweeping down to the heel; polymer, a chequered panel let into each side."""
    pts = [(556, 242), (642, 242), (645, 248), (645, 320), (636, 330), (628, 334), (624, 350), (622, 366), (613, 373), (600, 379), (585, 404), (572, 430),
           (568, 466), (560, 473), (450, 452), (442, 443), (500, 349), (522, 339), (535, 307), (545, 290), (553, 265)]
    gp = K.tmp(prism(RL(pts, 642, 242, at), 'x', -12.5 * mm, 12.5 * mm))
    # its section: as narrow as the lower where it meets it, swelling into the palm below (seen from behind, a narrow neck over a fuller body)
    T = at[1]
    boolean(gp, prism([(-10.4 * mm, T + 0.01), (10.4 * mm, T + 0.01), (10.4 * mm, T - 6 * mm), (12.5 * mm, T - 24 * mm), (12.5 * mm, T - 0.2), (-12.5 * mm, T - 0.2),
                       (-12.5 * mm, T - 24 * mm), (-10.4 * mm, T - 6 * mm)], 'y', -0.3, 0.3), 'INTERSECT')
    bevel(gp, 2.2 * mm, 2, 30); smooth(gp); K.adopt(gp, 'grip', FURN)
    panel = [(543, 300), (632, 300), (627, 330), (620, 352), (612, 366), (598, 372), (582, 398), (569, 425), (564, 452), (470, 440), (502, 362), (524, 343)]
    for s in (-1, 1):
        o = K.tmp(prism(RL(panel, 642, 242, at), 'x', *xs(s * 12.2 * mm, s * 12.6 * mm))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'grip', 'stipple')

def grip_mod(at):
    """A modern polymer grip, `at` its front top (the lower's photo point 642, 242): no finger swell, a straight front strap a little
    more upright than the A2's, a beavertail tucked under the lower's tang over the web of the hand, a palm swell, a storage core with a
    cap at the bottom and a textured panel recessed into each side."""
    pts = [(642, 242), (645, 250), (644, 300), (636, 338), (618, 380), (598, 422), (584, 452), (578, 464),
           (470, 450), (466, 440), (488, 400), (508, 360), (524, 322), (533, 290), (536, 262), (530, 250),
           (523, 236), (524, 224), (531, 215), (540, 212), (547, 218), (553, 230), (556, 242)]
    gp = K.tmp(prism(RL(pts, 642, 242, at), 'x', -12.6 * mm, 12.6 * mm))
    T = at[1]
    # its section: the lower's width at the top, a palm swell below, narrowing a little toward the cap; the beavertail thinner still
    boolean(gp, prism([(-10.4 * mm, T + 0.02), (10.4 * mm, T + 0.02), (10.4 * mm, T - 5 * mm), (12.6 * mm, T - 30 * mm), (12.6 * mm, T - 70 * mm),
                       (11.6 * mm, T - 0.2), (-11.6 * mm, T - 0.2), (-12.6 * mm, T - 70 * mm), (-12.6 * mm, T - 30 * mm), (-10.4 * mm, T - 5 * mm)], 'y', -0.3, 0.3), 'INTERSECT')
    tl = RL([(538, 266), (530, 250), (520, 236), (521, 222), (530, 210), (542, 208), (552, 222), (560, 246), (560, 266)], 642, 242, at)
    for s in (-1, 1): cut(gp, prism(tl, 'x', *xs(s * 9.0 * mm, s * 14 * mm)))
    # the textured panels: let into each side (recessed 0.4 mm), so they sit flush with the moulding's edge
    panel = [(550, 300), (634, 300), (628, 336), (612, 372), (594, 410), (580, 438), (488, 428), (504, 392), (520, 352), (532, 318)]
    for s in (-1, 1): cut(gp, prism(RL(panel, 642, 242, at), 'x', *xs(s * 11.9 * mm, s * 13 * mm)))
    bevel(gp, 2.8 * mm, 3, 30); smooth(gp); K.adopt(gp, 'grip', FURN)
    for s in (-1, 1):
        o = K.tmp(prism(RL(panel, 642, 242, at), 'x', *xs(s * 11.5 * mm, s * 12.15 * mm))); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'grip', 'stipple')
    # the storage core's cap: a plug in the bottom, a finger notch at its rear
    cap = K.tmp(prism(RL([(578, 464), (575, 474), (568, 479), (480, 465), (472, 458), (470, 450)], 642, 242, at), 'x', -11.0 * mm, 11.0 * mm))
    cut(cap, prism(RL([(500, 470), (486, 467), (484, 458), (500, 460)], 642, 242, at), 'x', -4 * mm, 4 * mm))
    bevel(cap, 1.6 * mm, 2, 30); smooth(cap); K.adopt(cap, 'grip', 'rubber')

def grip_hk(at):
    """The HK416's grip (from HK416N.png), its front top seated at `at`."""
    S3 = 0.487 * mm
    pts = [(578, 456), (640, 470), (632, 499), (624, 536), (616, 547), (600, 588), (592, 610), (588, 634), (580, 642), (560, 645), (500, 645), (480, 642), (474, 630),
           (476, 593), (488, 557), (520, 498), (552, 459)]
    gp = K.tmp(prism([(at[0] + (x - 640) * S3, at[1] + (470 - y) * S3) for x, y in pts], 'x', -13 * mm, 13 * mm))
    bevel(gp, 2.4 * mm, 2, 30); smooth(gp); K.adopt(gp, 'grip', 'stipple')

# ===================================================================================== HANDGUARDS (factory: handguard)
HB_T, HB_B, HB_X = RAIL_U0, U(166), 19.6 * mm         # a quad rail's body: top (flush with the receiver's rail), bottom, half width
def handguard_quad(f0, f1, hk=False):
    """A free-floated quad rail (the Mk 18's RIS II; hk: the HK416's): an eight-sided tube, a Picatinny rail on each of its four
    faces, rows of round and oval lightening holes along its bevelled corners, crossbolt heads at its front."""
    HC = (HB_T + HB_B) / 2
    ch = 7 * mm if not hk else 4 * mm
    sec = [(-HB_X, HB_T - ch), (-HB_X + ch, HB_T), (HB_X - ch, HB_T), (HB_X, HB_T - ch), (HB_X, HB_B + ch), (HB_X - ch, HB_B), (-HB_X + ch, HB_B), (-HB_X, HB_B + ch)]
    hg = K.tmp(prism(sec, 'y', f0, f1))
    cut(hg, cyl(14.0 * mm, f0 - 0.01, f1 + 0.01, 'y', (0, 0), 24))
    n = int((f1 - f0 - 0.030) / 0.0262)
    for k in range(n):   # round holes high, oval holes low, along each bevelled corner
        f = f0 + 0.020 + k * 0.0262
        for sx in (-1, 1):
            for sz in (-1, 1):
                if hk: g = prism(rounded(f + 0.006, 0.0, 7 * mm, 1.6 * mm, 1.5 * mm, 2), 'x', -0.004, 0.004)
                elif sz > 0: g = cyl(2.8 * mm, -0.004, 0.004, 'x', (f + 0.006, 0.0), 12)
                else: g = prism(rounded(f + 0.006, 0.0, 4.8 * mm, 2.6 * mm, 2.5 * mm, 3), 'x', -0.004, 0.004)
                g.transform(Matrix.Translation((sx * (HB_X - ch / 2), 0, HC + sz * (HB_T - HC - ch / 2))) @ Matrix.Rotation(sx * sz * math.pi / 4, 4, 'Y'))
                cut(hg, g)
    bevel(hg, 0.6 * mm, 1, 30); smooth(hg); K.adopt(hg, 'handguard', RCV)
    picatinny(K, f0, f1 - 2 * mm, HB_T, 'handguard', RCV)
    picatinny(K, f0 + 0.010, f1 - 2 * mm, HB_B, 'handguard', RCV, axis='bottom')
    for s, ax in ((1, 'right'), (-1, 'left')): picatinny(K, f0 + 0.012, f1 - 2 * mm, HC, 'handguard', RCV, axis=ax, x0=s * HB_X)
    for s in (-1, 1):   # the front crossbolts' heads
        o = K.obj(cyl(3.6 * mm, *xs(s * (HB_X + 5.6 * mm), s * (HB_X + 6.4 * mm)), 'x', (f1 - 6 * mm, HC - 2 * mm), 14), 'handguard', 'steel'); smooth(o)
    return HB_B

def handguard_mlok(f0, f1, mat=None, sc=1.0):
    """A free-floated M-LOK handguard (after the Midwest Industries / Aero Precision pattern in the Crane comparison sheet,
    KeyMod_and_M-LOK_handguards.png on Commons): an eight-sided aluminium tube flush with the receiver's rail (a slim, nearly round section), a Picatinny rail its full
    length on top, a row of small round lightening holes along each upper bevel, M-LOK slots (32 x 7 mm on a 40 mm pitch) down each side,
    each lower bevel (staggered half a pitch) and the bottom; at the rear a clamp (a ring bored to the barrel nut, split underneath, two screws across a lug below the nut) and a QD sling
    socket each side; the front edge chamfered."""
    mat = mat or RCV
    # its section, after the commercial slim M-LOK tubes (Aero's ATLAS S-ONE and Enhanced Gen 2 side-on: the upper bevels, the side flats
    # and the lower bevels each about a third of its height): taller than wide, a narrow top flat under the rail, steep upper bevels down to
    # short side flats, long lower bevels in to a narrow bottom flat; nearly round in the hand
    T, B, W = HB_T, -19.0 * mm * sc, 19.0 * mm * sc                    # top (the receiver's rail base), bottom, half width
    C = (8.0 * mm * sc, 15.0 * mm * sc, 10.0 * mm * sc, 15.0 * mm * sc)  # the bevels: upper (across, down), lower (across, up)
    CI = tuple(c - 1.1 * mm for c in C)                                  # (the bore's, 2.6 mm in)
    def octo(t, b, w, c):
        ux, uz, lx, lz = c
        return [(-w + ux, t), (w - ux, t), (w, t - uz), (w, b + lz), (w - lx, b), (-w + lx, b), (-w, b + lz), (-w, t - uz)]
    hg = K.tmp(prism(octo(T, B, W, C), 'y', f0, f1))
    cut(hg, prism(octo(T - 2.6 * mm, B + 2.6 * mm, W - 2.6 * mm, CI), 'y', f0 - 0.01, f1 + 0.01))   # (hollow: 2.6 mm walls)
    def face_cut(a, b, f, ln, wd, r=None, depth=6 * mm):
        """A slot ln long, wd across, through the face from section point a to b, centred along it, its centre at forward f."""
        ax, az = a; bx, bz = b
        tx, tz = bx - ax, bz - az; n_ = math.hypot(tx, tz); tx, tz = tx / n_, tz / n_
        nx, nz = tz, -tx                                                      # (the face's outward normal, the octagon wound anticlockwise)
        if nx * (ax + bx) + nz * (az + bz - (T + B)) < 0: nx, nz = -nx, -nz
        if nx * tz - nz * tx < 0: tx, tz = -tx, -tz                           # (keep the frame right-handed)
        cx, cz = (ax + bx) / 2, (az + bz) / 2
        g = prism(rounded(f, 0.0, ln / 2, wd / 2, (r or wd / 2) * 0.98, 4), 'x', -depth, depth)
        g.transform(Matrix(((nx, 0, tx, cx), (0, 1, 0, 0), (nz, 0, tz, cz), (0, 0, 0, 1))))
        return g
    P = octo(T, B, W, C)
    faces = {'ubR': (P[1], P[2]), 'sR': (P[2], P[3]), 'lbR': (P[3], P[4]), 'bot': (P[4], P[5]), 'lbL': (P[5], P[6]), 'sL': (P[6], P[7]), 'ubL': (P[7], P[0])}
    CL = 0.030                                                                # (the clamp: the rear 30 mm, no slots)
    n = int((f1 - f0 - CL - 0.010 + 0.008) / 0.040)
    for k in range(n):
        f = f0 + CL + 0.016 + k * 0.040
        for nm in ('sR', 'sL', 'bot'): cut(hg, face_cut(*faces[nm], f, 32 * mm, 7 * mm))
        if f + 0.020 + 0.016 < f1 - 0.010:
            for nm in ('lbR', 'lbL'): cut(hg, face_cut(*faces[nm], f + 0.020, 32 * mm, 7 * mm))
    k, f = 0, f0 + CL + 0.004                                                 # the round holes along the upper bevels, every 20 mm
    while f < f1 - 0.010:
        for nm in ('ubR', 'ubL'): cut(hg, face_cut(*faces[nm], f, 4.4 * mm, 4.4 * mm))
        f += 0.020
    # the clamp: the rear 18 mm (over the barrel nut, r 16.5 at the bore) a solid ring bored to the nut, split along the bottom, the
    # split's two jaws a lug under the tube; two socket-head screws across the lug, below the nut, pull the split shut on it
    CJ, NR = 0.018, NUT_R + 0.2 * mm                                                 # (the clamp's length; its bore, the nut's radius and a hair)
    SPL = box(-0.8 * mm, 0.8 * mm, f0 - 0.01, f0 + CJ + 4 * mm, B - 0.01, -NR + 1.0 * mm)
    cut(hg, SPL.copy())
    bevel(hg, 0.5 * mm, 1, 30); smooth(hg); K.adopt(hg, 'handguard', mat)
    ring = K.tmp(prism(octo(T - 2.6 * mm, B + 2.6 * mm, W - 2.6 * mm, CI), 'y', f0, f0 + CJ))
    cut(ring, cyl(NR, f0 - 0.01, f0 + CJ + 0.01, 'y', (0, 0), 40), SPL.copy())
    smooth(ring); K.adopt(ring, 'handguard', mat)
    LZ0, LZ1, LX = B - 6.0 * mm, B + 0.5 * mm, 7.5 * mm                       # (the lug: its bottom, top (inside the tube's wall), half width)
    SZ, SFQ = B - 2.8 * mm, (0.0045, 0.0130)                                 # (the screws: height, positions back to front over the nut)
    lug = K.tmp(prism([(-LX, LZ1), (LX, LZ1), (LX, LZ0 + 1.5 * mm), (LX - 1.5 * mm, LZ0), (-LX + 1.5 * mm, LZ0), (-LX, LZ0 + 1.5 * mm)], 'y', f0, f0 + CJ))
    cut(lug, *[SPL] + [cyl(1.6 * mm, -LX - 0.01, LX + 0.01, 'x', (f0 + q, SZ), 12) for q in SFQ]
             + [cyl(2.9 * mm, LX - 2.6 * mm, LX + 0.01, 'x', (f0 + q, SZ), 18) for q in SFQ])      # (bores; the heads' counterbores, right)
    bevel(lug, 0.5 * mm, 1, 30); smooth(lug); K.adopt(lug, 'handguard', mat)
    for q in SFQ:                                                              # the screws: socket heads sunk in the right jaw, the threaded
        o = K.tmp(cyl(2.6 * mm, LX - 2.6 * mm, LX - 0.3 * mm, 'x', (f0 + q, SZ), 18))   # ends flush in the left
        hx = prism([(f0 + q + 1.25 * mm * math.cos(math.pi / 3 * j), SZ + 1.25 * mm * math.sin(math.pi / 3 * j)) for j in range(6)], 'x', LX - 1.5 * mm, LX)
        cut(o, hx); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'handguard', 'steel')
        o = K.obj(cyl(1.6 * mm, -LX - 0.05 * mm, -LX + 1.0 * mm, 'x', (f0 + q, SZ), 12), 'handguard', 'steel'); smooth(o)
    for s in (-1, 1):                                                          # the QD sockets: a boss on each side face, its cup
        o = K.tmp(cyl(6.5 * mm, *xs(s * (W - 0.5 * mm), s * (W + 1.6 * mm)), 'x', (f0 + 0.016, (T - C[1] + B + C[3]) / 2), 24))
        cut(o, cyl(3.6 * mm, *xs(s * (W - 1.0 * mm), s * (W + 2.0 * mm)), 'x', (f0 + 0.016, (T - C[1] + B + C[3]) / 2), 20))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'handguard', mat)
    picatinny(K, f0, f1 - 1.5 * mm, T, 'handguard', mat)
    return B

def handguard_carbine(f0, f1):
    """The M4's two-piece carbine handguard: the delta ring and its slip ring round the barrel nut at the rear, the round ribbed body
    tapering a little to the front cap against the front sight base, split along each side, a row of oval vents along each upper
    shoulder; hollow (its heat shields). Returns its bottom."""
    R0 = R1 = 23.0 * mm
    o = K.tmp(lathe([(f0, 0.0005), (f0, 23.0 * mm), (f0 + 2 * mm, 26.0 * mm), (f0 + 11 * mm, 26.0 * mm), (f0 + 12 * mm, 24.5 * mm), (f0 + 12 * mm, 0.0005)], 36))
    cut(o, cyl(NUT_R + 0.2 * mm, f0 - 0.01, f0 + 0.02, 'y', (0, 0), 36))
    for k in range(24):    # the slip ring's knurled grip
        g = box(-1.0 * mm, 1.0 * mm, f0 + 3 * mm, f0 + 10 * mm, 25.3 * mm, 27 * mm); g.transform(Matrix.Rotation(k * math.pi / 12, 4, 'Y')); cut(o, g)
    bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'handguard', RCV)
    hg = K.tmp(lathe([(f0 + 12 * mm, 0.0005), (f0 + 12 * mm, R0), (f1 - 7 * mm, R1), (f1 - 6 * mm, 19.5 * mm), (f1 - 6 * mm, 0.0005)], 40))
    cut(hg, cyl(17.5 * mm, f0, f1, 'y', (0, 0), 32))
    a_f, a_b = f0 + 18 * mm, f1 - 12 * mm
    for k in range(20):    # the ribs: shallow flutes along it, round all but the shoulders' vents and the side seams
        a = (k + 0.5) * math.pi / 10
        if abs(math.cos(a)) > 0.97: continue
        g = box(-1.3 * mm, 1.3 * mm, a_f, a_b, R0 - 1.0 * mm, R0 + 3 * mm); g.transform(Matrix.Rotation(a, 4, 'Y')); cut(hg, g)
    for sx in (-1, 1):     # the split along each side
        cut(hg, box(*xs(sx * 15 * mm, sx * 30 * mm), f0 + 12 * mm - 0.001, f1 - 6 * mm + 0.001, -0.5 * mm, 0.5 * mm))
    n = 6
    for k in range(n):     # the oval vents along each upper shoulder
        f = a_f + (a_b - a_f) * (k + 0.5) / n
        for sx in (-1, 1):
            g = prism(rounded(0.0, f, 2.4 * mm, 7 * mm, 2.3 * mm, 3), 'z', 15 * mm, 30 * mm)   # (straight down through the shell, then tipped out)
            g.transform(Matrix.Rotation(-sx * math.radians(38), 4, 'Y')); cut(hg, g)
    bevel(hg, 0.4 * mm, 1, 30); smooth(hg); K.adopt(hg, 'handguard', 'polymer')
    o = K.obj(lathe([(f1 - 6.5 * mm, 20.5 * mm), (f1, 20.5 * mm), (f1, 13 * mm), (f1 - 6.5 * mm, 13 * mm)], 32), 'handguard', RCV); smooth(o)   # the front cap
    return -R0

def front_sight_base(f, br):
    """The A2 front sight base pinned to the barrel, centred at f (22 mm long): its ring round the barrel, the tower, the two ears round
    the post (the post's top on the sight line), the bayonet lug under it, the sling swivel, the taper pins."""
    o = K.tmp(cyl(br + 3.0 * mm, f - 11 * mm, f + 11 * mm, 'y', (0, 0), 28))
    boolean(o, prism([(f - 11 * mm, 0.0), (f + 11 * mm, 0.0), (f + 7 * mm, SY - 15 * mm), (f - 5 * mm, SY - 15 * mm)], 'x', -6.5 * mm, 6.5 * mm), 'UNION')
    boolean(o, prism([(f - 6 * mm, SY - 17 * mm), (f + 6 * mm, SY - 17 * mm), (f + 4 * mm, SY + 3 * mm), (f - 3 * mm, SY + 3 * mm)], 'x', -7.8 * mm, 7.8 * mm), 'UNION')
    cut(o, box(-5.4 * mm, 5.4 * mm, f - 0.01, f + 0.01, SY - 11 * mm, SY + 5 * mm))                      # (the ears, open between)
    boolean(o, box(-4.2 * mm, 4.2 * mm, f - 3 * mm, f + 9 * mm, -br - 9 * mm, -br + 1 * mm), 'UNION')   # (the bayonet lug)
    cut(o, cyl(br, f - 0.02, f + 0.02, 'y', (0, 0), 28))
    bevel(o, 0.6 * mm, 1, 30); smooth(o); K.adopt(o, 'base', RCV)
    o = K.obj(box(-0.8 * mm, 0.8 * mm, f - 0.8 * mm, f + 0.8 * mm, SY - 12 * mm, SY), 'base', 'steel')                    # the post
    o = K.obj(cyl(2.6 * mm, -0.9 * mm, 0.9 * mm, 'x', (f, SY - 12.5 * mm), 12), 'base', 'steel'); smooth(o)              # (its detent)
    for q in (-6.5 * mm, 6.5 * mm):   # the taper pins
        o = K.obj(cyl(1.3 * mm, -6.8 * mm, 6.8 * mm, 'x', (f + q, br + 1.3 * mm), 10), 'base', 'steel'); smooth(o)
    sw = K.tmp(cyl(5.5 * mm, -1.0 * mm, 1.0 * mm, 'x', (f + 4 * mm, -br - 15 * mm), 18))                  # the sling swivel, hanging from the lug
    cut(sw, cyl(3.8 * mm, -0.01, 0.01, 'x', (f + 4 * mm, -br - 15 * mm), 18)); smooth(sw); K.adopt(sw, 'base', 'steel')

# ===================================================================================== BARREL, GAS, MUZZLE DEVICES
def barrel(f0, mz0, r=9.5 * mm, gas_f=None, fb=None, thr=7.6 * mm):
    """The factory barrel (a plain contour, its muzzle thread's shoulder) from `fb` (mount_barrel: what shows ahead of the longest
    handguard; the length under the handguard is base, it stays when another barrel is fitted) and (base) a low-profile gas block with its
    tube under a free-float handguard."""
    fb = fb or f0
    if fb > f0: o = K.obj(lathe([(f0, r), (fb, r)], 20), 'base', 'park'); smooth(o)
    o = K.obj(lathe([(fb, r), (mz0 - 6 * mm, r), (mz0 - 6 * mm, thr), (mz0, thr)], 20), 'barrel', 'park'); smooth(o)
    if gas_f:
        o = K.obj(lathe([(gas_f, r + 3.5 * mm), (gas_f + 0.018, r + 3.5 * mm)], 20), 'base', 'park'); smooth(o)
        o = K.obj(cyl(2.4 * mm, UP_F1, gas_f + 0.004, 'y', (0, r + 2.2 * mm), 10), 'base', 'steel'); smooth(o)

def muzzle_a2(mz0, sc=1.0):
    """The A2 birdcage: five slots round its top, its bottom closed (a crush washer behind it). sc: a .308's is larger."""
    L, R = 0.0505 * sc, 10.9 * mm * sc
    o = K.obj(lathe([(mz0 - 2 * mm, 9.6 * mm * sc), (mz0, 9.6 * mm * sc)], 20), 'muzzle', 'steel'); smooth(o)
    fh = K.tmp(lathe([(mz0, 8.6 * mm * sc), (mz0 + 3 * mm, R), (mz0 + L - 3 * mm, R), (mz0 + L, R - 1.0 * mm)], 24))
    cut(fh, cyl(3.6 * mm * sc, mz0 - 0.001, mz0 + L + 0.001, 'y', (0, 0), 16))
    for a in range(-2, 3):
        g = box(-1.3 * mm * sc, 1.3 * mm * sc, mz0 + 0.018 * sc, mz0 + L - 3 * mm, 4 * mm, 14 * mm * sc); g.transform(Matrix.Rotation(a * math.radians(45), 4, 'Y')); cut(fh, g)
    smooth(fh); K.adopt(fh, 'muzzle', 'park')
    return mz0 + L

# ===================================================================================== SIGHTS (factory: optic, the gun's own irons)
SY = RAIL_TOP + 34.5 * mm                                 # an absolute co-witness sight line
def rear_flip(f):
    """The Mk 18's folding rear sight (a KAC-pattern micro sight; the reference photo has it folded: its base on the rail at photo x
    586-632, its round leaf laid flat), stood up at f: a low clamp base with the windage knob on its right, a thin leaf standing on it,
    round-topped round its large close-quarters aperture, slim shoulders either side of its neck."""
    o = K.tmp(prism([(f - 11 * mm, RAIL_TOP), (f + 10 * mm, RAIL_TOP), (f + 9 * mm, RAIL_TOP + 8 * mm), (f - 10 * mm, RAIL_TOP + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm))
    bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'optic', RCV)
    o = K.obj(cyl(4.2 * mm, 9.5 * mm, 12.0 * mm, 'x', (f + 2 * mm, RAIL_TOP + 4.5 * mm), 16), 'optic', RCV); smooth(o)   # the windage knob
    # the leaf: 2.6 mm thick, a neck rising from the base to the disc round the aperture
    lf = K.tmp(prism([(-4.5 * mm, RAIL_TOP + 7 * mm), (4.5 * mm, RAIL_TOP + 7 * mm), (4.5 * mm, SY - 5 * mm), (-4.5 * mm, SY - 5 * mm)], 'y', f - 1.3 * mm, f + 1.3 * mm))
    boolean(lf, cyl(6.2 * mm, f - 1.3 * mm, f + 1.3 * mm, 'y', (0, SY), 28), 'UNION')
    cut(lf, cyl(3.2 * mm, f - 0.01, f + 0.01, 'y', (0, SY), 24))                                            # (the aperture: 6.4 mm, the close-quarters one)
    cut(lf, lathe([(f - 1.4 * mm, 4.4 * mm), (f + 0.2 * mm, 3.2 * mm)], 24, (0, 0, SY)))                    # (countersunk toward the eye)
    bevel(lf, 0.4 * mm, 1); smooth(lf); K.adopt(lf, 'optic', RCV)
    for sg in (-1, 1):   # the shoulders: low guards either side of the leaf's neck, well below the sight line
        o = K.tmp(prism([(f - 6 * mm, RAIL_TOP + 7 * mm), (f + 5 * mm, RAIL_TOP + 7 * mm), (f + 2 * mm, SY - 9 * mm), (f - 3 * mm, SY - 9 * mm)], 'x', *xs(sg * 7.0 * mm, sg * 9.0 * mm)))
        bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'optic', RCV)

def front_flip(f, base):
    """The Mk 18's folding front sight (KAC pattern; folded in the photo: a low block on the rail's top at photo x 1412-1520), stood up
    at f on a rail top at `base`: its clamp block, two slim ears round the post, the post."""
    o = K.tmp(prism([(f - 24 * mm, base), (f + 8 * mm, base), (f + 7 * mm, base + 7 * mm), (f - 22 * mm, base + 8 * mm)], 'x', -9.5 * mm, 9.5 * mm))
    bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'optic', RCV)
    o = K.obj(cyl(3.0 * mm, 9.5 * mm, 11.5 * mm, 'x', (f - 16 * mm, base + 4 * mm), 14), 'optic', 'steel'); smooth(o)     # the latch button
    ea = K.tmp(prism([(f - 4 * mm, base + 6 * mm), (f + 2 * mm, base + 6 * mm), (f + 1 * mm, SY + 5 * mm), (f - 3 * mm, SY + 5 * mm)], 'x', -9.0 * mm, 9.0 * mm))
    cut(ea, box(-7.2 * mm, 7.2 * mm, f - 0.01, f + 0.01, SY - 12 * mm, SY + 6 * mm))                         # (two slim ears, open between)
    bevel(ea, 0.5 * mm, 1); smooth(ea); K.adopt(ea, 'optic', RCV)
    o = K.obj(box(-0.75 * mm, 0.75 * mm, f - 1.6 * mm, f + 0.2 * mm, SY - 12.5 * mm, SY), 'optic', 'steel')

# ===================================================================================== MAGAZINES (part_mag)
def mag_stanag(top):
    """A curved 30-round STANAG magazine, its top (the photo point 866, 232) at `top`: open at the top between its feed lips, the top
    two rounds in it (the top one is the magazine check's: its case, its tip), its pressed ribs, its floorplate, and the game's
    witness windows (five down its back, toward the shooter; none on the front: brass showing through, each its own mesh at the face's tilt)."""
    pm = K.part('mag', (0, top[0], top[1])); pm['check'] = {'w': 0.0228}
    R = lambda pts: RL(pts, 866, 232, top)
    HWm = 11.4 * mm
    back = [(792, 250), (792, 320), (787, 350), (786, 363), (790, 395), (800, 445), (810, 481), (820, 516), (832, 548)]
    front = [(937, 284), (937, 400), (951, 459), (966, 506)]   # (its front 1 mm behind the well's front wall, x 937, and the same depth on down below the well: no step out)
    mg = K.tmp(prism(R([(795, 232), (937, 232), (937, 284), (937, 400), (951, 459), (966, 506), (966, 515), (951, 522), (932, 525), (900, 536), (860, 548),
                        (838, 553), (832, 548), (820, 516), (810, 481), (800, 445), (790, 395), (786, 363), (787, 350), (792, 320), (792, 250)]), 'x', -HWm, HWm))   # (its back 1 mm clear of the well's back wall, x 792, down through the well)
    cut(mg, prism(R([(800, 226), (936, 226), (936, 246), (800, 246)]), 'x', -HWm + 1.0 * mm, HWm - 1.0 * mm))      # (open at the top: the follower's well)

    def along(poly, y):    # the face's point at photo height y, and its direction there (downward)
        for (x0, y0), (x1, y1) in zip(poly, poly[1:]):
            if y0 <= y <= y1:
                t = (y - y0) / (y1 - y0); return (x0 + t * (x1 - x0), y), (x1 - x0, y1 - y0)
        (x0, y0), (x1, y1) = poly[-2], poly[-1]; return (x1, y1), (x1 - x0, y1 - y0)
    wins = []
    for i in range(1, 6):
        t = i / 6 * 0.94; y = 250 + t * (520 - 250)
        for side, poly in ((1, back),):   # (the back face only: the front has none)
            (px, py), (dx_, dy_) = along(poly, y)
            q = R([(px, py)])[0]
            uF, uU = -dx_ * S, dy_ * S; n_ = math.hypot(uF, uU); uF, uU = uF / n_, uU / n_      # (up the face, forward/up in the gun's frame)
            ang = math.atan2(-uF, uU)                                                              # (rotation about X that stands Z up the face)
            nF, nU = math.cos(ang), math.sin(ang)                                                  # (the face's normal toward the front)
            x = -side * 2.6 * mm
            g = box(x - 2.6 * mm, x + 2.6 * mm, -1.4 * mm, 1.4 * mm, -2.8 * mm, 2.8 * mm)
            g.transform(Matrix.Translation((0, q[0], q[1])) @ Matrix.Rotation(ang, 4, 'X')); cut(mg, g)
            wins.append((i - 1, t, side, q, ang, nF, nU))
    bevel(mg, 1.0 * mm, 1, 30); smooth(mg); K.adopt(mg, 'mag', 'park', pm)
    for i, t, side, q, ang, nF, nU in wins:
        x = -side * 2.6 * mm
        o = K.obj(box(x - 2.4 * mm, x + 2.4 * mm, -0.3 * mm, 0.3 * mm, -2.6 * mm, 2.6 * mm), 'mag', 'brass', pm)
        d = side * 1.0 * mm         # (the slot's floor: 1 mm into the face, inward from the back face is forward, from the front face back)
        o.matrix_world = Matrix.Translation((0, q[0] + d * nF, q[1] + d * nU)) @ Matrix.Rotation(ang, 4, 'X')
        o['chk'] = {'role': 'hole', 'i': i, 't': round(t, 4), 'side': side}
    for line in ([(814, 290), (818, 400), (832, 470), (856, 532)], [(868, 290), (872, 400), (888, 466), (910, 524)]):
        for sd in (-1, 1):
            for p0, p1 in zip(line, line[1:]):
                o = K.tmp(prism(R([(p0[0] - 5, p0[1]), (p0[0] + 5, p0[1]), (p1[0] + 5, p1[1] + 1), (p1[0] - 5, p1[1] + 1)]), 'x', *xs(sd * 11.2 * mm, sd * 12.0 * mm)))
                bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    o = K.tmp(prism(R([(836, 546), (969, 508), (971, 518), (838, 558)]), 'x', -12.6 * mm, 12.6 * mm)); bevel(o, 0.8 * mm, 1); smooth(o); K.adopt(o, 'mag', 'polymer', pm)
    # the feed lips: each wall's top turned in over the rounds
    for sd in (-1, 1):
        o = K.tmp(prism(R([(800, 229), (900, 229), (900, 234), (800, 234)]), 'x', *xs(sd * (HWm - 0.2 * mm), sd * (HWm - 3.0 * mm))))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    # the top two rounds (5.56 x 45: the case 44.7 mm, the bullet to 57.4 mm), staggered either side; the top one is the check's
    h = top[0] + (801 - 866) * S
    def rnd(x, z, chk):
        c = K.obj(lathe([(h, 0.0005), (h, 4.7 * mm), (h + 1.2 * mm, 4.7 * mm), (h + 1.5 * mm, 4.1 * mm), (h + 2.6 * mm, 4.1 * mm), (h + 3.0 * mm, 4.8 * mm),
                         (h + 36.5 * mm, 4.5 * mm), (h + 39.5 * mm, 3.2 * mm), (h + 44.7 * mm, 3.2 * mm), (h + 44.7 * mm, 0.0005)], 18, (x, 0, z)), 'mag', 'brass', pm)
        smooth(c)
        b = K.obj(lathe([(h + 44.7 * mm, 0.0005), (h + 44.7 * mm, 2.85 * mm), (h + 49 * mm, 2.85 * mm), (h + 54 * mm, 1.9 * mm), (h + 57.4 * mm, 0.4 * mm),
                         (h + 57.4 * mm, 0.0005)], 14, (x, 0, z)), 'mag', 'brass', pm)
        smooth(b)
        if chk: c['chk'] = {'role': 'top', 'i': 0}; b['chk'] = {'role': 'top', 'i': 1}
    rnd(2.5 * mm, top[1] - 2.6 * mm, True)
    rnd(-2.5 * mm, top[1] - 6.8 * mm, False)
    return pm

def mag_holes(body, pm, face, n, hw, mat='brass'):
    """The game's witness holes: n windows down the magazine's back face (side 1, toward the shooter), the stack's brass showing; each
    its own mesh, its node turned to the face's tilt there. face(t) -> ((forward, up), (dForward, dUp) down the face) at fraction t."""
    wins = []
    for i in range(1, n + 1):
        t = i / (n + 1) * 0.94
        (qf, qu), (df, du) = face(t)
        n_ = math.hypot(df, du); uF, uU = -df / n_, -du / n_                 # (up the face)
        ang = math.atan2(-uF, uU); nF, nU = math.cos(ang), math.sin(ang)
        x = -hw * 0.25
        g = box(x - 2.6 * mm, x + 2.6 * mm, -1.4 * mm, 1.4 * mm, -2.8 * mm, 2.8 * mm)
        g.transform(Matrix.Translation((0, qf, qu)) @ Matrix.Rotation(ang, 4, 'X')); cut(body, g)
        wins.append((i - 1, t, (qf, qu), ang, nF, nU, x))
    return wins

def mag_hole_glass(wins, pm):
    out = []
    for i, t, (qf, qu), ang, nF, nU, x in wins:
        o = K.obj(box(x - 2.4 * mm, x + 2.4 * mm, -0.3 * mm, 0.3 * mm, -2.6 * mm, 2.6 * mm), 'mag', 'brass', pm)
        d = 1.0 * mm               # (the slot's floor, 1 mm in from the back face)
        o.matrix_world = Matrix.Translation((0, qf + d * nF, qu + d * nU)) @ Matrix.Rotation(ang, 4, 'X')
        o['chk'] = {'role': 'hole', 'i': i, 't': round(t, 4), 'side': 1}; out.append(o)
    return out

def round_lathe(h, x, z, case, oal, rim, body, neck, bul, pm, chk):
    """A cartridge lying forward, its head at h: case (length), oal, rim / body / neck / bullet radii. The case and bullet are separate meshes
    (the magazine check's i 0 and i 1 when chk)."""
    c = K.obj(lathe([(h, 0.0005), (h, rim), (h + 1.2 * mm, rim), (h + 1.5 * mm, rim - 0.6 * mm), (h + 2.6 * mm, rim - 0.6 * mm), (h + 3.0 * mm, body),
                     (h + case * 0.8, body * 0.97), (h + case * 0.87, neck), (h + case, neck), (h + case, 0.0005)], 18, (x, 0, z)), 'mag', 'brass', pm); smooth(c)
    b = K.obj(lathe([(h + case, 0.0005), (h + case, bul), (h + case + (oal - case) * 0.3, bul), (h + case + (oal - case) * 0.75, bul * 0.66),
                     (h + oal, bul * 0.15), (h + oal, 0.0005)], 14, (x, 0, z)), 'mag', 'brass', pm); smooth(b)
    if chk: c['chk'] = {'role': 'top', 'i': 0}; b['chk'] = {'role': 'top', 'i': 1}

def mag_762(top):
    """The SR-25's 20-round 7.62 magazine: straight through the well (1 mm clear of its walls), curving a little forward below it, open at
    the top between its feed lips with the top two 7.62 x 51 rounds in it (the top one the check's), two pressed ribs down each side, a
    floorplate, five witness holes down its back."""
    pm = K.part('mag', (0, top[0], top[1])); HWm = 12.3 * mm; pm['check'] = {'w': round(2 * HWm, 4)}
    b0, f0_ = F(792) - top[0], F(937) - top[0]                            # (its back and front inside the well, from its top)
    dB, dF = U(318) - top[1], U(266) - top[1]                              # (the well's mouth at the back and the front)
    L, cv = C.get('mag_len', 0.158), 0.012                                                   # (its length below its top; how far forward its bottom comes)
    def cx(z): return 0.0 if z > dB else cv * ((dB - z) / (dB + L)) ** 1.6
    zs = [0.0, dB] + [dB + (-L - dB) * k / 6 for k in range(1, 7)]
    back = [(b0 + cx(z), z) for z in zs]
    front = [(f0_ + cx(z), z) for z in [0.0, dF - 2 * mm] + zs[1:]]    # (the same depth all the way down: no step out below the well)
    front[1] = (f0_, dF - 2 * mm)
    out = [(back[0][0] + top[0], top[1])] + [(f + top[0], z + top[1]) for f, z in front] + [(f + top[0], z + top[1]) for f, z in back[::-1]][:-1]
    mg = K.tmp(prism(out, 'x', -HWm, HWm))
    cut(mg, prism([(b0 + top[0] + 1.4 * mm, top[1] - 4.5 * mm), (f0_ + top[0] - 1.4 * mm, top[1] - 4.5 * mm), (f0_ + top[0] - 1.4 * mm, top[1] + 0.01),
                   (b0 + top[0] + 1.4 * mm, top[1] + 0.01)], 'x', -HWm + 1.0 * mm, HWm - 1.0 * mm))      # (open at the top)
    def face(t):
        z = -6 * mm + t * (-L + 0.030 + 6 * mm); dz = 0.004
        return (top[0] + b0 + cx(z), top[1] + z), (cx(z - dz) - cx(z + dz), -2 * dz)
    wins = mag_holes(mg, pm, face, 5, HWm)
    bevel(mg, 1.0 * mm, 1, 30); smooth(mg); K.adopt(mg, 'mag', 'park', pm)
    mag_hole_glass(wins, pm)
    for fr in (0.3, 0.68):   # the pressed ribs down each side, below the well
        pts = [(top[0] + b0 + (f0_ - b0) * fr + cx(z), top[1] + z) for z in (dB - 4 * mm, -L + 0.012)]
        for sd in (-1, 1):
            o = K.tmp(prism([(pts[0][0] - 2.5 * mm, pts[0][1]), (pts[0][0] + 2.5 * mm, pts[0][1]), (pts[1][0] + 2.5 * mm, pts[1][1]), (pts[1][0] - 2.5 * mm, pts[1][1])],
                            'x', *xs(sd * (HWm - 0.2 * mm), sd * (HWm + 0.6 * mm)))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    zb = top[1] - L; fb0, fb1 = top[0] + b0 + cv - 2 * mm, top[0] + f0_ + 1.2 * mm + cv + 2.5 * mm   # the floorplate
    o = K.tmp(prism([(fb0, zb + 2 * mm), (fb1, zb + 2 * mm), (fb1, zb - 3.5 * mm), (fb0, zb - 3.5 * mm)], 'x', -HWm - 0.8 * mm, HWm + 0.8 * mm))
    bevel(o, 1.0 * mm, 2, 30); smooth(o); K.adopt(o, 'mag', 'polymer', pm)
    for sd in (-1, 1):       # the feed lips
        o = K.tmp(box(*xs(sd * (HWm - 0.2 * mm), sd * (HWm - 3.4 * mm)), top[0] + b0 + 1 * mm, top[0] + b0 + 0.048, top[1] - 2.0 * mm, top[1] + 0.6 * mm))
        bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'mag', 'park', pm)
    h = top[0] + b0 + 1.2 * mm     # (7.62 x 51: the case 51 mm, the round 71 mm; its head against the back wall)
    round_lathe(h, 2.9 * mm, top[1] - 3.2 * mm, 0.051, 0.0705, 6.0 * mm, 5.9 * mm, 4.4 * mm, 3.9 * mm, pm, True)
    round_lathe(h, -2.9 * mm, top[1] - 8.4 * mm, 0.051, 0.0705, 6.0 * mm, 5.9 * mm, 4.4 * mm, 3.9 * mm, pm, False)
    return pm

def mag_glock(top, L=0.244, rake=None):
    """A Glock 9 mm magazine (the 33-round stick, 244 mm), its top at `top`: a polymer body with its front corners well rounded, open at
    the top between its feed lips with the top two 9 x 19 rounds in it (the top one the check's), the floorplate's lip, five witness
    holes down its back. rake: built upright, then turned about its top (its bottom back, as in a Glock's grip), its top cut level so the
    rounds lie level."""
    pm = K.part('mag', (0, top[0], top[1])); HWm, D = GHM, GD; pm['check'] = {'w': round(2 * HWm, 4)}
    r = rake or 0.0; M = grot(top) if rake else Matrix.Identity(4)
    ext = D / 2 * math.tan(r) + 1 * mm                                    # (built a little long at the top: cut level after the turn)
    fb, ff = top[0] - D / 2, top[0] + D / 2
    mg = K.tmp(prism([(fb, top[1] + ext), (ff, top[1] + ext), (ff, top[1] - L), (fb, top[1] - L)], 'x', -HWm, HWm))
    boolean(mg, prism(rounded(0.0, top[0] - 4 * mm, HWm, D / 2 + 4 * mm, 7.5 * mm, 4), 'z', top[1] - L - 0.01, top[1] + ext + 0.01), 'INTERSECT')   # (its section: the front rounded)
    cut(mg, box(-3.5 * mm, 3.5 * mm, ff - 2.0 * mm, ff + 0.01, top[1] - 0.034, top[1] - 0.028))       # (the catch's notch in its front)
    wins = mag_holes(mg, pm, lambda t: ((fb, top[1] - 0.012 + t * (-L + 0.040)), (0.0, -1.0)), 5, HWm)
    mg.data.transform(M)
    hb, hf = top[0] - D / 2 / math.cos(r), top[0] + D / 2 / math.cos(r)  # (its back and front at the level top)
    cut(mg, box(-0.05, 0.05, top[0] - 0.05, top[0] + 0.05, top[1], top[1] + 0.05),
        box(-HWm + 1.1 * mm, HWm - 1.1 * mm, hb + 1.4 * mm, hf - 1.6 * mm, top[1] - 4 * mm, top[1] + 0.01))   # (the top level, open between the lips)
    bevel(mg, 0.8 * mm, 1, 30); smooth(mg); K.adopt(mg, 'mag', 'polymer', pm)
    for o in mag_hole_glass(wins, pm): o.matrix_world = M @ o.matrix_world
    o = K.tmp(prism([(fb - 1.0 * mm, top[1] - L + 6 * mm), (ff + 2.5 * mm, top[1] - L + 6 * mm), (ff + 2.5 * mm, top[1] - L - 1.5 * mm), (fb - 1.0 * mm, top[1] - L - 1.5 * mm)],
                    'x', -HWm - 0.9 * mm, HWm + 0.9 * mm))
    boolean(o, prism(rounded(0.0, top[0] - 4 * mm + 0.75 * mm, HWm + 0.9 * mm, D / 2 + 4 * mm + 1.75 * mm, 8 * mm, 4), 'z', top[1] - L - 0.01, top[1] - L + 0.01), 'INTERSECT')
    o.data.transform(M); bevel(o, 0.8 * mm, 2, 30); smooth(o); K.adopt(o, 'mag', 'polymer', pm)            # the floorplate
    for sd in (-1, 1):       # the feed lips (the steel liner's top turned in), level
        o = K.tmp(box(*xs(sd * (HWm - 0.2 * mm), sd * (HWm - 3.2 * mm)), hb + 1 * mm, hb + 0.020, top[1] - 1.8 * mm, top[1] + 0.5 * mm))
        bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'mag', 'steel', pm)
    h = hb + 1.6 * mm              # (9 x 19: the case 19.15 mm, the round 29.7 mm; level, its head against the back wall)
    round_lathe(h, 2.4 * mm, top[1] - 2.8 * mm, 0.01915, 0.0297, 4.95 * mm, 4.9 * mm, 4.8 * mm, 4.5 * mm, pm, True)
    round_lathe(h, -2.4 * mm, top[1] - 7.4 * mm, 0.01915, 0.0297, 4.95 * mm, 4.9 * mm, 4.8 * mm, 4.5 * mm, pm, False)
    return pm


# ===================================================================================== ASSEMBLY (the gun CFG describes)
la = lower(C.get('lower', 'ar15'))
PORT = C.get('port', (755, 925))
upper(fa=C.get('forward_assist', True), deflector=C.get('deflector', True), port=PORT)
ch_at = charging_handle()
{'m4': stock_m4, 'hk': stock_hk}[C.get('stock', 'm4')]()   # (the SOPMOD / Crane stays in stock_sopmod, unused for now)
{'a2': grip_a2, 'mod': grip_mod, 'hk': grip_hk}[C.get('grip', 'mod')](la['grip'])
HG0 = UP_F1 + 0.6 * mm                                    # (the rail's rear butts against the upper: it hides the barrel nut)
HG1 = HG0 + C.get('hg_len', 0.2395)   # (the 9.5" RIS II: it ends 0.240 m ahead of the upper's front, inside the game's 15 mm of room before the muzzle)
HGK = C.get('hg', 'quad')
HGB = {'quad': lambda: handguard_quad(HG0, HG1), 'hk': lambda: handguard_quad(HG0, HG1, hk=True),
       'mlok': lambda: handguard_mlok(HG0, HG1, sc=RY), 'carbine': lambda: handguard_carbine(HG0, HG1)}[HGK]()   # (its bottom)
MZ0 = UP_F1 + C.get('barrel', 0.2557)                      # the factory barrel's end (a muzzle device screws on here)
BR = C.get('bore_r', 9.5 * mm)
FRONT = C.get('front', 'flip')
if FRONT == 'fsb':
    # a front sight base pinned to the barrel in front of the handguard: the handguard reaches 3 mm short of it, the barrel shows ahead of it
    HG_END = HG1 + 3 * mm
    FS = HG_END + 0.5 * mm + 11 * mm
    front_sight_base(FS, BR)
    FB = FS + 11 * mm + 0.5 * mm
else:
    HG_END = MZ0 - 0.012                # the furthest a handguard reaches (hgMax = this - mount_handguard - 3 mm: the 0.240 m rail; the game keeps 15 mm of barrel bare)
    FB = HG_END + 1 * mm
    FS = HG1 - 0.016
barrel(UP_F1, MZ0, r=BR, gas_f=None if C.get('gas', 0.186) is None else UP_F1 + C.get('gas', 0.186), fb=FB, thr=C.get('thr_r', 7.6 * mm))
MUZ = muzzle_a2(MZ0, C.get('muzzle_sc', 1.0))
RS = F(609)                                # (the rear sight's leaf: its base on the rail at photo x 586-632)
rear_flip(RS)
if FRONT == 'flip': front_flip(FS, HB_T + 5.6 * mm)   # (after the rear sight: the M4's parts keep their order)
MK = C.get('mag', 'stanag')
if MK == 'glock':
    MTOP = la['mag']
    mag_glock(MTOP, rake=GRK if C.get('lower', 'ar15') == 'glock' else None)
else:
    MTOP = la['mag']
    {'stanag': mag_stanag, '762': mag_762}[MK](MTOP)

# ===================================================================================== info and anchors
info = {
    'sy': round(SY, 4), 'fSight': round(RS, 4), 'relief': 0.075,
    'muzzles': [[round(MUZ, 4), 0, 0]],
    'grip': [round(la['grip'][0] - 0.040, 4), round(la['grip'][1] - 0.040, 4), 0], 'support': [round((HG0 + HG1) / 2 + 0.03, 4), round(HGB - 6 * mm, 4), 0],
    'anim': {'ch': 'part_ch', 'mag': 'part_mag', 'catch': 'part_catch'},
    'magAt': [round(MTOP[0], 4), round(MTOP[1], 4)],
    **({'magRake': round(GRK, 4)} if C.get('lower', 'ar15') == 'glock' else {}),   # (the well's rake: a reload draws the magazine out along it)
    'port': [round(F((PORT[0] + PORT[1]) / 2), 4), round(U(116), 4), round(HW_UP, 4)],
    'chamberAt': {'side': 'right', 'f': round(F(PORT[1] + 5), 4), 'y': 0.0, 'x': round(HW_UP - 0.6 * mm, 4)},
    'ch': [round(ch_at[0], 4), round(ch_at[1], 4), 0],
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [round(MZ0, 4), 0, 0]},
}
anchors = {
    'mount_optic': [round(F(586), 4), round(RAIL_TOP, 4), 0], 'mount_optic_end': [round(UP_F1, 4), round(RAIL_TOP, 4), 0],
    'mount_handguard': [round(HG0, 4), 0, 0], 'mount_handguard_end': [round(HG_END, 4), 0, 0],
    'mount_barrel': [round(FB, 4), 0, 0], 'mount_muzzle': [round(MZ0, 4), 0, 0],
    'mount_stock': [0, 0, 0], 'mount_grip': [round(la['grip'][0], 4), round(la['grip'][1], 4), 0],
    'mount_mag': [round(MTOP[0], 4), round(MTOP[1], 4), 0],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
