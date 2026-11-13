# The human model (face D): one skinned body and head on the game's own skeleton, built here, posed to check its joints,
# counted, and exported.   blender -b -P models/characters/build_human.py
# Writes models/characters/human/human.glb (the model at rest: an A-pose), human.blend, stats.json (triangles a part, bones)
# and poses.png (the joints in six poses, front three-quarter and side). Not loaded by the game yet.
#
# The skeleton is js/rig.ts's, in metres: hips 0.95 up; spine 0.08 over them; chest 0.19 over that; the shoulders 0.2 out and
# 0.26 up from the chest; upper arm 0.29, forearm 0.27; the hip joints 0.1 out and 0.03 down; thigh 0.44, shin 0.44. To that
# it adds a hand and a foot each side, and an eye each side (so they can look about).
# Blender's axes: z up, the figure facing -y. (glTF turns that to y up, facing +z: the game faces -z, so it's turned about when loaded.)
# The body's proportions are ANSUR II's (the U.S. Army's survey of its soldiers), checked against the Army's PT uniform photo
# (models/characters/ref). The limbs are tubes with rings where they bend (three close together at an elbow, a knee), joined
# to the trunk as one surface.
import bpy, bmesh, math, os, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'human'); os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
V = Vector

def mat(name, col, rough=0.7):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough
    return m
M = {k: mat(k, c, r) for k, c, r in [('skin', (0.55, 0.37, 0.28), 0.6), ('shirt', (0.13, 0.15, 0.17), 0.85), ('trousers', (0.10, 0.11, 0.12), 0.85), ('boots', (0.03, 0.03, 0.035), 0.6),
                                     ('hair', (0.05, 0.035, 0.03), 0.85), ('eye', (0.85, 0.85, 0.82), 0.25), ('iris', (0.03, 0.03, 0.035), 0.2), ('lip', (0.46, 0.25, 0.22), 0.5)]}
def link(name, me, smooth=True):
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = smooth
    return o

# ---- the joints (the game's), and the pose the model is made in: arms 40 degrees out from the sides
D2R = math.pi / 180
ARM = V((math.sin(40 * D2R), 0, -math.cos(40 * D2R)))
J = {'hips': V((0, 0, 0.95)), 'spine': V((0, 0, 1.03)), 'chest': V((0, 0, 1.22)), 'neck': V((0, 0.014, 1.51)), 'head': V((0, 0.016, 1.585)), 'top': V((0, 0.016, 1.756))}
for s, n in ((1, 'R'), (-1, 'L')):  # (the figure's own right is +x seen from behind: it faces -y)
    sh = V((s * 0.2, 0, 1.48)); arm = V((s * ARM.x, 0, ARM.z)); el = sh + arm * 0.29; wr = el + arm * 0.27 + V((0, -0.008, 0))
    hp = V((s * 0.1, 0, 0.92)); kn = hp + V((0, 0, -0.44)); an = kn + V((0, 0, -0.44))
    J.update({'sh' + n: sh, 'el' + n: el, 'wr' + n: wr, 'fi' + n: wr + arm * 0.19, 'hp' + n: hp, 'kn' + n: kn, 'an' + n: an + V((0, 0.012, 0.045)), 'toe' + n: V((s * 0.105, -0.2, 0.03)), 'arm' + n: arm})

# ---- a tube through rings set square to its own line: (centre, half-width across, half-depth), 'deep' the way its depth lies
def tube(rings, seg, deep=V((0, 1, 0)), cap=True):
    bm = bmesh.new(); loops = []
    for i, (c, rx, ry) in enumerate(rings):
        a, b = rings[max(0, i - 1)][0], rings[min(len(rings) - 1, i + 1)][0]; t = (b - a).normalized()
        d = (deep - t * deep.dot(t)).normalized(); sd = d.cross(t).normalized()
        loops.append([bm.verts.new(c + sd * (math.cos(k * 2 * math.pi / seg) * rx) + d * (math.sin(k * 2 * math.pi / seg) * ry)) for k in range(seg)])
    for a, b in zip(loops, loops[1:]):
        for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    if cap:
        for lp, c in ((loops[0], rings[0][0]), (loops[-1], rings[-1][0])):
            v = bm.verts.new(c)
            for k in range(seg): bm.faces.new((lp[k], lp[(k + 1) % seg], v))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm
def to_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); return link(name, me)
along = lambda a, b, u: a + (b - a) * u

def body_parts():
    parts = []
    # the trunk, pelvis to neck: level rings
    T = [(0.80, 0.07, 0.07, 0.006), (0.86, 0.14, 0.105, 0.008), (0.93, 0.168, 0.12, 0.012), (1.0, 0.158, 0.112, 0.008), (1.04, 0.15, 0.107, 0.005), (1.10, 0.142, 0.104, 0), (1.22, 0.154, 0.122, -0.01), (1.32, 0.164, 0.134, -0.016),
         (1.39, 0.166, 0.124, -0.008), (1.435, 0.172, 0.112, 0.002), (1.47, 0.172, 0.1, 0.006), (1.495, 0.14, 0.088, 0.011), (1.512, 0.09, 0.076, 0.015), (1.525, 0.066, 0.068, 0.015), (1.54, 0.055, 0.063, 0.011), (1.62, 0.051, 0.06, 0.0)]
    parts.append(to_obj('trunk', tube([(V((0, y, z)), rx, ry) for z, rx, ry, y in T], 16)))
    for s, n in ((1, 'R'), (-1, 'L')):
        S, E, W, F, a = J['sh' + n], J['el' + n], J['wr' + n], J['fi' + n], J['arm' + n]
        # the arm: from inside the shoulder, a ring either side of the elbow close to it, down to the wrist
        parts.append(to_obj('arm' + n, tube([(S - a * 0.075, 0.022, 0.03), (S - a * 0.05, 0.046, 0.054), (S - a * 0.01, 0.062, 0.068), (S + a * 0.07, 0.064, 0.069), (along(S, E, 0.42), 0.056, 0.062), (along(S, E, 0.8), 0.046, 0.05), (E - a * 0.03, 0.043, 0.046), (E, 0.042, 0.045), (E + a * 0.03, 0.044, 0.047),
                                             (along(E, W, 0.33), 0.047, 0.05), (along(E, W, 0.72), 0.036, 0.04), (W - a * 0.015, 0.028, 0.033), (W + a * 0.01, 0.026, 0.032)], 10)))
        # the hand: flat, its palm toward the thigh; the fingers one block, the thumb its own
        parts.append(to_obj('hand' + n, tube([(W - a * 0.005, 0.02, 0.03), (W + a * 0.035, 0.016, 0.042), (W + a * 0.09, 0.014, 0.045), (W + a * 0.14, 0.012, 0.04), (F, 0.008, 0.026)], 8)))
        th = W + a * 0.03 + V((0, -0.034, 0)); td = (a + V((0, -0.75, 0))).normalized()
        parts.append(to_obj('thumb' + n, tube([(th - td * 0.012, 0.012, 0.013), (th + td * 0.03, 0.012, 0.012), (th + td * 0.062, 0.008, 0.008)], 6)))
        H, K, A = J['hp' + n], J['kn' + n], J['an' + n]
        z = lambda zz, y=0.0: V((H.x, y, zz))
        parts.append(to_obj('leg' + n, tube([(z(0.96, 0.004), 0.085, 0.098), (z(0.86, 0.004), 0.094, 0.104), (z(0.70), 0.082, 0.09), (z(0.55, -0.004), 0.064, 0.069), (z(0.51, -0.005), 0.06, 0.064), (z(0.48, -0.005), 0.059, 0.063), (z(0.45, -0.002), 0.058, 0.064),
                                             (z(0.36, 0.014), 0.06, 0.069), (z(0.22, 0.014), 0.046, 0.053), (z(0.12, 0.013), 0.04, 0.047), (z(0.05, 0.012), 0.042, 0.048)], 10)))
        # the boot: heel to toe
        b = lambda y, zz: V((H.x + s * 0.004, y, zz))
        parts.append(to_obj('boot' + n, tube([(b(0.075, 0.04), 0.03, 0.032), (b(0.045, 0.052), 0.044, 0.05), (b(-0.03, 0.05), 0.048, 0.048), (b(-0.11, 0.04), 0.05, 0.038), (b(-0.17, 0.033), 0.044, 0.031), (b(-0.205, 0.03), 0.028, 0.022)], 8, deep=V((0, 0, 1)))))
    return parts

