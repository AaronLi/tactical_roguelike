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
# which figure: none named is the base one (the pose sheet and human.glb); HUMAN_VARIANT=m03 makes that variant into human/variants
import sys; sys.path.insert(0, HERE)
from human_variants import params
VID = os.environ.get('HUMAN_VARIANT', ''); P = params(VID)
if VID: OUT = os.path.join(OUT, 'variants'); os.makedirs(OUT, exist_ok=True)

def mat(name, col, rough=0.7):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough
    return m
sk, hc = P['skin'], P['hair_col']
M = {k: mat(k, c, r) for k, c, r in [('skin', sk, 0.6), ('stubble', tuple(a * 0.62 + b * 0.38 for a, b in zip(sk, hc)), 0.7), ('shirt', (0.13, 0.15, 0.17), 0.85), ('trousers', (0.10, 0.11, 0.12), 0.85), ('boots', (0.03, 0.03, 0.035), 0.6),
                                     ('hair', hc, 0.85), ('eye', (0.85, 0.85, 0.82), 0.25), ('iris', P['iris'], 0.2), ('lip', (sk[0] * 0.84, sk[1] * (0.6 if P['sex'] == 'f' else 0.68), sk[2] * (0.7 if P['sex'] == 'f' else 0.79)), 0.5)]}
# (the game gives each of these its own material by what's worn: the same colour here as the one it's a part of)
for k, of in (('upsleeve', 'shirt'), ('sleeve', 'shirt'), ('neck', 'skin'), ('hand', 'skin'), ('finger', 'skin'), ('eyeskin', 'skin'), ('brow', 'hair'), ('front', 'shirt'), ('lowleg', 'trousers')):
    M[k] = mat(k, tuple(M[of].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value)[:3], 0.7)
FIT = {}  # (what the game's gear is fitted to: body_parts fills it)
FINGERS = ('index', 'middle', 'ring', 'pinky'); FING = {}  # (each finger's joints, knuckle to tip, by its name and side (the thumb's too): body_parts fills it)
def link(name, me, smooth=True):
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = smooth
    return o

