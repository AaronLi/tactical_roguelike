# The worn gear that's the same on every body, made once (blender -b -P models/characters/build_gear.py): night vision and the
# plate on a shop's stand. Written to models/characters/gear/gear.glb (kept in the repo); tools/bake_humans.mjs puts it in the baked
# tree beside the bodies (assets/models/humans/gear.glb), js/humans.ts loads it with them and js/headgear.ts / js/hangar.ts use its
# nodes. Authored straight in the game's frame (js/rig.ts: x across, y up, the front -z): P() turns that into Blender's (z up),
# which the glTF exporter turns back.
#   nvg_mount           the mount on the helmet's shroud (centred on the hinge)
#   nvg_arm             the arm down from the hinge, 1 long along y (centred: js/headgear.ts stretches it to the eyes)
#   nvg_mono/bino/pano  the bridge and the tubes, in the eyes' frame (the eyepieces' middle at the origin, the tubes out along -z);
#   nvg_lit_*           their eyepieces (material nvlit: lit when it's down)
#   nvg_thermal         a fused set's thermal core and its window, on top of the bridge (the eyes' frame)
#   nvg_battery         a quad set's battery pack (centred), at the back of the helmet
#   plate               a SAPI-cut plate, curved, its strike face (material plateface) to +z, 0.28 across and 0.36 tall, its bottom at y = 0
import bpy, bmesh, math, os
from mathutils import Vector as V, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'gear', 'gear.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
P = lambda x, y, z: V((x, -z, y))
MATS = {}
def mat(name, col):
    if name not in MATS:
        m = bpy.data.materials.new(name); m.diffuse_color = (*[((col >> s) & 255) / 255 for s in (16, 8, 0)], 1); MATS[name] = m
    return MATS[name]
COL = {'nvbody': 0x2c3034, 'nvrubber': 0x101112, 'nvdark': 0x1a1c1e, 'nvlens': 0x05080a, 'nvlit': 0x3aff7a, 'nvthermal': 0x3a3428, 'nvwindow': 0x2a1a08, 'nvbatt': 0x24272a, 'plate': 0x4a4f55, 'plateface': 0x4a4f55}

def obj(name, bm, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat(m, COL[m])); o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

def rbox(name, c, size, m, bev=0.003, rx=0.0):
    """a rounded box at c (game frame), size across / tall / deep, tipped rx about x"""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = V((v.co.x * size[0], v.co.y * size[2], v.co.z * size[1]))
    if bev: bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bev, min(size) * 0.45), segments=2, affect='EDGES', profile=0.5)
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(rx, 3, 'X'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=P(*c)); return obj(name, bm, m)

def cyl(name, x, y, z, r, length, m, cant=0.0, seg=16, r2=None):
    """a cylinder along the game's z, its middle at (x, y, z) (cant: turned about y round the tube's origin, see tube)"""
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r2 or r, depth=length)
    for v in bm.verts: v.co = P(v.co.x, v.co.y, v.co.z)  # (Blender's z is the game's z here: along the tube)
    bmesh.ops.translate(bm, verts=bm.verts, vec=P(x, y, z)); return obj(name, bm, m)

def join(objs, name):
    for q in bpy.context.selected_objects: q.select_set(False)
    for q in objs: q.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); objs[0].name = name; objs[0].data.name = name
    for p in objs[0].data.polygons: p.use_smooth = True
    objs[0].data.set_sharp_from_angle(angle=math.radians(35)); return objs[0]

def place(o, x, cant):
    """a tube's parts, made at x = 0, turned by cant about y and set at x"""
    o.data.transform(Matrix.Rotation(cant, 4, 'Z')); o.data.transform(Matrix.Translation(P(x, 0, 0))); return o

