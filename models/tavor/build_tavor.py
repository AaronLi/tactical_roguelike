# The TX-9 Tavor: an IWI Tavor X95 (the 16.5 in. 5.56 rifle, flat-top) on STANAG magazines, in Blender.
#   Blender: exec(open(r'<repo>/models/tavor/build_tavor.py').read(), {'GUN_DIR': r'<repo>/models/tavor'})
#   or:      blender -b -P models/tavor/build_tavor.py
# References: the Rainier Arms product shots of a black X95 XB16 (16.5 in., 5.56 NATO) on white, 650 x 365 px each: a level left side (muzzle to the left; the charging handle's
# channel, the blank where the left ejection port would be, the bolt release, the selector) and a level right side (muzzle to the right; the open ejection port and deflector,
# the mag release), plus three-quarter views, the flip-up irons standing and close-ups of the handguard, the butt, the nose cap and the top rail. Scale: 663.6 mm overall (IWI's
# 26.125 in.) over the 621 px from the hider's tip to the butt (x 13 to 633): 1.0703 mm a pixel (a coarse scale: about 1 mm a pixel); the bore on y 166 (the barrel's edges
# 160 and 172). The shell, the pistol grip with its trigger-guard loop and the butt are the left photo's silhouette (traced from its mask); the right photo's matches it,
# mirrored (the controls and plugs of the butt sit at the same distances from its back on both sides). Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the butt's
# back face on the bore line. Photo x counts from the left of the LEFT photo (butt at x 633.5, forward toward lower x), y down.
# What makes it the X95: the flat full-length top rail (in two stretches, the gap at x 357-366), the handguard block with its slanted slots, the row of short slots along its
# lower edge, the grid panel, the ridged lower lip and the nose cap with its vents; the closed trigger-guard loop running down into the grip with its finger grooves; the left
# charging knob in its channel; the bolt release behind the guard; the squarer butt with its panels, plugs and the mag release. Flip-up irons stand on the rail, tall and thin
# (the front post at the rail's front end, the rear leaf at the front of its rear stretch).
import bpy, json, math, os
from mathutils import Matrix
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
ID = 'tavor'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
S = 0.6636 / 620                              # metres a pixel
def F(x): return (633.5 - x) * S
def U(y): return (166 - y) * S
def PL(pts): return [(F(x), U(y)) for x, y in pts]
def wnorm(o, deg=30):
    smooth(o, deg)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    _apply(o, md); return o
def xs(a, b): return tuple(sorted((a, b)))
def slot_pts(cx, cy, ln, wd, ang, n=6):
    """A stadium (a slot with round ends) in photo pixels: centre, length, width, `ang` degrees from vertical (positive: the top toward the butt)."""
    r = wd / 2; a = math.radians(ang); d = max(ln / 2 - r, 0.01)
    ex, ey = math.sin(a), -math.cos(a)
    top = (cx + ex * d, cy + ey * d); bot = (cx - ex * d, cy - ey * d); base = math.atan2(ey, ex); pts = []
    for i in range(n + 1): th = base - math.pi / 2 + math.pi * i / n; pts.append((top[0] + r * math.cos(th), top[1] + r * math.sin(th)))
    for i in range(n + 1): th = base + math.pi / 2 + math.pi * i / n; pts.append((bot[0] + r * math.cos(th), bot[1] + r * math.sin(th)))
    return pts
def circ(cx, cy, r, n=16): return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
def rect(x0, y0, x1, y1, c=1.2): return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]

