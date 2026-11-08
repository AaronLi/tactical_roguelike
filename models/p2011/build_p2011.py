# A 2011: the double-stack 9 mm descendant of the 1911, in Blender. Its shape after a 4.5" duty 2011 (the user chose the HD P4.5's
# gallery as the reference: side, top and three-quarter product photos, viewed in the browser and measured there; reference only,
# nothing traced into the repo; no maker's markings, names, flags or logos copied, the grip's texture plain stippling).
#   Blender: exec(open(r'<repo>/models/p2011/build_p2011.py').read(), {'GUN_DIR': r'<repo>/models/p2011'})
#   or:      blender -b -P models/p2011/build_p2011.py
# The side photo (1000 px square, muzzle right, the left side): the slide 813 px = about 179 mm, so 0.22 mm a pixel; f = (x - 150) px
# forward of the slide's rear, up = (272 - y) px over the bore. The top photo (0.2 mm a pixel): the slide 24 mm across, its top a 12 mm
# flat with a broad bevel each side down 7 mm (the side photo's bright band), the grip 33 mm across.
# Motifs: the bevelled slide top; four long leaning slots at the rear and five at the front, round at both ends; an optic cut over the
# rear with its plate, the rear sight standing at its front edge, ahead of it the ejection port opening over the top; a tall front sight;
# the bushingless crown and the guide rod's plug in the slide's nose; the dust cover full length with its rail's lugs under it; a squared
# trigger guard with a thick front; a skeletonised flat trigger; the ring hammer; the beavertail and the grip safety's curve; a long thumb
# safety and slide stop; a straight stippled grip flaring a little into its magazine well; the base pad below.
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the slide's rear face on the bore line (as the pistols' frames).
# Parts and anchors: the authored-pistol interface (as models/maxim9).
import bpy, json, math, os
from mathutils import Matrix
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = 'p2011'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
S = 0.22
def P(x, y): return ((x - 150) * S * mm, (272 - y) * S * mm)      # a photo pixel -> (forward, up) metres
def PL(pts): return [P(x, y) for x, y in pts]
def F(x): return (x - 150) * S * mm
def U(y): return (272 - y) * S * mm
GL = 0.30                                                          # the grip's lean at its front (pixels back per pixel down)

def wnorm(o, deg=30):
    # shade by angle, then weight each vertex's normal by the faces' areas (keeping the sharp edges): the big flat sides stay flat
    # instead of picking up the rounded edges' slope across their long triangles (the side view's streaks)
    smooth(o, deg)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    _apply(o, md); return o

def boxuv(o):
    # UVs in metres, each face projected along its dominant axis (a box projection): the game's 'stipple' material tiles its
    # relief (bump) map by the metre over them (js/gunmaterials.ts relief: a pit pattern every 6 mm), so the grip reads stippled
    me = o.data; uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        n = p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (v[a], v[b])
    return o

coll, root = kit_collection(ID)
K = Kit(coll, root)

SW = 12.0 * mm                                 # the slide's half width (24 mm)
s_top, s_bot, s_end = U(220), U(332), F(963)   # its top, its foot, its muzzle face
TOPW, BEV = 6.0 * mm, 7.0 * mm                 # the top's flat (half) and the bevel's drop

# ---- SLIDE (part_slide) ----
def slide_sec(w, b, t, tw, bev):
    # flat sides, the broad bevel up to the flat top, its edges eased (filleted), the foot's corners small
    up = fillet_poly([(w, b + 5 * mm), (w, t - bev), (tw, t), (-tw, t), (-w, t - bev), (-w, b + 5 * mm)], 2.2 * mm, 5)
    return [(-w + 0.8 * mm, b), (w - 0.8 * mm, b), (w, b + 0.8 * mm)] + up[6:-6] + [(-w, b + 0.8 * mm)]
sec = slide_sec(SW, s_bot, s_top, TOPW, BEV)
slide = K.tmp(prism(sec, 'y', 0.0, s_end))
cut(slide, prism([(s_end - 5 * mm, s_top + 0.001), (s_end + 0.001, s_top + 0.001), (s_end + 0.001, s_top - 5 * mm)], 'x', -0.03, 0.03))   # the nose's top chamfered
for s in (-1, 1):
    cut(slide, prism([(s * (SW + 0.001), s_end - 3 * mm), (s * (SW + 0.001), s_end + 0.001), (s * (SW - 3 * mm), s_end + 0.001)], 'z', s_bot - 0.01, s_top + 0.01))
