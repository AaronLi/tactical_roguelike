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
