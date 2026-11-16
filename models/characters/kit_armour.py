# Body armour made on each body (build_human.py calls it, the body built and skinned): each piece drawn as a panel, laid onto this body's
# own surface a few millimetres off it (shrinkwrapped), given its thickness, and weighted as the body under it is (each vertex the weights
# of the nearest point of the body's skin, the trunk's bones only), so it fits this body and moves as it does. In the figure's frame:
# z up, facing -y, the skeleton js/rig.ts's (the chest joint 1.22 up, the neck 1.51).
# What's made, one mesh each, its material its name (the game dresses it by what's worn: js/rig.ts setKit; the colour is the carrier's):
#   kitsoft            a concealable vest: a front and a back panel and its sides, wrapping the trunk from the waist up, straps over
#                      the shoulders (the Lightline, the Ghost)
#   kitpc, kitheavy    a plate carrier: a plate bag on the chest and one on the back (the SAPI's cut: its top corners off), the
#                      cummerbund right round the waist under them, straps over the shoulders (the slick, patrol and assaulter
#                      carriers; the heavy one larger and thicker, a collar round the neck and pads over the shoulders)
#   kitplatepc, kitplateheavy        the plate in its bag: its outline standing proud of the front bag (only with a plate in)
#   kitbelt, kitbeltwide            a duty belt; a padded battle or war belt
#   kitrecon           a chest rig: a pouch panel across the front, straps over the shoulders, a strap round the back
#   kitpack{sling,assault,ruck}[c]  a pack on the back, clear of a plate carrier (c) or not; kitpackstrap[c] its shoulder straps
#   kitifak[b]         the IFAK at the back of the hips, on a belt (b) or not
#   (the pouches on a carrier's or a belt's MOLLE aren't made here: js/rig.ts lays what's mounted onto these surfaces)
import bpy, bmesh, math
from mathutils import Vector as V, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

TRUNK = ('hips', 'spine', 'chest', 'neck', 'clavicle.R', 'clavicle.L')

def _mat(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1); m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.85
    return m

def _grid(name, pts):
    """a mesh of quads from rows of points (a list of rows, each a list of V); None where there's nothing"""
    bm = bmesh.new(); vs = [[(bm.verts.new(p) if p is not None else None) for p in row] for row in pts]
    for r in range(len(vs) - 1):
        for c in range(len(vs[r]) - 1):
            q = (vs[r][c], vs[r][c + 1], vs[r + 1][c + 1], vs[r + 1][c])
            if all(q): bm.faces.new(q)
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

# Every piece is laid on the body from INSIDE it: rays from the trunk's own line out through its skin (an arm, a thigh, the head never in
# the way), each point where its ray leaves the skin, gap off it. BVH: the body's surface at rest.
BVH = None
def _bvh(body):
    global BVH
    if BVH is None: me = body.data; BVH = BVHTree.FromPolygons([v.co for v in me.vertices], [list(p.vertices) for p in me.polygons])
    return BVH

def _out(body, o, d, gap):
    """where a ray from o (inside the trunk) the way d leaves the skin, gap beyond it; None if it doesn't"""
    d = d.normalized(); loc, n, fi, dist = _bvh(body).ray_cast(o, d, 1.0)
    if loc is None: return None
    return loc + d * gap

def _shell(name, body, grid, gap, t, smooth=1, outf=None):
    """a slab over the body: grid rows of (origin, direction), each laid on as _out does, eased, thickened outward"""
    pts = [[_out(body, o, d, gap) for o, d in row] for row in grid]
    o = _grid(name, pts)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for _ in range(smooth): bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.4, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    # (each face turned to look out from the trunk's line, or up over the shoulders: the thickness goes outward)
    for f in bm.faces:
        c = f.calc_center_median(); out = outf(c) if outf else V((c.x, c.y, 0)) if c.z < 1.43 else V((c.x * 0.3, c.y * 0.3, 1))
        if f.normal.dot(out) < 0: f.normal_flip()
    bm.to_mesh(o.data); bm.free()
    md = o.modifiers.new('so', 'SOLIDIFY'); md.thickness = t; md.offset = 1; md.use_even_offset = True; md.use_rim = True
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); old = o.data; o.modifiers.clear(); o.data = me; bpy.data.meshes.remove(old)
    return o