cut(slide, cyl(7.2 * mm, s_end - 0.004, s_end + 0.01, 'y', (0, 0), 28))                                                        # the mouth round the crown
cut(slide, box(-7.0 * mm, SW + 0.01, F(455), F(592), 1.0 * mm, s_top + 0.01))                                                  # the port, open over the top and the right
def slots(xs, y0=312, y1=238, w=24, lean=14):
    for x in xs:
        r = w / 2
        g = circles_hull([P(x, y0 - r), P(x + lean, y1 + r)], r * S * mm, 12)
        for s in (-1, 1): cut(slide, prism(g, 'x', s * (SW - 1.4 * mm), s * (SW + 0.01)))
slots((212, 248, 285, 322))                                                                                                 # the rear set
slots((665, 702, 740, 776, 813), y0=308)                                                                                    # the front set
OPT_F0, OPT_F1, OPT_D = F(165), F(360), U(220) - U(228)                                                                            # the optic cut
OPT_F = (OPT_F0 + OPT_F1) / 2
cut(slide, box(-SW - 0.01, SW + 0.01, -0.01, OPT_F1, s_top - OPT_D, s_top + 0.01))                                      # the rear's top lower: the optic cut
cut(slide, prism([(-0.01, s_top - OPT_D + 0.001), (0.0035, s_top - OPT_D + 0.001), (-0.01, s_top - OPT_D - 0.004)], 'x', -0.03, 0.03))   # (its rear corner eased)
bevel(slide, 0.5 * mm, 2); wnorm(slide)
pslide = K.part('slide', (0, 0, 0))
K.adopt(slide, 'slide', 'black', pslide)
# the nose: the slide down past its foot at the front, round the guide rod's plug
ROD_U = U(352)
nz = K.tmp(prism([(-SW + 2.5 * mm, U(372)), (SW - 2.5 * mm, U(372)), (SW, U(372) + 2.5 * mm), (SW, s_bot + 0.001), (-SW, s_bot + 0.001), (-SW, U(372) + 2.5 * mm)], 'y', F(905), s_end))
cut(nz, prism([(s_end - 4 * mm, U(372) - 0.001), (s_end + 0.001, U(372) - 0.001), (s_end + 0.001, U(372) + 4 * mm)], 'x', -0.03, 0.03))
for s in (-1, 1):
    cut(nz, prism([(s * (SW + 0.001), s_end - 3 * mm), (s * (SW + 0.001), s_end + 0.001), (s * (SW - 3 * mm), s_end + 0.001)], 'z', U(372) - 0.01, s_bot + 0.01))
cut(nz, cyl(5.0 * mm, s_end - 0.003, s_end + 0.01, 'y', (0, ROD_U), 24))
bevel(nz, 0.6 * mm, 2); wnorm(nz); K.adopt(nz, 'slide', 'black', pslide)
o = K.obj(cyl(4.6 * mm, s_end - 0.003, s_end - 0.0003, 'y', (0, ROD_U), 24), 'slide', 'steel', pslide); smooth(o)        # the plug
o = K.obj(cyl(1.6 * mm, s_end - 0.0004, s_end + 0.0002, 'y', (0, ROD_U), 12), 'slide', 'gunmetal', pslide)
# the optic plate over the cut (a dot replaces it), its two screws side by side near its rear
cp = K.tmp(box(-TOPW - 1.8 * mm, TOPW + 1.8 * mm, OPT_F0 + 0.2 * mm, OPT_F1 - 0.2 * mm, s_top - OPT_D - 0.3 * mm, s_top - OPT_D + 0.4 * mm)); bevel(cp, 0.8 * mm, 2); smooth(cp)
K.adopt(cp, 'optic', 'black', pslide)
for dx in (-4.5 * mm, 4.5 * mm):
    o = K.obj(cyl(1.6 * mm, s_top - OPT_D + 0.3 * mm, s_top - OPT_D + 0.6 * mm, 'z', (dx, OPT_F0 + 0.010), 12), 'optic', 'steel', pslide); smooth(o)
