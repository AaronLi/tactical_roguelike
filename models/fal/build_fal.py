# The FN FAL (50.00: fixed stock, polymer furniture, folding carry handle), built in Blender from a traced photograph.
#
#   Blender: exec(open(r'<repo>/models/fal/build_fal.py').read())   (or: blender -b -P models/fal/build_fal.py)
#
# Reads trace.json (outlines and column profiles traced off the reference photo, see its src/licence), builds the gun
# into a fresh "fal" collection in the open scene, saves models/fal/fal.blend and exports models/fal/fal.glb. The bake
# (tools/bake_models.mjs) picks that file up instead of the procedural recipe, checks it against the model contract
# (docs/models.md) and compresses it into assets/models/guns/fal.glb.
#
# Blender frame: X = the gun's right, Y = forward, Z = up; metres. The glTF exporter turns that into the game's frame
# (x right, y up, z = -forward). The origin is the back of the receiver on the bore line.
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix, geometry

HERE = globals().get('FAL_DIR') or os.environ.get('FAL_DIR') or os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(HERE, 'trace.json')))

# photo pixels -> metres: the gun is 1090 mm long overall (FN's figure for the 50.00), 1929 px in the photo
S = 1.090 / 1929
PX0, PY0 = 583, 222            # the back of the receiver; the bore line
def F(px): return (px - PX0) * S
def U(py): return (PY0 - py) * S

SY = 0.040                     # the line of sight: the rear aperture's centre and the front post's tip
COL = {}                       # px column -> [[top, bottom], ...]
for k, v in T['cols'].items(): COL[int(k)] = v

# ---- scene ----
COLL = 'fal'
def reset():
    c = bpy.data.collections.get(COLL)
    if c:
        for o in list(c.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(COLL); bpy.context.scene.collection.children.link(c)
    for m in list(bpy.data.meshes):
        if m.users == 0: bpy.data.meshes.remove(m)
    return c
coll = reset()

# the catalogue's materials by NAME (the game swaps its own in at load); the colours here are for viewing in Blender
MATS = {
    'park': ((0.055, 0.056, 0.054), 0.85, 0.55), 'black': ((0.02, 0.02, 0.022), 0.7, 0.45), 'polymer': ((0.025, 0.025, 0.025), 0.0, 0.6),
    'rubber': ((0.015, 0.015, 0.015), 0.0, 0.9), 'brass': ((0.75, 0.55, 0.22), 1.0, 0.3), 'steel': ((0.45, 0.45, 0.46), 1.0, 0.3),
}
def mat(name):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF'); c, met, rough = MATS[name]
        b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Metallic'].default_value = met; b.inputs['Roughness'].default_value = rough
    return m

ROOT = bpy.data.objects.new('fal', None); coll.objects.link(ROOT); ROOT['gun'] = 'fal'
N = [0]
def obj(me, slot, m, parent=None):
    N[0] += 1; o = bpy.data.objects.new(f'{slot}_{N[0]}', me); me.name = o.name; coll.objects.link(o)
    o['slot'] = slot; me.materials.clear(); me.materials.append(mat(m))
    o.parent = parent or ROOT
    if parent: o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o
def part(key, at):
    e = bpy.data.objects.new('part_' + key, None); coll.objects.link(e); e.parent = ROOT; e['part'] = key
    e.location = at; bpy.context.view_layer.update(); return e

def finish(me, smooth=35, caps=True):
    """Smooth shading split at hard edges; an extrusion's flat sides (normals along X) shaded flat."""
    for p in me.polygons: p.use_smooth = not (caps and abs(p.normal.x) > 0.985)
    me.set_sharp_from_angle(angle=math.radians(smooth))
    me.validate(); me.update()

# ---- builders ----
def rdp(pts, eps):
    if len(pts) < 3: return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]; L = math.hypot(bx - ax, by - ay) or 1e-9
    dm, i_ = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L
        if d > dm: dm, i_ = d, i
    if dm <= eps: return [pts[0], pts[-1]]
    return rdp(pts[:i_ + 1], eps)[:-1] + rdp(pts[i_:], eps)

