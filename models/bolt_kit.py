# Shared helpers for the bolt-action rifles (the R700 and the Mosin-Nagant): a body from its side and plan outlines, rods and balls at any angle, shading, and the
# bolt group (the bolt body, its sleeve, cocking piece, handle and knob: one part_bolt, pivot on the bore at the handle's root).
# A build script runs models/blender_kit.py first, then this:  exec(open(os.path.join(MODELS, 'bolt_kit.py'), encoding='utf-8').read(), globals())
# Frame: Blender X = right, Y = forward, Z = up, metres; points are written (right, forward, up).
import math
from mathutils import Matrix, Vector

def wnorm(o, deg=30):
    """Shade by angle, then weight each vertex's normal by its faces' areas (sharp edges kept): long flat faces stay flat."""
    tidy(o)
    smooth(o, deg)
    md = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.mode = 'FACE_AREA'; md.keep_sharp = True; md.weight = 100
    _apply(o, md); return o

def plan_poly(hws):
    """A plan outline (right, forward) from [(forward, half width), ...], both sides."""
    return [(hw, f) for f, hw in hws] + [(-hw, f) for f, hw in reversed(hws)]

def simplify(pts, tol=0.4e-3):
    """A closed outline with the points that lie within tol of the line between their neighbours' kept ones dropped (Ramer-Douglas-Peucker on each half): a traced curve
    keeps its shape to 0.4 mm with a third of the vertices, and so a third of the strips its sides cut into."""
    def rdp(a):
        if len(a) < 3: return a
        (x0, y0), (x1, y1) = a[0], a[-1]; L = math.hypot(x1 - x0, y1 - y0) or 1e-9
        d = [abs((x1 - x0) * (y0 - y) - (x0 - x) * (y1 - y0)) / L for x, y in a[1:-1]]; i = max(range(len(d)), key=d.__getitem__)
        if d[i] < tol: return [a[0], a[-1]]
        return rdp(a[:i + 2])[:-1] + rdp(a[i + 1:])
    h = len(pts) // 2
    return rdp(pts[:h + 1])[:-1] + rdp(pts[h:] + [pts[0]])[:-1]

def body(Kx, side, hws, slot, mat, parent=None, bev=0.004, seg=1, cuts=(), adds=(), angle=40, round_first=False):
    """A solid whose side outline is `side` ([(forward, up)]) and plan outline `hws` ([(forward, half width)]), intersected; then cuts, bevelled, shaded.
    round_first: the (wide, rounded: seg segments) bevel BEFORE the cuts, so a wide round section isn't also taken round the cuts' rims (modeling-practices rule 1)."""
    o = Kx.tmp(prism(simplify(side), 'x', -0.08, 0.08)); boolean(o, prism(plan_poly(hws), 'z', -0.5, 0.5), 'INTERSECT')
    if round_first and bev: bevel(o, bev, seg, angle)
    for c in cuts: boolean(o, c, 'DIFFERENCE')
    for a in adds: boolean(o, a, 'UNION')
    if bev and not round_first: bevel(o, bev, seg, angle)
    slice_at_vertices(o, 'y')
    wnorm(o); Kx.adopt(o, slot, mat, parent); return o

def rod(p0, p1, r0, r1=None, seg=14):
    """A cylinder (or cone) from p0 to p1, points (right, forward, up), capped."""
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0; L = d.length
    me = lathe([(0, r0), (L, r0 if r1 is None else r1)], seg)
    me.transform(Matrix.Translation(p0) @ Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()); return me

def ball(c, r, sc=(1, 1, 1), seg=None):
    """A (stretched) ball at c = (right, forward, up): radii r * sc along (right, forward, up)."""
    n = 6; seg = seg or max(8, segs(r) // 2)
    prof = [(r * math.sin(math.radians(-90 + 180 * i / n)), max(r * math.cos(math.radians(-90 + 180 * i / n)), 0.0)) for i in range(n + 1)]
    me = lathe(prof, seg)
    me.transform(Matrix.Translation(c) @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1)))
    return me

