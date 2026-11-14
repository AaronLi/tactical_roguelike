# Helmets and face pieces made on each body's own head (build_human.py calls it, after the body armour): each shell laid over the
# skull (not the hair: a helmet presses it down) at its padding's gap, eased smooth (a shell doesn't dip into the temples or bulge
# over an ear), its lower edge where js/headgear.ts CUT has it (so js/ballistics.ts BRIM, the helmet's coverage, stays true), and
# all of it on the head bone alone. In the figure's frame: z up, facing -y; the wearer's left is -x.
# What's made (one mesh each, its material its name; js/rig.ts setKit wears them, coloured as the game colours them):
#   the helmets as they are:   kithelmbump, kithelmfast, kithelmach, kithelmrifle   (shell, rails, shroud, loop panels, counterweight...)
#   the face pieces:           kitmandible, kitshield, kitshieldrifle               (the shields' clear sheet; kitshieldframe their frames)
#   the mandible's arms:       kitmandarmshigh, kitmandarmsmid                     (up to a high-cut's rails, or a mid-cut's)
import bpy, bmesh, math
from mathutils import Vector as V
from mathutils.bvhtree import BVHTree
import kit_armour as K

PI = math.pi
ease = lambda a: (1 - math.cos(a)) / 2
notch = lambda a, a0, w: math.exp(-(((abs(a) - a0) / w) ** 2))
CUT = {  # (js/headgear.ts: the polar angle of the lower edge, round from straight ahead)
    'high': lambda a: PI * (0.44 + 0.16 * ease(a) - 0.12 * notch(a, 1.72, 0.42)),
    'mid': lambda a: PI * (0.455 + 0.175 * ease(a) - 0.045 * notch(a, 1.7, 0.36)),
}
SC = (1.0, 1.1, 1.02)  # (js/headgear.ts SC: a head's longer front to back; in this frame x, y (depth), z)