# the rear sight: standing at the cut's front edge, a square notch, ramped at its front
rb = K.tmp(prism(PL([(362, 230), (454, 230), (454, 221), (366, 221)]), 'x', -TOPW - 1.5 * mm, TOPW + 1.5 * mm)); bevel(rb, 0.8 * mm, 2); smooth(rb)
K.adopt(rb, 'optic', 'black', pslide)                                                                                      # the rear sight's base, ahead of the cut
rs = K.tmp(prism(PL([(406, 222), (438, 222), (436, 196), (428, 181), (410, 181)]), 'x', -8.5 * mm, 8.5 * mm))
cut(rs, box(-1.9 * mm, 1.9 * mm, -0.02, 0.2, U(200), 0.04))   # (the notch: its floor 0.7 mm under the post's top, 3.8 mm wide)
bevel(rs, 0.4 * mm, 2); smooth(rs)
K.adopt(rs, 'optic', 'black', pslide)
# the front sight: a tall post, its fibre across the top
fs = K.tmp(prism(PL([(908, 222), (955, 222), (952, 199), (914, 197)]), 'x', -1.4 * mm, 1.4 * mm)); bevel(fs, 0.4 * mm, 1); smooth(fs)   # (2.8 mm wide)
K.adopt(fs, 'slide', 'black', pslide)
o = K.obj(cyl(0.9 * mm, F(916), F(950), 'y', (0, U(201)), 10), 'slide', 'sightPaint', pslide)

# ---- BARREL: the crown, the body inside; the hood showing in the port ----
o = K.obj(lathe([(F(600), 6.9 * mm), (s_end + 0.0006, 6.9 * mm), (s_end + 0.0006, 4.6 * mm), (s_end - 0.0015, 4.6 * mm)], 28), 'barrel', 'black'); smooth(o)
o = K.obj(cyl(4.6 * mm, s_end - 0.004, s_end + 0.0007, 'y', (0, 0), 20), 'barrel', 'gunmetal')
o = K.obj(box(-6.0 * mm, 6.0 * mm, F(452), F(592), -3 * mm, s_top - 1.4 * mm), 'barrel', 'steel'); bevel(o, 0.5 * mm, 2); smooth(o)
MUZ = s_end + 0.0006

# ---- FRAME (base) ----
FW = 11.0 * mm
fr = K.tmp(prism(PL([(150, 332), (958, 332), (958, 380), (945, 390), (662, 390), (650, 405), (425, 410), (175, 410), (150, 395)]), 'x', -FW, FW))
bevel(fr, 1.6 * mm, 3, 30); wnorm(fr)
K.adopt(fr, 'base', 'black')
o = K.tmp(prism(PL([(152, 300), (139, 300), (136, 340), (152, 345)]), 'x', -FW, FW)); bevel(o, 0.8 * mm, 2); smooth(o); K.adopt(o, 'base', 'black')   # the frame's tang behind the slide
for x0, x1 in ((750, 775), (795, 821), (840, 867), (884, 942)):                                         # the rail's lugs under the dust cover
    o = K.obj(box(-FW + 1.0 * mm, FW - 1.0 * mm, F(x0), F(x1), U(397), U(388)), 'base', 'black'); bevel(o, 0.5 * mm, 1); smooth(o)
tg = K.tmp(prism(PL([(425, 498), (404, 514), (414, 524), (431, 528), (612, 528), (620, 520), (620, 452), (632, 422), (652, 404), (425, 406)]), 'x', -5.0 * mm, 5.0 * mm))
cut(tg, prism(PL([(440, 410), (440, 498), (452, 511), (588, 511), (597, 499), (597, 447), (588, 425), (568, 410)]), 'x', -0.02, 0.02))
bevel(tg, 1.5 * mm, 3, 30); wnorm(tg, 35)
K.adopt(tg, 'base', 'black')
tr = K.tmp(prism(PL([(446, 412), (468, 412), (472, 455), (468, 505), (452, 508), (446, 470)]), 'x', -3.2 * mm, 3.2 * mm))      # the flat trigger, skeletonised
for yy in (432, 455, 478):
    cut(tr, box(-0.01, 0.01, F(452), F(464), U(yy + 8), U(yy)))
bevel(tr, 0.5 * mm, 2); smooth(tr); K.adopt(tr, 'base', 'steel')
# the beavertail over the web of the hand, the grip safety's curve down to the back strap
bt = K.tmp(prism(PL([(175, 335), (178, 522), (131, 533), (137, 517), (144, 501), (152, 485), (156, 469), (155, 455), (150, 440), (142, 425), (130, 413),
                     (115, 405), (94, 397), (72, 389), (49, 381), (37, 373), (34, 366), (42, 361), (80, 360), (122, 356), (135, 341), (150, 335)]), 'x', -FW, FW))
