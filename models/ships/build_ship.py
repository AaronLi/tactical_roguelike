# The squad's ship, built in Blender from the game's own layout of her (models/ships/<id>.layout.json, written by
# tools/ship_layout.mjs from js/spacedata.ts): her decks, stairs and walls are drawn where the game's solids are, so what
# you see aboard is what you walk on. Exports models/ships/<id>.glb, which tools/bake_ships.mjs checks against the same
# layout and puts in the models' bundle; js/shipmodel.ts dresses it (her paint, the lit materials, the screens' pictures).
#   blender -b -P models/ships/build_ship.py -- [kestrel]
# What the game finds in it, by name (docs/models.md "The squad's ship"):
#   body                 everything that doesn't move, one mesh, its materials named for what they are (the game swaps
#                        each for its own: hull, armor, accent, deck, inner, dark, seat, glass, glow, strip, hot)
#   nose_L, nose_R       the breaching door's leaves, each pivoting at the door's middle (the game slides them apart in x)
#   ramp                 the rear door, hinged at the crew deck's floor, closed (the game turns it about x to open it)
#   screen_nav, screen_sensors   the two screens (the game puts its pictures on them; their UVs right way up for a canvas)
#   hp_0, hp_1           the hardpoints on her roof's shoulders, port then starboard (the game puts a turret on each that has a gun)
#   light_0..2           her own lamps: the cockpit, the breach deck, the crew deck
#   thrust_L, thrust_R   the engines' exhausts, facing aft (the game hangs the drive's glow there)
# Her frame is the game's: x to starboard, y up from her keel, z aft (her nose toward -z); Blender's is z up, so a point
# (x, y, z) of hers is (x, -z, y) here (and the exporter's y-up turns it back).
import bpy, bmesh, json, os, sys, math
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SID = argv[0] if argv else 'kestrel'
J = json.load(open(os.path.join(HERE, SID + '.layout.json')))
L, BOXES, SEATS, D = J['layout'], J['boxes'], J['seats'], J['def']
fw, tw, sw, hw = L['fw'], L['tw'], L['sw'], L['hw']
zc, zt, zw, zk, zr, z1 = L['zc'], L['zt'], L['zw'], L['zk'], L['zr'], L['z1']
FC, FB, FM, CC, CB, CM = L['FC'], L['FB'], L['FM'], L['CC'], L['CB'], L['CM']
W = 0.22; X = hw + W; TOP = CB + 0.2
# the cockpit's glazing (as js/shipmodel.ts had it): the canopy's outline at the header, drawn in IN at the deck
SILL, HEADER, zg0, zg1, zf, fc, IN = FC, CC - 0.06, zc + 0.77, zc + 3.1, zc + 1.08, fw - 0.45, 0.3
CROWN = [(-fw, zg1), (-fw, zg0), (-fc, zc + 0.33), (fc, zc + 0.33), (fw, zg0), (fw, zg1)]
FOOT = [(-fw + IN, zg1), (-fw + IN, zg0 + 0.12), (-fc + 0.12, zc + 0.33 + IN), (fc - 0.12, zc + 0.33 + IN), (fw - IN, zg0 + 0.12), (fw - IN, zg1)]
EPS = 1e-6