# ---- the STANAG magazine, the sights: the Mk18's (models/ar_kit.py), borrowed by running the AR builder into a scratch collection
ag = {'GUN_DIR': os.path.join(MODELS, '_tavor_scratch'), 'CFG': {}}
os.environ['GUN_EXPORT'] = '0'
exec(open(os.path.join(MODELS, 'ar_kit.py'), encoding='utf-8').read(), ag)
os.environ['GUN_EXPORT'] = '1' if EXPORT else '0'
scratch = ag['coll']
for o in list(scratch.all_objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.data.collections.remove(scratch)

coll, root = kit_collection(ID)
K = Kit(coll, root)
root['gun'] = ID
SH = 'polymer'                               # the X95's black polymer

# ===================================================================================== plan
HWG = 27.0 * mm                              # the handguard's and handle channel's half width
def hw(f):
    """The shell's half width at f (30 at the butt, 31 behind the grip, 27 round the handguard)."""
    pts = [(0.0, 30.0), (0.12, 31.0), (0.36, 31.0), (0.40, 27.0), (0.70, 27.0)]
    for (a, wa), (b, wb) in zip(pts, pts[1:]):
        if a <= f <= b: return (wa + (wb - wa) * (f - a) / (b - a)) * mm
    return 27.0 * mm
def plan_pts(d=0.0):
    """The body seen from above (x, forward): the butt's back edge straight across its middle, its corners rounded by 20 mm arcs, 62 mm across behind the grip, 54 round the handguard."""
    R = 26 * mm; W = 31 * mm + d; cx = W - R; right = []
    for i in range(9):                                            # (the rear right corner: from the back edge round to the side)
        a = math.pi / 2 * i / 8; right.append((cx + R * math.sin(a), 0.0 - d + R - R * math.cos(a)))
    right += [(31 * mm + d, 0.36), (HWG + d, 0.40), (HWG + d, 0.62 + d)]
    return [(-x, f) for x, f in right[::-1]] + right
PLAN = plan_pts()
def section_pts(d=0.0, zb=-0.080, zt=0.0482):
    """The body's cross-section (x, up): broad shoulders (15 mm radius on the top corners), a flat top, the underside's corners rounded by 10 mm."""
    W = 31 * mm + d; Rt = 20 * mm; Rb = 14 * mm; pts = []
    for i in range(9):                                            # (top right shoulder, from the side up to the top)
        a = math.pi / 2 * i / 8; pts.append((W - Rt + Rt * math.cos(a), zt + d - Rt + Rt * math.sin(a)))
    for i in range(9):                                            # (top left)
        a = math.pi / 2 + math.pi / 2 * i / 8; pts.append((-W + Rt + Rt * math.cos(a), zt + d - Rt + Rt * math.sin(a)))
    for i in range(9):                                            # (bottom left)
        a = math.pi + math.pi / 2 * i / 8; pts.append((-W + Rb + Rb * math.cos(a), zb - d + Rb + Rb * math.sin(a)))
    for i in range(9):                                            # (bottom right)
        a = 1.5 * math.pi + math.pi / 2 * i / 8; pts.append((W - Rb + Rb * math.cos(a), zb - d + Rb + Rb * math.sin(a)))
    return pts
def slice_sel(o, co, no, pred):
    """Bisect only the faces whose middle satisfies pred (the corner strips of the butt, cut at the same heights as the side cells so they share vertices with them)."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    fs = [f for f in bm.faces if pred(f.calc_center_median())]
    if fs:
        es = list({e for f in fs for e in f.edges}); vs = list({v for f in fs for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=vs + es + fs, plane_co=co, plane_no=no, dist=1e-6)
    bm.to_mesh(o.data); bm.free(); o.data.update(); return o
def along(a, b, r, step=0.040):
    """A lathe profile from a to b at radius r with a ring every `step`: a long tube is a row of short strips, not one 300 mm facet."""
    n = max(1, math.ceil((b - a) / step)); return [(a + (b - a) * i / n, r) for i in range(n + 1)]
def clean(o, d=0.02 * mm):
    """A boolean-and-slice leftovers pass: vertices within 0.02 mm welded, zero-area faces dissolved, (the faces with no area a slice through existing vertices leaves)."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=d)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=d)
    bm.to_mesh(o.data); bm.free(); o.data.update(); return o
def dark(poly_px, x_lo, x_hi):
    sg = 1 if x_lo + x_hi > 0 else -1; x_lo += sg * 0.04 * mm; x_hi += sg * 0.04 * mm        # (0.04 mm clear of the floor it lies on: faces on the same plane overlap)
    o = K.tmp(prism(PL(poly_px), 'x', x_lo, x_hi)); smooth(o); K.adopt(o, 'base', 'black'); return o
def pocket(sh, poly_px, f, sx, depth, floor=True, mat='black'):
    """An opening on side sx (-1 left, 1 right): a pocket `depth` deep with walls, and (floor) a dark floor plate at its bottom. Returns the cut applied to sh."""
    w = hw(f); a, b = sx * (w - depth), sx * (w + 1 * mm)
    cut(sh, prism(PL(poly_px), 'x', *xs(a, b)))
    if floor: dark(poly_px, *xs(sx * (w - depth), sx * (w - depth + 0.7 * mm)))
def raised(poly_px, f, sx, h, mat='black', bev=0.4):
    w = hw(f); o = K.tmp(prism(PL(poly_px), 'x', *xs(sx * (w - 0.3 * mm), sx * (w + h)))); boolean(o, prism(plan_pts(h), 'z', U(1300), U(-300)), 'INTERSECT'); boolean(o, prism(section_pts(h), 'y', -0.10, 0.80), 'INTERSECT'); bevel(o, min(0.4 * mm, h * 0.45), 1); smooth(o); K.adopt(o, 'base', mat); return o
def disc(cx, cy, r, f, sx, h, mat, n=14, depth=0.0):
    w = hw(f); o = K.obj(cyl(r * S, *xs(sx * (w - depth), sx * (w + h)), 'x', (F(cx), U(cy)), n), 'base', mat); smooth(o); return o

# ===================================================================================== the shell (base): the photo's outline above the grip
SHELL = [[91, 177], [91, 151], [91, 145], [93, 141], [97, 137], [102, 135], [110, 121], [440, 121], [440, 124], [612, 124], [622, 125], [630, 127], [634, 133], [633, 164],
         [631, 192], [631, 231], [627, 235], [621, 236], [483, 236], [483, 232], [421, 232], [421, 217],
         [415, 211], [414, 199], [408, 191], [406, 188], [360, 187], [248, 196], [107, 197], [107, 204], [105, 208], [97, 208], [95, 205], [93, 192], [91, 186]]
MAG_TOP = (F(452), -0.0458)                  # the well's mouth is photo x 421-483 (its middle 452) at y 232; the magazine's foot reaches y 342
MB, MF = -32.6 * mm, 31.6 * mm
sh = K.tmp(prism(PL(SHELL), 'x', -40 * mm, 40 * mm))
boolean(sh, prism(PLAN, 'z', U(1300), U(-300)), 'INTERSECT')
# the section: broad shoulders on the top (15 mm), the underside rounded (10 mm); then the remaining edges are rounded (4 mm, three segments) before any detail is cut
boolean(sh, prism(section_pts(), 'y', -0.10, 0.80), 'INTERSECT')
tidy(sh, 0.1 * mm, False); bevel(sh, 4.0 * mm, 2, 30)               # (chamfer the body once, THEN the cuts)
cut(sh, box(-12.4 * mm, 12.4 * mm, MAG_TOP[0] + MB - 1.0 * mm, MAG_TOP[0] + MF + 1.0 * mm, U(1250), MAG_TOP[1] + 2 * mm))
PORT = (F(499), F(419), U(172), U(153))                             # (the right side's ejection port; the left shows its cover panel at the same place)
def port_cutter(pa, pb, pu0, pu1, x_in, x_out, flare=0.7 * mm):
    c, m = (pa + pb) / 2, (pu0 + pu1) / 2; hw_, hh_ = (pb - pa) / 2, (pu1 - pu0) / 2; r_ = 2.0 * mm; cs = corner_segs(r_)
    xm = x_out - 2.5 * mm
    a = prism(rounded(c, m, hw_, hh_, r_, cs), 'x', x_in, xm)
    b = loft(rounded(c, m, hw_, hh_, r_, cs), rounded(c, m, hw_ + flare, hh_ + flare, r_ + flare, cs), 'x', xm - 0.01, x_out)
    return a, b
for pc_ in port_cutter(*PORT, -2.0 * mm, 33 * mm): cut(sh, pc_)

# ---- the handguard (both sides): the slanted slots, the row of short slots along its lower edge, the top dashes, the grid panel, the nose cap's vents
for sx in (-1, 1):
    pocket(sh, rect(100, 141, 248, 168, 3.0), 0.5, sx, 1.0 * mm, floor=False)     # (the band the slanted ribs stand in: recessed 1 mm, the ribs rise back to the surface below)
    for hx in (97, 107.5, 118.6, 130, 142, 153.6, 165, 202):                          # (the lower row: bold, dark, 5 x 13 px round-ended slots, deep)
        pocket(sh, slot_pts(hx, 169.5, 13, 5, 0), 0.5, sx, 14.0 * mm)
    for hx in (116, 130, 144, 214, 228):                                             # (the top row's dashes: nine, 10 px long at a 14 px pitch, the first well behind the body's sloped front corner: its edge is at x 102 at this height)
        pocket(sh, slot_pts(hx, 135, 10, 4.6, 90), 0.5, sx, 8.0 * mm)
for hx in (158, 172, 186, 200):                                                      # (four of them go through: the left photo shows daylight in them)
    cut(sh, prism(PL(slot_pts(hx, 135, 10, 4.6, 90)), 'x', -40 * mm, 40 * mm))
# the nose cap's vents (on its front face, cut along the bore): four slots over the barrel, two round holes under it
def nose_cut(poly_xz, depth=10.0):
    cut(sh, prism(poly_xz, 'y', F(91) - 0.001, F(91) + depth * mm))
for xo in (-15, -8, 8, 15):
    nose_cut([(xo * mm - 1.6 * mm, 4 * mm), (xo * mm + 1.6 * mm, 4 * mm), (xo * mm + 1.6 * mm, 16 * mm), (xo * mm - 1.6 * mm, 16 * mm)])
for xo in (-10, 10): nose_cut([(xo * mm + 3.0 * mm * math.cos(2 * math.pi * i / 10), -17 * mm + 3.0 * mm * math.sin(2 * math.pi * i / 10)) for i in range(10)])
# the sling hole through the nose cap's flanks
cut(sh, prism([(F(101) + 4.5 * mm * math.cos(2 * math.pi * i / 10), U(148) + 4.5 * mm * math.sin(2 * math.pi * i / 10)) for i in range(10)], 'x', -40 * mm, 40 * mm))
# the ridged lower lip: grooves across the handguard's underside
for i in range(11):
    xg = 100 + 12.5 * i
    cut(sh, box(-HWG - 1 * mm, HWG + 1 * mm, F(xg + 1.8), F(xg), U(196) - 0.001, U(196) + 1.6 * mm))
# ---- the left side: the long channel for the charging knob, the cover panel where the port would be, its hole plate, the plugs, the mag release's recess
CH = slot_pts(291.5, 148, 86, 7, 90, 8)
cut(sh, prism(PL(CH), 'x', -40 * mm, -HWG + 12.0 * mm)); dark(CH, -HWG + 11.4 * mm, -HWG + 12.2 * mm)       # (the channel: open from the shell's side, wherever that is along its length (31 mm out behind f 0.40, 27 ahead of it), down to a floor 15 mm from the axis)
BLANK = rect(419, 154, 499, 170, 2.0)
pocket(sh, BLANK, 0.18, -1, 7.0 * mm)
HOLEPLATE = rect(500, 153, 529, 170, 1.5)
pocket(sh, HOLEPLATE, 0.15, -1, 1.5 * mm, floor=False)
HOLES = [(508, 162), (515, 162), (522, 162)]
for hx, hy in HOLES: pocket(sh, circ(hx, hy, 1.7, 8), 0.15, -1, 6.0 * mm)
pocket(sh, rect(452, 190, 509, 211, 2.5), 0.18, -1, 1.5 * mm, floor=False)           # (the mag release's recess)
pocket(sh, rect(419, 190, 450, 212, 2.0), 0.2, -1, 0.8 * mm, floor=False)
# the right side: the same plugs; the port (cut above) with its deflector flap on its rear edge
for sx in (-1, 1):
    pocket(sh, circ(535, 208, 10), 0.1, sx, 5.0 * mm)
    pocket(sh, circ(498, 222, 8), 0.14, sx, 5.0 * mm)
    pocket(sh, circ(570, 198, 6), 0.06, sx, 6.0 * mm)
    pocket(sh, circ(382, 152, 10.5), 0.25, sx, 4.0 * mm)                           # (the round recess behind the selector's front: the barrel nut's cap)
    pocket(sh, circ(323, 183, 12.5), 0.31, sx, 3.0 * mm, floor=False)               # (the selector's recess)
cut(sh, box(-4.5 * mm, 4.5 * mm, F(297.6), F(283.4), U(199), U(188)))                 # (the slot in the floor the trigger comes through)
side_cuts = []
for sx_ in (-1, 1):
    for xw_, fp_ in ((31 * mm, 0.2), (HWG, 0.5)):
        for z_ in range(36, -72, -12): side_cuts.append(((sx_ * xw_, fp_, 0.0), (sx_, 0, 0), (0, 0, z_ * mm), (0, 0, 1)))
slice_across(sh, 'y', [0.040 * k_ for k_ in range(1, 15)])                           # (all of it: the long top and bottom bands and their bevels cut every 40 mm, the same planes as the side cells)
slice_faces(sh, side_cuts)
for z_ in range(36, -72, -12): slice_sel(sh, (0, 0, z_ * mm), (0, 0, 1), lambda c: c.y < 0.030)     # (the butt's swept back corners and back face, at the side cells' heights)
tidy(sh, 1e-6, True); clean(sh)
wnorm(sh, 50); K.adopt(sh, 'base', SH)
port_inside(K, *PORT, 31 * mm, mouth_r=5.6 * mm, ramp=26 * mm, az=(PORT[2] + PORT[3]) / 2)
CARRIER = port_carrier(K, *PORT, 31 * mm, ax=0.0, az=(PORT[2] + PORT[3]) / 2)

# ---- the grid panel's ribs, the raised and fitted parts, the pins and plugs (both sides where the photos show them on both)
def flush(poly_px, f, sx, depth=1.0 * mm, mat=SH):
    """A piece standing in a 1 mm recess, its face flush with the surface (a rib, a panel)."""
    w = hw(f); o = K.tmp(prism(PL(poly_px), 'x', *xs(sx * (w - depth - 0.3 * mm), sx * w))); return o
for sx in (-1, 1):
    for hx in (130, 141, 154, 166, 202, 216, 228, 238):                              # (the slanted slots of the photo are thin raised ribs: 2 mm wide, the top toward the muzzle)
        o = flush(slot_pts(hx, 152, 20, 1.9, -11), 0.5, sx); smooth(o); K.adopt(o, 'base', SH)
pn = flush(rect(174, 145, 197, 170, 1.0), 0.5, -1)                                    # (the raised rectangle with its horizontal lines)
w_ = hw(0.5)
for gy in (153, 157, 161, 165):
    cut(pn, prism(PL(rect(177, gy, 194, gy + 0.9, 0.2)), 'x', -w_ - 1 * mm, -w_ + 0.0 * mm) if False else prism(PL(rect(177, gy, 194, gy + 0.9, 0.2)), 'x', -w_ - 1 * mm, -w_ + 0.7 * mm))
bevel(pn, 0.3 * mm, 1); smooth(pn); K.adopt(pn, 'base', SH)
raised(rect(547, 172, 577, 178, 1.5), 0.1, -1, 0.8 * mm, 'steel')                  # (the serial plate)
raised(rect(581, 136, 612, 170, 4.0), 0.03, -1, 0.9 * mm, SH); raised(rect(581, 136, 612, 170, 4.0), 0.03, 1, 0.9 * mm, SH)   # (the butt's raised rear panel, each side)
for sx in (-1, 1):
    disc(595, 146, 5.0, 0.04, sx, 1.4 * mm, 'black'); disc(595, 146, 2.0, 0.04, sx, 1.9 * mm, 'steel')       # (its pin)
    disc(535, 208, 6.0, 0.1, sx, 1.0 * mm, 'steel', depth=3.0 * mm)                      # (the ring plug's stud)
    disc(498, 222, 5.0, 0.14, sx, 1.0 * mm, 'black', depth=3.0 * mm); disc(583, 230, 3.2, 0.05, sx, 1.4 * mm, 'steel')
    disc(382, 152, 7.5, 0.25, sx, 0.8 * mm, 'steel', depth=2.5 * mm)                     # (the nut's cap)
    # the mag release: a steel lever plate in its recess, with its pin
    w = hw(0.18)
    o = K.tmp(prism(PL(rect(455, 194, 505, 207, 2.0)), 'x', *xs(sx * (w - 0.8 * mm), sx * (w + 0.6 * mm)))); bevel(o, 0.3 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
    disc(462, 200, 2.0, 0.18, sx, 1.1 * mm, 'black')
    # the selector: a black hub with its steel centre and a lever pointing back
    SELP = (F(323), U(183)); w = hw(0.31)
    o = K.obj(cyl(10.0 * S, *xs(sx * (w - 2.0 * mm), sx * (w + 3.0 * mm)), 'x', SELP, 16), 'base', 'black'); smooth(o)
    o = K.obj(cyl(3.0 * S, *xs(sx * (w + 3.0 * mm), sx * (w + 3.8 * mm)), 'x', SELP, 10), 'base', 'steel'); smooth(o)
    lv = K.tmp(prism([(SELP[0] - 1.0 * mm, SELP[1] - 1.8 * mm), (SELP[0] - 15 * mm, SELP[1] - 1.4 * mm), (SELP[0] - 15 * mm, SELP[1] + 1.4 * mm), (SELP[0] - 1.0 * mm, SELP[1] + 1.8 * mm)], 'x', *xs(sx * (w + 3.0 * mm), sx * (w + 6.0 * mm))))
    bevel(lv, 0.4 * mm, 1); smooth(lv); K.adopt(lv, 'base', 'black')
    # the bolt release: a paddle behind the guard, with its pin
    w = hw(0.386)
    o = K.tmp(prism(PL(rect(265, 174, 282, 191, 2.0)), 'x', *xs(sx * (w - 0.3 * mm), sx * (w + 2.2 * mm)))); bevel(o, 0.5 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')
    disc(293, 187, 1.5, 0.39, sx, 0.8 * mm, 'steel')
# the right side's ejection deflector (a flap on the port's rear edge with its pin)
o = K.tmp(prism(PL(rect(120, 153, 148, 172, 2.0)), 'x', 30.7 * mm, 33.2 * mm)); bevel(o, 0.6 * mm, 1); smooth(o); K.adopt(o, 'base', 'black')
o = K.obj(cyl(2.0 * mm, 33.0 * mm, 33.8 * mm, 'x', (F(135), U(162)), 8), 'base', 'steel'); smooth(o)
# the butt pad (a line of rubber across the butt's rear)
BUTT = [[612, 125], [622, 125], [630, 127], [634, 133], [633, 164], [631, 192], [631, 231], [627, 235], [621, 236], [612, 236]]
pad = K.tmp(prism(PL(SHELL), 'x', -40 * mm, 40 * mm)); boolean(pad, prism(plan_pts(0.8 * mm), 'z', U(1300), U(-300)), 'INTERSECT'); boolean(pad, prism(section_pts(0.8 * mm), 'y', -0.10, 0.80), 'INTERSECT')
tidy(pad, 0.1 * mm, False); bevel(pad, 4.0 * mm, 2, 30); boolean(pad, prism(PL(BUTT), 'x', -40 * mm, 40 * mm), 'INTERSECT'); tidy(pad, 1e-6, True); wnorm(pad, 50); K.adopt(pad, 'base', 'rubber')      # (the butt pad: the shell's own shape, 0.8 mm proud, cut off at its front)
# the trigger
# the trigger: a thin curved steel blade coming down out of a slot in the receiver's floor (its top inside the housing), its tip forward and low (photo x 284-296, y 189-220)
TRIG = [[285.5, 188.5], [296, 188.5], [296, 199], [295.6, 206], [293.4, 213.5], [288.5, 218.5], [285, 219.7], [284.4, 218], [287, 212.5], [288.8, 204], [287.5, 198], [285.5, 196]]
o = K.tmp(prism(PL(TRIG), 'x', -2.4 * mm, 2.4 * mm)); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'base', 'steel')
dark([[283, 187.6], [297.4, 187.6], [297.4, 188.4], [283, 188.4]], -4.4 * mm, 4.4 * mm)

# ===================================================================================== the top rail (two stretches, the gap at photo x 357-366)
RA, RB = F(440), F(117)
RAIL_U = U(121)
picatinny(K, F(440), F(366), RAIL_U, 'base', 'black', lean=True)
picatinny(K, F(357), F(117), RAIL_U, 'base', 'black', lean=True)
RAIL_TOP = RAIL_U + 5.6 * mm
SY = 0.088                                                        # the sight line: the flip-ups' tips stand 37-44 mm over the rail (the X95 photos)
L = F(91)                                                         # the handguard's nose face: where the barrel comes out
picatinny(K, F(225), F(125), U(196.5), 'base', 'black', axis='bottom', lean=True)         # (the short bottom rail under the forend: foregrips, the hand stop and the bipod stand on it; mount_fg is its middle)
# the lower rail is the handguard's own ridged lip; the side rail sections for the game's lights sit on its flanks
for s_, ax in ((1, 'right'), (-1, 'left')):
    picatinny(K, F(248), F(232), -6 * mm, 'base', 'black', axis=ax, x0=s_ * HWG, lean=True)

# ===================================================================================== the barrel (barrel) and the flash hider (muzzle)
MZ0 = F(55)
COLLAR_R, COLLAR_BORE = 11.5 * mm, 9.8 * mm
cl = K.tmp(lathe([(L - 0.032, COLLAR_R), (L + 0.006, COLLAR_R), (L + 0.008, COLLAR_R - 1.5 * mm)], segs(COLLAR_R)))
cut(cl, cyl(COLLAR_BORE, L - 0.04, L + 0.03, 'y', (0, 0), segs(COLLAR_BORE, 0.3 * mm)))
tidy(cl); smooth(cl); K.adopt(cl, 'base', 'black')
BR = 6.4 * mm
o = K.obj(lathe(along(0.222, L - 0.030, BR), 12), 'barrel', 'park'); smooth(o)
o = K.obj(lathe(along(L - 0.030, MZ0, BR, 0.016), segs(BR)), 'barrel', 'park'); smooth(o)
o = K.obj(lathe([(L + 0.002, 8.2 * mm), (L + 0.008, 8.2 * mm), (L + 0.011, BR)], segs(8.2 * mm)), 'barrel', 'black'); smooth(o)
def flash_hider(mz0, ln=0.0450, R=10.2 * mm):
    o = K.obj(lathe([(mz0 - 2 * mm, 8.6 * mm), (mz0, 8.6 * mm)], segs(8.6 * mm)), 'muzzle', 'steel'); smooth(o)
    fh = K.tmp(lathe([(mz0, 8.0 * mm), (mz0 + 3 * mm, 8.8 * mm), (mz0 + 12 * mm, 8.8 * mm), (mz0 + 13 * mm, R), (mz0 + 17 * mm, R), (mz0 + 18 * mm, 8.8 * mm), (mz0 + 21 * mm, 8.8 * mm),
                              (mz0 + 22 * mm, R), (mz0 + ln - 3 * mm, R), (mz0 + ln, R - 1.0 * mm)], segs(R)))
    cut(fh, cyl(3.8 * mm, mz0 - 0.001, mz0 + ln + 0.001, 'y', (0, 0), 16))
    for a in range(-2, 3):
        g = box(-1.2 * mm, 1.2 * mm, mz0 + 0.024, mz0 + ln - 3 * mm, 3.5 * mm, 12 * mm); g.transform(Matrix.Rotation(a * math.radians(45), 4, 'Y')); cut(fh, g)
    smooth(fh); K.adopt(fh, 'muzzle', 'park')
    return mz0 + ln
MUZ = flash_hider(MZ0)

# ===================================================================================== the grip (grip): the pistol grip and the trigger-guard loop in one, as the photos show
def chaikin(pts, n=2):
    """Corner cutting: each pass replaces every corner by two points a quarter of the way along its edges (a clean curve through straight runs, no pixel steps)."""
    for _ in range(n):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1])); out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        pts = out
    return pts