bevel(bt, 2.6 * mm, 4, 30); wnorm(bt, 35); K.adopt(bt, 'base', 'black')
hm = K.tmp(prism(PL([(152, 268), (140, 250), (122, 250), (114, 266), (122, 284), (152, 292)]), 'x', -3.0 * mm, 3.0 * mm))
cut(hm, cyl(1.8 * mm, -0.01, 0.01, 'x', (F(128), U(267)), 14)); bevel(hm, 0.4 * mm, 2); smooth(hm); K.adopt(hm, 'base', 'black')   # the ring hammer
for s in (-1, 1):                                                                                                           # the thumb safety, both sides
    o = K.obj(prism(PL([(150, 344), (283, 342), (288, 352), (270, 366), (165, 368), (146, 360)]), 'x', s * FW, s * (FW + 1.5 * mm)), 'base', 'black'); bevel(o, 0.4 * mm, 2); smooth(o)
o = K.obj(prism(PL([(325, 340), (515, 344), (525, 356), (515, 368), (340, 368)]), 'x', -FW - 1.3 * mm, -FW + 0.1 * mm), 'base', 'black'); bevel(o, 0.4 * mm, 2); smooth(o)   # slide stop (left)
o = K.obj(cyl(2.6 * mm, -FW - 1.5 * mm, FW + 1.5 * mm, 'x', (F(517), U(355)), 14), 'base', 'black'); smooth(o)
o = K.obj(cyl(3.0 * mm, -FW - 4.2 * mm, -FW - 2.0 * mm, 'x', (F(383), U(483)), 16), 'base', 'black'); smooth(o)               # the magazine release (left)

# ---- GRIP: straight, front strap and back strap, flaring a little at its foot into the magazine well; rounded right round ----
GW = 16.5 * mm
gp = PL([(425, 410), (425, 505), (389, 525), (366, 541), (299, 765), (316, 797), (318, 805), (312, 815), (67, 830), (58, 815), (45, 789), (39, 765), (131, 533), (178, 522), (178, 410)])
g = K.tmp(prism(gp, 'x', -GW, GW))
bevel(g, 8.0 * mm, 6, 30)
cut(g, prism(PL([(415, 400), (265, 400), (85, 836), (300, 836)]), 'x', -11.5 * mm, 11.5 * mm))          # the magazine well
for sd in (-1, 1):
    cut(g, prism(PL([(372, 470), (170, 470), (75, 790), (300, 790)]), 'x', sd * (GW - 0.6 * mm), sd * (GW + 0.01)))
wnorm(g, 35); boxuv(g)
K.adopt(g, 'grip', 'stipple')

