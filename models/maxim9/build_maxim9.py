# The SilencerCo Maxim 9 (integrally suppressed 9 mm pistol, long configuration), in Blender.
#   Blender: exec(open(r'<repo>/models/maxim9/build_maxim9.py').read(), {'GUN_DIR': r'<repo>/models/maxim9'})
#   or:      blender -b -P models/maxim9/build_maxim9.py
# Proportions measured off a side-on product photo (muzzle left; reference only, nothing traced into the repo): 768 px = 273 mm overall
# (10.75 in, the long configuration), so 0.3555 mm a pixel; f = (778 - x) px forward of the slide's rear, up = (145 - y) px over the bore.
# Published: 273 mm long (242 short), 4.38 in barrel, about 40 mm across the suppressor, 17 rounds of 9x19.
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the slide's rear face on the bore line (as the pistols' frames).
# Parts and anchors: the authored-pistol interface (round 3, TASK 15): base = frame (dust cover, trigger guard, trigger, controls);
# grip = the grip (stippled); slide = part_slide (its optic cut with a cover plate and the rear sight, slot optic); barrel = the factory
# barrel, which on this gun IS the integral suppressor: the hood in the port, the barrel, the housing and its front sight (no muzzle
# thread: suppressor 'integral'); mag = part_mag (body up the grip, base plate).
# VARIANTS (each its own collection in maxim9.blend and its own file, same frame, root extras.variant_json):
#   barrel_short.glb  the suppressor with its front block off: the big block ahead of the main seam (x 275, 94 mm), where the photo's
#                     top steps up to the raised strip; the muzzle comes back from 273 to 179 mm, 62 mm ahead of the slide;
#   mag_ext.glb       an extended magazine: the body and base pad 25 mm longer down the grip's slope (+5 rounds).
import bpy, json, math, os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = 'maxim9'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
S = 0.3555                                                     # mm a pixel of the reference
def P(x, y): return ((778 - x) * S * mm, (145 - y) * S * mm)    # a reference pixel -> (forward, up) metres
def PL(pts): return [P(x, y) for x, y in pts]
def F(x): return (778 - x) * S * mm
def U(y): return (145 - y) * S * mm

coll, root = kit_collection(ID)
K = Kit(coll, root)

# ---- SLIDE (part_slide): a Glock-width slide, chamfered top edges, rear serrations cut diagonally over the top corners, the ejection port ----
SW = 12.75 * mm                                     # half its width
s_top, s_bot = U(108), U(185)
front = [(-SW, s_bot), (SW, s_bot), (SW, s_top - 4 * mm), (SW - 3.2 * mm, s_top), (-SW + 3.2 * mm, s_top), (-SW, s_top - 4 * mm)]
slide = K.tmp(prism(front, 'y', 0.0, F(450)))
cut(slide, prism([(-0.001, s_top + 0.001), (-0.001, s_top - 5 * mm), (7 * mm, s_top + 0.001)], 'x', -0.03, 0.03))          # the rear's top bevelled off
cut(slide, prism([(-0.001, s_bot - 0.001), (-0.001, s_bot + 2.5 * mm), (2.5 * mm, s_bot - 0.001)], 'x', -0.03, 0.03))      # (and its foot)
cut(slide, box(-0.03, 0.03, F(470), F(440), s_top - 1.5 * mm, s_top + 0.01))                                                     # the nose's step down
cut(slide, box(SW - 4 * mm, SW + 0.01, F(665), F(565), 0.5 * mm, s_top + 0.01))                                                    # the ejection port (right)
for i in range(5):                                                                                                                 # rear serrations, both sides: leaning slots up the
    f0 = F(768) + i * 7.0 * mm                                                                                                     # upper side and over the top corner
    sl = [(f0, -3 * mm), (f0 + 2.2 * mm, -3 * mm), (f0 + 2.2 * mm + 9 * mm, s_top + 0.002), (f0 + 9 * mm, s_top + 0.002)]
    for s in (-1, 1):
        cut(slide, prism(sl, 'x', s * (SW - 1.1 * mm), s * (SW + 0.01)))