# the loop's outline: its front strap runs straight down to a rounded foot, the foot along the bottom, up the grip's back (the photos' silhouette, smoothed)
GRIP = chaikin([(246, 186), (248, 196), (255, 207), (263, 224), (271, 243), (281, 266), (289, 282), (294, 291), (300, 296), (346, 296), (355, 295), (362, 290), (366, 280),
                (366, 268), (362, 248), (357, 230), (352, 215), (349, 205), (352, 196), (358, 188), (360, 184)], 2)
# the window: a straight slanted front edge, a rounded bottom, the grip's front strap up its back (the finger grooves are cut into it below)
WIN = chaikin([(267, 176), (267, 198), (274, 224), (281, 246), (288, 264), (294, 278), (299, 285), (307, 288), (322, 288), (329, 285), (331, 279), (331, 266), (327, 252), (325, 248),
               (320, 245), (320, 235), (314, 229), (306, 226), (306, 222), (312, 218), (314, 214), (314, 200), (314, 176)], 1)
gp = K.tmp(prism(PL(GRIP), 'x', -16 * mm, 16 * mm)); tidy(gp, 0.1 * mm, False); bevel(gp, 3.0 * mm, 2, 30)
cut(gp, prism(PL(WIN), 'x', -20 * mm, 20 * mm))
slice_across(gp, 'z', [-0.030 - 0.030 * k_ for k_ in range(1, 4)]); tidy(gp); wnorm(gp, 35); K.adopt(gp, 'grip', SH)
# the grip's side panel: a raised, textured insert outlined on each side, with its screw
PANEL = chaikin([(325, 212), (344, 208), (352, 220), (358, 240), (363, 262), (364, 280), (360, 287), (348, 288), (338, 284), (334, 270), (331, 252), (328, 236), (326, 224)], 1)
for sx in (-1, 1):
    o = K.tmp(prism(PL(PANEL), 'x', *xs(sx * 15.5 * mm, sx * 16.9 * mm))); bevel(o, 0.4 * mm, 1); smooth(o); K.adopt(o, 'grip', 'stipple')
    o = K.obj(cyl(2.0 * S, *xs(sx * 16.8 * mm, sx * 17.8 * mm), 'x', (F(353), U(240)), 10), 'grip', 'steel'); smooth(o)