# ---- the joints (the game's), and the pose the model is made in: arms 40 degrees out from the sides
D2R = math.pi / 180
ARM = V((math.sin(40 * D2R), 0, -math.cos(40 * D2R)))
J = {'hips': V((0, 0, 0.95)), 'spine': V((0, 0, 1.03)), 'chest': V((0, 0, 1.22)), 'neck': V((0, 0.014, 1.51)), 'head': V((0, 0.016, 1.585)), 'top': V((0, 0.016, 1.756))}
for s, n in ((1, 'R'), (-1, 'L')):  # (the figure's own right is +x seen from behind: it faces -y)
    sh = V((s * 0.2, 0, 1.445));  # (3.5 cm under the game's own shoulder joint, which sits at the height of the shoulder's top, not its middle)
    arm = V((s * ARM.x, 0, ARM.z)); el = sh + arm * 0.29; wr = el + arm * 0.27 + V((0, -0.008, 0))
    hp = V((s * 0.1, 0, 0.92)); kn = hp + V((0, 0, -0.44)); an = kn + V((0, 0, -0.44))
    J['cl' + n] = V((s * 0.03, -0.02, 1.44))
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
         (1.38, 0.166, 0.126, -0.01), (1.415, 0.172, 0.114, -0.002), (1.445, 0.168, 0.102, 0.004), (1.475, 0.135, 0.09, 0.009), (1.502, 0.092, 0.078, 0.014), (1.525, 0.066, 0.068, 0.015), (1.54, 0.055, 0.063, 0.011), (1.62, 0.051, 0.06, 0.0)]
    # (a variant's build: the rings wider or deeper by the region they're in, and a bust forward of the chest)
    ZA = [(0.80, 'hip'), (0.93, 'hip'), (1.10, 'waist'), (1.32, 'chest'), (1.43, 'shoulder'), (1.49, 'shoulder'), (1.535, 'neck'), (1.7, 'neck')]
    def reg(tab, z):
        for (z0, k0), (z1, k1) in zip(ZA, ZA[1:]):
            if z <= z1: return tab[k0] + (tab[k1] - tab[k0]) * max(0.0, z - z0) / (z1 - z0)
        return tab['neck']
    def ring(z, rx, ry, y):
        b = P['bust'] * G(z - 1.3, 0.05)
        return (V((0, y - b / 2, z)), rx * reg(P['w'], z), ry * reg(P['d'], z) + b / 2)
    girth = lambda rings, ks: [(c, rx * k, ry * k) for (c, rx, ry), k in zip(rings, ks)]
    dl, ua, fa, th_, cf = P['delt'], P['arm'], P['fore'], P['thigh'], P['calf']; el_, kn_ = (ua + fa) / 2, (th_ + cf) / 2
    rings = [ring(z, rx, ry, y) for z, rx, ry, y in T]
    # the gear's fit: across a band of the trunk, its half-width, how far its front stands forward of the spine's line and its back behind it
    def ext(z0, z1):
        sel = [(c, rx, ry) for c, rx, ry in rings if z0 <= c.z <= z1]
        return [round(max(rx for c, rx, ry in sel), 4), round(max(ry - c.y for c, rx, ry in sel), 4), round(max(ry + c.y for c, rx, ry in sel), 4)]
    FIT.update(chest=ext(1.2, 1.42), belt=ext(0.97, 1.06), pelvis=ext(0.9, 0.96), delt=round(dl, 3), arm=round(ua, 3), fore=round(fa, 3), thigh=round(th_, 3), calf=round(cf, 3), head_w=round(P['head_w'], 3))
    FIT['pelvis'][0] = round(max(FIT['pelvis'][0], 0.1 + 0.094 * th_), 4)  # (the hips are as wide as the thighs' tops)
    parts.append(to_obj('trunk', tube(rings, 16)))
    for s, n in ((1, 'R'), (-1, 'L')):
        S, E, W, F, a = J['sh' + n], J['el' + n], J['wr' + n], J['fi' + n], J['arm' + n]
        # the arm: from inside the shoulder, a ring either side of the elbow close to it, down to the wrist
        parts.append(to_obj('arm' + n, tube(girth([(S - a * 0.075, 0.022, 0.03), (S - a * 0.05, 0.047, 0.055), (S - a * 0.01, 0.063, 0.069), (S + a * 0.065, 0.064, 0.07), (along(S, E, 0.42), 0.056, 0.062), (along(S, E, 0.8), 0.046, 0.05), (E - a * 0.03, 0.043, 0.046), (E, 0.042, 0.045), (E + a * 0.03, 0.044, 0.047),
                                             (along(E, W, 0.33), 0.047, 0.05), (along(E, W, 0.72), 0.036, 0.04), (W - a * 0.015, 0.028, 0.033), (W + a * 0.01, 0.026, 0.032)], [dl, dl, dl, dl, ua, ua, el_, el_, el_, fa, fa, (1 + fa) / 2, (1 + fa) / 2]), 10)))
        # the hand: its palm toward the thigh; four fingers, a little curled in toward it, and the thumb forward of them
        pn = V((-s * math.cos(40 * D2R), 0, -math.sin(40 * D2R)))  # (the way the palm faces: in toward the body)
        kn = W + a * 0.095
        parts.append(to_obj('palm' + n, tube([(W - a * 0.005, 0.02, 0.03), (W + a * 0.04, 0.016, 0.041), (kn - a * 0.01, 0.014, 0.043), (kn + a * 0.006, 0.011, 0.04)], 8)))
        # (each finger in three bones, knuckle to knuckle (FINGERS: their joints), with rings either side of each knuckle so it bends there; the same line as ever:
        # straight off the knuckle, curling in toward the palm toward the tip)
        for k, (fy, fl) in enumerate(((-0.03, 0.074), (-0.01, 0.082), (0.01, 0.076), (0.029, 0.06))):
            b0 = kn + V((0, fy, 0)) - a * 0.004; d1 = (a + pn * 0.22).normalized(); d2 = (a * 0.75 + pn * 0.66).normalized(); dm = (d1 + d2).normalized()
            j1 = b0 + d1 * fl * 0.45; j2 = j1 + dm * fl * 0.3; tip = j2 + d2 * fl * 0.25; q = 0.003
            FING[FINGERS[k] + n] = [b0, j1, j2, tip]
            parts.append(to_obj('finger%d%s' % (k, n), tube([(b0 - d1 * 0.004, 0.0088, 0.0092), (b0 + d1 * q, 0.0087, 0.0091), (j1 - d1 * q, 0.0081, 0.0086), (j1 + dm * q, 0.0078, 0.0083), (along(j1, j2, 0.5), 0.0072, 0.0077),
                                                             (j2 - dm * q, 0.0068, 0.0072), (j2 + d2 * q, 0.0065, 0.0069), (tip - d2 * 0.004, 0.0059, 0.0063), (tip, 0.0055, 0.0058)], 5)))
        th = W + a * 0.035 + V((0, -0.032, 0)); td = (a * 0.7 + V((0, -0.62, 0)) + pn * 0.3).normalized(); t1 = th + td * 0.034; t2d = (td + a * 0.4 + pn * 0.2).normalized()
        t2 = t1 + t2d * 0.016; ttip = t2 + t2d * 0.015; q = 0.003
        FING['thumb' + n] = [th, t1, t2, ttip]
        parts.append(to_obj('thumb' + n, tube([(th - td * 0.014, 0.012, 0.013), (along(th, t1, 0.5), 0.0112, 0.012), (t1 - td * q, 0.0106, 0.0111), (t1 + t2d * q, 0.0102, 0.0106), (t2 - t2d * q, 0.0088, 0.0092), (t2 + t2d * q, 0.0084, 0.0088),
                                               (ttip - t2d * 0.004, 0.0072, 0.0076), (ttip, 0.0068, 0.0072)], 6)))
        H, K, A = J['hp' + n], J['kn' + n], J['an' + n]
        z = lambda zz, y=0.0: V((H.x, y, zz))
        parts.append(to_obj('leg' + n, tube(girth([(z(0.96, 0.004), 0.085, 0.098), (z(0.86, 0.004), 0.094, 0.104), (z(0.70), 0.082, 0.09), (z(0.55, -0.004), 0.064, 0.069), (z(0.51, -0.005), 0.06, 0.064), (z(0.48, -0.005), 0.059, 0.063), (z(0.45, -0.002), 0.058, 0.064),
                                             (z(0.36, 0.014), 0.06, 0.069), (z(0.22, 0.014), 0.046, 0.053), (z(0.12, 0.013), 0.04, 0.047), (z(0.05, 0.012), 0.042, 0.048)], [th_, th_, th_, kn_, kn_, kn_, kn_, cf, cf, (1 + cf) / 2, (1 + cf) / 2]), 10)))
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
    for cen, rad, it in [(J['sh' + n] + V((0, 0, -0.01)), 0.11, 8) for n in 'RL'] + [(J['hp' + n] + V((0, 0, -0.06)), 0.1, 4) for n in 'RL']:
        vs = [v for v in bm.verts if (v.co - cen).length < rad]
        for _ in range(it): bmesh.ops.smooth_vert(bm, verts=vs, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return link(name, me)

# what each face is made of, by where it is
def dress(o):
    names = ('shirt', 'trousers', 'boots', 'neck', 'upsleeve', 'sleeve', 'hand', 'finger', 'front', 'lowleg')
    me = o.data; me.materials.clear()
    for k in names: me.materials.append(M[k])
    for p in me.polygons:
        c = p.center; mi = 0
        if c.z < 1.0 and abs(c.x) < 0.21: mi = 1  # (the belt line: a ring of the trunk)
        if c.z < 0.13 or (c.z < 0.2 and c.y < -0.06): mi = 2
        if min(me.vertices[i].co.z for i in p.vertices) > 1.524 and max(abs(me.vertices[i].co.x) for i in p.vertices) < 0.079 * max(1.0, P['w']['neck']): mi = 3  # (the collar: the ring of the trunk at the base of the neck)
        for n in 'RL':
            S, W, a = J['sh' + n], J['wr' + n], J['arm' + n]; t = (c - S).dot(a); off = ((c - S) - a * t).length
            # the sleeve: its top over the shoulder and down to mid upper arm (a T-shirt's), the rest to the wrist; then the hand, and the fingers past the knuckles
            if off < 0.1 and t < 0.13 and abs(c.x) > 0.205: mi = 4
            elif off < 0.1 and t >= 0.13: mi = 5
            if (c - W).dot(a) > -0.004 and (c - W).length < 0.26: mi = 6 if (c - W).dot(a) < 0.092 else 7
        if mi == 0 and c.y < -0.03 and abs(c.x) < 0.05: mi = 8  # (down the front of the chest: what an open jacket shows of the shirt under it)
        if mi == 1 and c.z < 0.5: mi = 9                        # (below the knee: bare under shorts)
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
        X = fWIDE(Z) * cx * shrink * P['head_w'] * (1 + (P['jaw'] - 1) * max(0.0, min(1.0, (-0.02 - Z) / 0.06))); Y = c + h * sy * shrink
        fr = max(0.0, -sy) ** 1.5 * shrink; ax = abs(X); d = 0.0
        nz, nw = fNOSE(Z) * P['nose'], P['nose_w']
        d += nz * G(ax, (0.0075 + 0.2 * nz) * nw) + 0.006 * nw * G(ax - 0.014 * nw, 0.007) * G(Z + 0.045, 0.007)       # the nose down the midline, its wings
        d += fLIPS(Z) * (0.55 + 0.45 * P['lips']) * G(ax, 0.02) * max(0.0, 1 - (ax / 0.03) ** 2)                                               # the lips
        d += 0.004 * P['brow'] * G(Z - 0.024, 0.01) * G(max(0, ax - 0.02), 0.03)                                               # the brow out over the eyes
        d -= 0.011 * G(Z - 0.004, 0.014) * G(ax - P['eye_x'], 0.018)                                                    # the sockets
        d += 0.003 * P['cheek'] * G(Z + 0.018, 0.02) * G(ax - 0.05, 0.02) + P['chin'] * G(Z + 0.1, 0.016) * G(ax, 0.03)                                                       # the cheekbones
        Y -= d * fr
        # under the jaw's edge the surface turns in sharply and runs back flat to the throat: the edge stands, with its shadow under it
        zj = jawz(Y)
        if Z < zj:
            u = min(1.0, (zj - Z) / 0.012); Z = zj - (zj - Z) * 0.3; X *= 1 - 0.3 * u
            if Y < -0.02: Y += 0.014 * u
        elif Z < zj + 0.01 and Y < 0.03: X *= 1 + 0.035 * P['jaw_edge'] * (1 - (Z - zj) / 0.01)
        v.co = (X, Y, Z)
    return bm
def sphere(r, sub, scale=(1, 1, 1), at=(0, 0, 0)):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts: v.co = V((v.co.x * scale[0] + at[0], v.co.y * scale[1] + at[1], v.co.z * scale[2] + at[2]))
    return bm
EYE = [V((s * P['eye_x'], -0.074, 0.004)) for s in (1, -1)]  # (R, L), in the head's own frame
def build_head(at):
    bm = head_mesh(5); me = bpy.data.meshes.new('head'); bm.to_mesh(me); bm.free()
    h = link('head', me)
    vg = h.vertex_groups.new(name='plain')
    for v in me.vertices:
        c = v.co; face = max(0.0, min(1.0, (-c.y - 0.03) / 0.05)) * (1.0 if -0.112 < c.z < 0.04 else 0.25) * max(0.0, min(1.0, (0.062 - abs(c.x)) / 0.02))
        if abs(c.z - jawz(c.y)) < 0.012 and c.y < 0.03: face = max(face, 0.8)  # (the jaw's edge kept, right round to the ear)
        if P['hair'] == 'bald' and c.z > 0.02: face = max(face, 0.75)  # (a bare scalp is seen: kept round)
        vg.add([v.index], 1.0 - 0.93 * face, 'REPLACE')
    d = h.modifiers.new('thin', 'DECIMATE'); d.ratio = 0.3 if P['hair'] == 'bald' else 0.2; d.vertex_group = 'plain'; d.vertex_group_factor = 30.0
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
        for v in b2.verts:
            ey, ez = v.co.y, v.co.z; wide = 0.016 * (1.0 if ez > -0.2 else 1.0 + ez * 0.55)  # (narrowing to the lobe)
            v.co = V((s * (0.0725 * P['head_w'] + 0.004 * v.co.x * s + 0.011 * (ey + 1) * 0.5), ey * wide + 0.014, ez * 0.031 - 0.008))
        add(b2, 'skin')
    for e in EYE:
        r_l = 0.0151; xs = [-0.0147 + k * 0.0294 / 8 for k in range(9)]
        open_ = lambda x: max(0.0, 1 - (x / 0.0128) ** 2) ** 0.7
        for lo, hi in ((lambda x: 0.0048 * P['eye_open'] * open_(x) + 0.0006, lambda x: 0.0128), (lambda x: -0.0112, lambda x: -0.0056 * P['eye_open'] * open_(x) - 0.0004)):
            b2 = bmesh.new(); grid = []
            for x in xs:
                col = []
                for q in range(3):
                    z = lo(x) + (hi(x) - lo(x)) * q / 2; y = -math.sqrt(max(1e-8, r_l * r_l - x * x - z * z))
                    col.append(b2.verts.new(e + V((x, y, z))))
                grid.append(col)
            for c0, c1 in zip(grid, grid[1:]):
                for q in range(2): b2.faces.new((c0[q], c1[q], c1[q + 1], c0[q + 1]))
            bmesh.ops.recalc_face_normals(b2, faces=b2.faces)
            for f in b2.faces:
                if f.normal.y > 0: f.normal_flip()
            add(b2, 'eyeskin')
    # the hair, by its style: where its line runs (a man's has a sideburn, a receding one sits high at the front), how far the cap
    # stands off the scalp (across, front to back, up, and lifted at the crown), and whatever hangs or is tied behind
    style = P['hair']
    HL = ([(-0.2, 0.108), (-0.026, 0.108), (-0.018, 0.05), (-0.012, 0.016), (-0.004, 0.012), (0.02, 0.022), (0.036, -0.02), (0.06, -0.065), (0.2, -0.065)] if style == 'receding' else
          [(-0.2, 0.086), (-0.052, 0.086), (-0.038, 0.05), (-0.026, 0.03), (-0.01, 0.024), (0.02, 0.024), (0.036, -0.02), (0.06, -0.065), (0.2, -0.065)] if P['sex'] == 'f' else
          [(-0.2, 0.09), (-0.05, 0.09), (-0.036, 0.045), (-0.024, 0.016), (-0.01, 0.012), (0.02, 0.022), (0.036, -0.02), (0.06, -0.065), (0.2, -0.065)])
    tied = (1.055, 1.055, 1.045, 0)
    kx, ky, kz, top = {'buzz': (1.04, 1.04, 1.03, 0), 'receding': (1.055, 1.055, 1.04, 0), 'full': (1.12, 1.11, 1.06, 0.01), 'hightop': (1.09, 1.085, 1.06, 0.022), 'bob': (1.1, 1.09, 1.06, 0.004),
                       'ponytail': tied, 'bun': tied, 'topbun': tied}.get(style, (1.085, 1.075, 1.06, 0))
    def hairline(y):
        for (y0, z0), (y1, z1) in zip(HL, HL[1:]):
            if y <= y1: return z0 + (z1 - z0) * (y - y0) / (y1 - y0)
        return HL[-1][1]
    def haired(c, m=0.0):
        return c.z > hairline(c.y) + m
    from mathutils.bvhtree import BVHTree
    if style != 'bald':
        # (the scalp under the hair is drawn in a little, so its coarser faces never show through it)
        for v in bm.verts:
            if haired(v.co, 0.014): v.co = V((v.co.x * 0.93, 0.004 + (v.co.y - 0.004) * 0.93, v.co.z * 0.95))
        # (from a plainer copy of the same head, so the hairline runs along even faces, not the thinned scalp's big ones)
        b2 = head_mesh(4); bmesh.ops.delete(b2, geom=[f for f in b2.faces if not haired(f.calc_center_median())], context='FACES')
        plain = head_mesh(4); skin_of = BVHTree.FromBMesh(plain)
        for ed in b2.edges:  # (its edge is brought to the line along the head's own surface: straight down would sink it under the brow's slope)
            if len(ed.link_faces) == 1:
                for v in ed.verts:
                    for _ in range(3): v.co = skin_of.find_nearest(V((v.co.x, v.co.y, hairline(v.co.y) - 0.002)))[0]
        plain.free()
        for v in b2.verts: v.co = V((v.co.x * kx, 0.004 + (v.co.y - 0.004) * ky, v.co.z * kz + 0.001 + top * max(0.0, min(1.0, (v.co.z - 0.06) / 0.04))))
        add(b2, 'hair')
        hw = P['head_w']
        if style == 'bob':  # a curtain round the back from before one ear to before the other, down to the jaw
            b2 = bmesh.new(); rows = [(0.05, 0.93), (-0.02, 1.02), (-0.085, 1.0), (-0.128, 0.94)]
            grid = [[b2.verts.new((0.089 * hw * math.sin(math.radians(-102 + 17 * k)) * m, 0.01 + 0.112 * math.cos(math.radians(-102 + 17 * k)) * m, z)) for z, m in rows] for k in range(13)]
            for c0, c1 in zip(grid, grid[1:]):
                for q in range(len(rows) - 1): b2.faces.new((c0[q], c1[q], c1[q + 1], c0[q + 1]))
            bmesh.ops.recalc_face_normals(b2, faces=b2.faces); add(b2, 'hair')
        if style == 'ponytail': add(tube([(V((0, 0.085, 0.055)), 0.02, 0.02), (V((0, 0.135, 0.035)), 0.027, 0.025), (V((0, 0.152, -0.05)), 0.022, 0.02), (V((0, 0.14, -0.14)), 0.008, 0.008)], 6, deep=V((1, 0, 0))), 'hair')
        if style == 'bun': add(sphere(0.037, 2, (1.1, 0.85, 1.0), (0, 0.118, 0.012)), 'hair')
        if style == 'topbun': add(sphere(0.036, 2, (1.1, 1.0, 0.85), (0, 0.05, 0.142)), 'hair')
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
    strip(xs, lambda x: -0.0700, lambda x: -0.0700 + 0.0072 * P['lips'] * bow(x) ** 0.7 - 0.0012 * G(x, 0.004), 2, 'lip', 0.0009)
    strip(xs, lambda x: -0.0700 - 0.0085 * P['lips'] * bow(x) ** 0.8, lambda x: -0.0700, 2, 'lip', 0.0009)
    for sg in (1, -1): strip([sg * (0.014 + k * 0.006) for k in range(6)], lambda x: 0.0215 + 0.002 * G(abs(x) - 0.03, 0.02), lambda x: 0.0215 + 0.0047 * P['browthick'] + 0.003 * G(abs(x) - 0.028, 0.02), 1, 'brow', 0.0022)
    bm.faces.ensure_lookup_table()
    me = bpy.data.meshes.new('head'); bm.to_mesh(me); bm.free()
    me.materials.clear()
    for k in ('skin', 'hair', 'lip', 'stubble', 'brow', 'eyeskin'): me.materials.append(M[k])
    for p in me.polygons:
        c = p.center; tag = next((t for a, b, t in tags if a <= p.index < b), None)
        p.material_index = {'hair': 1, 'lip': 2, 'brow': 4, 'eyeskin': 5}.get(tag, 0)
        # (round the eyes and across the bridge of the nose: what a balaclava leaves bare)
        if p.index < n_base and c.y < -0.05 and abs(c.x) < 0.056 and -0.011 < c.z < 0.02: p.material_index = 5
        # (stubble: the jaw, the chin and the upper lip, rising to the ear at the sides)
        if P['stubble'] and p.index < n_base and c.y < 0.012 and c.z < -0.03 - 0.022 * max(0.0, min(1.0, (-c.y - 0.03) / 0.06)): p.material_index = 3
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
    BONES += [('clavicle.' + n, 'chest', 'cl' + n, 'sh' + n), ('upperarm.' + n, 'clavicle.' + n, 'sh' + n, 'el' + n), ('forearm.' + n, 'upperarm.' + n, 'el' + n, 'wr' + n), ('hand.' + n, 'forearm.' + n, 'wr' + n, 'fi' + n),
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
# The fingers' bones, put in after the body's skinned (so every weight it had is as it was): three a finger and the thumb, each from its knuckle to the next,
# parented to the hand; 'index1.R' the bone off the knuckle, 'index3.R' the tip's. Then a vertex the hand had on a finger or the thumb hands its weight on to
# the bones along it, eased across each knuckle (FB metres either side), the first bone's taken from the hand's.
FB = {'finger': 0.0045, 'thumb': 0.008}
def finger_bones(arm, o):
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT'); ad = arm.data
    for key, pts in FING.items():
        f, n = key[:-1], key[-1]
        for i in range(3):
            e = ad.edit_bones.new('%s%d.%s' % (f, i + 1, n)); e.head = pts[i]; e.tail = pts[i + 1]
            e.parent = ad.edit_bones['hand.' + n if i == 0 else '%s%d.%s' % (f, i, n)]
            e.align_roll(ad.edit_bones['hand.' + n].z_axis)  # (rolled as the hand is: a knuckle bends about the bone's x)
    bpy.ops.object.mode_set(mode='OBJECT')
    vg = {g.name: g for g in o.vertex_groups}
    for key in FING:
        for i in range(3): nm = '%s%d.%s' % (key[:-1], i + 1, key[-1]); vg[nm] = o.vertex_groups.new(name=nm)
    def near(p, pts):  # (how far from a finger's line, and how far along it from the first knuckle, in metres)
        best = (1e9, 0.0); u0 = 0.0
        for a, b in zip(pts, pts[1:]):
            ab = b - a; L = ab.length; t = max(0.0, min(1.0, (p - a).dot(ab) / (L * L)))
            if a == pts[0]: t = min(1.0, (p - a).dot(ab) / (L * L))  # (behind the first knuckle: on the line's extension, into the palm)
            d = (p - (a + ab * t)).length
            if d < best[0]: best = (d, u0 + t * L)
            u0 += L
        return best
    moved = 0
    for v in o.data.vertices:
        n = 'R' if v.co.x > 0 else 'L'; hg = vg['hand.' + n]
        try: wh = hg.weight(v.index)
        except RuntimeError: continue
        if wh <= 0: continue
        best = None
        for key, pts in FING.items():
            if key[-1] != n: continue
            d, u = near(v.co, pts)
            if best is None or d < best[0]: best = (d, u, key)
        d, u, key = best; th = key.startswith('thumb')
        if d > (0.02 if th else 0.016): continue
        pts = FING[key]; L1 = (pts[1] - pts[0]).length; L2 = (pts[2] - pts[1]).length; bw = FB['thumb' if th else 'finger']
        ease = lambda x, at: max(0.0, min(1.0, (x - at + bw) / (2 * bw)))
        k0 = ease(u, 0.0); k1 = ease(u, L1); k2 = ease(u, L1 + L2)  # (past the first knuckle, the second, the third)
        ws = [1 - k0, k0 - k1, k1 - k2, k2]  # (the hand, bone 1, 2, 3)
        if ws[0] >= 0.999: continue
        hg.add([v.index], wh * ws[0], 'REPLACE')
        for i in range(3):
            if ws[i + 1] > 1e-4: vg['%s%d.%s' % (key[:-1], i + 1, n)].add([v.index], wh * ws[i + 1], 'REPLACE')
        moved += 1
    bpy.context.view_layer.objects.active = o; bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    print('FINGERS', moved, 'vertices')
def skin_to(o, arm, bone):
    o.parent = arm; md = o.modifiers.new('arm', 'ARMATURE'); md.object = arm
    o.vertex_groups.new(name=bone).add(range(len(o.data.vertices)), 1.0, 'REPLACE')

body = union(body_parts(), 'body'); dress(body)
head, eyes = build_head(J['head'] + V((0, -0.02, 0.07)))  # (carried a little forward of the spine's line, as a head is, and clear of the shoulders)
arm = build_rig([e.location.copy() for e in eyes])
skin_auto(body, arm)
finger_bones(arm, body)
skin_to(head, arm, 'head')
for e, n in zip(eyes, 'RL'): skin_to(e, arm, 'eye.' + n)
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
stats = {'triangles': {'body': tris(body), 'head': tris(head), 'eyes': sum(tris(e) for e in eyes)}, 'vertices': {'body': len(body.data.vertices), 'head': len(head.data.vertices)}, 'bones': [b[0] for b in BONES] + ['eye.R', 'eye.L'] + ['%s%d.%s' % (k[:-1], i, k[-1]) for k in FING for i in (1, 2, 3)], 'height': P['height']}
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
    ('hands up', {**both('clavicle', 0.17, 0.02, 0.085), **both('upperarm', 0.55, -0.05, 0.83), **both('forearm', 0.05, -0.1, 1), **both('hand', 0, -0.1, 1)}, (0, 0, 0), (0, 12)),
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
def hexof(c):  # (a colour as the game writes one: sRGB, 0xRRGGBB)
    e = lambda v: round(255 * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055))
    return (e(c[0]) << 16) | (e(c[1]) << 8) | e(c[2])
if VID:
    pose(POSES[1][1]); arm.scale = (P['scale'],) * 3; sc.render.resolution_x, sc.render.resolution_y = 430, 640
    shoot(os.path.join(OUT, VID + '_body.png'), 20, scale=2.2)
    arm.scale = (1, 1, 1); sc.render.resolution_x, sc.render.resolution_y = 430, 430
    for az in (0, 40): shoot(os.path.join(OUT, '%s_head_%d.png' % (VID, az)), az, c=V((0, 0, 1.635)), scale=0.44)
    pose({})
    for q in bpy.context.selected_objects: q.select_set(False)
    for o in (arm, body, head, *eyes): o.select_set(True)
    # (the model itself is kept in the repo, beside its figures: human/variants/<id>.glb. The game loads a copy of it from
    # assets/models/humans/, which nothing keeps: tools/bake_humans.mjs makes that copy on a machine with no Blender)
    GLB = os.path.join(HERE, '..', '..', 'assets', 'models', 'humans'); os.makedirs(GLB, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, VID + '.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_animations=False)
    import shutil; shutil.copyfile(os.path.join(OUT, VID + '.glb'), os.path.join(GLB, VID + '.glb'))
    with open(os.path.join(OUT, VID + '.json'), 'w') as f: json.dump({'id': VID, 'sex': P['sex'], 'name': P['name'], 'height': P['height'], 'scale': P['scale'], 'hair': P['hair'], 'triangles': stats['triangles'], 'fit': FIT,
                                                                           'skin': hexof(P['skin']), 'hair_col': hexof(P['hair_col'])}, f)
    print('DONE', VID); sys.stdout.flush(); os._exit(0)
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
pose({'upperarm.R': (0.3, -0.5, -0.8), 'forearm.R': (-0.3, -0.6, 0.75), 'hand.R': (-0.2, -0.3, 0.9), 'clavicle.L': (-0.17, 0.01, 0.06), 'upperarm.L': (-1, 0, 0.05), 'forearm.L': (-0.1, -0.2, 1)}, (0, 0, 0), (0, 0))
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