OPT_F, OPT_D = 0.32 * F(450), 3 * mm                 # the optic cut: its centre 0.32 x the slide's length forward of its rear, 3 mm deep
cut(slide, box(-12.5 * mm, 12.5 * mm, OPT_F - 17 * mm, OPT_F + 17 * mm, s_top - OPT_D, s_top + 0.01))
bevel(slide, 0.6 * mm, 2); smooth(slide)
pslide = K.part('slide', (0, 0, 0))
K.adopt(slide, 'slide', 'black', pslide)
# the rear sight (on the slide: it moves with it): a dovetailed block with a square notch
rs = K.tmp(prism(PL([(770, 108), (735, 108), (738, 92), (768, 90)]), 'x', -10 * mm, 10 * mm))
cut(rs, box(-1.8 * mm, 1.8 * mm, F(780), F(730), U(100), U(80)))
bevel(rs, 0.4 * mm, 1); smooth(rs)
K.adopt(rs, 'optic', 'black', pslide)
# the optic cut's cover plate (the factory irons' part: a pistol dot replaces it), flush with the slide's top, two screws
cp = K.tmp(box(-12.3 * mm, 12.3 * mm, OPT_F - 16.8 * mm, OPT_F + 16.8 * mm, s_top - OPT_D, s_top - 0.2 * mm)); bevel(cp, 0.5 * mm, 1); smooth(cp)
K.adopt(cp, 'optic', 'black', pslide)
for df in (-11 * mm, 11 * mm):
    o = K.obj(cyl(1.6 * mm, s_top - 0.6 * mm, s_top - 0.05 * mm, 'z', (0, OPT_F + df), 12), 'optic', 'steel', pslide); smooth(o)

# ---- SUPPRESSOR = the factory BARREL: the deep housing over the barrel and the frame's front, rounded edges, recessed panels each side,
# the bore, the section seams; the front sight on its top; the hood and barrel inside the slide.
# fx: the front face's pixel (10 long; 97 short: the front section off) ----
HW = 19.5 * mm
UW, top, bot = 17.2 * mm, U(103), U(312)
MAIN_SEAM = 275                                                          # (pixel) the front block's joint
def suppressor(Kx, fx):
    hp = PL([(fx, 103), (450, 103), (450, 186), (365, 186), (365, 262), (325, 305), (fx + 30, 312), (fx, 300)])
    hs = Kx.tmp(prism(hp, 'x', -HW, HW))
    # its section (front view, from a 3/4 front photo): full width below the slide's foot, a narrower upper deck above a crease, big chamfers on top
    sec = [(-HW, bot - 0.01), (HW, bot - 0.01), (HW, U(186)), (UW, U(186) + 5 * mm), (UW, top - 5.5 * mm), (UW - 5.5 * mm, top + 0.0005),
           (-UW + 5.5 * mm, top + 0.0005), (-UW, top - 5.5 * mm), (-UW, U(186) + 5 * mm), (-HW, U(186))]
    boolean(hs, prism(sec, 'y', F(460), F(fx) + 0.01), 'INTERSECT')
    bevel(hs, 2.2 * mm, 3, 30)                                              # (rounded first: the panels, seams and holes are cut crisp into it)
    # the recessed side panels: the small one on the front block, the long one behind it (on the short, what is left of it)
    pans = [PL([(fx + 12, 198), (fx + 98, 198), (fx + 108, 268), (fx + 20, 276)])] if fx < 100 else []
    pans.append(PL([(max(122, fx + 12), 198), (330, 198), (392, 228), (395, 258), (345, 288), (max(130, fx + 20), 282)]))
    for s_ in (-1, 1):
        for pts in pans:
            cut(hs, prism(pts, 'x', s_ * (HW - 0.8 * mm), s_ * (HW + 0.01)))
    # the seams: the main one (x 275: the front block comes off here) deep, the baffle segments' (x 55, 97, 143) fine; round the sides and top
    for sx, dp, wd in ((55, 0.3, 0.25), (97, 0.3, 0.25), (143, 0.3, 0.25), (MAIN_SEAM, 0.7, 0.45)):
        if sx < fx + 20: continue
        g0, g1 = F(sx) - wd * mm, F(sx) + wd * mm
        for s_ in (-1, 1): cut(hs, box(s_ * (HW - dp * mm), s_ * (HW + 0.01), g0, g1, bot - 0.01, top + 0.01))
        cut(hs, box(-0.03, 0.03, g0, g1, top - dp * mm, top + 0.01))
    cut(hs, cyl(5.2 * mm, F(fx + 20), F(fx) + 0.002, 'y', (0, 0), 24))       # the bore's exit
    for x in (-5.5 * mm, 5.5 * mm):                                          # two small holes in the face under it (the take-down pins' ends)
        cut(hs, cyl(1.5 * mm, F(fx + 8), F(fx) + 0.002, 'y', (x, U(185)), 12))
    smooth(hs)
    Kx.adopt(hs, 'barrel', 'black')
    # the front sight on the housing's top, near its front
    o = Kx.obj(prism(PL([(fx + 40, 103), (fx + 15, 103), (fx + 17, 92), (fx + 37, 92)]), 'x', -1.6 * mm, 1.6 * mm), 'barrel', 'black'); bevel(o, 0.3 * mm, 1); smooth(o)
    o = Kx.obj(cyl(0.9 * mm, F(fx + 20), F(fx + 18), 'y', (0, U(95)), 10), 'barrel', 'sightPaint')
    # the hood and chamber block seen through the port, and the barrel ahead of it inside the slide
    o = Kx.obj(box(-5.5 * mm, 5.5 * mm, F(700), F(560), -3 * mm, s_top - OPT_D - 0.6 * mm), 'barrel', 'gunmetal'); bevel(o, 0.4 * mm, 1); smooth(o)
    o = Kx.obj(lathe([(F(560), 6.4 * mm), (F(452), 6.4 * mm)], 18), 'barrel', 'gunmetal'); smooth(o)
    return F(fx)