# ===================================================================================== the charging handle (part_handle): a mushroom knob on the LEFT, at the front of its channel
H0 = (F(238), U(148))
ph = K.part('handle', (0, H0[0], H0[1]))
XH = -HWG
o = K.obj(cyl(3.4 * mm, XH - 9.0 * mm, XH + 0.5 * mm, 'x', H0, 12), 'base', 'black', ph); smooth(o)                                   # (the stem)
hd = K.tmp(cyl(8.0 * mm, XH - 17.0 * mm, XH - 8.5 * mm, 'x', H0, 20)); bevel(hd, 2.4 * mm, 2, 30); smooth(hd); K.adopt(hd, 'base', 'black', ph)   # (the round knob)
o = K.obj(lathe(along(H0[0] - 0.100, H0[0] - 0.004, 1.8 * mm, 0.012), 8, (XH + 1.6 * mm, 0, H0[1])), 'base', 'steel', ph); smooth(o)                  # (the guide rod in the channel)

# ===================================================================================== the sights (optic: the gun's own flip-up irons on the rail)
ag['K'] = K; ag['RAIL_TOP'] = RAIL_TOP; ag['SY'] = SY; ag['RCV'] = 'black'
RS, FS = F(404), F(126)
def drop_after(n0, keep):
    """Remove the sight meshes the kit made after number n0 except those at the offsets in `keep` (its clamp bases and buttons stay, its leaf and post are replaced)."""
    for o in list(coll.all_objects):
        if o.type == 'MESH' and o.get('slot') == 'optic' and o.name.startswith('optic_'):
            k = int(o.name.split('_')[1])
            if k > n0 and (k - n0) not in keep: bpy.data.objects.remove(o, do_unlink=True)