def put(Kx, me, slot, mat, parent=None, bev=0, deg=30):
    o = Kx.tmp(me)
    if bev: bevel(o, bev, 1, 40)
    wnorm(o, deg); Kx.adopt(o, slot, mat, parent); return o

def bolt_group(Kx, K, pivot_f, rear, face, rb, handle, knob, sleeve=None, cock=None, lug_r=None, ext=True, knob_mat='blued', handle_mat='blued', body_mat='steel', ribs=0):
    """part_bolt: pivot at (0, pivot_f, 0), the handle's root. The bolt body (steel) from the sleeve's front to `face` (the bolt face, closed), a ring of locking lugs and an
    extractor on its head, the sleeve (black) with its cocking piece behind it, and the handle (a stem through the points in `handle`, a ball at `knob` = (right, forward, up, radii))."""
    pb = Kx.part('bolt', (0, pivot_f, 0))
    s0, s1, sr = sleeve if sleeve else (rear + 0.016, rear + 0.060, rb * 1.3)
    put(Kx, lathe([(s1 - 0.002, rb), (face - 0.016, rb), (face - 0.0155, (lug_r or rb * 1.1)), (face - 0.004, (lug_r or rb * 1.1)), (face - 0.0015, rb * 0.93), (face, rb * 0.88)], segs(rb * 1.1)), 'base', body_mat, pb)
    # the bolt's body: grooves and the lug ring seam
    for fg in (0.40,):
        f = s1 + (face - 0.016 - s1) * fg
        put(Kx, lathe([(f - 0.0009, rb * 1.0), (f, rb * 0.93), (f + 0.0009, rb * 1.0)], segs(rb * 1.1)), 'base', 'gunmetal', pb)
    if ext:   # the extractor's claw on the head's right, with its collar
        put(Kx, box(rb * 0.95, rb * 1.15, face - 0.016, face - 0.0012, -0.0025, 0.0035), 'base', 'gunmetal', pb, bev=0.0004)
        put(Kx, box(rb * 0.55, rb * 1.18, face - 0.0045, face - 0.0012, -0.0025, 0.0030), 'base', 'gunmetal', pb, bev=0.0004)
    # the sleeve
    put(Kx, lathe([(s0, sr * 0.72), (s0 + 0.003, sr), (s1 - 0.004, sr), (s1, rb)], segs(rb * 1.1)), 'base', 'black', pb)
    if cock:   # the cocking piece: a knob behind the sleeve (cr, length) and the cocking indicator's tab on top
        cr, cl = cock
        put(Kx, lathe([(s0 - cl, cr * 0.7), (s0 - cl + 0.002, cr), (s0 - 0.0005, cr), (s0 + 0.0005, sr * 0.72)], segs(rb * 1.1)), 'base', 'steel', pb)
        put(Kx, box(-0.0022, 0.0022, s0 - cl * 0.9, s0 - 0.001, cr * 0.7, cr * 1.5), 'base', 'steel', pb, bev=0.0004)
    # the handle's root collar, the stem, the knob
    put(Kx, lathe([(pivot_f - 0.011, rb * 1.12), (pivot_f - 0.010, rb * 1.3), (pivot_f + 0.011, rb * 1.3), (pivot_f + 0.012, rb * 1.12)], segs(rb * 1.1)), 'base', handle_mat, pb)
    pts = handle
    for a, b in zip(pts, pts[1:]):
        put(Kx, rod(a[:3], b[:3], a[3], b[3]), 'base', handle_mat, pb)
    for p in pts[1:-1]: put(Kx, ball(p[:3], p[3]), 'base', handle_mat, pb)
    kx, kf, ku, kr = knob[:4]
    put(Kx, ball((kx, kf, ku), kr, knob[4] if len(knob) > 4 else (1, 1, 1)), 'base', knob_mat, pb)
    return pb

def sweep_check(coll):
    """Names of meshes with no material or slot (a script slip)."""
    return [o.name for o in coll.all_objects if o.type == 'MESH' and ('slot' not in o or not o.data.materials)]