MUZ = suppressor(K, 10)

# ---- FRAME (base): the dust cover under the slide behind the housing, the rails, the trigger guard, the trigger, slide stop and magazine catch ----
FW = 14 * mm
fr = K.tmp(prism(PL([(365, 186), (776, 186), (792, 204), (786, 222), (745, 232), (588, 262), (440, 262), (365, 262)]), 'x', -FW, FW))
bevel(fr, 1.5 * mm, 2, 30); smooth(fr)
K.adopt(fr, 'base', 'polymer')
tg = K.tmp(prism(PL([(430, 255), (452, 325), (552, 325), (590, 280), (592, 258)]), 'x', -5.5 * mm, 5.5 * mm))
cut(tg, prism(PL([(452, 262), (468, 312), (540, 312), (568, 280), (575, 258)]), 'x', -0.02, 0.02))
bevel(tg, 1.2 * mm, 2, 30); smooth(tg)
K.adopt(tg, 'base', 'polymer')
o = K.obj(prism(PL([(546, 240), (556, 240), (562, 300), (553, 303), (541, 272)]), 'x', -3 * mm, 3 * mm), 'base', 'black'); bevel(o, 0.6 * mm, 2); smooth(o)
o = K.obj(prism(PL([(578, 196), (642, 194), (642, 204), (580, 206)]), 'x', -FW - 1.2 * mm, -FW + 0.3 * mm), 'base', 'black'); bevel(o, 0.3 * mm, 1); smooth(o)   # slide stop (left)
o = K.obj(prism(rounded(F(615), U(282), 4.5 * mm, 4 * mm, 1.5 * mm, 3), 'x', -FW - 1 * mm, -FW + 1 * mm), 'base', 'polymer'); bevel(o, 0.3 * mm, 1); smooth(o)  # mag catch (left)

# ---- GRIP: stippled, its front strap and back strap from the reference, the beavertail ----
GW = 15.5 * mm
gp = PL([(588, 258), (745, 228), (790, 214), (796, 226), (778, 260), (792, 470), (782, 488), (652, 488), (640, 470), (618, 330), (596, 300)])
g = K.tmp(prism(gp, 'x', -GW, GW))
cut(g, prism(PL([(612, 255), (725, 255), (782, 486), (660, 486)]), 'x', -10.5 * mm, 10.5 * mm))      # the magazine well (open at the bottom)
bevel(g, 3.5 * mm, 3, 30); smooth(g)
K.adopt(g, 'grip', 'stipple')