# one surface: the parts joined where they run into each other
def union(parts, name):
    base = parts[0]
    for p in parts[1:]:
        m = base.modifiers.new('u', 'BOOLEAN'); m.operation = 'UNION'; m.object = p; m.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    for p in parts: bpy.data.objects.remove(p)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0015)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=0.0005)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    # where the parts run into each other the join is eased, so a shoulder (and a hip) is one form, not shapes set together
    for cen, rad, it in [(J['sh' + n] + V((0, 0, -0.01)), 0.115, 10) for n in 'RL'] + [(J['hp' + n] + V((0, 0, -0.06)), 0.1, 4) for n in 'RL']:
        vs = [v for v in bm.verts if (v.co - cen).length < rad]
        for _ in range(it): bmesh.ops.smooth_vert(bm, verts=vs, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return link(name, me)

# what each face is made of, by where it is
def dress(o):
    me = o.data; me.materials.clear()
    for k in ('shirt', 'trousers', 'boots', 'skin'): me.materials.append(M[k])
    for p in me.polygons:
        c = p.center; mi = 0
        if c.z < 1.0 and abs(c.x) < 0.21: mi = 1  # (the belt line: a ring of the trunk)
        if c.z < 0.13 or (c.z < 0.2 and c.y < -0.06): mi = 2
        if c.z > 1.528 and abs(c.x) < 0.085: mi = 3  # (the collar sits at the base of the neck)
        for n in 'RL':
            if (c - J['wr' + n]).dot(J['arm' + n]) > -0.004 and (c - J['wr' + n]).length < 0.24: mi = 3
        p.material_index = mi

# ---- the head: face D (face_options.py's, coarser), its features kept where the surface is thinned out
G = lambda d, r: math.exp(-(d / r) ** 2)
# The head's side view is traced from Gray's Anatomy fig. 1193 (models/characters/ref/head_profile.png: the outline of the
# side of the face over the skull), 0.544 mm to its pixel: [y, z] in the head's own frame (its middle at the origin, the
# face toward -y). BASE is the face without the nose and lips (they're added down the midline, so they don't spread across
# it); BACK the back of the skull; WIDE the half-width seen from the front (not in the plate: the usual figures).
BASE = [(0.022, 0.115), (-0.027, 0.110), (-0.054, 0.097), (-0.073, 0.081), (-0.087, 0.062), (-0.097, 0.043), (-0.102, 0.026), (-0.098, 0.007), (-0.098, -0.02), (-0.101, -0.05), (-0.102, -0.07), (-0.102, -0.088), (-0.104, -0.101), (-0.095, -0.115)]
BACK = [(0.022, 0.115), (0.060, 0.100), (0.087, 0.073), (0.101, 0.040), (0.103, 0.013), (0.100, -0.020), (0.090, -0.047), (0.082, -0.066), (0.072, -0.096), (0.062, -0.115)]
NOSE = [(0, 0.007), (0.011, -0.014), (0.021, -0.036), (0.025, -0.042), (0.021, -0.047), (0.006, -0.051), (0, -0.054)]
LIPS = [(0, -0.052), (0.011, -0.061), (0.006, -0.0685), (0.004, -0.0705), (0.008, -0.079), (0.001, -0.088), (0, -0.092)]
WIDE = [(0, 0.115), (0.03, 0.108), (0.052, 0.095), (0.068, 0.075), (0.0755, 0.05), (0.077, 0.02), (0.0745, 0.0), (0.071, -0.02), (0.066, -0.045), (0.057, -0.075), (0.047, -0.095), (0.036, -0.108), (0.027, -0.115)]
def curve(pts):  # a value at a height, from points given top to bottom: straight between them, eased a little
    def at(z):
        if z >= pts[0][1]: return pts[0][0]
        for (v0, z0), (v1, z1) in zip(pts, pts[1:]):
            if z >= z1: return v0 + (v1 - v0) * (z0 - z) / (z0 - z1)
        return pts[-1][0]
    return lambda z: (at(z - 0.004) + 2 * at(z) + at(z + 0.004)) / 4
fBASE, fBACK, fNOSE, fLIPS, fWIDE = curve(BASE), curve(BACK), curve(NOSE), curve(LIPS), curve(WIDE)
# the jaw's edge, by how far back along the head: level under the chin, rising to its angle under the ear, then up the back of the jaw to the skull
jawz = lambda Y: -0.113 if Y < -0.08 else -0.113 + 0.031 * (Y + 0.08) / 0.075 if Y < -0.005 else -0.082 + 0.03 * min(1.0, (Y + 0.005) / 0.035)
def head_mesh(sub=4):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
    for v in bm.verts:
        ux, uy, uz = v.co; rr = math.hypot(ux, uy) or 1e-9; cx, sy = ux / rr, uy / rr
        if uz > -0.75: Z = 0.115 * uz; shrink = 1.0
        else:  # the underside: flat under the jaw, closing in the neck
            t = (-uz - 0.75) / 0.25; Z = -0.115 * (0.75 + 0.25 * (1 - (1 - t) ** 2)); shrink = math.sqrt(max(0.0, 1 - uz * uz)) / math.sqrt(1 - 0.75 ** 2)
        yf, yb = fBASE(Z), fBACK(Z); c, h = (yf + yb) / 2, (yb - yf) / 2
        X = fWIDE(Z) * cx * shrink; Y = c + h * sy * shrink
        fr = max(0.0, -sy) ** 1.5 * shrink; ax = abs(X); d = 0.0
        d += fNOSE(Z) * G(ax, 0.0075 + 0.2 * fNOSE(Z)) + 0.006 * G(ax - 0.014, 0.007) * G(Z + 0.045, 0.007)       # the nose down the midline, its wings
        d += fLIPS(Z) * G(ax, 0.02) * max(0.0, 1 - (ax / 0.03) ** 2)                                               # the lips
        d += 0.004 * G(Z - 0.024, 0.01) * G(max(0, ax - 0.02), 0.03)                                               # the brow out over the eyes
        d -= 0.011 * G(Z - 0.004, 0.014) * G(ax - 0.0315, 0.018)                                                    # the sockets
        d += 0.003 * G(Z + 0.018, 0.02) * G(ax - 0.05, 0.02)                                                       # the cheekbones
        Y -= d * fr
        # under the jaw's edge the surface turns in sharply and runs back flat to the throat: the edge stands, with its shadow under it
        zj = jawz(Y)
        if Z < zj:
            u = min(1.0, (zj - Z) / 0.012); Z = zj - (zj - Z) * 0.3; X *= 1 - 0.3 * u
            if Y < -0.02: Y += 0.014 * u
        elif Z < zj + 0.01 and Y < 0.03: X *= 1 + 0.035 * (1 - (Z - zj) / 0.01)
        v.co = (X, Y, Z)
    return bm
def sphere(r, sub, scale=(1, 1, 1), at=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts: v.co = V((v.co.x * scale[0] + at[0], v.co.y * scale[1] + at[1], v.co.z * scale[2] + at[2]))
    return bm
EYE = [V((s * 0.0315, -0.0705, 0.004)) for s in (1, -1)]  # (R, L), in the head's own frame
def build_head(at):
    bm = head_mesh(5); me = bpy.data.meshes.new('head'); bm.to_mesh(me); bm.free()
    h = link('head', me)
    vg = h.vertex_groups.new(name='plain')
    for v in me.vertices:
        c = v.co; face = max(0.0, min(1.0, (-c.y - 0.03) / 0.05)) * (1.0 if -0.112 < c.z < 0.04 else 0.25) * max(0.0, min(1.0, (0.062 - abs(c.x)) / 0.02))
        if abs(c.z - jawz(c.y)) < 0.012 and c.y < 0.03: face = max(face, 0.8)  # (the jaw's edge kept, right round to the ear)
        vg.add([v.index], 1.0 - 0.93 * face, 'REPLACE')
    d = h.modifiers.new('thin', 'DECIMATE'); d.ratio = 0.2; d.vertex_group = 'plain'; d.vertex_group_factor = 30.0
    # (which way the group counts isn't to be trusted: both ways are tried, and the one that leaves the face the denser is kept)
    best = None
    for inv in (False, True):
        d.invert_vertex_group = inv; bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); m2 = bpy.data.meshes.new_from_object(h.evaluated_get(dg))
        nf = sum(1 for p in m2.polygons if p.center.y < -0.05 and abs(p.center.x) < 0.05 and -0.1 < p.center.z < 0.035)
        print('HEAD invert', inv, 'tris', len(m2.polygons), 'in the face', nf)
        if best is None or nf > best[0]: best = (nf, m2)
    me2 = best[1]; bpy.data.objects.remove(h)
    print('HEAD base tris', sum(len(p.vertices) - 2 for p in me2.polygons))
    bm = bmesh.new(); bm.from_mesh(me2)
    # the rest of the head, in the one mesh: ears, lids, the hair's cap (materials by face, below)
    tags = []; bm.faces.index_update(); n_base = len(bm.faces)
    def add(b2, tag):
        n0 = len(bm.faces); m3 = bpy.data.meshes.new('t'); b2.to_mesh(m3); b2.free(); bm.from_mesh(m3); bpy.data.meshes.remove(m3); bm.faces.ensure_lookup_table(); tags.append((n0, len(bm.faces), tag))
    for s in (1, -1):
        b2 = bmesh.new(); bmesh.ops.create_uvsphere(b2, u_segments=8, v_segments=5, radius=1)
        for v in b2.verts: v.co = V((v.co.x * 0.007 + s * 0.0745 - s * 0.006 * max(0, -v.co.y), v.co.y * 0.016 + 0.012, v.co.z * 0.03 - 0.01))
        add(b2, 'skin')
    for e in EYE:
        for lo, hi in ((0.0068, 1), (-1, -0.0086)):
            b2 = sphere(0.0151, 2); bmesh.ops.delete(b2, geom=[v for v in b2.verts if not (lo <= v.co.z <= hi and v.co.y < 0.003)], context='VERTS')
            for v in b2.verts: v.co += e
            add(b2, 'skin')
    bm.normal_update(); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table(); bm.faces.index_update(); bm.verts.index_update()
    # the hair: the scalp's own faces over the hairline (high on the forehead, down past the temple, behind the ear to the nape), stood 5 mm off it
    def haired(c, m=0.0):
        line = 0.088 if c.y < -0.055 else 0.088 - 0.068 * (c.y + 0.055) / 0.055 if c.y < 0.0 else 0.02 - 0.085 * min(1.0, c.y / 0.06)
        return c.z > line + m
    # (the scalp under the hair is drawn in a little, so its coarser faces never show through it)
    for v in bm.verts:
        if haired(v.co, 0.012): v.co = V((v.co.x * 0.95, 0.004 + (v.co.y - 0.004) * 0.95, v.co.z * 0.96))
    # (from a plainer copy of the same head, so the hairline runs along even faces, not the thinned scalp's big ones)
    b2 = head_mesh(4); bmesh.ops.delete(b2, geom=[f for f in b2.faces if not haired(f.calc_center_median())], context='FACES')
    for v in b2.verts: v.co = V((v.co.x * 1.085, 0.004 + (v.co.y - 0.004) * 1.075, v.co.z * 1.06 + 0.001))
    add(b2, 'hair')
    from mathutils.bvhtree import BVHTree
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table(); tree = BVHTree.FromBMesh(bm)
    def strip(xs, z_lo, z_hi, rows, tag, lift=0.0007):
        b2 = bmesh.new(); grid = []
        for x in xs:
            col = []
            for r in range(rows + 1):
                z = z_lo(x) + (z_hi(x) - z_lo(x)) * r / rows; hit = tree.ray_cast(V((x, -0.3, z)), V((0, 1, 0)))[0]
                edge = r in (0, rows) or x in (xs[0], xs[-1])
                col.append(b2.verts.new((x, (hit.y if hit else -0.08) - (lift * 0.45 if edge else lift), z)))
            grid.append(col)
        for a, b in zip(grid, grid[1:]):
            for r in range(rows): b2.faces.new((a[r], b[r], b[r + 1], a[r + 1]))
        bmesh.ops.recalc_face_normals(b2, faces=b2.faces)
        for f in b2.faces:
            if f.normal.y > 0: f.normal_flip()
        add(b2, tag)
    xs = [k * 0.0235 / 5 for k in range(-5, 6)]; bow = lambda x: 1 - (x / 0.0238) ** 2
    strip(xs, lambda x: -0.0700, lambda x: -0.0700 + 0.0072 * bow(x) ** 0.7 - 0.0012 * G(x, 0.004), 2, 'lip', 0.0009)
    strip(xs, lambda x: -0.0700 - 0.0085 * bow(x) ** 0.8, lambda x: -0.0700, 2, 'lip', 0.0009)
    for sg in (1, -1): strip([sg * (0.014 + k * 0.006) for k in range(6)], lambda x: 0.0215 + 0.002 * G(abs(x) - 0.03, 0.02), lambda x: 0.0262 + 0.003 * G(abs(x) - 0.028, 0.02), 1, 'hair', 0.0022)
    bm.faces.ensure_lookup_table()
    me = bpy.data.meshes.new('head'); bm.to_mesh(me); bm.free()
    me.materials.clear()
    for k in ('skin', 'hair', 'lip'): me.materials.append(M[k])
    for p in me.polygons:
        c = p.center; tag = next((t for a, b, t in tags if a <= p.index < b), None)
        p.material_index = 1 if tag == 'hair' else 2 if tag == 'lip' else 0
    h = link('head', me); h.location = at
    eyes = []
    for e, n in zip(EYE, 'RL'):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.014)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))  # (its pole to the front)
        em = bpy.data.meshes.new('eye' + n); bm.to_mesh(em); bm.free(); em.materials.append(M['eye']); em.materials.append(M['iris'])
        for p in em.polygons: p.material_index = 1 if p.center.y < -0.0118 else 0
        o = link('eye' + n, em); o.location = at + e; eyes.append(o)
    return h, eyes

