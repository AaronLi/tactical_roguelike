# Shared Blender helpers for the authored models (models/<id>/build_<id>.py, models/parts/<slot>/<id>/build_<id>.py).
# A build script runs it first:  exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
# Frame: Blender X = right, Y = forward, Z = up, metres. Every mesh gets custom property `slot` and ONE catalogue material (by name).
import bpy, bmesh, math, os
from mathutils import Matrix, Vector
mm = 0.001

def kit_collection(name):
    """The model's own collection, emptied (rebuilt every run); its root empty named after the model."""
    coll = bpy.data.collections.get(name)
    if coll:
        for o in list(coll.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(coll)
    for m in list(bpy.data.meshes):
        if m.users == 0: bpy.data.meshes.remove(m)
    root = bpy.data.objects.new(name, None); coll.objects.link(root)
    return coll, root

KIT_COL = {'black': (0.03, 0.03, 0.035, 1), 'polymer': (0.035, 0.035, 0.04, 1), 'stipple': (0.03, 0.03, 0.033, 1), 'rubber': (0.015, 0.015, 0.015, 1),
           'steel': (0.55, 0.55, 0.57, 1), 'blued': (0.04, 0.045, 0.06, 1), 'park': (0.06, 0.06, 0.055, 1), 'gunmetal': (0.08, 0.085, 0.09, 1),
           'glass': (0.05, 0.08, 0.1, 1), 'reflexLens': (0.55, 0.6, 0.85, 0.3), 'brass': (0.7, 0.55, 0.2, 1), 'sightPaint': (0.95, 0.95, 0.9, 1),
           'tritium': (0.5, 1, 0.55, 1)}
# one-off materials (the contract's `m_<rrggbb>`: kept as exported, a standard PBR material): name -> (metallic, roughness)
KIT_PBR = {'m_9c9ea1': (1.0, 0.42), 'm_80838a': (1.0, 0.48)}     # raw bead-blasted titanium: a light satin grey; raw bead-blasted steel
TITANIUM = 'm_9c9ea1'
def kit_mat(n):
    m = bpy.data.materials.get(n)
    if m: return m
    m = bpy.data.materials.new(n)
    if n.startswith('m_'):
        h = n[2:]; rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]      # (sRGB hex -> linear)
        met, rough = KIT_PBR.get(n, (0.0, 0.5))
        m.diffuse_color = (*lin, 1); m.metallic = met; m.roughness = rough
        try:
            m.use_nodes = True
            b = m.node_tree.nodes.get('Principled BSDF')
            if b:
                b.inputs['Base Color'].default_value = (*lin, 1); b.inputs['Metallic'].default_value = met; b.inputs['Roughness'].default_value = rough
        except Exception: pass
    else:
        m.diffuse_color = KIT_COL.get(n, (0.5, 0.5, 0.5, 1))
    return m

def hull2(pts):
    """The convex hull of 2D points, anticlockwise (monotone chain)."""
    P = sorted(set(pts))
    if len(P) < 3: return P
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(hi) >= 2 and cr(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]

def circles_hull(cs, r, seg=24):
    """The convex outline round circles of radius r at the centres cs (2D), anticlockwise."""
    return hull2([(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for cx, cy in cs for i in range(seg)])

def _isect(p, d, q, e):
    """The intersection of the lines p + t d and q + s e (2D)."""
    den = d[0] * e[1] - d[1] * e[0]
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + t * d[0], p[1] + t * d[1])

def inset_poly(poly, ws):
    """A convex polygon (anticlockwise) with each edge i moved inward by ws[i] (a number: all the same): a machined pocket's outline
    inside its frame members (the members are then exactly ws wide)."""
    n = len(poly); ws = ws if isinstance(ws, (list, tuple)) else [ws] * n
    lines = []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]; d = (b[0] - a[0], b[1] - a[1]); L = math.hypot(*d)
        nx, ny = -d[1] / L, d[0] / L                                   # (inward for anticlockwise)
        lines.append(((a[0] + nx * ws[i], a[1] + ny * ws[i]), d))
    return [_isect(lines[i - 1][0], lines[i - 1][1], lines[i][0], lines[i][1]) for i in range(n)]