def _panel(name, body, side, x0, x1, z0, z1, gap, t, cut=0.0, step=0.045, oy=0.0):
    """a bag or panel on the chest (side -1) or the back (+1): x0..x1 across, z0..z1 up, its top corners cut off by `cut`; laid on by
    rays from the trunk's line toward where it is"""
    nx = max(2, round((x1 - x0) / step)); nz = max(2, round((z1 - z0) / step)); rows = []
    for j in range(nz + 1):
        z = z0 + (z1 - z0) * j / nz; row = []
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            if cut and z > z1 - cut:  # (the cut corner: the point moved onto the cut's line, so the edge is straight)
                d = z - (z1 - cut); x = max(x, x0 + d) if x < (x0 + x1) / 2 else min(x, x1 - d)
            row.append((V((0, oy, z)), V((x * 2.2, side * 0.3, 0))))
        rows.append(row)
    return _shell(name, body, rows, gap, t)

def _band(name, body, z0, z1, gap, t, a0=0.0, a1=2 * math.pi, seg=20, step=0.045, closed=True):
    """a band round the trunk, z0..z1 up (a0..a1: from straight ahead round by its right)"""
    nz = max(2, round((z1 - z0) / step)); n = seg if closed else seg + 1
    rows = [[(V((0, 0.0, z0 + (z1 - z0) * j / nz)), V((math.sin(a0 + (a1 - a0) * i / seg), -math.cos(a0 + (a1 - a0) * i / seg), 0))) for i in range(n)] for j in range(nz + 1)]
    if closed:
        for r in rows: r.append(r[0])
    return _shell(name, body, rows, gap, t)

def _strap(name, body, x, w, gap, t, step=0.1):
    """a strap over the shoulder at x: from its front, up over its top, down to its back (rays from inside the shoulder fanned front to back)"""
    rows = []
    for k in range(int(round(2 / step)) + 1):
        u = -1 + k * step; d = V((0, u * 1.25, 1.0))
        rows.append([(V((x - w / 2 + w * i / 2, 0.0, 1.30)), d) for i in range(3)])
    return _shell(name, body, rows, gap, t, smooth=0)

def _tube(name, body, a, b, t0, t1, ang0, ang1, gap, t, ref, seg=8, step=0.04, closed=False, smooth=1):
    """a piece round a limb: along its bone a..b (t0..t1 of the way), round it from ang0 to ang1 (radians; 0 the way ref points, square
    to the bone), laid on from the bone's own line out"""
    d = (b - a).normalized(); e1 = (ref - d * ref.dot(d)).normalized(); e2 = d.cross(e1); L = (b - a).length
    nz = max(2, round((t1 - t0) * L / step)); n = seg if closed else seg + 1; rows = []
    for j in range(nz + 1):
        o = a + (b - a) * (t0 + (t1 - t0) * j / nz)
        row = [(o, e1 * math.cos(ang0 + (ang1 - ang0) * i / seg) + e2 * math.sin(ang0 + (ang1 - ang0) * i / seg)) for i in range(n)]
        if closed: row.append(row[0])
        rows.append(row)
    return _shell(name, body, rows, gap, t, smooth=smooth, outf=lambda c: c - (a + d * (c - a).dot(d)))