# ---- the skeleton
BONES = [('hips', None, 'hips', 'spine'), ('spine', 'hips', 'spine', 'chest'), ('chest', 'spine', 'chest', 'neck'), ('neck', 'chest', 'neck', 'head'), ('head', 'neck', 'head', 'top')]
for n in 'RL':
    BONES += [('upperarm.' + n, 'chest', 'sh' + n, 'el' + n), ('forearm.' + n, 'upperarm.' + n, 'el' + n, 'wr' + n), ('hand.' + n, 'forearm.' + n, 'wr' + n, 'fi' + n),
              ('thigh.' + n, 'hips', 'hp' + n, 'kn' + n), ('shin.' + n, 'thigh.' + n, 'kn' + n, 'an' + n), ('foot.' + n, 'shin.' + n, 'an' + n, 'toe' + n)]
def build_rig(eye_at):
    ad = bpy.data.armatures.new('human'); arm = bpy.data.objects.new('human', ad); sc.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
    for name, par, a, b in BONES:
        e = ad.edit_bones.new(name); e.head = J[a]; e.tail = J[b]
        if par: e.parent = ad.edit_bones[par]
    for n, p in zip('RL', eye_at):
        e = ad.edit_bones.new('eye.' + n); e.head = p; e.tail = p + V((0, -0.03, 0)); e.parent = ad.edit_bones['head']
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm
def skin_auto(o, arm):
    for q in bpy.context.selected_objects: q.select_set(False)
    o.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for g in ('eye.R', 'eye.L'):
        if g in o.vertex_groups: o.vertex_groups.remove(o.vertex_groups[g])
    # (no more than four bones a vertex, their weights adding to one: what the game's skinning takes)
    bpy.context.view_layer.objects.active = o; bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