def fillet_poly(poly, r, seg=4):
    """A convex polygon (anticlockwise) with every corner rounded to radius r (a milled pocket's corners: the cutter's radius)."""
    out, n = [], len(poly)
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        u = (p0[0] - p1[0], p0[1] - p1[1]); v = (p2[0] - p1[0], p2[1] - p1[1])
        lu, lv = math.hypot(*u), math.hypot(*v); u = (u[0] / lu, u[1] / lu); v = (v[0] / lv, v[1] / lv)
        th = math.acos(max(-1, min(1, u[0] * v[0] + u[1] * v[1])))
        t = min(r / math.tan(th / 2), 0.45 * min(lu, lv)); rr = t * math.tan(th / 2)
        a = (p1[0] + u[0] * t, p1[1] + u[1] * t); b = (p1[0] + v[0] * t, p1[1] + v[1] * t)
        bis = (u[0] + v[0], u[1] + v[1]); lb = math.hypot(*bis); c = (p1[0] + bis[0] / lb * rr / math.sin(th / 2), p1[1] + bis[1] / lb * rr / math.sin(th / 2))
        a0, a1 = math.atan2(a[1] - c[1], a[0] - c[0]), math.atan2(b[1] - c[1], b[0] - c[0])
        while a1 - a0 > math.pi: a1 -= 2 * math.pi
        while a0 - a1 > math.pi: a1 += 2 * math.pi
        for j in range(seg + 1):
            ang = a0 + (a1 - a0) * j / seg; out.append((c[0] + rr * math.cos(ang), c[1] + rr * math.sin(ang)))
    return out

def ccw(poly):
    """The polygon anticlockwise."""
    s = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    return poly if s > 0 else list(reversed(poly))