# -- night vision (as js/headgear.ts nvg drew it, rounded)
join([rbox('m', (0, 0, 0), (0.036, 0.03, 0.022), 'nvdark', 0.004), rbox('m2', (0, -0.012, -0.012), (0.026, 0.012, 0.012), 'nvdark', 0.002)], 'nvg_mount')
join([rbox('a', (0, 0, 0), (0.022, 1.0, 0.014), 'nvbody', 0.004)], 'nvg_arm')
SETS = {'mono': [(-0.032, 0, 0.016, 0.1)], 'bino': [(-0.032, 0, 0.017, 0.105), (0.032, 0, 0.017, 0.105)], 'pano': [(-0.058, 0.36, 0.0135, 0.088), (-0.022, 0, 0.0135, 0.088), (0.022, 0, 0.0135, 0.088), (0.058, -0.36, 0.0135, 0.088)]}
for key, tubes in SETS.items():
    n = len(tubes); bw = 0.03 if n == 1 else 0.084 if n == 2 else 0.142
    parts = [rbox('br', (-0.016 if n == 1 else 0, 0.02, -0.035), (bw, 0.026, 0.05), 'nvbody', 0.005)]; lit = []
    for x, cant, r, L in tubes:
        tp = [cyl('t', 0, 0, -L / 2 - 0.006, r, L, 'nvbody', r2=r * 0.96), cyl('c', 0, 0, -0.004, r * 1.12, 0.012, 'nvrubber'), cyl('o', 0, 0, -L - 0.008, r * 1.08, 0.014, 'nvdark'), cyl('l', 0, 0, -L - 0.016, r * 0.8, 0.002, 'nvlens')]
        for o in tp: place(o, x, cant)
        parts += tp; lit.append(place(cyl('e', 0, 0, 0.0035, r * 0.62, 0.0015, 'nvlit'), x, cant))
    join(parts, 'nvg_' + key); join(lit, 'nvg_lit_' + key)
join([rbox('tc', (0, 0.042, -0.05), (0.044, 0.026, 0.05), 'nvthermal', 0.005), cyl('tw', 0, 0.042, -0.077, 0.011, 0.004, 'nvwindow')], 'nvg_thermal')
join([rbox('bt', (0, 0, 0), (0.07, 0.04, 0.026), 'nvbatt', 0.006)], 'nvg_battery')

# -- the plate: SAPI cut (its top corners off), curved across (a multi-curve's), its strike face proud
def plate():
    W, H, T, CUT, BOW = 0.28, 0.36, 0.024, 0.06, 0.02
    def slab(w, h, cut, t, z0, m, nx=10):
        bm = bmesh.new()
        # a grid over the outline's box, kept inside it: rows up, columns across (the corners pulled onto the cut)
        rows = 8; vs = []
        for j in range(rows + 1):
            y = h * j / rows; row = []
            for i in range(nx + 1):
                x = -w / 2 + w * i / nx
                over = y - (h - cut)
                if over > 0: x = max(x, -w / 2 + over) if x < 0 else min(x, w / 2 - over)
                z = z0 - BOW * (2 * x / W) ** 2  # (the curve: its edges back)
                row.append((bm.verts.new(P(x, y, z + t)), bm.verts.new(P(x, y, z))))
            vs.append(row)
        for j in range(rows):
            for i in range(nx):
                a, b, c, d = vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]
                bm.faces.new((a[0], b[0], c[0], d[0])); bm.faces.new((d[1], c[1], b[1], a[1]))
        ring = [vs[0][i] for i in range(nx + 1)] + [vs[j][nx] for j in range(1, rows + 1)] + [vs[rows][i] for i in range(nx - 1, -1, -1)] + [vs[j][0] for j in range(rows - 1, 0, -1)]
        for k in range(len(ring)):
            p, q = ring[k], ring[(k + 1) % len(ring)]
            bm.faces.new((p[1], q[1], q[0], p[0]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return obj('pl', bm, m)
    face = slab(W - 0.05, H - 0.04, CUT - 0.01, 0.005, T / 2, 'plateface')
    face.data.transform(Matrix.Translation(P(0, 0.02, 0)))  # (the face: centred over the plate, 2 cm in from its edges)
    return join([slab(W, H, CUT, T, -T / 2, 'plate'), face], 'plate')
plate()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True, export_normals=True, export_materials='EXPORT', export_extras=False)
print('GEAR', OUT, [o.name for o in bpy.context.scene.objects])