def loops_of(name, eps=1.3):
    """A part's traced outlines in metres, simplified (eps in photo px) and lightly smoothed (pixel steps out)."""
    out = []
    for l in T['parts'][name]:
        p = l['pts']; h = len(p) // 2
        q = rdp(p[:h + 1], eps)[:-1] + rdp(p[h:] + [p[0]], eps)[:-1]
        if len(q) > 8:   # one pass of neighbour averaging, corners kept where the turn is sharp
            r = []
            for i in range(len(q)):
                a, b, c = q[i - 1], q[i], q[(i + 1) % len(q)]
                v1 = (b[0] - a[0], b[1] - a[1]); v2 = (c[0] - b[0], c[1] - b[1])
                cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((math.hypot(*v1) * math.hypot(*v2)) or 1)
                r.append(b if cos < 0.5 else ((a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4))
            q = r
        out.append([(F(x), U(y)) for x, y in q])
    return out

def _seg_x(p, q, a, b):
    """Do segments pq and ab cross (properly)?"""
    def o(u, v, w): return (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0])
    return o(p, q, a) * o(p, q, b) < 0 and o(a, b, p) * o(a, b, q) < 0

def slab(loops, w, R, seg=3):
    """An outline (f, u loops; nested loops are holes) made solid w thick across X, its edges rounded to radius R in
    section, the silhouette staying the traced one. Each outline point's radius is cut down where the part is thinner
    than 2R or a corner is tighter (the trigger, the guard, the grip's corners), so the rounding never folds over
    itself: an inset outline that crosses itself fills its flat sides with inside-out triangles (see-through)."""
    R = max(1e-5, min(R, w / 2 - 1e-5))
    L = []
    for l in loops:   # material to the left of travel: outer loops anticlockwise, holes clockwise
        a = sum(l[i - 1][0] * l[i][1] - l[i][0] * l[i - 1][1] for i in range(len(l))) / 2
        hole = sum(1 for m in loops if m is not l and _inside(l[0], m)) % 2 == 1
        L.append(list(l) if (a > 0) != hole else list(reversed(l)))
    segs = [(l[i], l[(i + 1) % len(l)]) for l in L for i in range(len(l))]
    def inward(l, i):
        p, c, n = l[i - 1], l[i], l[(i + 1) % len(l)]
        t1 = Vector((c[0] - p[0], c[1] - p[1])).normalized(); t2 = Vector((n[0] - c[0], n[1] - c[1])).normalized()
        v = Vector((-t1.y, t1.x)) + Vector((-t2.y, t2.x))
        return v.normalized() if v.length > 1e-9 else Vector((-t1.y, t1.x))
    N = [[inward(l, i) for i in range(len(l))] for l in L]
    rad = []
    for l, nl in zip(L, N):   # the part's thickness along each point's inward normal: a ray against every other edge
        r = []
        for i, (c, nv) in enumerate(zip(l, nl)):
            d = 1.0; far = (c[0] + nv.x, c[1] + nv.y)
            for a, b in segs:
                if a == c or b == c: continue
                h = geometry.intersect_line_line_2d(Vector(c), Vector(far), Vector(a), Vector(b))
                if h: d = min(d, (h - Vector(c)).length)
            r.append(min(R, 0.45 * d))
        n = len(r); r = [min(r[(i + k) % n] for k in range(-2, 3)) for i in range(n)]
        rad.append(r)
    for _ in range(8):   # where the inset outlines still cross, shrink the radii there
        ins = [[(c[0] + nv.x * r, c[1] + nv.y * r) for c, nv, r in zip(l, nl, rl)] for l, nl, rl in zip(L, N, rad)]
        isg = [(k, i, l[i], l[(i + 1) % len(l)]) for k, l in enumerate(ins) for i in range(len(l))]
        bad = set()
        for x in range(len(isg)):
            k, i, p, q = isg[x]
            for y in range(x + 1, len(isg)):
                k2, j, a, b = isg[y]
                if k == k2 and (abs(i - j) <= 1 or abs(i - j) == len(ins[k]) - 1): continue   # neighbours share a point
                if _seg_x(p, q, a, b):
                    for kk, ii in ((k, i), (k2, j)):
                        n = len(ins[kk])
                        for s in (-1, 0, 1, 2): bad.add((kk, (ii + s) % n))
        if not bad: break
        for kk, ii in bad: rad[kk][ii] *= 0.6
    bm = bmesh.new(); h = w / 2
    caps = {+1: [], -1: []}
    for l, nl, rl in zip(L, N, rad):
        n = len(l)
        def ring(sd, j):
            out = []
            for c, nv, r in zip(l, nl, rl):
                ph = math.pi / 2 * j / seg; ins = r * (1 - math.sin(ph))
                out.append(bm.verts.new((sd * (h - r + r * math.cos(ph)), c[0] + nv.x * ins, c[1] + nv.y * ins)))
            return out
        rings = [ring(+1, j) for j in range(seg + 1)] + [ring(-1, j) for j in range(seg, -1, -1)]
        for A, B in zip(rings, rings[1:]):
            for i in range(n): bm.faces.new((A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]))
        caps[+1].append(rings[0]); caps[-1].append(rings[-1])
    for sd, rs in caps.items():   # the flat sides: the inset outlines (with their holes) triangulated
        flat = [v for r in rs for v in r]
        for tri in geometry.tessellate_polygon([[(v.co.y, v.co.z, 0) for v in r] for r in rs]):
            try: bm.faces.new([flat[t] for t in tri])
            except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('slab'); bm.to_mesh(me); bm.free()
    me['w0'] = w
    return me