def skin_to(o, arm, bone):
    o.parent = arm; md = o.modifiers.new('arm', 'ARMATURE'); md.object = arm
    o.vertex_groups.new(name=bone).add(range(len(o.data.vertices)), 1.0, 'REPLACE')

body = union(body_parts(), 'body'); dress(body)
head, eyes = build_head(J['head'] + V((0, -0.02, 0.07)))  # (carried a little forward of the spine's line, as a head is, and clear of the shoulders)
arm = build_rig([e.location.copy() for e in eyes])
skin_auto(body, arm)
skin_to(head, arm, 'head')
for e, n in zip(eyes, 'RL'): skin_to(e, arm, 'eye.' + n)
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
stats = {'triangles': {'body': tris(body), 'head': tris(head), 'eyes': sum(tris(e) for e in eyes)}, 'vertices': {'body': len(body.data.vertices), 'head': len(head.data.vertices)}, 'bones': [b[0] for b in BONES] + ['eye.R', 'eye.L'], 'height': 1.756}
stats['triangles']['total'] = sum(stats['triangles'].values())
print('STATS', json.dumps(stats))

# ---- posed: each bone turned to point a given way (the figure faces -y; R is +x), the hips moved, the eyes turned
def pose(dirs, hips=(0, 0, 0), look=(0, 0)):
    for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
    arm.pose.bones['hips'].location = arm.pose.bones['hips'].bone.matrix_local.to_3x3().inverted() @ V(hips)
    for name, *_ in BONES:
        if name not in dirs: continue
        bpy.context.view_layer.update(); pb = arm.pose.bones[name]; cur = pb.matrix.copy(); h = cur.to_translation()
        q = (cur.to_3x3() @ V((0, 1, 0))).rotation_difference(V(dirs[name]).normalized())
        pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ cur
    for n in 'RL': arm.pose.bones['eye.' + n].rotation_mode = 'XYZ'; arm.pose.bones['eye.' + n].rotation_euler = (math.radians(look[1]), 0, math.radians(-look[0]))
    bpy.context.view_layer.update()