def build(head, arm):
    mats = {}
    me = head.data; hair = {i for i, m in enumerate(me.materials) if m and m.name.split('.')[0] == 'hair'}
    polys = [p for p in me.polygons if p.material_index not in hair]
    mw = head.matrix_world
    bvh = BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [list(p.vertices) for p in polys])
    skin = [mw @ me.vertices[i].co for p in polys for i in p.vertices]
    top = max(v.z for v in skin)
    up = [v for v in skin if v.z > top - 0.06]
    C = V((0, (min(v.y for v in up) + max(v.y for v in up)) / 2, top - 0.107))  # (the cranium's centre: js/headgear.ts C0)
    D = lambda a, th: V((-math.sin(th) * math.sin(a) * SC[0], -math.sin(th) * math.cos(a) * SC[1], math.cos(th) * SC[2])).normalized()

    # the skull's surface as a field of radii round C (a x th), each the farthest of it near that way plus gap, eased smooth and never
    # inside the head: what every shell is laid on
    NA, NT, TMAX = 64, 30, 0.86 * PI
    def field(gap, smooth=6, shell=False, convex=None):
        R = [[0.0] * (NT + 1) for _ in range(NA)]
        for i in range(NA):
            for j in range(NT + 1):
                a, th = -PI + 2 * PI * i / NA, TMAX * j / NT
                hit = bvh.ray_cast(C, D(a, th), 0.4)[0]
                R[i][j] = ((hit - C).length if hit else 0.1) + gap
        need = [row[:] for row in R]
        # a shell's an egg round the head, not its every bump: the smallest egg (its own width, depth ahead and behind, and height, from
        # the head's) clear of the head over the dome (above the ears), then out further only where the head needs it below that
        dirs = lambda i, j: D(-PI + 2 * PI * i / NA, TMAX * j / NT)
        ext = lambda f: max(need[i][j] * f(dirs(i, j)) for i in range(NA) for j in range(NT + 1))
        ax, af, ab, az = ext(lambda d: abs(d.x)), ext(lambda d: max(0, -d.y)), ext(lambda d: max(0, d.y)), ext(lambda d: max(0, d.z))
        def egg(d): return 1 / math.sqrt((d.x / ax) ** 2 + (d.y / (af if d.y < 0 else ab)) ** 2 + (d.z / az) ** 2)
        rs = sorted(need[i][j] / egg(dirs(i, j)) for i in range(NA) for j in range(NT + 1) if TMAX * j / NT < 0.45 * PI); k = rs[int(len(rs) * 0.85)]  # (most of it, not its one high spot)
        if shell: R = [[max(need[i][j], k * egg(dirs(i, j))) for j in range(NT + 1)] for i in range(NA)]
        if convex:  # (a sheet over the face: wholly an egg, as small as clears the face there (its nose, its chin), none of its shape)
            a0, a1, t0, t1 = convex
            ins = [(i, j) for i in range(NA) for j in range(NT + 1) if a0 <= -PI + 2 * PI * i / NA <= a1 and t0 <= TMAX * j / NT <= t1]
            face = [(i, j) for i, j in ins if abs(-PI + 2 * PI * i / NA) < 0.9]  # (its width the cheeks', not the ears')
            ex = lambda f, L=None: max(need[i][j] * f(dirs(i, j)) for i, j in (L or ins)) or 0.1  # (the face's own: its width, its depth ahead, up and down)
            cx = ex(lambda d: abs(d.x), face); cf, cu, cd = ex(lambda d: max(0, -d.y)), ex(lambda d: max(0, d.z)), ex(lambda d: max(0, -d.z))
            fegg = lambda d: 1 / math.sqrt((d.x / cx) ** 2 + (min(0, d.y) / cf) ** 2 + (d.z / (cu if d.z > 0 else cd)) ** 2 + 1e-9)
            kc = max(need[i][j] / fegg(dirs(i, j)) for i, j in ins)
            R = [[kc * fegg(dirs(i, j)) for j in range(NT + 1)] for i in range(NA)]; smooth = 0
        for _ in range(smooth):  # (eased: each the mean of it and its neighbours, then no less than the head needs)
            R = [[max(need[i][j], (R[i][j] * 2 + R[(i - 1) % NA][j] + R[(i + 1) % NA][j] + R[i][max(0, j - 1)] + R[i][min(NT, j + 1)]) / 6) for j in range(NT + 1)] for i in range(NA)]
        R0 = sum(R[i][0] for i in range(NA)) / NA
        if not convex:
            for i in range(NA): R[i][0] = R0  # (one crown)
        def at(a, th, off=0.0):
            u = ((a + PI) / (2 * PI) * NA) % NA; v = min(NT, max(0.0, th / TMAX * NT))
            i0, j0 = int(u) % NA, min(NT - 1, int(v)); fu, fv = u - int(u), v - j0
            r = (R[i0][j0] * (1 - fu) + R[(i0 + 1) % NA][j0] * fu) * (1 - fv) + (R[i0][j0 + 1] * (1 - fu) + R[(i0 + 1) % NA][j0 + 1] * fu) * fv
            return C + D(a, th) * (r + off)
        return at

    def sheet(name, at, a0, a1, th0, th1, t, off=0.0, cols=40, rows=12, closed=False, flat=False):
        """a piece of shell over the field: azimuth a0..a1, polar th0(a)..th1(a), off beyond it, t thick (outward)"""
        f0 = th0 if callable(th0) else (lambda a: th0); f1 = th1 if callable(th1) else (lambda a: th1)
        n = cols if closed else cols + 1
        pts = []
        for j in range(rows + 1):
            row = []
            for i in range(n):
                a = a0 + (a1 - a0) * i / cols; t0, t1 = f0(a), f1(a)
                row.append(at(a, t0 + (t1 - t0) * j / rows, off))
            if closed: row.append(row[0])
            pts.append(row)
        o = K._grid(name, pts)
        bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
        for f in bm.faces:
            if f.normal.dot(f.calc_center_median() - C) < 0: f.normal_flip()
        bm.to_mesh(o.data); bm.free()
        md = o.modifiers.new('so', 'SOLIDIFY'); md.thickness = t; md.offset = 1; md.use_even_offset = True; md.use_rim = True
        dg = bpy.context.evaluated_depsgraph_get(); m2 = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); old = o.data; o.modifiers.clear(); o.data = m2; bpy.data.meshes.remove(old)
        if flat: o['flat'] = 1
        return o

    def box(name, at, a, th, size, off, tilt=0.0):
        """a block standing on the field at (a, th), its faces square to the way out from the centre there"""
        p = at(a, th, off + size[1] / 2); n = (p - C).normalized(); x = V((0, 0, 1)).cross(n).normalized() if abs(n.z) < 0.95 else V((1, 0, 0)); z = n.cross(x)
        o = K._box(name, V((0, 0, 0)), size)
        import mathutils
        R = mathutils.Matrix((x, n, z)).transposed().to_4x4() @ mathutils.Matrix.Rotation(tilt, 4, 'X')
        o.data.transform(R); o.data.transform(mathutils.Matrix.Translation(p)); return o

    def strip(name, p0, p1, w, d):
        """a flat bar from p0 to p1, its face turned out from the head"""
        import mathutils
        L = (p1 - p0); y = L.normalized(); n = ((p0 + p1) / 2 - C); n = (n - y * n.dot(y)).normalized(); x = y.cross(n)
        o = K._box(name, V((0, 0, 0)), (w, L.length + 0.01, d))
        o.data.transform(mathutils.Matrix((x, y, n)).transposed().to_4x4()); o.data.transform(mathutils.Matrix.Translation((p0 + p1) / 2)); return o

    def pod(name, at, a, th, r, depth, off):
        """a round pod on the side of the head (an ear's comms): a cylinder out of the shell"""
        p = at(a, th, off); n = (p - C).normalized()
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r, radius2=r * 0.85, depth=depth)
        import mathutils
        q = V((0, 0, 1)).rotation_difference(n); bmesh.ops.rotate(bm, verts=bm.verts, matrix=q.to_matrix()); bmesh.ops.translate(bm, verts=bm.verts, vec=p + n * depth / 2)
        m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free(); o = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(o); return o

    def done(o, name):
        o = K._done(o, name, mats, head, arm, only='head')
        if o.get('flat'): o.data.shade_flat()
        return o

    out = []
    MODELS = {'bump': ('high', 0.012, 0.004), 'fast': ('high', 0.014, 0.007), 'ach': ('mid', 0.015, 0.008), 'rifle': ('mid', 0.017, 0.012)}
    for key, (cutk, gap, t) in MODELS.items():
        cut = CUT[cutk]; at = field(gap, smooth=16, shell=True)  # (eased hard: a shell's a smooth dome, not the skull's every bump)
        parts = [sheet('sh', at, -PI, PI, 0.0, cut, t, closed=True, cols=30, rows=8)]
        if key in ('bump', 'fast', 'rifle'):
            for s in (-1, 1):  # ARC rails along the cut over each ear
                parts.append(sheet('rl', at, 1.0 * s if s > 0 else -2.35, 2.35 if s > 0 else -1.0, lambda a: cut(a) - 0.075 * PI, lambda a: cut(a) - 0.01 * PI, 0.009, off=t, cols=8, rows=2))
            parts.append(sheet('sr', at, -0.32, 0.32, 0.31 * PI, lambda a: cut(a) - 0.015 * PI, 0.005, off=t, cols=8, rows=4))  # the night-vision shroud
            parts.append(box('mt', at, 0.0, 0.38 * PI, (0.03, 0.016, 0.022), t + 0.004, tilt=-0.35))  # its mount
        if key in ('fast', 'rifle'):
            parts.append(sheet('lp', at, -0.55, 0.55, 0.06 * PI, 0.2 * PI, 0.002, off=t, cols=8, rows=3))  # loop panels: the crown, each side
            for s in (-1, 1): parts.append(sheet('ls', at, 1.3 if s > 0 else -2.2, 2.2 if s > 0 else -1.3, 0.25 * PI, 0.33 * PI, 0.002, off=t, cols=6, rows=2))
            parts.append(box('cw', at, PI, 0.5 * PI, (0.075, 0.022, 0.045), t, tilt=0.3))  # the counterweight pouch
        if key == 'ach':
            parts.append(sheet('cv', at, -PI, PI, lambda a: cut(a) - 0.09 * PI, lambda a: cut(a) - 0.06 * PI, 0.002, off=t, closed=True, cols=30, rows=1))  # the cover's band
            parts.append(box('br', at, 0.0, 0.4 * PI, (0.034, 0.006, 0.03), t, tilt=-0.6))  # the front bracket
        if key == 'bump':
            for a, th in ((0.5, 0.18), (-0.5, 0.18), (2.4, 0.22), (-2.4, 0.22), (PI, 0.3), (1.4, 0.2), (-1.4, 0.2)): parts.append(box('vt', at, a, th * PI, (0.02, 0.002, 0.01), t - 0.0015))  # vents
        out.append(done(K._join(parts, 'kithelm' + key), 'kithelm' + key))
        if key != 'ach':  # where night vision hangs: its mount on the shroud (js/rig.ts finds it and hangs js/headgear.ts nvg there)
            p = at(0.0, 0.36 * PI, t + 0.018); out.append(done(K._grid('nv', [[p, p + V((0.001, 0, 0))], [p + V((0, 0, 0.001)), p + V((0.001, 0, 0.001))]]), 'kitnv' + key))
    # the chinstrap: from under the shell in front of and behind each ear, down the cheek to a cup under the chin, on the skin
    sat = field(0.003, smooth=6)
    straps = [sheet('cs', sat, s * a0 - 0.035, s * a0 + 0.035, 0.45 * PI, th1, 0.003, cols=1, rows=6) for s in (-1, 1) for a0, th1 in ((1.32, 0.82 * PI), (1.95, 0.78 * PI))]
    straps.append(sheet('cc', sat, -1.3, 1.3, 0.8 * PI, 0.84 * PI, 0.003, cols=10, rows=1))
    out.append(done(K._join(straps, 'kitstrap'), 'kitstrap'))

    # the face pieces: a mandible round the jaw, a smooth guard clear of the chin, on arms up to each helmet's rails (one pair for the
    # high cut's rails, one for the mid cut's); a face shield from the brow to below the chin, a smooth sheet clear of the nose
    at = field(0.015)
    MJ = (-1.45, 1.45, 0.6 * PI, 0.76 * PI)
    jat = field(0.024, smooth=24)  # (close round the jaw, eased over the lips and the chin)
    out.append(done(sheet('md', jat, MJ[0], MJ[1], MJ[2], MJ[3], 0.012, cols=16, rows=4), 'kitmandible'))
    for cutk, (gap, t) in (('high', (0.014, 0.007)), ('mid', (0.016, 0.01))):
        hat, cut = field(gap, smooth=16, shell=True), CUT[cutk]; arms = []
        for sd in (-1, 1):
            a = sd * 1.5; p0 = jat(a * 0.97, MJ[2] + 0.02 * PI, 0.012); p1 = hat(sd * 1.55, cut(sd * 1.55) - 0.035 * PI, t + 0.006)
            arms.append(strip('ma', p0, p1, 0.022, 0.009)); arms.append(box('mk', hat, sd * 1.55, cut(sd * 1.55) - 0.035 * PI, (0.026, 0.01, 0.03), t))  # (the arm, its clamp on the rail)
        out.append(done(K._join(arms, 'kitmandarms' + cutk), 'kitmandarms' + cutk))
    FS = (-1.2, 1.2, 0.38 * PI, 0.8 * PI)
    vat = field(0.045, convex=FS)
    out.append(done(sheet('fs', vat, FS[0], FS[1], FS[2], FS[3], 0.007, cols=14, rows=7), 'kitshield'))
    out.append(done(sheet('fr', vat, FS[0], FS[1], FS[2], FS[3], 0.016, cols=14, rows=7), 'kitshieldrifle'))
    out.append(done(K._join([sheet('fb', vat, -1.22, 1.22, 0.36 * PI, 0.4 * PI, 0.012, off=0.002, cols=20, rows=1)] + [box('fa', at, s2 * 1.4, 0.42 * PI, (0.014, 0.05, 0.03), 0.012) for s2 in (-1, 1)], 'kitshieldframe'), 'kitshieldframe'))
    return out