def _inside(p, poly):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i - 1], poly[i]
        if (y1 > p[1]) != (y2 > p[1]) and p[0] < x1 + (p[1] - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c

def loft(rings, cap=True):
    """Skin a list of equal-length rings of (x, y, z) points; capped at both ends."""
    bm = bmesh.new(); R = [[bm.verts.new(p) for p in r] for r in rings]; n = len(rings[0])
    for A, B in zip(R, R[1:]):
        for i in range(n): bm.faces.new((A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]))
    if cap: bm.faces.new(R[0]); bm.faces.new(list(reversed(R[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def lathe(prof, seg=24, cap0=True, cap1=True, eps=0.00012):
    """A solid of revolution about the bore (the Y axis): prof = [(f, r), ...] front to back or back to front."""
    if len(prof) > 4 and eps: prof = rdp(prof, eps)
    bm = bmesh.new(); rings = []
    for f, r in prof:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), f, r * math.sin(2 * math.pi * i / seg))) for i in range(seg)])
    for A, B in zip(rings, rings[1:]):
        for i in range(seg): bm.faces.new((A[i], A[(i + 1) % seg], B[(i + 1) % seg], B[i]))
    if cap0: bm.faces.new(rings[0])
    if cap1: bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def tube(prof, seg=24, axis='y', at=(0, 0, 0)):
    """lathe() about another axis through `at` (prof: (along, r))."""
    me = lathe(prof, seg)
    if axis == 'x': me.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))
    if axis == 'z': me.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
    me.transform(Matrix.Translation(at)); return me

def box(x0, x1, y0, y1, z0, z1):
    (x0, x1), (y0, y1), (z0, z1) = sorted((x0, x1)), sorted((y0, y1)), sorted((z0, z1))   # (reversed bounds turn it inside out)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def modified(o, mods):
    """Apply modifiers [(type, {attr: value})] to o's mesh (context-free: through the evaluated mesh)."""
    for t, kw in mods:
        m = o.modifiers.new(t.lower(), t)
        for k, v in kw.items(): setattr(m, k, v)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data; o.modifiers.clear(); o.data = me; me.name = o.name
    if old.users == 0: bpy.data.meshes.remove(old)
    return o

def bevel(o, width, seg=2, angle=40):
    """Round a box's edges."""
    return modified(o, [('BEVEL', dict(width=width, segments=seg, limit_method='ANGLE', angle_limit=math.radians(angle), use_clamp_overlap=True))])

FAILED = []
def cut(o, cutters, union=False):
    """Boolean difference (or union) of throwaway meshes."""
    tmp = []
    for me in cutters:
        c = bpy.data.objects.new('cutter', me); coll.objects.link(c); c.hide_render = True; tmp.append(c)
    for c in tmp:   # one at a time; where the exact solver fails (it can return nothing), the float one
        for solver in ('EXACT', 'FLOAT'):
            keep = o.data.copy(); n = len(keep.polygons)
            modified(o, [('BOOLEAN', dict(object=c, operation='UNION' if union else 'DIFFERENCE', solver=solver))])
            if len(o.data.polygons) > n * 0.5: bpy.data.meshes.remove(keep); break
            bad = o.data; o.data = keep; keep.name = o.name; bpy.data.meshes.remove(bad)
            FAILED.append((o.name, solver))
    for c in tmp:
        me = c.data; bpy.data.objects.remove(c, do_unlink=True); bpy.data.meshes.remove(me)
    return o

