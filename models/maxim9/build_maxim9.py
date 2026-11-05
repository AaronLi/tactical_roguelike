# The SilencerCo Maxim 9 (integrally suppressed 9 mm pistol, long configuration), in Blender.
#   Blender: exec(open(r'<repo>/models/maxim9/build_maxim9.py').read(), {'GUN_DIR': r'<repo>/models/maxim9'})
#   or:      blender -b -P models/maxim9/build_maxim9.py
# Proportions measured off a side-on product photo (muzzle left; reference only, nothing traced into the repo): 768 px = 273 mm overall
# (10.75 in, the long configuration), so 0.3555 mm a pixel; f = (778 - x) px forward of the slide's rear, up = (145 - y) px over the bore.
# Published: 273 mm long (242 short), 4.38 in barrel, about 40 mm across the suppressor, 17 rounds of 9x19.
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the slide's rear face on the bore line (as the pistols' frames).
# Parts (the pistol interface, expected from the round-3 pistol reform): base = frame (dust cover, trigger guard, trigger, controls);
# grip = the grip (stippled); slide = part_slide (with the rear sight, slot optic); barrel = the hood seen in the port; muzzle = the integral
# suppressor housing (with the front sight, slot optic); mag = part_mag (body up the grip, base plate).
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
bevel(slide, 0.6 * mm, 2); smooth(slide)
pslide = K.part('slide', (0, 0, 0))
K.adopt(slide, 'slide', 'black', pslide)
# the rear sight (on the slide: it moves with it): a dovetailed block with a square notch
rs = K.tmp(prism(PL([(770, 108), (735, 108), (738, 92), (768, 90)]), 'x', -10 * mm, 10 * mm))
cut(rs, box(-1.8 * mm, 1.8 * mm, F(780), F(730), U(100), U(80)))
bevel(rs, 0.4 * mm, 1); smooth(rs)
K.adopt(rs, 'optic', 'black', pslide)

# ---- BARREL: the hood and chamber block seen through the port, and the barrel ahead of it inside the slide ----
o = K.obj(box(-5.5 * mm, 5.5 * mm, F(700), F(560), -3 * mm, s_top - 1.2 * mm), 'barrel', 'gunmetal'); bevel(o, 0.4 * mm, 1); smooth(o)
o = K.obj(lathe([(F(560), 6.4 * mm), (F(452), 6.4 * mm)], 18), 'barrel', 'gunmetal'); smooth(o)

# ---- SUPPRESSOR (muzzle): the deep housing over the barrel and the frame's front, rounded edges, two recessed panels each side, the bore ----
HW = 19.5 * mm
hp = PL([(10, 103), (450, 103), (450, 186), (365, 186), (365, 262), (325, 305), (40, 312), (10, 300)])
hs = K.tmp(prism(hp, 'x', -HW, HW))
# its section (front view, from a 3/4 front photo): full width below the slide's foot, a narrower upper deck above a crease, big chamfers on top
UW, top, bot = 17.2 * mm, U(103), U(312)
sec = [(-HW, bot - 0.01), (HW, bot - 0.01), (HW, U(186)), (UW, U(186) + 5 * mm), (UW, top - 5.5 * mm), (UW - 5.5 * mm, top + 0.0005),
       (-UW + 5.5 * mm, top + 0.0005), (-UW, top - 5.5 * mm), (-UW, U(186) + 5 * mm), (-HW, U(186))]
boolean(hs, prism(sec, 'y', F(460), F(0) + 0.01), 'INTERSECT')
for s in (-1, 1):
    pa = PL([(22, 198), (108, 198), (118, 268), (30, 276)])
    pb = PL([(122, 198), (330, 198), (392, 228), (395, 258), (345, 288), (130, 282)])
    for pts in (pa, pb):
        cut(hs, prism(pts, 'x', s * (HW - 0.8 * mm), s * (HW + 0.01)))
cut(hs, cyl(5.2 * mm, F(30), F(0), 'y', (0, 0), 24))                     # the bore's exit
for x in (-5.5 * mm, 5.5 * mm):                                          # two small holes in the face under it (the take-down pins' ends)
    cut(hs, cyl(1.5 * mm, F(18), F(0) + 0.002, 'y', (x, U(185)), 12))
bevel(hs, 2.2 * mm, 3, 30); smooth(hs)
K.adopt(hs, 'muzzle', 'black')
# the front sight on the housing's top (fixed: the barrel does not move here)
o = K.obj(prism(PL([(50, 103), (25, 103), (27, 92), (47, 92)]), 'x', -1.6 * mm, 1.6 * mm), 'optic', 'black'); bevel(o, 0.3 * mm, 1); smooth(o)
o = K.obj(cyl(0.9 * mm, F(30), F(28), 'y', (0, U(95)), 10), 'optic', 'sightPaint')

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
pmag = K.part('mag', (0, MAG_TOP[0], MAG_TOP[1]))
o = K.obj(prism(PL([(605, 192), (712, 192), (778, 486), (664, 486)]), 'x', -10 * mm, 10 * mm), 'mag', 'black', pmag); bevel(o, 0.8 * mm, 1); smooth(o)
o = K.obj(prism(PL([(660, 484), (792, 484), (796, 498), (788, 506), (664, 506)]), 'x', -15.5 * mm, 15.5 * mm), 'mag', 'polymer', pmag); bevel(o, 1.5 * mm, 2); smooth(o)

# ---- the gun's info and anchors (placeholders until the pistol reform settles the pistol anchors) ----
SY = U(91)                                                  # the sight line: the rear notch's floor and the front post's top
info = {
    'sy': round(SY, 4), 'fSight': round(F(752), 4), 'relief': 0.36, 'pistol': True,
    'muzzles': [[round(F(10), 4), 0, 0]],
    'grip': [round(F(700), 4), round(U(320), 4), 0], 'support': [round(F(690), 4), round(U(340), 4), -0.022],
    'anim': {'slide': 'part_slide', 'mag': 'part_mag'},
    'slide': [round(F(735), 4), round(U(150), 4), 0],
    'magAt': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4)],
    'chamberAt': {'side': 'port', 'f': round(F(615), 4), 'x': 0.006, 'y': 0.009},
}
anchors = {
    'mount_optic': [round(F(735), 4), round(s_top, 4), 0], 'mount_optic_end': [round(F(640), 4), round(s_top, 4), 0],
    'mount_muzzle': [round(F(10), 4), 0, 0], 'mount_barrel': [round(F(452), 4), 0, 0],
    'mount_grip': [round(F(588), 4), round(U(258), 4), 0], 'mount_mag': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4), 0],
    'mount_tac': [round(F(380), 4), round(U(312), 4), 0],
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors); root['seat_json'] = json.dumps({'barrelR': 0.0064})

meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in b] for b in bb], 'info': info,
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