both = lambda k, x, y, z: {k + '.R': (x, y, z), k + '.L': (-x, y, z)}
POSES = [
    ('rest', {}, (0, 0, 0), (0, 0)),
    ('arms down', {**both('upperarm', 0.12, 0, -1), **both('forearm', 0.08, -0.12, -1), **both('hand', 0.05, -0.15, -1)}, (0, 0, 0), (25, 0)),
    ('aiming', {'upperarm.R': (0.25, -0.7, -0.66), 'forearm.R': (-0.62, -0.75, 0.25), 'hand.R': (-0.5, -0.85, 0.1), 'upperarm.L': (-0.1, -0.92, -0.38), 'forearm.L': (0.3, -0.94, 0.16), 'hand.L': (0.4, -0.9, 0.1), 'chest': (0, -0.1, 1), 'neck': (0, -0.2, 1)}, (0, 0, 0), (0, 0)),
    ('hands up', {**both('upperarm', 0.55, -0.05, 0.83), **both('forearm', 0.05, -0.1, 1), **both('hand', 0, -0.1, 1)}, (0, 0, 0), (0, 12)),
    ('crouch', {**both('thigh', 0.12, -0.9, -0.42), **both('shin', 0, 0.5, -0.87), **both('foot', 0, -1, -0.15), 'spine': (0, -0.25, 0.97), 'chest': (0, -0.35, 0.94), 'neck': (0, 0.1, 1), 'head': (0, 0.15, 1),
                'upperarm.R': (0.2, -0.75, -0.6), 'forearm.R': (-0.6, -0.75, 0.3), 'upperarm.L': (-0.1, -0.9, -0.4), 'forearm.L': (0.3, -0.94, 0.16)}, (0, 0.1, -0.36), (0, 0)),
    ('kneeling', {'thigh.R': (0.05, -0.95, -0.3), 'shin.R': (0, 0.12, -1), 'thigh.L': (-0.05, 0.12, -1), 'shin.L': (0, 0.97, -0.25), 'foot.L': (0, 0.4, -0.9), **both('upperarm', 0.1, -0.3, -0.95), **both('forearm', -0.2, -0.9, -0.3)}, (0, 0, -0.4), (0, 0)),
    ('stride', {'thigh.R': (0, -0.55, -0.84), 'shin.R': (0, 0.05, -1), 'thigh.L': (0, 0.35, -0.94), 'shin.L': (0, 0.78, -0.62), 'foot.L': (0, 0.2, -1), 'upperarm.R': (0.1, 0.4, -0.9), 'forearm.R': (0.05, -0.3, -0.95), 'upperarm.L': (-0.1, -0.45, -0.9), 'forearm.L': (-0.05, -0.9, -0.4)}, (0, 0, -0.03), (-20, 0)),
    ('seated', {**both('thigh', 0.08, -1, -0.05), **both('shin', 0, 0.05, -1), **both('upperarm', 0.08, -0.25, -0.96), **both('forearm', -0.05, -0.95, -0.3)}, (0, 0, -0.42), (0, 0)),
]