def clip(o, keep):
    """Keep the part of o's mesh inside the half-spaces keep = [(point, normal_pointing_out)], capped."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    for co, no in keep:
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]
        r = bmesh.ops.bisect_plane(bm, geom=g, plane_co=co, plane_no=no, clear_outer=True)
        edges = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            try: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            except Exception: pass
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free(); return o

def widths(o, fn):
    """Re-width a slab: each vertex's X scaled by fn(f, u) / the slab's own width (tapers it)."""
    w0 = o.data.get('w0', 1.0)
    for v in o.data.vertices:
        v.co.x *= fn(v.co.y, v.co.z) / w0
    return o

def lerp(a, b, t): t = max(0.0, min(1.0, t)); return a + (b - a) * t
def ramp(x, x0, x1, a, b): return lerp(a, b, (x - x0) / (x1 - x0))

def col_run(px, near):
    """The alpha run of a photo column that contains (or is nearest) row `near`: (top, bottom) in px."""
    best = None
    for t, b in COL.get(px, []):
        d = 0 if t <= near <= b else min(abs(t - near), abs(b - near))
        if best is None or d < best[0]: best = (d, t, b)
    return (best[1], best[2]) if best else None

# =====================================================================================================================
# STOCK: polymer. In section a tall rounded rectangle (its butt end: corners about a third of its width round),
# 46 mm wide at the butt to 32 at the wrist. The rear sling swivel is a thin piece of its own.
SW = (160, 256, 412)                                               # the swivel's box in photo px: x0, x1, below y
def no_swivel(name):
    out = []
    for l in T['parts'][name]:
        if abs(l['area']) < 300: continue
        out.append({'area': l['area'], 'pts': [p for p in l['pts'] if not (SW[0] < p[0] < SW[1] and p[1] > SW[2])]})
    T['parts'][name + '_main'] = out
    return loops_of(name + '_main')
st = obj(slab(no_swivel('stock'), 0.046, 0.0135, 4), 'stock', 'polymer')
widths(st, lambda f, u: ramp(f, F(140), F(560), 0.046, 0.032)); finish(st.data)
sv = obj(slab(loops_of('stock'), 0.007, 0.0008, 1), 'stock', 'black')
clip(sv, [((0, F(SW[0]), 0), (0, -1, 0)), ((0, F(SW[1]), 0), (0, 1, 0)), ((0, 0, U(SW[2]) + 0.002), (0, 0, 1))]); finish(sv.data)

# GRIP: polymer, an oval in section, a little fuller at the palm swell
gr = obj(slab(loops_of('grip'), 0.031, 0.0115, 4), 'grip', 'polymer')
widths(gr, lambda f, u: ramp(u, U(300), U(380), 0.027, 0.031)); finish(gr.data)

# RECEIVER (base): parkerised steel, machined flat sides with small radii; upper 30 mm, lower 34; the trigger guard
# and trigger thin. The top from the rear sight to the receiver's front is the dust cover: a pressed steel arch.
rc = obj(slab(loops_of('base'), 0.034, 0.0018, 2), 'base', 'park')
def w_rcv(f, u):
    if F(752) < f < F(862) and u < U(300): return 0.006 if F(770) < f < F(800) and u > U(345) else 0.009
    if F(866) < f < F(906) and u < U(297): return 0.014
    if f > F(1092): return 0.030                                   # the barrel nut
    return ramp(u, U(276), U(286), 0.030, 0.034)
widths(rc, w_rcv)
COV = (603, 905, 195)                                              # the cover: photo x0, x1, its lower edge (px)
cutters = [
    box(-0.03, 0.03, F(COV[0]), F(COV[1]), U(COV[2]), 0.05),        # (the cover replaces the receiver's top here)
    box(0.0128, 0.04, F(690), F(856), U(250), U(232)),             # ejection port (right)
    box(-0.04, -0.0165, F(600), F(1092), U(282.5), U(281.5)),       # upper/lower receiver seam
    box(0.0165, 0.04, F(600), F(1092), U(282.5), U(281.5)),
    box(-0.04, -0.0135, F(930), F(1060), U(204), U(201)),          # the charging handle's slot (left)
]
cut(rc, cutters); finish(rc.data)
rings = []
top = [(F(px), U(col_run(px, 190)[0])) for px in range(COV[0], COV[1] + 1)]
for f, t in rdp(top, 0.0004):                                      # (sections only where its top line bends)
    b = U(COV[2]) - 0.0004; hw = 0.0132
    ring = [(hw, b)] + [(hw * math.cos(a), b + (t - b) * math.sin(a)) for a in [math.pi * k / 8 for k in range(9)]] + [(-hw, b)]
    rings.append([(x, f, z) for x, z in ring])
dc = obj(loft(rings), 'base', 'park'); finish(dc.data, 40, caps=False)
# the bolt carrier showing in the port
obj(box(0.006, 0.0118, F(695), F(851), U(248), U(234)), 'base', 'black')
# pins, the takedown lever and the selector
for px, py, r in ((748, 279, 0.0022), (796, 282, 0.0022), (831, 273, 0.0028)):
    o = obj(tube([(-0.019, r * 0.8), (-0.018, r), (0.018, r), (0.019, r * 0.8)], 16, 'x', (0, F(px), U(py))), 'base', 'steel'); finish(o.data)
for side in (-1, 1):
    o = obj(tube([(0, 0.0045), (0.001, 0.0065), (0.0025, 0.0065), (0.0035, 0.0045)], 20, 'x', (side * 0.0168 - (0.0035 if side < 0 else 0), F(863), U(271))), 'base', 'black')
    finish(o.data)
sel = obj(box(-0.0195, -0.0168, F(840), F(890), U(268), U(258)), 'base', 'black'); bevel(sel, 0.001, 1); finish(sel.data)

# REAR SIGHT (optic): an aperture block between protective ears
rs = obj(slab(loops_of('rsight'), 0.018, 0.0009, 1), 'optic', 'park')
cut(rs, [tube([(-0.02, 0.0036), (0.02, 0.0036)], 24, 'y', (0, F(587), SY)),          # (the aperture: 7.2 mm, a ghost ring)
         box(-0.004, 0.004, F(560), F(610), SY + 0.0034, 0.08)])     # the notch over the aperture keeps the line clear
finish(rs.data)

# CARRY HANDLE: wire frame with a rubber-gripped bar; traced raised, then folded down on its hinge along the left side
car = []
cw = obj(slab(loops_of('carry', 2.2), 0.0045, 0.0007, 1), 'base', 'black'); car.append(cw)
bar = []
for px in range(872, 1046, 1):
    r = col_run(px, 110)
    if r: bar.append((F(px), max(0.004, (r[1] - r[0] + 1) / 2 * S)))
bc = (U(110))
bm_ = obj(lathe([(bar[0][0], bar[0][1] * 0.6)] + rdp(bar, 0.0005) + [(bar[-1][0], bar[-1][1] * 0.6)], 10, eps=0), 'base', 'rubber')
bm_.data.transform(Matrix.Translation((0, 0, bc))); car.append(bm_)
hx, hz = -0.0255, U(174)                                           # the hinge: front left of the receiver top
fold = Matrix.Translation((hx, 0, hz)) @ Matrix.Rotation(math.pi, 4, 'Y') @ Matrix.Translation((0, 0, -hz))
for o in car: o.data.transform(fold); finish(o.data)
# its hinge block
o = obj(box(-0.022, -0.015, F(1050), F(1078), U(182), U(166)), 'base', 'park'); bevel(o, 0.0012, 1); finish(o.data)

# CHARGING HANDLE (part_handle): a flat lever along the left side with its tab folded out; it runs back 100 mm
HF, HY, HX = 0.235, 0.004, -0.0165
ph = part('handle', (0, HF, HY))
lv = obj(box(HX - 0.004, HX, HF - 0.032, HF, HY - 0.006, HY + 0.006), 'base', 'black', ph); bevel(lv, 0.0012, 2); finish(lv.data)
tb = obj(box(HX - 0.022, HX - 0.002, HF - 0.008, HF, HY - 0.005, HY + 0.005), 'base', 'black', ph); bevel(tb, 0.002, 2); finish(tb.data)

# MAGAZINE (part_mag): steel, 20 rounds, ribbed sides, a round on top
MAG_F, MAG_U = (F(903) + F(1053)) / 2, U(298)
pm = part('mag', (0, MAG_F, MAG_U)); pm['check'] = {'w': 0.028}
mg = obj(slab(loops_of('mag'), 0.028, 0.0017, 2), 'mag', 'park', pm)
rib = []
for px in (936, 972, 1021):
    for s in (-1, 1): rib.append(box(s * 0.0128, s * 0.03, F(px) - 0.0016, F(px) + 0.0016, U(492), U(318)))
# the witness windows (the game's magazine check): four down the back face (toward the shooter), none on the front, slots with
# the stack's brass showing, each window its own mesh at the face's tilt there (the faces read off the magazine's own outline)
def face_at(z, back):
    ys = []
    for e in mg.data.edges:
        a_, b_ = mg.data.vertices[e.vertices[0]].co, mg.data.vertices[e.vertices[1]].co
        if (a_.z - z) * (b_.z - z) < 0: ys.append(a_.y + (b_.y - a_.y) * (z - a_.z) / (b_.z - a_.z))
    return min(ys) if back else max(ys)
WZ0, WZ1 = U(330), U(480)
wins = []
for side in (1,):
    for i in range(1, 5):
        t = i / 5 * 0.94; z = WZ0 + (WZ1 - WZ0) * (0.05 + 0.85 * i / 5)
        y = face_at(z, side == 1); ya, yb = face_at(z + 0.008, side == 1), face_at(z - 0.008, side == 1)
        ang = math.atan2(-(ya - yb), 0.016)                         # (about X: Z up the face)
        nF, nU = math.cos(ang), math.sin(ang)
        x = -side * 0.004
        g = box(x - 0.0026, x + 0.0026, -0.0016, 0.0016, -0.0028, 0.0028); g.transform(Matrix.Translation((0, y, z)) @ Matrix.Rotation(ang, 4, 'X'))
        rib.append(g); wins.append((i - 1, t, side, (y, z), ang, nF, nU))
cut(mg, rib); finish(mg.data)
for i, t, side, (y, z), ang, nF, nU in wins:
    x = -side * 0.004
    o = obj(box(x - 0.0024, x + 0.0024, -0.0003, 0.0003, -0.0026, 0.0026), 'mag', 'brass', pm)
    d = side * 0.0011                                                  # (the slot's floor, in from its face)
    o.matrix_world = Matrix.Translation((0, y + d * nF, z + d * nU)) @ Matrix.Rotation(ang, 4, 'X'); finish(o.data)
    o['chk'] = {'role': 'hole', 'i': i, 't': round(t, 4), 'side': side}
# its top half rides up inside the well (hidden while seated; seen when it drops out on a reload): the body to the feed
# lips 9 mm under the bore, the top round held in the lips where the bolt strips it, the next one staggered under it
LIPS = -0.009
up = obj(box(-0.014, 0.014, F(907), F(1049), MAG_U + 0.0005, LIPS - 0.003), 'mag', 'park', pm); bevel(up, 0.0012, 1); finish(up.data)
for sx in (-1, 1):   # the feed lips: two inturned edges, the round showing between them
    lp = obj(box(sx * 0.0045, sx * 0.014, F(912), F(1046), LIPS - 0.0035, LIPS), 'mag', 'park', pm); bevel(lp, 0.0008, 1); finish(lp.data)
for k, (x, z) in enumerate(((0.0, LIPS - 0.0035), (0.0052, LIPS - 0.0035 - 0.0085))):
    # (7.62x51: the case 51 mm, the bullet to 71 mm; the top one's case and tip are the magazine check's)
    cs = obj(lathe([(0.0, 0.0055), (0.0, 0.0059), (0.040, 0.0059), (0.044, 0.0045), (0.051, 0.0045), (0.051, 0.0005)], 12, eps=0), 'mag', 'brass', pm)
    cs.data.transform(Matrix.Translation((x, F(906) + 0.002, z))); finish(cs.data)   # (case head at the back of the mag, bullet forward)
    tp = obj(lathe([(0.051, 0.0005), (0.051, 0.0039), (0.062, 0.0035), (0.071, 0.0012)], 12, eps=0), 'mag', 'brass', pm)
    tp.data.transform(Matrix.Translation((x, F(906) + 0.002, z))); finish(tp.data)
    if k == 0: cs['chk'] = {'role': 'top', 'i': 0}; tp['chk'] = {'role': 'top', 'i': 1}

# HANDGUARD: polymer, rounded, three vent slots a side, a long groove and vent holes along the bottom
hg = obj(slab(loops_of('handguard'), 0.050, 0.019, 5), 'handguard', 'polymer')   # an oval in section (its front end's view)
hc = []
for a, b in ((1327, 1372), (1394, 1439), (1459, 1504)):
    for s in (-1, 1): hc.append(box(s * 0.006, s * 0.04, F(a), F(b), U(192), U(182)))      # (through, into the barrel channel)
for s in (-1, 1): hc.append(box(s * 0.0236, s * 0.04, F(1135), F(1520), U(236), U(229)))
for px in (1180, 1370, 1430, 1495):
    hc.append(tube([(-0.04, 0.0022), (0.04, 0.0022)], 12, 'x', (0, F(px), U(257))))
cut(hg, hc); finish(hg.data)
# the front sling swivel
o = obj(box(-0.0015, 0.0015, F(1505), F(1520), U(268), U(258)), 'handguard', 'black'); finish(o.data)
# (the traced handguard runs 234.5 mm to the gas block; the longest the platform takes is 231.5 (hgMax): scaled to 230.5 mm from its rear)
HG_K = 0.2305 / 0.2345
for o_ in (hg, o): o_.data.transform(Matrix.Translation((0, F(1116), 0)) @ Matrix.Scale(HG_K, 4, (0, 1, 0)) @ Matrix.Translation((0, -F(1116), 0)))

# BARREL: turned from the photo's profile (round, on the bore), with the gas block, gas plug and bayonet lug
prof = []
for px in range(1096, 1882, 3):
    r = col_run(px, PY0) if px >= 1606 else None
    rr = (r[1] - r[0] + 1) / 2 * S if r and (r[1] - r[0]) < 40 else 0.0095
    prof.append((F(px), min(rr, 0.0105)))
GAS_F, BAR_F = F(1607), F(1672)                                    # the gas block's front; mount_barrel (the bare tube starts here, ahead of the bayonet lug's collar)
# slot BARREL is the factory barrel only: the bare tube from mount_barrel to its end (mount_muzzle). Any other barrel is the shared standard
# tube (r 9.5 mm) seated at mount_barrel. Everything that stays when it is swapped is BASE: the barrel's run inside the receiver, handguard
# and gas block, the collar behind mount_barrel (at least r 10.5 mm at its front, so it hides where a standard tube starts), the gas block,
# the bayonet lug, the gas plug, the gas tube and the front sight.
br = obj(lathe([q for q in prof if q[0] <= GAS_F + 1e-6] + [(GAS_F, prof[0][1])], 16), 'base', 'park'); finish(br.data)
col = [(GAS_F - 0.002, 0.0085)] + [(f, max(r, 0.0105)) for f, r in prof if GAS_F < f < BAR_F] + [(BAR_F, 0.0105), (BAR_F, 0.0075)]
o = obj(lathe(col, 16), 'base', 'park'); finish(o.data)
fr = obj(lathe([(BAR_F - 0.002, 0.0075)] + [q for q in prof if q[0] > BAR_F], 16), 'barrel', 'park'); finish(fr.data)
gb = obj(slab(loops_of('barrel'), 0.032, 0.004, 2), 'base', 'park')
clip(gb, [((0, F(1607), 0), (0, 1, 0))]); finish(gb.data)
lug = obj(slab(loops_of('barrel'), 0.012, 0.001, 1), 'base', 'park')
clip(lug, [((0, F(1607), 0), (0, -1, 0)), ((0, F(1670), 0), (0, 1, 0)), ((0, 0, -0.008), (0, 0, 1))]); finish(lug.data)
o = obj(tube([(F(1598), 0.0058), (F(1614), 0.0058), (F(1616), 0.0045)], 18, 'y', (0, 0, U(178))), 'base', 'park'); finish(o.data)
# the gas tube: from the receiver's face to the gas block's rear, over the barrel (base, with the gas block). It is sized to sit
# INSIDE every shared handguard seated at mount_handguard: its top is 17.0 mm over the bore, under the slim one's 16-sided r 18 mm (flats at 17.65 mm).
# On the real rifle it sits higher (the gas plug's line, U(178)), hidden by the factory handguard either way.
GT_R, GT_U = 0.0036, 0.0134                                         # 0.5 mm over the barrel (r 9.5 mm)
o = obj(tube([(F(1116) - 0.002, GT_R), (F(1531) + 0.002, GT_R)], 12, 'y', (0, 0, GT_U)), 'base', 'park'); finish(o.data)

# FRONT SIGHT (on the gas block, so base: it stays whatever barrel or optic is fitted): two protective ears and the post between them, its tip on the line of sight
for s in (-1, 1):
    e = obj(slab(loops_of('fsight'), 0.003, 0.0006, 1), 'base', 'park')
    e.data.transform(Matrix.Translation((s * 0.0062, 0, 0))); finish(e.data)
FPF = F(1575)
o = obj(box(-0.0013, 0.0013, FPF - 0.0015, FPF + 0.0015, U(168), SY), 'base', 'park'); finish(o.data)
o = obj(box(-0.0075, 0.0075, F(1550), F(1600), U(172), U(165)), 'base', 'park'); bevel(o, 0.001, 1); finish(o.data)

# FLASH HIDER (muzzle): turned, bored, six slots
mp = []
for px in range(1880, 2022, 2):
    r = col_run(px, PY0); mp.append((F(px), (r[1] - r[0] + 1) / 2 * S if r else 0.0095))
MZ = F(2021)
mp = [(mp[0][0], 0.0085)] + mp + [(MZ, mp[-1][1] * 0.94), (MZ, 0.0042), (MZ - 0.03, 0.0042)]
mz = obj(lathe(mp, 18), 'muzzle', 'black')
sl = []
for i in range(6):
    a = 2 * math.pi * i / 6 + math.pi / 6
    c = box(-0.0013, 0.0013, F(1950), F(2012), 0.004, 0.02); c.transform(Matrix.Rotation(a, 4, 'Y')); sl.append(c)
cut(mz, sl); finish(mz.data)

# =====================================================================================================================
# the anchors the game needs (docs/models.md), in its [forward, up, right] metres
info = {
    'sy': SY, 'fSight': F(587), 'relief': 0.075,
    'muzzles': [[round(MZ, 4), 0, 0]],
    'grip': [0.05, -0.078, 0], 'support': [0.37, -0.024, 0],
    'anim': {'handle': 'part_handle', 'mag': 'part_mag'},
    'magAt': [round(MAG_F, 4), round(MAG_U, 4)],
    'handle': {'f': HF, 'y': HY, 'x': HX, 'travel': 0.1, 'style': 'fold', 'grab': [HF, HY + 0.006, HX - 0.028]},
    'port': [round(F(780), 4), round(U(241), 4), 0.016],
    'chamberAt': {'side': 'right', 'f': round(F(760), 4), 'y': round(U(241), 4), 'x': 0.012},
    'recoilBarrel': 0,
    'mounts': {'mount_muzzle': [round(F(1880), 4), 0, 0]},
}
ROOT['info_json'] = json.dumps(info)
# the MOUNT ANCHORS (docs/models.md "Authored models", js/glb.ts GUN_MODEL_CONTRACT.authored): where the gun's non-factory parts are seated, [forward, up, right] metres
anchors = {
    'mount_optic': [round(F(608), 4), round(U(181), 4), 0],            # the optic rail's start: along the dust cover, at the receiver's top
    'mount_optic_end': [round(F(900), 4), round(U(181), 4), 0],        # ... and its end (the same height)
    'mount_handguard': [round(F(1116), 4), 0, 0],                      # where a handguard starts (the barrel nut's front)
    'mount_handguard_end': [round(F(1531), 4), 0, 0],                  # the furthest forward one reaches: the gas block's rear (js/parts.ts hgMax is this minus mount_handguard minus 3 mm)
    'mount_barrel': [round(BAR_F, 4), 0, 0],                           # the bare tube (slot barrel) from here, ahead of the bayonet lug's collar: another barrel is seated here
    'mount_muzzle': [round(F(1880), 4), 0, 0],                         # the 21" barrel's end: a muzzle device screws on here
    'mount_stock': [0, round((U(219) + U(290)) / 2, 5), 0],            # the stock's wrist at the receiver's back (the centre height)
    'mount_grip': [round(F(700), 4), round(U(302), 4), 0],             # the grip's seat: the receiver's underside
    'mount_mag': [round(MAG_F, 4), round(MAG_U, 4), 0],                # the magazine well (info.magAt)
}
ROOT['anchors_json'] = json.dumps(anchors)

# ---- save and export ----
tris = sum(len(p.vertices) - 2 for o in coll.all_objects if o.type == 'MESH' for p in o.data.polygons)
out = {'objects': len(coll.all_objects), 'tris': tris, 'info': info, 'failed': FAILED}
for o in coll.all_objects:
    if o.type == 'MESH' and 'w0' in o.data: del o.data['w0']
if os.environ.get('FAL_EXPORT', '1') == '1':
    # fal.blend holds the FAL only. A session holding nothing else is saved whole; one with other models in it (another part built in the
    # same Blender) writes just this collection (kept by a fake user: File > Append > Collection > fal, or the Blender File view).
    # (Never bpy.data.libraries.write a SCENE: Blender 5.2.3 crashes in BKE_view_layer_copy_data.)
    others = [c.name for c in bpy.data.collections if c != coll and (c.objects or c.children)] + [s.name for s in bpy.data.scenes if s != bpy.context.scene]
    if not others: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'fal.blend'), copy=True)
    else:
        bpy.data.libraries.write(os.path.join(HERE, 'fal.blend'), {coll}, fake_user=True, compress=True)
        print('fal.blend: the collection only (the session also holds %s)' % ', '.join(others))
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, 'fal.glb'), export_format='GLB', use_selection=True, export_extras=True,
                              export_yup=True, export_apply=True, export_texcoords=False, export_normals=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False, export_animations=False)
    out['glb'] = os.path.getsize(os.path.join(HERE, 'fal.glb'))
result = out