# ---- MAGAZINE (part_mag): the body up the well to just under the slide, the base plate; the pivot at its top front (magAt) ----
MAG_TOP = P(605, 192)
MAG_SLOPE = (778 - 712) / (486 - 192)                       # the magazine's lean (pixels back per pixel down), the grip's
def magazine(Kx, ext=0):
    # part_mag: the body (ext px longer down the slope) and its base pad (a deeper one, and a sleeve over the extension, when extended)
    dx = ext * MAG_SLOPE
    pm = Kx.part('mag', (0, MAG_TOP[0], MAG_TOP[1])); pm['check'] = {'w': 0.020}
    # the body: open at the top between its feed lips (the top round sits in it), witness windows cut down its back (the game's
    # magazine check: four down the back, toward the shooter, none on the front, the stack's brass showing; each window its own mesh at the face's tilt)
    body = Kx.tmp(prism(PL([(605, 192), (712, 192), (778 + dx, 486 + ext), (664 + dx, 486 + ext)]), 'x', -10 * mm, 10 * mm))
    cut(body, prism(PL([(610, 186), (707, 186), (707, 201), (610, 201)]), 'x', -9.0 * mm, 9.0 * mm))
    bevel(body, 0.8 * mm, 1)
    wins = []
    for side, (a0, a1) in ((1, ((712, 192), (778 + dx, 486 + ext))),):
        q0, q1 = PL([a0])[0], PL([a1])[0]
        uF, uU = q0[0] - q1[0], q0[1] - q1[1]; n_ = math.hypot(uF, uU); uF, uU = uF / n_, uU / n_      # (up the face)
        ang = math.atan2(-uF, uU); nF, nU = math.cos(ang), math.sin(ang)                             # (about X: Z up the face; the face's forward normal)
        for i in range(1, 5):
            t = i / 5 * 0.94; k = 0.12 + 0.8 * i / 5
            q = (q0[0] + (q1[0] - q0[0]) * k, q0[1] + (q1[1] - q0[1]) * k)
            x = -side * 2.6 * mm
            g = box(x - 2.4 * mm, x + 2.4 * mm, -1.4 * mm, 1.4 * mm, -2.6 * mm, 2.6 * mm)
            g.transform(Matrix.Translation((0, q[0], q[1])) @ Matrix.Rotation(ang, 4, 'X')); cut(body, g)
            wins.append((i - 1, t, side, q, ang, nF, nU))
    smooth(body); Kx.adopt(body, 'mag', 'black', pm)
    for i, t, side, q, ang, nF, nU in wins:
        x = -side * 2.6 * mm
        o = Kx.obj(box(x - 2.2 * mm, x + 2.2 * mm, -0.3 * mm, 0.3 * mm, -2.4 * mm, 2.4 * mm), 'mag', 'brass', pm)
        d = side * 1.0 * mm         # (the slot's floor, inward from its face)
        o.matrix_world = Matrix.Translation((0, q[0] + d * nF, q[1] + d * nU)) @ Matrix.Rotation(ang, 4, 'X')
        o['chk'] = {'role': 'hole', 'i': i, 't': round(t, 4), 'side': side}
    for sd in (-1, 1):   # the feed lips
        o = Kx.obj(box(min(sd * 9.8 * mm, sd * 7.2 * mm), max(sd * 9.8 * mm, sd * 7.2 * mm), P(700, 0)[0], P(640, 0)[0], MAG_TOP[1] - 1.0 * mm, MAG_TOP[1] + 0.6 * mm), 'mag', 'black', pm)
        bevel(o, 0.3 * mm, 1); smooth(o)
    # the top round (9x19: the case 19.15 mm, a round nose to 29.7 mm), its case head at the body's back wall; the check's case and tip
    h, zc = P(706, 0)[0], MAG_TOP[1] - 2.5 * mm
    o = Kx.obj(lathe([(h, 0.0005), (h, 4.9 * mm), (h + 0.9 * mm, 4.9 * mm), (h + 1.2 * mm, 4.3 * mm), (h + 2.0 * mm, 4.3 * mm), (h + 2.3 * mm, 4.95 * mm),
                      (h + 19.15 * mm, 4.8 * mm), (h + 19.15 * mm, 0.0005)], 18, (0, 0, zc)), 'mag', 'brass', pm); smooth(o); o['chk'] = {'role': 'top', 'i': 0}
    o = Kx.obj(lathe([(h + 19.15 * mm, 0.0005), (h + 19.15 * mm, 4.5 * mm), (h + 23.5 * mm, 4.5 * mm), (h + 27.0 * mm, 3.9 * mm), (h + 29.2 * mm, 2.2 * mm), (h + 29.7 * mm, 0.0005)],
                   16, (0, 0, zc)), 'mag', 'brass', pm); smooth(o); o['chk'] = {'role': 'top', 'i': 1}
    pad = [(660, 484), (792, 484), (796, 498), (788, 506), (664, 506)] if not ext else [(660, 484), (792, 484), (798, 500), (794, 512), (780, 518), (668, 518)]
    o = Kx.obj(prism(PL([(x + dx, y + ext) for x, y in pad]), 'x', -15.5 * mm, 15.5 * mm), 'mag', 'polymer', pm); bevel(o, 1.5 * mm, 2); smooth(o)
    if ext:
        o = Kx.tmp(prism(PL([(664, 482), (782, 482), (780 + dx, 486 + ext), (664 + dx, 486 + ext)]), 'x', -11.5 * mm, 11.5 * mm))
        for s_ in (-1, 1):   # a witness window each side
            cut(o, box(s_ * 10.8 * mm, s_ * 12 * mm, F(710 + dx * 0.5), F(700 + dx * 0.5), U(486 + ext * 0.75), U(486 + ext * 0.25)))
        bevel(o, 0.8 * mm, 1); smooth(o); Kx.adopt(o, 'mag', 'polymer', pm)