# ---- the sheet
for e in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try: sc.render.engine = e; break
    except TypeError: pass
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.25, 0.27, 0.3, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
for kind, loc, en, rot in (('SUN', (0, 0, 3), 3.0, (math.radians(50), 0, math.radians(-30))), ('SUN', (0, 0, 3), 1.2, (math.radians(60), 0, math.radians(150)))):
    d = bpy.data.lights.new(kind, kind); d.energy = en; o = bpy.data.objects.new(kind, d); o.rotation_euler = rot; sc.collection.objects.link(o)
cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = 2.05; cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
def shoot(path, az, wire=False, c=None, scale=2.05):
    a = math.radians(az); flat = c is not None and scale < 0.35; c = c or V((0, -0.05, 0.9)); cd.ortho_scale = scale; cam.location = c + V((math.sin(a) * 6, -math.cos(a) * 6, 0 if flat else 0.5)); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    for o in (body, head):
        for m in [m for m in o.modifiers if m.type == 'WIREFRAME']: o.modifiers.remove(m)
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
sc.render.resolution_x, sc.render.resolution_y = 430, 640
shots = []
for name, dirs, hp, look in POSES:
    pose(dirs, hp, look)
    row = []
    for az in (32, 90, 180):
        f = os.path.join(OUT, '_%s_%d.png' % (name.replace(' ', '_'), az)); shoot(f, az); row.append(f)
    shots.append((name, row))