def picatinny(Kx, f0, f1, u0, slot, mat, parent=None, axis='top', x0=0.0, lean=False):
    """A Picatinny rail from f0 to f1 standing on u0 (axis 'top'), or on a side face at x0 facing out (axis 'right'/'left'), or under u0
    (axis 'bottom'). 21.2 mm across, 5.6 mm tall, a slot every 10 mm: built as its section intersected with its toothed side profile
    (one boolean, few triangles)."""
    w, h, sd = 21.2 * mm, 5.6 * mm, 2.8 * mm
    if lean:   # the dovetail's silhouette in six points (a viewmodel can't see the small flats)
        sec = [(-w / 2 + 1.5 * mm, 0), (w / 2 - 1.5 * mm, 0), (w / 2, 2.8 * mm), (w / 2 - 1.2 * mm, h), (-w / 2 + 1.2 * mm, h), (-w / 2, 2.8 * mm)]
    else:
        sec = [(-w / 2 + 1.5 * mm, 0), (w / 2 - 1.5 * mm, 0), (w / 2 - 1.5 * mm, 1.5 * mm), (w / 2, 2.8 * mm), (w / 2 - 1.2 * mm, h - 1.0 * mm),
               (w / 2 - 1.2 * mm, h), (-w / 2 + 1.2 * mm, h), (-w / 2 + 1.2 * mm, h - 1.0 * mm), (-w / 2, 2.8 * mm), (-w / 2 + 1.5 * mm, 1.5 * mm)]
    prof = [(f1, -0.001), (f0, -0.001), (f0, h)]
    f = f0 + 0.006
    while f + 0.0053 < f1 - 0.003:
        prof += [(f, h), (f, h - sd), (f + 0.0053, h - sd), (f + 0.0053, h)]
        f += 0.010
    prof += [(f1, h)]
    r = Kx.tmp(prism(sec, 'y', f0, f1))
    boolean(r, prism(list(reversed(prof)) if False else prof, 'x', -0.02, 0.02), 'INTERSECT')
    M = {'top': Matrix.Translation((x0, 0, u0)),
         'bottom': Matrix.Translation((x0, 0, u0)) @ Matrix.Rotation(math.pi, 4, 'Y'),
         'right': Matrix.Translation((x0, 0, u0)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'),
         'left': Matrix.Translation((x0, 0, u0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Y')}[axis]
    r.data.transform(M); smooth(r); Kx.adopt(r, slot, mat, parent)
    return r

class Kit:
    """Makes the model's meshes: named <slot>_<n>, parented to a node (the root or a part_ empty)."""
    def __init__(self, coll, root):
        self.coll, self.root, self.n = coll, root, 0
    def part(self, key, at):
        """A part_<key> empty (extras.part = key) with its pivot at `at` (x, y, z), under the root."""
        e = bpy.data.objects.new('part_' + key, None); self.coll.objects.link(e); e.parent = self.root
        e.location = at; e['part'] = key
        bpy.context.view_layer.update()          # (its matrix_world now holds the pivot: meshes parented to it keep their world places)
        return e
    def obj(self, me, slot, mat, parent=None):
        self.n += 1
        o = bpy.data.objects.new('%s_%d' % (slot, self.n), me); self.coll.objects.link(o)
        o['slot'] = slot; me.materials.append(kit_mat(mat))
        p = parent or self.root
        o.parent = p
        if p is not self.root: o.matrix_parent_inverse = p.matrix_world.inverted()   # (world positions stay as built)
        return o
    def tmp(self, me):
        """A working object (cut and bevel it), made a model mesh by adopt()."""
        o = bpy.data.objects.new('tmp', me); self.coll.objects.link(o); return o
    def adopt(self, o, slot, mat, parent=None):
        self.n += 1
        o.name = '%s_%d' % (slot, self.n); o['slot'] = slot
        o.data.materials.clear(); o.data.materials.append(kit_mat(mat))
        p = parent or self.root
        o.parent = p
        if p is not self.root: o.matrix_parent_inverse = p.matrix_world.inverted()
        return o

def prism(pts, axis, a0, a1):
    """The polygon pts extruded across `axis` from a0 to a1. axis 'x': pts are (forward, up); 'y': (right, up); 'z': (right, forward)."""
    bm = bmesh.new()
    P = lambda u, v, a: {'x': (a, u, v), 'y': (u, a, v), 'z': (u, v, a)}[axis]
    lo = [bm.verts.new(P(u, v, a0)) for u, v in pts]; hi = [bm.verts.new(P(u, v, a1)) for u, v in pts]
    n = len(pts)
    bm.faces.new(lo); bm.faces.new(list(reversed(hi)))
    for i in range(n): bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def loft(pts0, pts1, axis, a0, a1):
    """Like prism, but the outline pts0 at a0 and pts1 (as many points) at a1: a tapered cutter, so a pocket's walls slope and catch
    the light like a chamfer round its rim, with no more faces than square walls."""
    bm = bmesh.new()
    P = lambda u, v, a: {'x': (a, u, v), 'y': (u, a, v), 'z': (u, v, a)}[axis]
    lo = [bm.verts.new(P(u, v, a0)) for u, v in pts0]; hi = [bm.verts.new(P(u, v, a1)) for u, v in pts1]
    n = len(pts0)
    bm.faces.new(lo); bm.faces.new(list(reversed(hi)))
    for i in range(n): bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def box(x0, x1, y0, y1, z0, z1):
    return prism([(y0, z0), (y1, z0), (y1, z1), (y0, z1)], 'x', min(x0, x1), max(x0, x1))

def cyl(r, a0, a1, axis, c, seg=20):
    """A cylinder of radius r along `axis` from a0 to a1, through c = its other two coordinates (in the order prism takes them)."""
    return prism([(c[0] + r * math.cos(2 * math.pi * i / seg), c[1] + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)], axis, a0, a1)

def lathe(prof, seg=24, at=(0, 0, 0)):
    """A solid of revolution about the forward (Y) axis through `at`: prof = [(forward, r), ...] in order, capped at both ends."""
    bm = bmesh.new(); rings = []
    for f, r in prof:
        rings.append([bm.verts.new((at[0] + r * math.cos(2 * math.pi * i / seg), f, at[2] + r * math.sin(2 * math.pi * i / seg))) for i in range(seg)])
    for A, B in zip(rings, rings[1:]):
        for i in range(seg): bm.faces.new((A[i], A[(i + 1) % seg], B[(i + 1) % seg], B[i]))
    bm.faces.new(rings[0]); bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def rounded(cx, cy, hw, hh, r, seg=4):
    """A rounded rectangle's outline, anticlockwise (centre, half sizes, corner radius)."""
    out = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (hw - r), cy + qy * (hh - r)
        for j in range(seg + 1):
            a = math.radians(a0 + 90 * j / seg); out.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return out

def _apply(o, md):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me2 = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.remove(md); old = o.data; mats = list(old.materials); o.data = me2
    me2.materials.clear()
    for m in mats: me2.materials.append(m)
    bpy.data.meshes.remove(old)

def boolean(o, me, op='DIFFERENCE'):
    """o minus (or union / intersect) the closed mesh me, exact, applied. Returns o."""
    c = bpy.data.objects.new('cutter', me); o.users_collection[0].objects.link(c)
    c.matrix_world = Matrix.Identity(4)
    md = o.modifiers.new('b', 'BOOLEAN'); md.operation = op; md.object = c; md.solver = 'EXACT'
    _apply(o, md)
    bpy.data.objects.remove(c, do_unlink=True); bpy.data.meshes.remove(me); return o

def cut(o, *mes):
    for me in mes: boolean(o, me, 'DIFFERENCE')
    return o

def bevel(o, w, seg=2, angle=40):
    md = o.modifiers.new('bv', 'BEVEL'); md.width = w; md.segments = seg; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(angle)
    md.use_clamp_overlap = True
    _apply(o, md); return o

def slice_across(o, axis, at, gap=None, merge=2 * mm):
    """Cut o's mesh through with planes square to `axis` ('x', 'y', 'z') at each of `at` (and between them, so no two are more than
    `gap` apart): a long flat face a boolean has pierced (slots, holes) is one n-gon wrapped round them all, which exports as a fan of
    slivers the whole length of the part; cut across at each hole it's short pieces that triangulate cleanly (and a vertex attribute,
    the weapon AO, has vertices along it to vary on)."""
    k = 'xyz'.index(axis); at0 = sorted(set(round(a, 6) for a in at)); at = []
    for a in at0:                                                         # (two cuts closer than merge are one: a hairline strip between them
        if not at or a - at[-1] >= merge: at.append(a)                    #  is all slivers)
    if gap:
        full = []
        for a, b in zip(at, at[1:]):
            n = max(1, math.ceil((b - a) / gap - 1e-9)); full += [a + (b - a) * j / n for j in range(n)]
        at = full + at[-1:]
    bm = bmesh.new(); bm.from_mesh(o.data)
    lo, hi = min(v.co[k] for v in bm.verts), max(v.co[k] for v in bm.verts)
    no = [0.0, 0.0, 0.0]; no[k] = 1.0
    for a in at:
        if a <= lo + 1e-5 or a >= hi - 1e-5: continue
        co = [0.0, 0.0, 0.0]; co[k] = a
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, dist=1e-6)
    bm.to_mesh(o.data); bm.free(); o.data.update(); return o

def segs(r, tol=0.1 * mm, lo=6):
    """How many sides a circle of radius r needs: as few as keep each side within tol of the true circle (0.1 mm: a 1.6 mm screw 8,
    a 6.5 mm boss 18, a 16.5 mm bore 28), at least lo, even. .claude/skills/modeling-practices."""
    n = math.pi / math.acos(max(-1.0, 1 - tol / r)) if r > tol else lo
    n = max(lo, math.ceil(n)); return n + (n % 2)

def corner_segs(r, tol=0.1 * mm):
    """A rounded() corner's segments for radius r: a quarter of segs(r), at least 1."""
    return max(1, math.ceil(segs(r, tol, 4) / 4))

def slice_faces(o, cuts, tol=0.05e-3):
    """Cut only some faces of o: each cut (face_point, face_normal, plane_point, plane_normal[, (dir, lo, hi)]) splits the faces lying in
    the plane through face_point square to face_normal (within tol), and whose middle's dot with dir is within lo..hi if given, along
    the plane (plane_point, plane_normal). For framing a hole in a flat face: lines
    just outside it along the face, so it sits in a little rectangle of its own and its triangles stay inside that (the rest of the face
    keeps clean quads)."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    for cut in cuts:
        fp, fn, co, no = Vector(cut[0]), Vector(cut[1]).normalized(), cut[2], cut[3]
        rng = (Vector(cut[4][0]), cut[4][1], cut[4][2]) if len(cut) > 4 else None
        fs = [f for f in bm.faces if f.normal.dot(fn) > 0.9999 and abs((f.calc_center_median() - fp).dot(fn)) < tol
              and (not rng or rng[1] <= f.calc_center_median().dot(rng[0]) <= rng[2])]
        if not fs: continue
        es = list({e for f in fs for e in f.edges}); vs = list({v for f in fs for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=vs + es + fs, plane_co=co, plane_no=no, dist=1e-6)
    bm.to_mesh(o.data); bm.free(); o.data.update(); return o

def strip_ngons(o, axis, aspect=6.0, merge=0.0, passes=3):
    """An n-gon (more than 4 sides) longer along `axis` than `aspect` times its width cut across at each of ITS OWN vertices into
    strips (its cuts closer than merge are one), the plane limited to that face: left alone it exports as a fan the length of the face.
    Cutting a face puts vertices on its neighbours' edges, so it goes round again (passes) for the faces that made n-gons of."""
    k = 'xyz'.index(axis); no = [0.0, 0.0, 0.0]; no[k] = 1.0
    bm = bmesh.new(); bm.from_mesh(o.data)
    for _ in range(passes):
        done = 0
        for f in [f for f in bm.faces if len(f.verts) > 4]:
            if not f.is_valid or len(f.verts) <= 4: continue
            cs = [v.co[k] for v in f.verts]; lo, hi = min(cs), max(cs); ln_ = hi - lo
            if aspect:
                pts = [Vector(v.co) for v in f.verts]; c0 = sum(pts, Vector()) / len(pts)
                wd = max(((v - c0) - (v - c0).dot(Vector(no)) * Vector(no)).length for v in pts) * 2
                if ln_ < aspect * max(wd, 1e-6): continue
            fn, fp = f.normal.copy(), f.calc_center_median()
            at = []
            for a in sorted(set(round(c, 7) for c in cs)):
                if a <= lo + max(merge, 1e-6) or a >= hi - max(merge, 1e-6): continue
                if at and a - at[-1] < merge: continue
                at.append(a)
            for a in at:
                fs = [g for g in bm.faces if g.normal.dot(fn) > 0.9999 and abs((g.calc_center_median() - fp).dot(fn)) < 0.05e-3
                      and min(v.co[k] for v in g.verts) < a - 1e-6 and max(v.co[k] for v in g.verts) > a + 1e-6 and lo - 1e-6 <= g.calc_center_median()[k] <= hi + 1e-6]
                if not fs: continue
                co = [0.0, 0.0, 0.0]; co[k] = a; done += 1
                bmesh.ops.bisect_plane(bm, geom=list({v for g in fs for v in g.verts}) + list({e for g in fs for e in g.edges}) + fs, plane_co=co, plane_no=no, dist=1e-6)
        if not done: break
    bm.to_mesh(o.data); bm.free(); o.data.update(); return o

def slice_at_vertices(o, axis, merge=1.5e-3):
    """A solid made by extruding an outline (a receiver's traced side, a section) and cutting it with booleans has big flat sides that
    are one n-gon each, exported as a fan of slivers. Each such face cut across `axis` at its own vertices (cuts closer than merge are
    one), not the whole part round at every vertex it has anywhere (that put lines on faces that lined up with nothing): each side
    becomes a row of trapezoid strips. For holes in a face use slice_faces instead (.claude/skills/modeling-practices)."""
    strip_ngons(o, axis, aspect=0, merge=merge)
    return tidy(o, 0.1e-3, False)

def tidy(o, dist=1e-6, tri=True):
    """Weld vertices closer than dist and drop the faces that have no area left (a boolean's or a clamped bevel's leftovers); with tri,
    every n-gon (more than 4 sides: a cylinder's cap, a face round a hole) triangulated by Blender's 'beauty' (the triangles' smallest
    angles as large as they can be) instead of left to the exporter's fan."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=dist)
    if tri:
        ng = [f for f in bm.faces if len(f.verts) > 4]
        if ng: bmesh.ops.triangulate(bm, faces=ng, quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(o.data); bm.free(); o.data.update(); return o

def smooth(o, deg=35):
    """Flat faces stay flat, rounded ones shade smooth (split normals by angle; the glTF export writes them)."""
    for p in o.data.polygons: p.use_smooth = True
    try: o.data.set_sharp_from_angle(angle=math.radians(deg))
    except AttributeError: pass
    return o

def xform(me, M):
    me.transform(M); return me

def tris_of(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')

def kit_variant(gun, name, slot, meta):
    """A variant part of a gun (another barrel, magazine...): its own collection and root `<gun>_<name>` (extras.variant_json), same frame."""
    import json
    coll, root = kit_collection(gun + '_' + name)
    root['variant_json'] = json.dumps(dict({'gun': gun, 'slot': slot, 'of': 'factory'}, **meta))
    return coll, root, Kit(coll, root)

def export_glb(coll, path):
    """One collection (its root and children, extras on) to a .glb; returns its size."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_yup=True,
                              export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_cameras=False,
                              export_lights=False, export_animations=False)
    return os.path.getsize(path)

def save_and_export(coll, root, here, name, export=True, also=()):
    """<name>.blend (the model only, with the collections in `also` (its variants): the whole file when the session holds nothing else, else
    just those collections, kept by a fake user; never bpy.data.libraries.write a SCENE: Blender 5.2.3 crashes) and <name>.glb (coll only)."""
    if not export: return None
    own = {coll, *also}
    others = [c.name for c in bpy.data.collections if c not in own and (c.objects or c.children)] + [s.name for s in bpy.data.scenes if s != bpy.context.scene]
    if not others: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(here, name + '.blend'), copy=True)
    else:
        bpy.data.libraries.write(os.path.join(here, name + '.blend'), own, fake_user=True, compress=True)
        print(name + '.blend: its own collections only (the session also holds %s)' % ', '.join(others))
    return export_glb(coll, os.path.join(here, name + '.glb'))

# ===================================================================================================== a rifle's ejection port with its bolt carrier (part_carrier)
# One opening cut in a receiver (port_pocket), what it shows when the carrier is back (port_inside: a black lining, the chamber's mouth on the bore and the feed ramp under
# it, dark metal) and the carrier itself (port_carrier: a black block filling the port, its outer face inside the receiver's surface, ribbed; it slides along z, backward).
# pa, pb: the port's rear and front (forward, metres); pu0, pu1: its bottom and top (up); hw: the receiver's surface half width there; the bore is the Y axis.
MM_ = 0.001
def port_pocket(pa, pb, pu0, pu1, x_out, r=2.0 * MM_, x_in=-2.0 * MM_):
    """The cutter for the opening: from just past the bore (x_in, -2 mm) out through the receiver's surface."""
    return prism(rounded((pa + pb) / 2, (pu0 + pu1) / 2, (pb - pa) / 2, (pu1 - pu0) / 2, r, 4), 'x', x_in, x_out)

def port_inside(Kx, pa, pb, pu0, pu1, hw, mouth_r=5.6 * MM_, ramp=24 * MM_, parent=None, x_in=-2.0 * MM_, ax=0.0, az=0.0):
    """The port's inside: a 0.45 mm black lining shell, the chamber's mouth (the barrel extension's face, gunmetal) at the front wall and the feed ramp under the round's path."""
    pc, pu, ph, pv = (pa + pb) / 2, (pu0 + pu1) / 2, (pb - pa) / 2, (pu1 - pu0) / 2
    tub = Kx.tmp(prism(rounded(pc, pu, ph - 0.15 * MM_, pv - 0.15 * MM_, 2.0 * MM_, 4), 'x', x_in, hw - 0.3 * MM_))
    cut(tub, prism(rounded(pc, pu, ph - 0.6 * MM_, pv - 0.6 * MM_, 1.8 * MM_, 4), 'x', x_in + 0.45 * MM_, hw + 1 * MM_)); smooth(tub); Kx.adopt(tub, 'base', 'black', parent)
    o = Kx.obj(lathe([(pb - 4.6 * MM_, mouth_r), (pb - 0.7 * MM_, mouth_r)], 24, (ax, 0, az)), 'base', 'gunmetal', parent); smooth(o)
    o = Kx.tmp(prism([(pb - ramp, pu0 + 0.6 * MM_), (pb - 1.0 * MM_, az - mouth_r * 0.2), (pb - 1.0 * MM_, pu0 + 0.6 * MM_)], 'x', ax - mouth_r * 1.6, ax + mouth_r * 1.6)); smooth(o); Kx.adopt(o, 'base', 'gunmetal', parent)

def port_carrier(Kx, pa, pb, pu0, pu1, hw, x0=5.6 * MM_, ribs=4, mat='black', x1=None, ax=0.0, az=None, head=0.034, body='cyl', rb=None, rh=None, rollers=False):
    """part_carrier: the bolt group seen through the open port (not a plate: the carrier's own body and the bolt in front of it), sliding back (+z in the game). Its outer face stays 0.8 mm inside
    the receiver's surface (x1) wherever it runs back to. The round bolt carrier (body 'cyl': a cylinder on the bore axis (ax, az), phosphated black, two grooves, a flat gas-key land)
    runs forward into the bolt (a steel cylinder, a ring of locking lugs behind its face, the extractor claw and its spring pin on the right); the carrier of a box receiver (body 'box': a milled
    block, round on top, between x0 and x1) carries the same bolt. rollers: a roller-delayed bolt's two locking rollers stand out of the head's sides. The bolt head (length 'head', 34 mm) reaches
    the port's front: it covers the chambered round's case until the carrier is drawn back."""
    pc, pu = (pa + pb) / 2, (pu0 + pu1) / 2
    az = pu if az is None else az
    x1 = hw - 0.8 * MM_ if x1 is None else x1
    pk = Kx.part('carrier', (0, pc, pu))
    f0, f1 = pa + 1.0 * MM_, pb - 1.0 * MM_
    fh = f1 - head                                  # (where the bolt head begins)
    rb = min((pu1 - pu0) / 2 - 0.5 * MM_, x1 - ax) if rb is None else rb
    rh = rb * 0.86 if rh is None else rh
    if body == 'cyl':
        o = Kx.tmp(lathe([(f0, rb * 0.9), (f0 + 2.5 * MM_, rb), (fh + 1.0 * MM_, rb), (fh + 1.0 * MM_, rh)], 28, (ax, 0, az))); smooth(o); Kx.adopt(o, 'base', mat, pk)
        for g in (0.3, 0.55):                       # (the grooves round the carrier)
            fg = f0 + (fh - f0) * g
            o = Kx.tmp(lathe([(fg - 0.9 * MM_, rb * 0.97), (fg, rb * 0.97 - 0.9 * MM_), (fg + 0.9 * MM_, rb * 0.97)], 28, (ax, 0, az))); smooth(o); Kx.adopt(o, 'base', 'gunmetal', pk)
        o = Kx.tmp(box(ax - rb * 0.5, ax + rb * 0.5, f0 + (fh - f0) * 0.62, fh - 3.0 * MM_, az + rb * 0.5, az + rb * 0.98)); smooth(o); Kx.adopt(o, 'base', 'gunmetal', pk)   # (the gas key's land, on top)
    else:
        o = Kx.tmp(prism(rounded((f0 + fh) / 2, pu, (fh - f0) / 2, (pu1 - pu0) / 2 - 0.5 * MM_, 2.5 * MM_, 4), 'x', x0, x1)); bevel(o, 0.5 * MM_, 2, 30); smooth(o); Kx.adopt(o, 'base', mat, pk)
        for g in (0.3, 0.6):                        # (a milled step or two along it)
            fg = f0 + (fh - f0) * g
            o = Kx.tmp(box(x1 - 0.6 * MM_, x1 + 0.1 * MM_, fg - 1.0 * MM_, fg + 1.0 * MM_, pu0 + 1.5 * MM_, pu1 - 1.5 * MM_)); smooth(o); Kx.adopt(o, 'base', 'gunmetal', pk)
    o = Kx.tmp(lathe([(fh, rh), (f1 - 3.0 * MM_, rh), (f1 - 1.2 * MM_, rh * 0.93), (f1, rh * 0.9)], 28, (ax, 0, az))); smooth(o); Kx.adopt(o, 'base', 'steel', pk)       # (the bolt: its face chamfered)
    o = Kx.tmp(lathe([(f1 - 10.0 * MM_, rh * 1.04), (f1 - 5.5 * MM_, rh * 1.04)], 28, (ax, 0, az))); smooth(o); Kx.adopt(o, 'base', 'gunmetal', pk)                         # (the locking lugs' ring)
    xe = min(ax + rh + 1.0 * MM_, x1)
    o = Kx.tmp(box(xe - 2.6 * MM_, xe, f1 - 14.0 * MM_, f1 - 1.5 * MM_, az - rh * 0.1, az + rh * 0.55)); bevel(o, 0.4 * MM_, 1); smooth(o); Kx.adopt(o, 'base', 'gunmetal', pk)    # (the extractor's claw)
    o = Kx.obj(cyl(0.9 * MM_, xe - 1.0 * MM_, xe + 0.05 * MM_, 'x', (f1 - 9.0 * MM_, az + rh * 0.3), 10), 'base', 'steel', pk); smooth(o)                                  # (its spring's pin)
    if rollers:
        for sgn in (1,):
            o = Kx.obj(cyl(2.4 * MM_, az - 3.0 * MM_, az + 3.0 * MM_, 'z', (min(ax + rh - 0.4 * MM_, x1 - 2.4 * MM_), fh + head * 0.45), 14), 'base', 'steel', pk); smooth(o)
    return pk