magazine(K)

# ---- the gun's info and the authored-pistol anchors (TASK 15's names) ----
SY = U(91)                                                  # the sight line: the rear notch's floor and the front post's top
info = {
    'sy': round(SY, 4), 'fSight': round(F(752), 4), 'relief': 0.36, 'pistol': True,
    'muzzles': [[round(MUZ, 4), 0, 0]],
    'grip': [round(F(700), 4), round(U(320), 4), 0], 'support': [round(F(690), 4), round(U(340), 4), -0.022],
    'anim': {'slide': 'part_slide', 'mag': 'part_mag'},
    'slide': [round(F(735), 4), round(U(150), 4), 0],
    'magAt': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4)],
    'chamberAt': {'side': 'port', 'f': round(F(615), 4), 'x': 0.006, 'y': 0.009},
}
anchors = {
    'mount_slide': [0, round(s_bot, 4), 0],                                     # the slide's rear on the frame's rails
    'mount_optic': [round(OPT_F, 4), round(s_top - OPT_D, 4), 0],              # the optic cut's centre, on its floor
    'mount_optic_end': [round(OPT_F, 4), round(s_top - OPT_D, 4), 0],          # (no rail)
    'mount_barrel': [round(F(450), 4), 0, 0],                                   # the slide's mouth: the barrel (here the suppressor) begins
    'mount_mag': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4), 0],
    'mount_grip': [round(F(588), 4), round(U(258), 4), 0],                      # the grip seat: its front, the frame's underside
    'mount_tac': [round(F(335), 4), round(bot, 4), 0],                          # the rail under the housing (on the long and the short alike)
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)

# ---- VARIANTS: their own collections and files ----
VARS = []
c_, r_, K2 = kit_variant(ID, 'barrel_short', 'barrel', {})
MUZ2 = suppressor(K2, MAIN_SEAM)
r_['variant_json'] = json.dumps({'gun': ID, 'slot': 'barrel', 'of': 'factory', 'info': {'muzzles': [[round(MUZ2, 4), 0, 0]]},
                                 'note': 'the front block off at the main seam: 94 mm shorter (muzzle 179 mm), far handier, less quiet'})
VARS.append(('barrel_short', c_))
MAG_EXT = 70                                                # (pixels: 25 mm)
c_, r_, K3 = kit_variant(ID, 'mag_ext', 'mag', {'note': 'extended magazine: 25 mm longer, +5 rounds (22)', 'cap': 22})
magazine(K3, MAG_EXT)
VARS.append(('mag_ext', c_))

meshes = [o for o in coll.all_objects if o.type == 'MESH']
vglb = {n: (export_glb(c, os.path.join(HERE, n + '.glb')) if EXPORT else None, tris_of(c.all_objects)) for n, c in VARS}
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in b] for b in bb], 'info': info,
          'glb': save_and_export(coll, root, HERE, ID, EXPORT, also=tuple(c for _, c in VARS)), 'variants': vglb, 'short_muzzle_mm': round(MUZ2 * 1000, 1)}