# close: the head (its eyes turned), and the joints bent
close = []
pose({}, (0, 0, 0), (22, 8))
for az in (0, 32, 90): f = os.path.join(OUT, '_head_%d.png' % az); shoot(f, az, c=V((0, 0, 1.64)), scale=0.42); close.append(f)
shots.append(('head (eyes turned)', close))
pose({'upperarm.R': (0.3, -0.5, -0.8), 'forearm.R': (-0.3, -0.6, 0.75), 'hand.R': (-0.2, -0.3, 0.9), 'upperarm.L': (-1, 0, 0.05), 'forearm.L': (-0.1, -0.2, 1)}, (0, 0, 0), (0, 0))
close = []
for az in (20, 110, 180): f = os.path.join(OUT, '_elbow_%d.png' % az); shoot(f, az, c=V((0, 0, 1.38)), scale=1.1); close.append(f)
shots.append(('elbows and shoulders, bent hard', close))
pose({'thigh.R': (0.05, -0.97, 0.2), 'shin.R': (0, 0.55, -0.83), 'thigh.L': (-0.05, -0.3, -0.95), 'shin.L': (0, 0.95, 0.3)}, (0, 0, 0), (0, 0))
close = []
for az in (30, 90, 180): f = os.path.join(OUT, '_knee_%d.png' % az); shoot(f, az, c=V((0, -0.1, 0.62)), scale=1.25); close.append(f)
shots.append(('hips and knees, bent hard', close))
pose({})
sc.render.resolution_x, sc.render.resolution_y = 800, 800
shoot(os.path.join(OUT, '_profile.png'), 90, c=head.location.copy(), scale=0.30)
sc.render.resolution_x, sc.render.resolution_y = 430, 640
# the shoulders and the neck, close: arms at the sides, and at rest
for nm, dirs in (('shoulders and neck, arms down', POSES[1][1]), ('shoulders and neck, at rest', {})):
    pose(dirs); close = []
    for az in (0, 55, 180): f = os.path.join(OUT, '_%s_%d.png' % (nm.replace(' ', '_').replace(',', ''), az)); shoot(f, az, c=V((0, 0, 1.47)), scale=0.82); close.append(f)
    shots.append((nm, close))
# the mesh itself, at rest: its edges shown
pose({})
for o in (body, head): o.display_type = 'WIRE'
wm = bpy.data.materials.new('wire'); wm.use_nodes = True; wm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.9, 0.9, 1)
wires = []
for o in (body, head):
    dup = o.copy(); dup.data = o.data.copy(); sc.collection.objects.link(dup); dup.data.materials.clear(); dup.data.materials.append(wm)
    md = dup.modifiers.new('w', 'WIREFRAME'); md.thickness = 0.0025; md.use_replace = True; wires.append(dup)
    o.hide_render = True
for e in eyes: e.hide_render = True
wire = []
for az in (32, 90, 180):
    f = os.path.join(OUT, '_wire_%d.png' % az); shoot(f, az); wire.append(f)
for o in wires: bpy.data.objects.remove(o)
for o in (body, head, *eyes): o.hide_render = False; o.display_type = 'TEXTURED'
with open(os.path.join(OUT, 'stats.json'), 'w') as f: json.dump(dict(stats, poses=[n for n, *_ in POSES], shots=[[n, r] for n, r in shots], wire=wire), f, indent=1)
pose({})
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'human.blend'))
for q in bpy.context.selected_objects: q.select_set(False)
for o in (arm, body, head, *eyes): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'human.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_animations=False)
print('DONE')