def _box(name, c, size, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = V((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if rot: bmesh.ops.rotate(bm, verts=bm.verts, matrix=rot)
    for v in bm.verts: v.co += c
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

def _rbox(name, c, size, bev):
    """a box with its edges rounded (a pack, a pouch): centre c, size across / deep / tall, its edges bev round"""
    o = _box(name, c, size); md = o.modifiers.new('bv', 'BEVEL'); md.width = bev; md.segments = 3; md.limit_method = 'NONE'
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); old = o.data; o.modifiers.clear(); o.data = me; bpy.data.meshes.remove(old)
    return o

def _back(body, z0, z1, n=6):
    """how far back the body's back reaches between z0 and z1 (the most, down its middle)"""
    ys = [p.y for p in (_out(body, V((0, 0.0, z0 + (z1 - z0) * i / (n - 1))), V((0, 1, 0)), 0.0) for i in range(n)) if p is not None]
    return max(ys) if ys else 0.12

def _weigh(o, body, arm, only=None, allow=TRUNK):
    """each vertex the weights of the nearest point of the body's skin (its face's corners, as far as it's toward each), the trunk's
    bones only (an arm raised doesn't drag the armour after it); or all to one bone (only)"""
    vg = {g.index: g.name for g in body.vertex_groups}
    for n in set(allow) | ({only} if only else set()): o.vertex_groups.new(name=n)
    if only:
        o.vertex_groups[only].add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    else:
        bme = body.data; bvh = BVHTree.FromPolygons([v.co for v in bme.vertices], [list(p.vertices) for p in bme.polygons])
        for v in o.data.vertices:
            loc, nrm, fi, d = bvh.find_nearest(v.co)
            if fi is None: continue
            poly = bme.polygons[fi]; ws = poly_3d_calc([bme.vertices[i].co for i in poly.vertices], loc); acc = {}
            for vi, k in zip(poly.vertices, ws):
                for g in bme.vertices[vi].groups:
                    n = vg.get(g.group)
                    if n in allow: acc[n] = acc.get(n, 0) + g.weight * k
            tot = sum(acc.values())
            if tot <= 0: acc, tot = {allow[0] if 'chest' not in allow else 'chest': 1.0}, 1.0
            for n, w in sorted(acc.items(), key=lambda a: -a[1])[:4]: o.vertex_groups[n].add([v.index], w / tot, 'REPLACE')
    o.parent = arm; md = o.modifiers.new('arm', 'ARMATURE'); md.object = arm

def _done(o, name, mats, body, arm, only=None, allow=TRUNK, weigh=True):
    if name not in mats: mats[name] = _mat(name, (0.2, 0.22, 0.18))
    o.name = name; o.data.name = name; o.data.materials.clear(); o.data.materials.append(mats[name])
    o.data.shade_smooth(); o.data.set_sharp_from_angle(angle=math.radians(40))  # (smooth over the body's curve, hard at its rims: fewer vertices than flat)
    if weigh: _weigh(o, body, arm, only, allow)
    o.hide_render = True
    return o

def _join(objs, name):
    for q in bpy.context.selected_objects: q.select_set(False)
    for q in objs: q.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); objs[0].name = name; return objs[0]

def build(body, arm):
    """every piece, on this body: a list of objects, each skinned to arm"""
    mats = {}
    out = []
    B = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
    # -- the concealable vest: thin, from the waist to the chest's top, front and back panels and its sides under the arms, straps
    parts = [_panel('sf', body, -1, -0.15, 0.15, 1.02, 1.44, 0.004, 0.012, cut=0.07), _panel('sb', body, 1, -0.155, 0.155, 1.02, 1.46, 0.004, 0.012, cut=0.04),
             _band('ss', body, 1.02, 1.27, 0.004, 0.012, a0=0.3 * math.pi, a1=0.7 * math.pi, seg=8, closed=False), _band('ss2', body, 1.02, 1.27, 0.004, 0.012, a0=1.3 * math.pi, a1=1.7 * math.pi, seg=8, closed=False)]
    for x in (-0.09, 0.09): parts.append(_strap('st', body, x, 0.05, 0.004, 0.01))
    out.append(_done(_join(parts, 'kitsoft'), 'kitsoft', mats, body, arm))
    # -- the plate carriers: (key, bag width, height, its thickness with the plate, the cummerbund's height, its strap width)
    for key, bw, bh, bt, ch, stw in (('pc', 0.27, 0.32, 0.03, 0.15, 0.055), ('heavy', 0.31, 0.35, 0.042, 0.19, 0.07)):
        top = 1.47 if key == 'pc' else 1.49  # (its top at the sternum's notch: the plate over the top of the lungs)
        parts = [_panel('pf', body, -1, -bw / 2, bw / 2, top - bh, top, 0.006, bt, cut=0.05), _panel('pb', body, 1, -bw / 2 - 0.005, bw / 2 + 0.005, top - bh + 0.01, top + 0.01, 0.006, bt * 0.85, cut=0.03),
                 _band('cb', body, top - bh, top - bh + ch, 0.004, 0.014) if key == 'pc' else _band('cb', body, 1.0, 1.34, 0.004, 0.016)]
        for x in (-0.1, 0.1): parts.append(_strap('st', body, x * (1 if key == 'pc' else 1.05), stw * 0.9, 0.004 + bt * 0.3, 0.014))  # (its inner edge off the neck's side)
        if key == 'heavy':
            parts.append(_band('collar', body, 1.5, 1.545, 0.014, 0.022, seg=20))  # (a collar round the neck's base)
            parts += [_panel('af', body, -1, -bw / 2 + 0.02, bw / 2 - 0.02, 1.0, top - bh + 0.03, 0.008, 0.014), _panel('ab', body, 1, -bw / 2 + 0.01, bw / 2 - 0.01, 1.0, top - bh + 0.03, 0.008, 0.014)]  # (the belly and the small of the back)
        out.append(_done(_join(parts, 'kit' + key), 'kit' + key, mats, body, arm))
        # the plate in it: its outline, proud of the front bag
        out.append(_done(_panel('pl', body, -1, -bw / 2 + 0.025, bw / 2 - 0.025, top - bh + 0.03, top - 0.02, 0.006 + bt, 0.005, cut=0.045), 'kitplate' + key, mats, body, arm))
        # its pouches: across the front bag's lower half, standing on its face (each rides the chest)
    # -- the full-wrap vest (IIIA): soft armour closed right round the trunk, from under the collarbones down to the belt, higher under
    # the arms than the concealable one; thicker, a plate pocket in front, two pouches low on it
    parts = [_panel('wf', body, -1, -0.16, 0.16, 0.97, 1.45, 0.005, 0.018, cut=0.07), _panel('wb', body, 1, -0.165, 0.165, 0.97, 1.47, 0.005, 0.018, cut=0.04),
             _band('ws', body, 0.97, 1.33, 0.005, 0.018, a0=0.28 * math.pi, a1=0.72 * math.pi, seg=8, closed=False), _band('ws2', body, 0.97, 1.33, 0.005, 0.018, a0=1.28 * math.pi, a1=1.72 * math.pi, seg=8, closed=False)]
    for x in (-0.09, 0.09): parts.append(_strap('st', body, x, 0.06, 0.006, 0.014))
    out.append(_done(_join(parts, 'kitwrap'), 'kitwrap', mats, body, arm))
    out.append(_done(_panel('pl', body, -1, -0.11, 0.11, 1.15, 1.43, 0.024, 0.005, cut=0.045), 'kitplatewrap', mats, body, arm))
    # -- the chest rig: a panel of pouches across the front of the chest (no armour), straps over the shoulders, a strap round the back
    parts = [_panel('rf', body, -1, -0.17, 0.17, 1.12, 1.31, 0.006, 0.022, step=0.04), _band('rb', body, 1.15, 1.185, 0.004, 0.006, a0=0.27 * math.pi, a1=1.73 * math.pi, seg=14, closed=False)]
    for x in (-0.1, 0.1): parts.append(_strap('st', body, x, 0.045, 0.006, 0.01))
    out.append(_done(_join(parts, 'kitrecon'), 'kitrecon', mats, body, arm))
    # -- the packs on the back (their bottoms rest in the small of it), each in two fits: over a plate carrier (c) or not; their straps
    # over the shoulders the same; the IFAK at the back of the hips, on a belt (b) or not
    cz = B('chest').z if 'chest' in arm.data.bones else 1.2
    for key, w, h, d, y in (('sling', 0.22, 0.26, 0.09, 0.12), ('assault', 0.3, 0.36, 0.13, 0.14), ('ruck', 0.34, 0.5, 0.2, 0.2)):
        zc = cz + y
        for suf, gap in (('', 0.022), ('c', 0.05)):
            yb = _back(body, zc - h / 2, zc + h / 2) + gap
            parts = [_rbox('pk', V((0, yb + d / 2, zc)), (w, d, h), min(0.035, d * 0.3)),
                     _rbox('pp', V((0, yb + d + 0.016, zc - h * 0.2)), (w * 0.8, 0.045, h * 0.32), 0.014)]  # (its front pocket)
            out.append(_done(_join(parts, 'kitpack' + key + suf), 'kitpack' + key + suf, mats, body, arm, only='chest'))
    for suf, gap in (('', 0.016), ('c', 0.03)): out.append(_done(_join([_strap('ps', body, x, 0.05, gap, 0.012) for x in (-0.1, 0.1)], 'kitpackstrap' + suf), 'kitpackstrap' + suf, mats, body, arm))
    for suf, gap in (('', 0.008), ('b', 0.032)):
        yb = _back(body, 0.97, 1.03, 3) + gap
        out.append(_done(_rbox('ifak', V((0, yb + 0.03, 1.0)), (0.13, 0.06, 0.1), 0.015), 'kitifak' + suf, mats, body, arm, only='hips'))
    # -- belts: a plain duty belt, and the padded battle/war belt (each on the hips alone: it rides them, it doesn't stretch)
    out.append(_done(_band('bl', body, 0.98, 1.025, 0.012, 0.008, seg=24), 'kitbelt', mats, body, arm, only='hips'))
    out.append(_done(_band('bw', body, 0.962, 1.042, 0.012, 0.018, seg=24), 'kitbeltwide', mats, body, arm, only='hips'))
    # -- what's worn on the limbs and the hips (a carrier's or a belt's): each on its own bones
    B = lambda n: arm.matrix_world @ arm.data.bones[n].head_local
    E = lambda n: arm.matrix_world @ arm.data.bones[n].tail_local
    UP, FWD = V((0, 0, 1)), V((0, -1, 0))
    two = lambda f: [f(s) for s in ('R', 'L')]
    # soft deltoid pads over the top of each arm; a hard cap (the hard guards) larger and thicker
    # (each side its own arm's: weighted before they're joined, so a pad goes where its arm does and not half with the chest)
    side = lambda o, s: (_weigh(o, body, arm, allow=('upperarm.' + s, 'clavicle.' + s)), o)[1]
    out.append(_done(_join(two(lambda s: side(_tube('dp', body, B('upperarm.' + s), E('upperarm.' + s), 0.04, 0.5, -1.7, 1.7, 0.006, 0.014, UP), s)), 'kitdelt'), 'kitdelt', mats, body, arm, weigh=False))
    out.append(_done(_join(two(lambda s: side(_tube('hc', body, B('upperarm.' + s), E('upperarm.' + s), -0.05, 0.42, -2.1, 2.1, 0.012, 0.022, UP, smooth=2), s)), 'kitshcap'), 'kitshcap', mats, body, arm, weigh=False))
    # an axillary panel down each flank under the arm (over a vest)
    out.append(_done(_join([_band('ax', body, 1.2, 1.35, 0.016, 0.012, a0=0.38 * math.pi, a1=0.62 * math.pi, seg=6, closed=False), _band('ax2', body, 1.2, 1.35, 0.016, 0.012, a0=1.38 * math.pi, a1=1.62 * math.pi, seg=6, closed=False)], 'kitaxil'), 'kitaxil', mats, body, arm))
    # the groin flap hanging from the carrier, a plate on it, a wrap right round the hips
    out.append(_done(_panel('gf', body, -1, -0.1, 0.1, 0.84, 1.0, 0.03, 0.012, oy=0.03, step=0.035), 'kitgflap', mats, body, arm, only='hips'))
    out.append(_done(_panel('gp', body, -1, -0.075, 0.075, 0.87, 0.98, 0.044, 0.007, oy=0.03, step=0.035), 'kitgplate', mats, body, arm, only='hips'))
    out.append(_done(_band('pw', body, 0.88, 1.0, 0.008, 0.014, seg=28), 'kitpelvis', mats, body, arm, allow=('hips', 'thigh.R', 'thigh.L', 'spine')))
    # down the legs: a panel on the front of each thigh, a wrap round it, a guard down each shin
    LEGS = ('thigh.R', 'thigh.L', 'hips', 'shin.R', 'shin.L')
    out.append(_done(_join(two(lambda s: _tube('tp', body, B('thigh.' + s), E('thigh.' + s), 0.1, 0.58, -0.95, 0.95, 0.006, 0.012, FWD, seg=8)), 'kitthigh'), 'kitthigh', mats, body, arm, allow=LEGS))
    out.append(_done(_join(two(lambda s: _tube('tw', body, B('thigh.' + s), E('thigh.' + s), 0.2, 0.82, 0, 2 * math.pi, 0.006, 0.012, FWD, seg=16, closed=True)), 'kitlegwrap'), 'kitlegwrap', mats, body, arm, allow=LEGS))
    out.append(_done(_join(two(lambda s: _tube('sg', body, B('shin.' + s), E('shin.' + s), 0.04, 0.85, -1.0, 1.0, 0.008, 0.008, FWD, seg=8)), 'kitshin'), 'kitshin', mats, body, arm, allow=LEGS))
    return out