# the rear: a thin tall leaf (10 mm wide, 1.8 thick) standing on the clamp, a round peep through its top and a small ear on its side, as in the photo
n0 = K.n; ag['rear_flip'](RS); drop_after(n0, (1, 2))
lf = K.tmp(prism([(-5.0 * mm, RAIL_TOP + 7.0 * mm), (5.0 * mm, RAIL_TOP + 7.0 * mm), (5.0 * mm, SY + 6.0 * mm), (-5.0 * mm, SY + 6.0 * mm)], 'y', RS - 0.9 * mm, RS + 0.9 * mm))
cut(lf, cyl(3.0 * mm, RS - 0.01, RS + 0.01, 'y', (0, SY), 20))
bevel(lf, 0.3 * mm, 1); smooth(lf); K.adopt(lf, 'optic', 'black')
ear = K.tmp(box(5.0 * mm, 9.0 * mm, RS - 0.9 * mm, RS + 0.9 * mm, SY + 1.5 * mm, SY + 6.0 * mm)); bevel(ear, 0.3 * mm, 1); smooth(ear); K.adopt(ear, 'optic', 'black')
# the front: a thin post tapering to its tip on its clamp, a wing out to one side
n1 = K.n; ag['front_flip'](FS, RAIL_TOP); drop_after(n1, (1, 2))
post = K.tmp(prism([(-1.4 * mm, RAIL_TOP + 6.0 * mm), (1.4 * mm, RAIL_TOP + 6.0 * mm), (0.8 * mm, SY), (-0.8 * mm, SY)], 'y', FS - 0.9 * mm, FS + 0.9 * mm)); smooth(post); K.adopt(post, 'optic', 'steel')
wing = K.tmp(box(1.0 * mm, 7.0 * mm, FS - 0.7 * mm, FS + 0.7 * mm, RAIL_TOP + 9.0 * mm, RAIL_TOP + 19.0 * mm)); bevel(wing, 0.3 * mm, 1); smooth(wing); K.adopt(wing, 'optic', 'black')
ag['fold_irons'](RS, FS)