def V(x, y, z): return Vector((x, -z, y))  # (her frame to Blender's)
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---- materials, named for what the game swaps in (their colours here are only for looking at the file on its own)
MATS = {}
def mat(name, rgb, metal=0.3, rough=0.6, emit=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    if emit: p.inputs['Emission Color'].default_value = (*rgb, 1); p.inputs['Emission Strength'].default_value = emit
    if alpha < 1: p.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND'
    MATS[name] = m; return m
for n, c, mt, r, e, a in [('hull', (0.32, 0.35, 0.39), 0.45, 0.55, 0, 1), ('armor', (0.16, 0.17, 0.19), 0.55, 0.5, 0, 1), ('accent', (0.9, 0.45, 0.1), 0.2, 0.5, 0, 1),
                          ('deck', (0.17, 0.18, 0.2), 0.2, 0.85, 0, 1), ('inner', (0.36, 0.4, 0.43), 0.2, 0.7, 0, 1), ('dark', (0.08, 0.09, 0.1), 0.5, 0.5, 0, 1), ('seat', (0.24, 0.27, 0.3), 0.1, 0.8, 0, 1),
                          ('glass', (0.5, 0.8, 1.0), 0.6, 0.05, 0, 0.2), ('glow', (0.16, 0.54, 0.35), 0, 1, 2, 1), ('strip', (0.87, 0.95, 1.0), 0, 1, 3, 1), ('hot', (0.95, 0.5, 0.12), 0, 1, 2, 1), ('screen', (0.02, 0.03, 0.05), 0, 1, 0.5, 1)]:
    mat(n, c, mt, r, e, a)

class Mesh:
    """geometry gathered into one bmesh, a material slot a name"""
    def __init__(s, name): s.name, s.bm, s.slots = name, bmesh.new(), []
    def slot(s, m):
        if m not in s.slots: s.slots.append(m)
        return s.slots.index(m)
    def faces(s, geom, m, smooth=False):
        k = s.slot(m)
        for f in geom:
            if isinstance(f, bmesh.types.BMFace): f.material_index = k; f.smooth = smooth
    def box(s, m, x0, y0, z0, x1, y1, z1, bev=0.0):
        """an axis-aligned box in her frame, its edges bevelled by bev (0: sharp)"""
        if x1 < x0: x0, x1 = x1, x0
        if y1 < y0: y0, y1 = y1, y0
        if z1 < z0: z0, z1 = z1, z0
        if x1 - x0 < EPS or y1 - y0 < EPS or z1 - z0 < EPS: return
        vs = [s.bm.verts.new(V(x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        q = lambda a, b, c, d: s.bm.faces.new((vs[a], vs[b], vs[c], vs[d]))
        fs = [q(0, 1, 3, 2), q(4, 6, 7, 5), q(0, 4, 5, 1), q(2, 3, 7, 6), q(0, 2, 6, 4), q(1, 5, 7, 3)]
        bmesh.ops.recalc_face_normals(s.bm, faces=fs)
        s.faces(fs, m)
        b = min(bev, (x1 - x0) * 0.3, (y1 - y0) * 0.3, (z1 - z0) * 0.3)
        if b > 0.002:
            es = list({e for f in fs for e in f.edges})
            r = bmesh.ops.bevel(s.bm, geom=es + vs, offset=b, segments=1, affect='EDGES', profile=0.5)
            s.faces(r['faces'], m)
    def poly(s, m, pts, smooth=False):
        vs = [s.bm.verts.new(V(*p)) for p in pts]
        f = s.bm.faces.new(vs); s.faces([f], m, smooth); return f
    def loft(s, m, secs, mirror=False, caps=True, smooth=False, closed=True):
        """rings of (x, y) at each z, joined; mirror: on the port side (x negated); closed=False: an open profile (no face from its last point back to its first)"""
        sg = -1 if mirror else 1
        rings = [[s.bm.verts.new(V(sg * x, y, z)) for (x, y) in pts] for z, pts in secs]
        fs = []
        for a, b in zip(rings, rings[1:]):
            n = len(a)
            for i in range(n if closed else n - 1):
                j = (i + 1) % n
                fs.append(s.bm.faces.new((a[i], a[j], b[j], b[i])))
        if caps: fs.append(s.bm.faces.new(rings[0])); fs.append(s.bm.faces.new(list(reversed(rings[-1]))))
        bmesh.ops.recalc_face_normals(s.bm, faces=fs); s.faces(fs, m, smooth)
    def beam(s, m, p, q, t=0.06, d=None):
        """a square bar from p to q, t across (d deep if given)"""
        p, q = Vector(p), Vector(q); ax = q - p; ln = ax.length
        up = Vector((0, 1, 0)) if abs(ax.normalized().y) < 0.9 else Vector((1, 0, 0))
        u = ax.cross(up).normalized() * (t / 2); w = ax.cross(u).normalized() * ((d or t) / 2)
        cs = [p + u + w, p - u + w, p - u - w, p + u - w]
        vs = [s.bm.verts.new(V(*c)) for c in cs] + [s.bm.verts.new(V(*(c + ax))) for c in cs]
        fs = [s.bm.faces.new((vs[i], vs[(i + 1) % 4], vs[4 + (i + 1) % 4], vs[4 + i])) for i in range(4)] + [s.bm.faces.new(vs[:4]), s.bm.faces.new(vs[4:][::-1])]
        bmesh.ops.recalc_face_normals(s.bm, faces=fs); s.faces(fs, m)
    def cyl(s, m, p, q, r, n=12, r2=None, smooth=True, caps=True):
        """a cylinder (or cone: r2) from p to q"""
        p, q = Vector(p), Vector(q); ax = (q - p).normalized(); up = Vector((0, 1, 0)) if abs(ax.y) < 0.9 else Vector((1, 0, 0))
        u = ax.cross(up).normalized(); w = ax.cross(u).normalized(); r2 = r if r2 is None else r2
        ring = lambda c, rr: [s.bm.verts.new(V(*(c + (u * math.cos(k * 2 * math.pi / n) + w * math.sin(k * 2 * math.pi / n)) * rr))) for k in range(n)]
        a, b = ring(p, r), ring(q, r2)
        fs = [s.bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])) for i in range(n)]
        if caps: fs += [s.bm.faces.new(a[::-1]), s.bm.faces.new(b)]
        bmesh.ops.recalc_face_normals(s.bm, faces=fs); s.faces(fs, m, smooth)
    def obj(s, loc=(0, 0, 0)):
        me = bpy.data.meshes.new(s.name); s.bm.normal_update(); s.bm.to_mesh(me); s.bm.free()
        for m in s.slots: me.materials.append(MATS[m])
        o = bpy.data.objects.new(s.name, me); bpy.context.collection.objects.link(o)
        if loc != (0, 0, 0):  # (its origin there: the mesh moved back by as much)
            me.transform(Matrix.Translation(-V(*loc))); o.location = V(*loc)
        return o

def empty(name, p):
    e = bpy.data.objects.new(name, None); e.empty_display_size = 0.3; e.location = V(*p); bpy.context.collection.objects.link(e); return e

def panels(M, m, axis, at, th, a0, a1, b0, b1, na, nb, gap=0.025, bev=0.012):
    """plates on a face of constant <axis> (x or y), from at to at+th, split na x nb with seams between"""
    for i in range(na):
        for j in range(nb):
            u0 = a0 + (a1 - a0) * i / na + (gap if i else 0); u1 = a0 + (a1 - a0) * (i + 1) / na - (gap if i < na - 1 else 0)
            v0 = b0 + (b1 - b0) * j / nb + (gap if j else 0); v1 = b0 + (b1 - b0) * (j + 1) / nb - (gap if j < nb - 1 else 0)
            if axis == 'x': M.box(m, at, u0, v0, at + th, u1, v1, bev)  # (u: y, v: z)
            else: M.box(m, u0, at, v0, u1, at + th, v1, bev)  # (u: x, v: z)

B = Mesh('body')
# ================================================================ inside
# every solid the game has her made of, as it stands (decks and stairs in the deck's grey, the rest lighter), bar the cockpit's
# glazed walls and deck (drawn with the glass), what keeps you off the glass's foot (behind it), and the doors
def same(a, b): return abs(a - b) < 1e-6
for b in BOXES:
    if len(b) > 6: continue
    bx0, by0, bz0, bx1, by1, bz1 = b
    if same(by0, FC) and same(by1, CC) and same(bz0, zc + 0.3): continue
    if same(bz0, zc + 0.3) and (same(by1, FC) or same(by1, FC + 0.55)): continue
    flat = by1 - by0 <= 0.36 or (by0 == 0 and by1 <= FB + 0.01 and bx1 - bx0 < 2 * fw)
    B.box('deck' if flat else 'inner', bx0, by0, bz0, bx1, by1, bz1, 0.015)
# the stairs' treads: a lit nosing on each step
for b in BOXES:
    if len(b) > 6: continue
    bx0, by0, bz0, bx1, by1, bz1 = b
    if by0 == 0 and same(bx1 - bx0, fw - 0.06) and zk - 0.01 < bz0 < zr: B.box('hot', bx0 + 0.05, by1, bz0 + 0.01, bx1 - 0.05, by1 + 0.006, bz0 + 0.04)
# the cockpit's deck: inside the glass's foot where it's glazed, the deck ahead of the helm's seat glass
B.box('deck', -fw + IN, 0, zf, fw - IN, FC, zg1, 0.01); B.box('deck', -fw - 0.2, 0, zg1, fw + 0.2, FC, zr, 0.01)
B.box('glass', -(fw - IN), FC - 0.035, zc + 0.6, fw - IN, FC - 0.005, zf)
for xx in (-0.4, 0.4): B.box('dark', xx - 0.02, FC - 0.04, zc + 0.6, xx + 0.02, FC - 0.002, zf)
# the glass: each pane between the outline at the deck and at the header; frames along both, posts at the corners
for i in range(len(CROWN) - 1):
    (x0, z0), (x1_, z1_), (u0, w0), (u1, w1) = CROWN[i], CROWN[i + 1], FOOT[i], FOOT[i + 1]
    B.poly('glass', [(u0, SILL, w0), (u1, SILL, w1), (x1_, HEADER, z1_), (x0, HEADER, z0)])
    B.beam('dark', (x0, HEADER, z0), (x1_, HEADER, z1_), 0.07); B.beam('dark', (u0, SILL + 0.03, w0), (u1, SILL + 0.03, w1), 0.06)
for i in range(len(CROWN)): B.beam('dark', (FOOT[i][0], SILL, FOOT[i][1]), (CROWN[i][0], HEADER, CROWN[i][1]), 0.065)
for s in (-1, 1): B.beam('dark', (s * (fw - IN), SILL, zc + 1.9), (s * fw, HEADER, zc + 1.9), 0.05)
B.box('dark', -fw, HEADER, zc + 0.3, fw, CC, zc + 0.38, 0.01)
for s in (-1, 1):
    a, b_ = s * fw, s * (fw + W)
    B.box('inner', a, SILL, zg1, b_, CC, zk, 0.01); B.box('dark', a, HEADER, zg0, b_, CC, zg1, 0.01)
# the screens on arms: the navigation screen by the pilot's left knee, the sensor station's at its right
B.cyl('dark', (-0.78, FC, zc + 1.24), (-0.78, FC + 0.78, zc + 1.24), 0.035, 8); B.box('dark', -0.98, FC, zc + 1.1, -0.58, FC + 0.04, zc + 1.38, 0.01)
B.cyl('dark', (0.82, FC, zc + 2.54), (0.82, FC + 1.05, zc + 2.54), 0.035, 8); B.box('dark', 0.62, FC, zc + 2.4, 1.02, FC + 0.04, zc + 2.68, 0.01)
def screen(name, c, wdt, hgt, yaw, pitch):
    """a screen facing (yaw about y, then pitch), UVs a canvas's way up; with a bezel"""
    S = Mesh(name); cx, cy, cz = c
    R = Matrix.Rotation(yaw, 3, 'Y') @ Matrix.Rotation(pitch, 3, 'X')  # (in her frame)
    pts = [R @ Vector((x, y, 0)) for x, y in ((-wdt / 2, -hgt / 2), (wdt / 2, -hgt / 2), (wdt / 2, hgt / 2), (-wdt / 2, hgt / 2))]
    vs = [S.bm.verts.new(V(cx + p.x, cy + p.y, cz + p.z)) for p in pts]
    f = S.bm.faces.new(vs); f.material_index = S.slot('screen')
    uv = S.bm.loops.layers.uv.new('UVMap')
    for lp, (u, v) in zip(f.loops, ((0, 1), (1, 1), (1, 0), (0, 0))): lp[uv].uv = (u, v)  # (v down the screen: the exporter flips it, a canvas wants it so)
    o = S.obj()
    bz = [R @ Vector((x, y, -0.02)) for x, y in ((-wdt / 2 - 0.03, -hgt / 2 - 0.03), (wdt / 2 + 0.03, hgt / 2 + 0.03))]
    return o
screen('screen_nav', (-0.7, FC + 0.85, zc + 1.2), 0.5, 0.32, 0.55, -0.7)
screen('screen_sensors', (0.68, FC + 1.25, zc + 2.4), 0.62, 0.4, -0.75, -0.35)
B.box('dark', -0.98, FC + 0.66, zc + 1.0, -0.42, FC + 1.02, zc + 1.42, 0.02) if False else None
# the seats: a pedestal, a pan, a back with a headrest and wings, arms; the jump seats folding pans on the wall
for st in SEATS:
    F, c, sn = st['f'], math.cos(st['yaw']), math.sin(st['yaw'])
    fx, fz = -sn, -c; ax, az = abs(fz), abs(fx)  # (the way it faces; across it)
    sx, sz = st['x'] - fx * 0.05, st['z'] - fz * 0.05
    jump = st['k'] == 'jump'; h = 0.21 if jump else 0.25; up = st['y'] - F - 0.26
    pan = F + up + 0.42
    if not jump: B.cyl('dark', (sx, F, sz), (sx, pan - 0.04, sz), 0.07, 10); B.box('dark', sx - 0.24, F, sz - 0.24, sx + 0.24, F + 0.04, sz + 0.24, 0.015)
    else: B.box('dark', sx + fx * 0.24 - ax * 0.18, pan - 0.08, sz + fz * 0.24 - az * 0.18, sx + fx * 0.3 + ax * 0.18, pan - 0.02, sz + fz * 0.3 + az * 0.18) if False else None
    B.box('seat', sx - ax * h - az * h, pan, sz - az * h - ax * h, sx + ax * h + az * h, pan + 0.09, sz + az * h + ax * h, 0.035)
    bx, bz = sx - fx * 0.27, sz - fz * 0.27; top = pan + (0.72 if jump else 0.88)
    B.box('seat', bx - ax * h - az * 0.06, pan + 0.05, bz - az * h - ax * 0.06, bx + ax * h + az * 0.06, top, bz + az * h + ax * 0.06, 0.035)
    if not jump:
        B.box('seat', bx - ax * 0.13 - az * 0.07, top, bz - az * 0.13 - ax * 0.07, bx + ax * 0.13 + az * 0.07, top + 0.2, bz + az * 0.13 + ax * 0.07, 0.04)
        for e in (-1, 1): B.box('dark', sx + ax * e * (h + 0.04) - az * 0.2 - ax * 0.03, pan + 0.2, sz + az * e * (h + 0.04) - ax * 0.2 - az * 0.03, sx + ax * e * (h + 0.04) + az * 0.06 + ax * 0.03, pan + 0.26, sz + az * e * (h + 0.04) + ax * 0.06 + az * 0.03, 0.015)
    if st['k'] == 'turret': B.box('hot', sx - 0.18, pan + 0.75, sz - 0.42, sx + 0.18, pan + 0.79, sz - 0.3, 0.005); B.box('dark', sx - 0.22, pan + 0.55, sz - 0.5, sx + 0.22, pan + 0.75, sz - 0.28, 0.02)
# ---- the breach deck: the tunnel ribbed, lit strips down its floor to the door, hazard stripes on the low wall, lamps over it
for k in range(int((zt - zc - 0.3) / 0.6) + 1):
    z = zc + 0.25 + k * 0.6
    for s in (-1, 1): B.box('dark', s * (tw - 0.05), FB, z - 0.05, s * tw, CB, z + 0.05, 0.01)
    B.box('dark', -tw, CB - 0.05, z - 0.05, tw, CB, z + 0.05, 0.01)
for sx in (-0.55, 0.55): B.box('hot', sx - 0.03, FB, zc + 0.2, sx + 0.03, FB + 0.008, zt)
for k in range(10):
    x0 = -1.0 + k * 0.2; B.box('hot' if k % 2 else 'dark', x0, FB + 1.0, zw - 0.005, x0 + 0.2, FB + 1.03, zw + 0.255)
for sx in (-0.4, 0.4): B.box('strip', sx - 0.05, CB - 0.02, zc + 0.3, sx + 0.05, CB, zk - 0.3)
for sx in (-0.5, 0.5): B.box('strip', sx - 0.03, CC - 0.02, zc + 1.6, sx + 0.03, CC, zc + 3.8)  # (two thin lamps over the cockpit, clear of the glass)
# ---- the crew deck: lockers over the seats, a lit line down each wall, her colour along the floor's edge, lamps overhead
for s in (-1, 1):
    B.box('inner', s * (hw - 0.38), CM - 0.55, zr + 0.9, s * hw, CM - 0.05, z1 - 0.9, 0.02)
    for k in range(int((z1 - zr - 1.8) / 0.6)): B.box('dark', s * (hw - 0.385), CM - 0.5, zr + 0.95 + k * 0.6, s * (hw - 0.375), CM - 0.1, zr + 1.48 + k * 0.6)
    B.box('glow', s * (hw - 0.4), CM - 0.6, zr + 0.9, s * (hw - 0.38), CM - 0.57, z1 - 0.9)
    B.box('hot', s * (hw - 0.02), FM + 0.06, zr + 0.4, s * hw, FM + 0.09, z1 - 0.4)
for sx in (-1.04, 1.04): B.box('strip', sx - 0.05, CM - 0.02, zr + 0.6, sx + 0.05, CM, z1 - 0.5)

# ================================================================ outside
O = 0.03
# ---- her skin: one surface over the breach deck and the crew deck, a rounded crown the collar's round at the nose, wider over the
# space behind the tunnel, sweeping down over the crew deck to the tail; clear of every wall and roof inside (by 0.2 m and more), open
# at the collar and at the ramp. Under the breach deck's overhang a fairing slopes in to the cockpit's flank.
HEAD_TOP, SKIN_TOP = TOP + 0.2, CM + 0.55
def prof(a, yb, b, r, n=6):
    left = [(-a + r + r * math.cos(math.pi - k * math.pi / 2 / n), b - r + r * math.sin(math.pi - k * math.pi / 2 / n)) for k in range(n + 1)]
    right = [(a - r + r * math.cos(math.pi / 2 - k * math.pi / 2 / n), b - r + r * math.sin(math.pi / 2 - k * math.pi / 2 / n)) for k in range(n + 1)]
    return [(-a, yb)] + left + right + [(a, yb)]
# (seen from above her sides turn twice: one taper from the collar out to the front of the space behind the tunnel, a second on to
# her full width where the crew deck begins, then straight to the tail; each clears what's inside it)
A0, A1, A2, ZA1, ZA2 = tw + W + 0.3, sw + W + 0.15, X + 0.2, zt, zr + 0.2
def aw(z): return A0 + (A1 - A0) * (z - zc) / (ZA1 - zc) if z <= ZA1 else A1 + (A2 - A1) * min(1.0, (z - ZA1) / (ZA2 - ZA1))
SKIN = [(zc - 0.05, aw(zc), CC, HEAD_TOP, 0.95), (ZA1, aw(ZA1), CC, HEAD_TOP, 0.8), (zk + 0.2, aw(zk + 0.2), CC, HEAD_TOP, 0.75),
        (ZA2, A2, FM - 0.2, HEAD_TOP - 0.25, 0.75), (zr + 1.4, X + 0.2, FM - 0.2, SKIN_TOP, 0.7), (z1 - 0.2, X + 0.2, FM - 0.2, SKIN_TOP - 0.05, 0.7), (z1 + 0.02, X + 0.1, FM - 0.2, SKIN_TOP - 0.1, 0.65)]
B.loft('hull', [(z, prof(a, yb, b, r)) for z, a, yb, b, r in SKIN], caps=False, closed=False)
# (the tail above the ramp closed; seams round her where the panels meet)
za, a, yb, b, r = SKIN[-1]; cap = [(x, max(y, CM + 0.2)) for x, y in prof(a, CM + 0.2, b, r)]
B.poly('hull', [(x, y, za) for x, y in cap])
for k in (1, 3, 4):
    za, a, yb, b, r = SKIN[k]; pts = prof(a + 0.012, yb, b + 0.012, r)
    for p0, p1 in zip(pts, pts[1:]): B.beam('dark', (p0[0], p0[1], za), (p1[0], p1[1], za), 0.04)
for s_ in (-1, 1):
    x0 = fw + W + O
    B.loft('armor', [(zg1 - 0.05, [(x0, CC - 0.05), (aw(zg1 - 0.05) - 0.02, CC), (x0, CC)]), (zg1 + 0.6, [(x0, 1.05), (aw(zg1 + 0.6) - 0.02, CC), (x0, CC)]), (zk + 0.2, [(x0, 1.0), (aw(zk + 0.2) - 0.02, CC), (x0, CC)]),
                     (zr + 0.2, [(x0, 0.55), (X + 0.2, FM - 0.2), (x0, FM - 0.2)])], s_ < 0)
# the brow over the glass
B.loft('armor', [(zc + 0.32, [(-fw - W, HEADER), (fw + W, HEADER), (fw + W, CC + 0.2), (-fw - W, CC + 0.2)]), (zc + 0.02, [(-fw - W + 0.1, CC), (fw + W - 0.1, CC), (fw + W, CC + 0.22), (-fw - W, CC + 0.22)])])
for s in (-1, 1):
    mir = s < 0
    # the cockpit's flank behind the glass, the breach deck's sides (the tunnel's, the wider space's), the stairs' section: plated, seams between
    panels(B, 'hull', 'x', s * (fw + W + O) - (0.04 if mir else 0), 0.04, 0.02, CC + 0.2, zg1, zr, 2, 2)
    # the crew deck's flank, plated; armour sloped from the keel to a chine; a line of her colour down it
    B.loft('armor', [(zr - 0.2, [(fw + W, 0.04), (fw + W + 0.2, 0.04), (X + 0.2, FM - 0.3), (X, FM)]), (zr + 1.2, [(X - 0.4, 0.04), (X + 0.2, 0.04), (X + 0.75, FM - 0.25), (X, FM + 0.1)]),
                     (z1 - 0.8, [(X - 0.4, 0.04), (X + 0.25, 0.04), (X + 0.85, FM - 0.25), (X, FM + 0.1)]), (z1 + 0.6, [(X - 0.4, 0.3), (X, 0.3), (X + 0.4, FM - 0.2), (X, FM)])], mir)
    # the wing: the flank pinches out into it, swept, thin at the pod; a lit leading edge, a light at its tip
    px, py, pz0, pz1 = X + 1.6, FM + 0.2, z1 - 3.0, z1 + 1.7
    B.loft('hull', [(zr + 0.3, [(X, FM - 0.1), (X + 0.25, FM + 0.12), (X + 0.32, FM + 0.24), (X + 0.32, FM + 0.32), (X + 0.25, FM + 0.45), (X, CM)]),
                    (pz0 - 0.3, [(X, 0.35), (px - 0.5, py - 0.15), (px, py - 0.08), (px, py + 0.1), (px - 0.5, py + 0.2), (X, CM + 0.1)]),
                    (pz1 - 0.6, [(X, 0.4), (px - 0.5, py - 0.15), (px, py - 0.08), (px, py + 0.1), (px - 0.5, py + 0.2), (X, CM)]),
                    (z1 + 0.35, [(X, 0.7), (px - 0.7, py - 0.1), (px - 0.25, py - 0.05), (px - 0.25, py + 0.06), (px - 0.7, py + 0.12), (X, CM - 0.3)])], mir)
    B.beam('accent', (s * (X + 0.3), FM + 0.28, zr + 0.35), (s * (px - 0.1), py + 0.02, pz0 - 0.35), 0.05)
    # the engine: a nacelle, faceted, a lip round its intake, a spike in it, a nozzle aft, a ring of her colour round it
    secs = [(pz0 - 0.15, 0.5), (pz0, 0.66), (pz0 + 0.9, 0.78), (pz1 - 1.0, 0.8), (pz1 - 0.2, 0.7), (pz1, 0.62)]
    hexr = lambda r: [(px + math.cos(k * math.pi / 5 + math.pi / 10) * r, py + math.sin(k * math.pi / 5 + math.pi / 10) * r * 1.05) for k in range(10)]
    B.loft('armor', [(z, hexr(r)) for z, r in secs], mir, caps=False)
    B.cyl('accent', (s * px, py, pz0 - 0.2), (s * px, py, pz0 + 0.05), 0.6, 10, 0.68, smooth=False, caps=False)
    B.cyl('dark', (s * px, py, pz0 + 0.02), (s * px, py, pz0 + 0.04), 0.58, 10, smooth=False)
    B.cyl('dark', (s * px, py, pz0 + 0.1), (s * px, py, pz0 - 1.4), 0.18, 10, 0.02, smooth=False)  # (the spike)
    B.cyl('dark', (s * px, py, pz1 - 0.05), (s * px, py, pz1 + 0.35), 0.6, 10, 0.5, smooth=False, caps=False)
    B.cyl('dark', (s * px, py, pz1 + 0.2), (s * px, py, pz1 + 0.22), 0.5, 10, smooth=False)
    B.cyl('accent', (s * px, py, pz1 + 0.3), (s * px, py, pz1 + 0.4), 0.52, 10, 0.52, smooth=False, caps=False)
    empty('thrust_' + ('L' if mir else 'R'), (s * px, py, pz1 + 0.42))
    B.box('strip' if not mir else 'strip', s * (px - 0.05), py + 0.7, pz1 - 0.6, s * (px + 0.05), py + 0.76, pz1 - 0.4)
    # a canted fin off the roof's edge, a running light at its tip; thruster blocks at her corners
    B.loft('armor', [(z1 - 2.4, [(X - 0.7, SKIN_TOP - 0.05), (X - 0.5, SKIN_TOP - 0.05), (X - 0.6, SKIN_TOP + 0.05)]), (z1 + 0.6, [(X - 0.7, SKIN_TOP - 0.1), (X - 0.5, SKIN_TOP - 0.1), (X + 0.1, SKIN_TOP + 1.2)])], mir)
    for zz, yy in ((zr + 0.2, CM - 0.1), (z1 - 0.2, CM - 0.1), (zc + 0.6, CB - 0.2)):
        xx = s * ((X + 0.2 + O) if zz > zr else (tw + W + 0.3 + O))
        B.box('dark', xx, yy - 0.18, zz - 0.18, xx + s * 0.12, yy + 0.18, zz + 0.18, 0.02)
        for e in (-1, 1): B.box('armor', xx + s * 0.12, yy + e * 0.08 - 0.03, zz - 0.04, xx + s * 0.16, yy + e * 0.08 + 0.03, zz + 0.04)
    # the hardpoint: a raised octagonal plinth on the roof's shoulder
    hx, hz = s * (hw - 0.7), zr + 1.6
    B.cyl('armor', (hx, SKIN_TOP - 0.05, hz), (hx, SKIN_TOP + 0.12, hz), 0.55, 8, 0.48, smooth=False)
    empty('hp_' + ('0' if mir else '1'), (hx, SKIN_TOP + 0.12, hz))
B.box('glow' , -0.03, 0, 0, 0.03, 0.01, 0.01) if False else None
# lights at the fins' tips (port red, starboard green)
B.box('hot', -(X + 0.15), SKIN_TOP + 1.12, z1 + 0.5, -(X + 0.05), SKIN_TOP + 1.22, z1 + 0.6)
B.box('glow', X + 0.05, SKIN_TOP + 1.12, z1 + 0.5, X + 0.15, SKIN_TOP + 1.22, z1 + 0.6)
# the roofs: the breach deck's, plated; a spine down the crew deck's, an antenna and a sensor dome on it
B.cyl('dark', (0.2, SKIN_TOP - 0.05, z1 - 1.6), (0.2, SKIN_TOP + 1.0, z1 - 1.6), 0.025, 6, smooth=False); B.cyl('dark', (0.2, SKIN_TOP + 1.0, z1 - 1.6), (0.2, SKIN_TOP + 1.02, z1 - 1.6), 0.12, 8, smooth=False)
B.cyl('dark', (-0.2, SKIN_TOP - 0.05, z1 - 2.6), (-0.2, SKIN_TOP + 0.18, z1 - 2.6), 0.3, 12, 0.22)
B.cyl('glass', (0, HEAD_TOP - 0.05, zt + 0.9), (0, HEAD_TOP + 0.16, zt + 0.9), 0.26, 12, 0.12)  # (a sensor blister over the breach deck)
# her belly: plated, vents aft
panels(B, 'dark', 'y', -0.04, 0.04, -fw - W, fw + W, zf, zr, 1, 3)
panels(B, 'dark', 'y', -0.04, 0.04, -X, X, zr, z1 + 0.1, 3, 3)
for k in range(6): B.box('armor', -0.9, -0.06, z1 - 2.0 + k * 0.22, 0.9, -0.04, z1 - 1.92 + k * 0.22)
# the collar: an eight-sided frame round the breaching door, clamp teeth on it, a lit ring inside
cy = FB + (CB - FB) / 2 + 0.08
oct_ = lambda r, sy: [(math.cos(k * math.pi / 4 + math.pi / 8) * r * 0.95, cy + math.sin(k * math.pi / 4 + math.pi / 8) * r * sy) for k in range(8)]
for (ra, za, mt, t) in ((1.28, zc - 0.1, 'accent', 0.2), (1.12, zc - 0.2, 'hot', 0.06)):
    pts = oct_(ra, 0.92)
    for k in range(8): B.beam(mt, (pts[k][0], pts[k][1], za), (pts[(k + 1) % 8][0], pts[(k + 1) % 8][1], za), t, 0.16 if t > 0.1 else 0.04)
for (x_, y_) in oct_(1.32, 0.95): B.box('dark', x_ - 0.07, y_ - 0.07, zc - 0.32, x_ + 0.07, y_ + 0.07, zc - 0.05, 0.015)
B.obj()

# ================================================================ what moves
# the breaching door's leaves (each about the door's middle: the game slides them apart), the ramp (hinged at the crew deck's floor)
for nm, s in (('nose_L', -1), ('nose_R', 1)):
    N = Mesh(nm); hgt = CB - FB
    N.box('armor', s * 0.005, FB, zc - W / 2 - 0.08, s * tw, CB, zc - W / 2 + 0.08, 0.02)
    N.box('hot', s * 0.01, FB, zc - W / 2 - 0.09, s * 0.07, CB, zc - W / 2 + 0.09)
    for yy in (FB + 0.6, FB + 1.5): N.box('dark', s * 0.15, yy, zc - W / 2 - 0.1, s * (tw - 0.1), yy + 0.12, zc - W / 2 - 0.08)
    N.obj((0, 0, zc - W / 2))
R = Mesh('ramp'); rh = CM - FM
R.box('armor', -hw, FM, z1 + W / 2 - 0.07, hw, CM, z1 + W / 2 + 0.07, 0.02)
for k in range(7): R.box('dark', -hw + 0.3, FM + 0.25 + k * 0.3, z1 + W / 2 - 0.1, hw - 0.3, FM + 0.3 + k * 0.3, z1 + W / 2 - 0.07)
for ry in (0.5, 1.2, 1.9): R.box('hot', -hw + 0.3, FM + ry, z1 + W / 2 + 0.07, hw - 0.3, FM + ry + 0.05, z1 + W / 2 + 0.09)
R.obj((0, FM, z1 + W / 2))
# her lamps
for i, p in enumerate(((0, CC - 0.3, zc + 2.2), (0, CB - 0.3, zw), (0, CM - 0.35, (zr + z1) / 2))): empty('light_%d' % i, p)

# ---- out
for o in bpy.data.objects: o.select_set(True)
out = os.path.join(HERE, SID + '.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_animations=False, export_extras=False)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('ship %s: %d triangles, %d objects -> %s' % (SID, tris, len(bpy.data.objects), out))