# ---- MAGAZINE (part_mag): the body down the grip's lean, the base pad below the well ----
MAG_TOP = P(270, 290)
def magazine(Kx):
    pm = Kx.part('mag', (0, MAG_TOP[0], MAG_TOP[1])); pm['check'] = {'w': 0.021}
    a, b = (270, 290), (425, 290)
    c, d = (425 - 530 * GL, 820), (270 - 530 * GL, 820)
    body = Kx.tmp(prism(PL([a, b, c, d]), 'x', -10.5 * mm, 10.5 * mm))
    cut(body, prism(PL([(282, 282), (414, 282), (414, 298), (282, 298)]), 'x', -9.0 * mm, 9.0 * mm))
    bevel(body, 0.8 * mm, 1)
    wins = []
    for side, (a0, a1) in ((-1, (a, d)),):                    # (the back only: no windows down the front; tagged side 1 below)
        q0, q1 = P(*a0), P(*a1)
        uF, uU = q0[0] - q1[0], q0[1] - q1[1]; n_ = math.hypot(uF, uU); uF, uU = uF / n_, uU / n_
        ang = math.atan2(-uF, uU); nF, nU = math.cos(ang), math.sin(ang)
        for i in range(1, 5):
            t = i / 5 * 0.94; k = 0.12 + 0.8 * i / 5
            q = (q0[0] + (q1[0] - q0[0]) * k, q0[1] + (q1[1] - q0[1]) * k)
            x = -side * 2.6 * mm
            gb = box(x - 2.4 * mm, x + 2.4 * mm, -1.4 * mm, 1.4 * mm, -2.6 * mm, 2.6 * mm)
            gb.transform(Matrix.Translation((0, q[0], q[1])) @ Matrix.Rotation(ang, 4, 'X')); cut(body, gb)
            wins.append((i - 1, t, side, q, ang, nF, nU))
    smooth(body); Kx.adopt(body, 'mag', 'black', pm)
    for i, t, side, q, ang, nF, nU in wins:
        x = -side * 2.6 * mm
        o = Kx.obj(box(x - 2.2 * mm, x + 2.2 * mm, -0.3 * mm, 0.3 * mm, -2.4 * mm, 2.4 * mm), 'mag', 'brass', pm)
        dd = side * 1.0 * mm
        o.matrix_world = Matrix.Translation((0, q[0] + dd * nF, q[1] + dd * nU)) @ Matrix.Rotation(ang, 4, 'X')
        o['chk'] = {'role': 'hole', 'i': i, 't': round(t, 4), 'side': 1}   # (side 1: the back face, toward the shooter)
    for sd in (-1, 1):
        o = Kx.obj(box(min(sd * 10.2 * mm, sd * 7.4 * mm), max(sd * 10.2 * mm, sd * 7.4 * mm), F(290), F(400), MAG_TOP[1] - 1.0 * mm, MAG_TOP[1] + 0.6 * mm), 'mag', 'black', pm)
        bevel(o, 0.3 * mm, 1); smooth(o)
    h, zc = F(276), MAG_TOP[1] - 2.5 * mm
    o = Kx.obj(lathe([(h, 0.0005), (h, 4.9 * mm), (h + 0.9 * mm, 4.9 * mm), (h + 1.2 * mm, 4.3 * mm), (h + 2.0 * mm, 4.3 * mm), (h + 2.3 * mm, 4.95 * mm),
                      (h + 19.15 * mm, 4.8 * mm), (h + 19.15 * mm, 0.0005)], 18, (0, 0, zc)), 'mag', 'brass', pm); smooth(o); o['chk'] = {'role': 'top', 'i': 0}
    o = Kx.obj(lathe([(h + 19.15 * mm, 0.0005), (h + 19.15 * mm, 4.5 * mm), (h + 23.5 * mm, 4.5 * mm), (h + 27.0 * mm, 3.9 * mm), (h + 29.2 * mm, 2.2 * mm), (h + 29.7 * mm, 0.0005)],
                   16, (0, 0, zc)), 'mag', 'brass', pm); smooth(o); o['chk'] = {'role': 'top', 'i': 1}
    pad = Kx.tmp(prism(PL([(100, 810), (300, 810), (290, 820), (276, 830), (216, 840), (98, 842), (94, 826)]), 'x', -13.5 * mm, 13.5 * mm))
    bevel(pad, 1.6 * mm, 3, 30); smooth(pad); Kx.adopt(pad, 'mag', 'polymer', pm)
magazine(K)

# ---- the gun's info and the authored-pistol anchors ----
SY = U(197)                                                   # the sight line: the front post's top (the contract: the post's tip is at sy), just over the notch's floor
info = {
    'sy': round(SY, 4), 'fSight': round(F(420), 4), 'relief': 0.36, 'pistol': True,
    'muzzles': [[round(MUZ, 4), 0, 0]],
    'grip': [round(F(260), 4), round(U(620), 4), 0], 'support': [round(F(280), 4), round(U(690), 4), -0.022],
    'anim': {'slide': 'part_slide', 'mag': 'part_mag'},
    'slide': [round(F(260), 4), round(U(300), 4), 0],
    'magAt': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4)],
    'chamberAt': {'side': 'port', 'f': round(F(520), 4), 'x': 0.006, 'y': 0.009},
}
anchors = {
    'mount_slide': [0, round(s_bot, 4), 0],
    'mount_optic': [round(OPT_F, 4), round(s_top - OPT_D, 4), 0],
    'mount_optic_end': [round(OPT_F, 4), round(s_top - OPT_D, 4), 0],
    'mount_barrel': [round(s_end, 4), 0, 0],
    'mount_mag': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4), 0],
    'mount_grip': [round(F(425), 4), round(U(410), 4), 0],
    'mount_tac': [round(F(846), 4), round(U(390), 4), 0],
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)

meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in b] for b in bb], 'info': info,
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