# ===================================================================================== the magazine (part_mag): the Mk18's STANAG
ag['mag_stanag'](MAG_TOP)
for o_ in [o_ for o_ in coll.all_objects if o_.type == 'MESH' and o_.get('slot') == 'mag']:
    zs_ = [v.co.z for v in o_.data.vertices]
    if zs_ and max(zs_) - min(zs_) > 0.09: slice_across(o_, 'z', [min(zs_) + 0.035 * k_ for k_ in range(1, int((max(zs_) - min(zs_)) / 0.035) + 1)])
_pm = [o for o in coll.all_objects if o.get('part') == 'mag'][0]; _pm.rotation_euler = (math.radians(4.5), 0, 0)      # (the photo's magazine leans forward more than the kit's curve)

# ===================================================================================== info and anchors
r4 = lambda v: round(v, 4)
GRIPF = (F(335), U(240))
info = {
    'sy': r4(SY), 'fSight': r4(RS), 'relief': 0.07,
    'muzzles': [[r4(MUZ), 0, 0]],
    'grip': [r4(GRIPF[0]), r4(GRIPF[1]), 0], 'support': [r4(F(150)), -0.001, 0],
    'anim': {'mag': 'part_mag', 'handle': 'part_handle', 'carrier': 'part_carrier'},
    'carrier': {'travel': 0.090},
    'magAt': [r4(MAG_TOP[0]), r4(MAG_TOP[1])],
    'handle': {'f': r4(H0[0]), 'y': r4(H0[1]), 'x': r4(XH - 0.014), 'travel': 0.100, 'recip': False, 'style': 'knob', 'grab': [r4(H0[0] + 0.008), r4(H0[1]), r4(XH - 0.014)]},
    'port': [r4((PORT[0] + PORT[1]) / 2), r4((PORT[2] + PORT[3]) / 2), 0.031],
    'chamberAt': {'side': 'port', 'f': r4(PORT[1] - 0.7 * mm - 0.72 * 0.042), 'y': r4((PORT[2] + PORT[3]) / 2 + 0.0048), 'x': 0.0},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [r4(MZ0), 0, 0]},
}
anchors = {
    'mount_optic': [r4(RA), r4(RAIL_U), 0], 'mount_optic_end': [r4(RB), r4(RAIL_U), 0],
    'mount_optic_rail': [r4(RA), r4(RAIL_TOP), 0], 'mount_optic_rail_end': [r4(RB), r4(RAIL_TOP), 0],
    'mount_handguard': [r4(L - 0.004), 0, 0], 'mount_handguard_end': [r4(L - 0.001), 0, 0],
    'mount_barrel': [r4(L), 0, 0], 'mount_muzzle': [r4(MZ0), 0, 0],
    'mount_stock': [0, r4(U(150)), 0],
    'mount_grip': [r4(F(330)), r4(U(192)), 0],
    'mount_mag': [r4(MAG_TOP[0]), r4(MAG_TOP[1]), 0],
    'mount_tac': [r4(F(240)), -0.006, 0.026],
    'mount_fg': [r4(F(175)), r4(U(196.5)) - 0.0056, 0],
}
root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
for _n, _c in (('black', (0.01, 0.01, 0.012, 1)), ('polymer', (0.16, 0.16, 0.175, 1)), ('stipple', (0.2, 0.2, 0.215, 1)), ('rubber', (0.07, 0.07, 0.075, 1))):    # (viewing colours only: the game replaces every material by its name)
    _m = bpy.data.materials.get(_n)
    if _m: _m.diffuse_color = _c
json.dump({'source': 'authored', 'sights': {'builtin': ['irons'], 'rail': [], 'railed': True}}, open(os.path.join(HERE, 'model.json'), 'w', encoding='utf-8'), indent=2)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb],
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
