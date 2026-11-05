# Shared Blender helpers for the authored models (models/<id>/build_<id>.py, models/parts/<slot>/<id>/build_<id>.py).
# A build script runs it first:  exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
# Frame: Blender X = right, Y = forward, Z = up, metres. Every mesh gets custom property `slot` and ONE catalogue material (by name).
import bpy, bmesh, math, os
from mathutils import Matrix, Vector

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
def kit_mat(n):
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n); m.diffuse_color = KIT_COL.get(n, (0.5, 0.5, 0.5, 1)); return m

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

def save_and_export(coll, root, here, name, export=True):
    """<name>.blend (the model only: the whole file when the session holds nothing else, else just its collection, kept by a fake user;
    never bpy.data.libraries.write a SCENE: Blender 5.2.3 crashes) and <name>.glb (the root and its children, extras on)."""
    if not export: return None
    others = [c.name for c in bpy.data.collections if c != coll and (c.objects or c.children)] + [s.name for s in bpy.data.scenes if s != bpy.context.scene]
    if not others: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(here, name + '.blend'), copy=True)
    else:
        bpy.data.libraries.write(os.path.join(here, name + '.blend'), {coll}, fake_user=True, compress=True)
        print(name + '.blend: the collection only (the session also holds %s)' % ', '.join(others))
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.all_objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(here, name + '.glb'), export_format='GLB', use_selection=True, export_extras=True, export_yup=True,
                              export_apply=True, export_texcoords=False, export_normals=True, export_materials='EXPORT', export_cameras=False,
                              export_lights=False, export_animations=False)
    return os.path.getsize(os.path.join(here, name + '.glb'))
