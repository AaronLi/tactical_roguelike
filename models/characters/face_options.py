# Face style options for the new human models, and the body's proportions, for choosing a direction before the real
# models are built:  blender -b -P models/characters/face_options.py
# Writes models/characters/options/faces.png (four heads, front and three-quarter), body.png (the figure, front and side)
# and face_options.blend. Nothing here is loaded by the game.
#   A  blank      no features: the skull's shape only, a dark visor band where the eyes would be
#   B  planar     the features cut in flat planes (few faces, flat shaded), eyes as dark insets
#   C  stylised   smooth and simple: a small nose, big dark eyes, a line of a mouth, brows as shapes
#   D  natural    sockets and eyeballs, a nose with wings, lips, ears, a jaw: as real as the game's detail carries
import bpy, bmesh, math, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'options'); os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(name, col, rough=0.6, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = (*col, 1); b.inputs['Emission Strength'].default_value = emit
    return m
SKIN = mat('skin', (0.62, 0.42, 0.32)); SKIN2 = mat('skin2', (0.36, 0.23, 0.17)); HAIR = mat('hair', (0.05, 0.035, 0.03), 0.8); DARK = mat('dark', (0.02, 0.02, 0.025), 0.3)
WHITE = mat('white', (0.85, 0.85, 0.82), 0.3); LIP = mat('lip', (0.5, 0.26, 0.24), 0.5); VISOR = mat('visor', (0.02, 0.05, 0.08), 0.08); CLOTH = mat('cloth', (0.16, 0.19, 0.22), 0.8); BOOT = mat('boot', (0.04, 0.04, 0.045), 0.6)

def obj(name, mesh, m, smooth=True):
    o = bpy.data.objects.new(name, mesh); sc.collection.objects.link(o); mesh.materials.append(m)
    for p in mesh.polygons: p.use_smooth = smooth
    return o
def sphere(name, r, m, loc, scale=(1, 1, 1), parent=None, sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = obj(name, me, m); o.location = loc; o.scale = scale; o.parent = parent; return o
def box(name, size, m, loc, parent=None, rot=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = obj(name, me, m, False); o.scale = size; o.location = loc; o.rotation_euler = rot; o.parent = parent; return o

# ---- a head: 23 cm crown to chin, the face toward -Y, its middle at the origin (the eye line)
G = lambda d, r: math.exp(-(d / r) ** 2)
def head(name, style, skin, look=(0, 0)):  # look: where D's eyes are turned, degrees (right, up)
    f = {'A': dict(nose=0, wings=0, brow=0.3, sock=0, lips=0, chin=0.6, cheek=0.4, sub=4),
         'B': dict(nose=1.25, wings=0.6, brow=1.5, sock=1.5, lips=0.9, chin=1.3, cheek=1.4, sub=4),
         'C': dict(nose=0.55, wings=0, brow=0.4, sock=0.25, lips=0, chin=0.8, cheek=0.7, sub=4),
         'D': dict(nose=1.0, wings=1.0, brow=1.0, sock=1.35, lips=1.25, chin=1.0, cheek=1.0, sub=6)}[style]
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=f['sub'], radius=1)
    for v in bm.verts:
        x, y, z = v.co
        X, Y, Z = x * 0.077, y * 0.097, z * 0.115
        if z < 0:
            t = -z
            X *= 1.04 * (1 - 0.30 * t ** 1.4)             # the jaw narrows to the chin
            if y > 0: Y *= 1 - 0.42 * t ** 1.2             # the back of the skull comes in to the neck
            else: Y *= 1 - 0.10 * t ** 2
        else: X *= 1 + 0.04 * (1 - z); Y += 0.006 * z        # the cranium, a little back
        if y < 0: Y *= 0.93                                 # the face flatter than the back
        fr = max(0.0, -y) ** 1.5                            # how much this vertex faces front
        ax = abs(X)
        d = 0.0
        d += f['brow'] * 0.0055 * G(Z - 0.024, 0.011) * G(max(0, ax - 0.03), 0.03)
        d -= f['sock'] * 0.0075 * G(Z - 0.004, 0.012) * G(ax - 0.031, 0.015)
        d += f['nose'] * (0.007 * G(ax, 0.0085) * G(Z + 0.008, 0.03) + 0.019 * G(ax, 0.011) * G(Z + 0.034, 0.013))
        d += f['wings'] * 0.006 * G(ax - 0.013, 0.007) * G(Z + 0.039, 0.008)
        d += f['lips'] * (0.0045 * G(Z + 0.060, 0.005) + 0.004 * G(Z + 0.071, 0.006) - 0.004 * G(Z + 0.0655, 0.0022)) * G(ax, 0.024)
        d += f['chin'] * 0.006 * G(Z + 0.100, 0.014) * G(ax, 0.022)
        d += f['cheek'] * 0.004 * G(Z + 0.016, 0.02) * G(ax - 0.05, 0.02)
        Y -= d * fr
        if style == 'D': X += math.copysign(0.002 * G(Z + 0.07, 0.03) * G(ax - 0.05, 0.02), X)  # the jaw's angle
        v.co = (X, Y, Z)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    h = obj(name, me, skin, style != 'B')
    if style == 'D':  # the lips are the face's own surface: its faces there take the lip's colour
        me.materials.append(LIP)
        for p in me.polygons:
            c = p.center
            if c.y < -0.06 and (c.x / 0.0235) ** 2 + ((c.z + 0.0655) / 0.0088) ** 2 < 1: p.material_index = 1
    if style == 'B':
        m = h.modifiers.new('planes', 'DECIMATE'); m.ratio = 0.045
    # the neck
    nk = bpy.data.meshes.new(name + '_neck'); bm = bmesh.new(); bmesh.ops.create_cone(bm, segments=10 if style == 'B' else 20, radius1=0.058, radius2=0.05, depth=0.12, cap_ends=True); bm.to_mesh(nk); bm.free()
    n = obj(name + '_neck', nk, skin, style != 'B'); n.location = (0, 0.022, -0.135); n.rotation_euler = (math.radians(-12), 0, 0); n.parent = h
    if style == 'A':
        v = sphere(name + '_visor', 1, VISOR, (0, -0.012, 0.004), (0.0725, 0.084, 0.03), h, 4)
    else:
        # hair: a cap over the crown and down the back
        hair = sphere(name + '_hair', 1, HAIR, (0, 0.012, 0.03), (0.086 if style == 'B' else 0.081, 0.104 if style == 'B' else 0.098, 0.098 if style == 'B' else 0.093), h, 2 if style == 'B' else 4)
        for p in hair.data.polygons: p.use_smooth = style != 'B'
    if style == 'B':
        for s in (-1, 1): box(name + '_eye', (0.02, 0.004, 0.007), DARK, (s * 0.031, -0.0795, 0.004), h)
    if style == 'C':
        for s in (-1, 1):
            sphere(name + '_eye', 1, DARK, (s * 0.03, -0.079, 0.002), (0.0105, 0.004, 0.0145), h, 3)
            box(name + '_brow', (0.024, 0.006, 0.0045), HAIR, (s * 0.031, -0.085, 0.028), h, (0, s * -0.12, 0))
        box(name + '_mouth', (0.03, 0.004, 0.0028), DARK, (0, -0.079, -0.064), h)
    if style == 'D':
        for s in (-1, 1):
            # the eye turns in its socket: the iris is the ball's, and the ball is what's rotated (in the game: toward what they're looking at)
            ball = sphere(name + '_ball', 0.0115, WHITE, (s * 0.031, -0.0700, 0.004), parent=h, sub=3)
            sphere(name + '_iris', 0.0056, DARK, (0, -0.0091, 0), (1, 0.45, 1), ball, 3)
            ball.rotation_euler = (math.radians(look[1]), 0, math.radians(-look[0]))
            # lids: shells of skin over the ball, the upper one down to the top of the iris, the lower a rim
            for lo, hi in ((0.0045, 1), (-1, -0.0068)):
                bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=4, radius=0.0124)
                bmesh.ops.delete(bm, geom=[v for v in bm.verts if not (lo <= v.co.z <= hi and v.co.y < 0.003)], context='VERTS')
                lm = bpy.data.meshes.new(name + '_lid'); bm.to_mesh(lm); bm.free()
                lid = obj(name + '_lid', lm, skin); lid.location = (s * 0.031, -0.0700, 0.004); lid.parent = h
                sd = lid.modifiers.new('thick', 'SOLIDIFY'); sd.thickness = 0.0012; sd.offset = 1
            box(name + '_brow', (0.027, 0.005, 0.0035), HAIR, (s * 0.031, -0.0875, 0.0245), h, (0, s * -0.1, 0))
            sphere(name + '_ear', 1, skin, (s * 0.078, 0.008, -0.008), (0.007, 0.016, 0.028), h, 3)
    if style in ('B', 'C'):
        for s in (-1, 1): sphere(name + '_ear', 1, skin, (s * 0.076, 0.008, -0.008), (0.006, 0.014, 0.024), h, 1 if style == 'B' else 3)
        if style == 'B':
            for c in h.children:
                if c.name.endswith('_ear'):
                    for p in c.data.polygons: p.use_smooth = False
    return h

# ---- the body: 1.78 m, seven and a half heads. Each part a tube through elliptical rings (centre, half-width, half-depth)
def tube(name, rings, m, parent, seg=16):
    bm = bmesh.new(); loops = []
    for (c, rx, ry) in rings: loops.append([bm.verts.new((c[0] + math.cos(a) * rx, c[1] + math.sin(a) * ry, c[2])) for a in [k * 2 * math.pi / seg for k in range(seg)]])
    for a, b in zip(loops, loops[1:]):
        for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bm.faces.new(loops[0][::-1]); bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = obj(name, me, m); o.parent = parent; ss = o.modifiers.new('sub', 'SUBSURF'); ss.levels = ss.render_levels = 2; return o
def body(name, x0):
    root = bpy.data.objects.new(name, None); sc.collection.objects.link(root)
    # Proportions from ANSUR II, the US Army's anthropometric survey of its own soldiers (men's means, public data): stature
    # 1.756 m, 0.51 across the deltoids, 0.415 between the shoulder points, chest 1.06 round, waist 0.94 (0.88 here: fit),
    # hips 0.35 across, crotch 0.85 up, knee 0.48, thigh 0.625 round, calf 0.39, upper arm 0.36 flexed, forearm 0.31, neck 0.40.
    tube(name + '_torso', [((0, 0.005, 0.83), 0.11, 0.09), ((0, 0.012, 0.92), 0.176, 0.125), ((0, 0.006, 1.02), 0.162, 0.112), ((0, 0, 1.10), 0.15, 0.108), ((0, -0.01, 1.22), 0.165, 0.125), ((0, -0.016, 1.32), 0.185, 0.14), ((0, -0.004, 1.40), 0.2, 0.125), ((0, 0.01, 1.455), 0.12, 0.085), ((0, 0.018, 1.485), 0.064, 0.066)], CLOTH, root)
    for s in (-1, 1):
        tube(name + '_arm', [((s * 0.17, 0, 1.43), 0.055, 0.065), ((s * 0.222, 0, 1.395), 0.07, 0.074), ((s * 0.24, 0.004, 1.29), 0.058, 0.064), ((s * 0.25, 0.01, 1.14), 0.045, 0.048), ((s * 0.258, 0.002, 1.07), 0.05, 0.053), ((s * 0.264, -0.018, 0.9), 0.033, 0.037), ((s * 0.265, -0.02, 0.86), 0.031, 0.035)], CLOTH, root, 12)
        tube(name + '_hand', [((s * 0.264, -0.018, 0.895), 0.028, 0.032), ((s * 0.267, -0.026, 0.83), 0.021, 0.046), ((s * 0.268, -0.032, 0.76), 0.018, 0.043), ((s * 0.268, -0.04, 0.70), 0.012, 0.03)], SKIN, root, 10)
        tube(name + '_leg', [((s * 0.092, 0.005, 0.91), 0.094, 0.108), ((s * 0.098, 0, 0.71), 0.086, 0.094), ((s * 0.104, -0.006, 0.49), 0.06, 0.064), ((s * 0.107, 0.018, 0.36), 0.062, 0.07), ((s * 0.11, 0.016, 0.11), 0.042, 0.048), ((s * 0.11, 0.012, 0.04), 0.046, 0.052)], CLOTH, root, 12)
        sphere(name + '_foot', 1, BOOT, (s * 0.113, -0.055, 0.045), (0.052, 0.14, 0.046), root, 3)
    # one skin: the parts joined, filled as a single volume and smoothed (the hands and boots stay their own)
    parts = [c for c in root.children if c.data.materials[0] == CLOTH]
    dg = bpy.context.evaluated_depsgraph_get(); bm = bmesh.new()
    for c in parts:
        tmp = bpy.data.meshes.new_from_object(c.evaluated_get(dg)); tmp.transform(c.matrix_local); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new(name + '_skin'); bm.to_mesh(me); bm.free()
    for c in parts: bpy.data.objects.remove(c)
    sk = obj(name + '_skin', me, CLOTH); sk.parent = root
    rm = sk.modifiers.new('one', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.009; rm.use_smooth_shade = True
    sm = sk.modifiers.new('smooth', 'SMOOTH'); sm.factor = 0.7; sm.iterations = 14
    root.location.x = x0
    return root

# ---- the sheets
def world(col=(0.23, 0.25, 0.28)):
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (*col, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.7
def light(kind, loc, energy, rot=(0, 0, 0), size=1):
    d = bpy.data.lights.new(kind, kind); d.energy = energy
    if kind == 'AREA': d.size = size
    o = bpy.data.objects.new(kind, d); o.location = loc; o.rotation_euler = rot; sc.collection.objects.link(o); return o
def camera(loc, look, ortho):
    c = bpy.data.cameras.new('cam'); c.type = 'ORTHO'; c.ortho_scale = ortho; o = bpy.data.objects.new('cam', c); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); sc.camera = o; return o
def label(t, loc, size=0.035):
    c = bpy.data.curves.new('t', 'FONT'); c.body = t; c.size = size; c.align_x = 'CENTER'; o = bpy.data.objects.new('t', c); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = (math.pi / 2, 0, 0); c.materials.append(mat('txt', (0.9, 0.9, 0.9), 1, 1.0)); return o
for e in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try: sc.render.engine = e; break
    except TypeError: pass
sc.view_settings.view_transform = 'Standard'
world()
light('SUN', (0, 0, 3), 3.0, (math.radians(55), 0, math.radians(-35)))
light('AREA', (1.2, -1.5, 0.6), 60, (math.radians(75), 0, math.radians(40)), 2)

NAMES = {'A': 'A  blank', 'B': 'B  planar', 'C': 'C  stylised', 'D': 'D  natural'}
heads = []
for i, s in enumerate('ABCD'):
    x = (i - 1.5) * 0.3
    h = head('head' + s, s, SKIN); h.location = (x, 0, 0.36); heads.append(h)
    q = head('head' + s + '34', s, SKIN2 if s in 'BD' else SKIN); q.location = (x, 0, 0); q.rotation_euler = (0, 0, math.radians(38))
    label(NAMES[s], (x, -0.12, 0.535))
camera((0, -3, 0.2), (0, 0, 0.2), 1.3)
sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
sc.render.filepath = os.path.join(OUT, 'faces.png'); bpy.ops.render.render(write_still=True)

# D on its own, closer: front, three-quarter, side
for i, (rz, look) in enumerate(((0, (0, 0)), (0, (-28, 0)), (0, (24, 14)), (38, (-38, -6)), (90, (0, 0)))):
    q = head('headD_close%d' % i, 'D', SKIN, look); q.location = (8 + (i - 2) * 0.27, 0, 0); q.rotation_euler = (0, 0, math.radians(rz))
camera((8, -3, -0.01), (8, 0, -0.01), 1.4)
sc.render.resolution_x, sc.render.resolution_y = 2400, 660
sc.render.filepath = os.path.join(OUT, 'face_d.png'); bpy.ops.render.render(write_still=True)

# the figure: front and side, a 1.78 m rule and head-heights beside it
bx = 4.0
for k, rz in enumerate((0, math.radians(90))):
    b = body('body%d' % k, 0); h = head('bodyhead%d' % k, 'D', SKIN); h.location = (0, 0.005, 1.641); h.parent = b
    b.location = (bx + (k - 0.5) * 0.9, 0, 0); b.rotation_euler = (0, 0, rz)
for i in range(9):
    z = 1.756 - i * 1.756 / 7.5
    if z >= -0.01: box('rule', (2.1, 0.002, 0.003), WHITE, (bx, 0.3, max(0, z)))
label('1.756 m (ANSUR II mean), 7.5 heads', (bx, -0.3, 1.86), 0.055)
# A reference photo laid over the figure, half see-through, if there is one: models/characters/ref/front.(png|jpg) over the
# front view, side.(png|jpg) over the side view. The picture is scaled so its height is REF_H metres (the whole picture
# from the soles to the top of the head: crop it so) and stood on the floor on the figure's middle; REF_DX nudges it sideways.
REF_H = float(os.environ.get('REF_H', 1.756)); REF_DX = float(os.environ.get('REF_DX', 0)); REF_A = float(os.environ.get('REF_A', 0.5))
for k, nm in enumerate(('front', 'side')):
    f = next((os.path.join(HERE, 'ref', nm + e) for e in ('.png', '.jpg', '.jpeg') if os.path.exists(os.path.join(HERE, 'ref', nm + e))), None)
    if not f: continue
    img = bpy.data.images.load(f); w = REF_H * img.size[0] / img.size[1]
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5); pm = bpy.data.meshes.new('ref'); uv = bm.loops.layers.uv.new()
    for fc in bm.faces:
        for lp in fc.loops: lp[uv].uv = (lp.vert.co.x + 0.5, lp.vert.co.y + 0.5)
    bm.to_mesh(pm); bm.free()
    m = bpy.data.materials.new('ref_' + nm); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img; em = nt.nodes.new('ShaderNodeEmission'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    mx.inputs[0].default_value = REF_A; nt.links.new(tx.outputs['Color'], em.inputs['Color']); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    try: m.surface_render_method = 'BLENDED'
    except Exception: m.blend_method = 'BLEND'
    o = obj('ref_' + nm, pm, m, False); o.scale = (w, REF_H, 1); o.rotation_euler = (math.pi / 2, 0, 0); o.location = (bx + (k - 0.5) * 0.9 + REF_DX, -0.5, REF_H / 2)
    print('reference over the', nm, 'view:', f)
camera((bx, -6, 0.93), (bx, 0, 0.93), 2.15)
sc.render.resolution_x, sc.render.resolution_y = 1100, 1300
sc.render.filepath = os.path.join(OUT, 'body.png'); bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'face_options.blend'))
