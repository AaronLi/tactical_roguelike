# The Halcyon Ember mini red dot (an RMR-class open reflex), modelled in Blender: the remaster of the recipe's S.minidot
# (tools/models/recipes.ts). One model for both of its catalogue entries: on a pistol slide's optic cut, and on a riser on a rifle rail
# (the riser is the gun's mount piece, optic@mount, never part of this model).
#   Blender: exec(open(r'<repo>/models/parts/optic/ember/build_ember.py').read(), {'PART_DIR': r'<repo>/models/parts/optic/ember'})
#   or:      blender -b -P models/parts/optic/ember/build_ember.py
# Its config is model.pending.json, NOT model.json yet, on purpose: a model.json here is picked up as a NEW catalogue part (op.auth.ember),
# and this model is to REPLACE the model of two existing entries (Halcyon Ember pistol dot, op:pso; Halcyon Ember open reflex on a riser,
# op:pic), which the authored-part path cannot do yet. Rename it when it can. check:models passes with it as model.json.
# Frame (docs/models.md "Authored parts"): Blender X = right, Y = forward, Z = up, metres; the ORIGIN is the mount surface (the top of the slide
# cut or of the riser) at the optic's mount point, centred. Nothing below Z = 0. Sight data (sy, window...) is in model.json.
#
# Sizes (the minidot's, kept so it fits every slide cut and riser it fits today):
#   footprint 24 x 32 mm, centred on the mount point (forward -16 to +16 mm); nothing is wider or longer (the shapes below are drawn from
#   the footprint's front edge at forward 0 and moved forward 16 mm at the end);
#   sight line 16 mm over the mount surface; window 20 x 16 mm centred on it; the hood's top 27 mm.
# Shape (an RMR-class sight): a low base plate; the emitter housing at the rear (the LED looks forward and low at the lens); the windage screw
# on its right side, the elevation screw on its top, a brightness button each side; the hood: a protective loop round the lens with sloped
# shoulders, leaning back; the lens a tilted plate in it; two mounting screws on the ledge between hood and housing.
import bpy, bmesh, math, os
from mathutils import Matrix, Vector
HERE = globals().get('PART_DIR') or os.path.dirname(os.path.abspath(__file__))
ID = os.path.basename(HERE)
EXPORT = os.environ.get('EMBER_EXPORT', '1') == '1'
mm = 0.001

# ---- scene: the part's own collection, rebuilt every run ----
coll = bpy.data.collections.get(ID)
if coll:
    for o in list(coll.all_objects): bpy.data.objects.remove(o, do_unlink=True)
else:
    coll = bpy.data.collections.new(ID); bpy.context.scene.collection.children.link(coll)
for m in list(bpy.data.meshes):
    if m.users == 0: bpy.data.meshes.remove(m)
root = bpy.data.objects.new(ID, None); coll.objects.link(root)

def mat(n):
    return bpy.data.materials.get(n) or bpy.data.materials.new(n)
COL = {'black': (0.03, 0.03, 0.035, 1), 'rubber': (0.015, 0.015, 0.015, 1), 'steel': (0.55, 0.55, 0.57, 1), 'glass': (0.05, 0.08, 0.1, 1),
       'reflexLens': (0.55, 0.75, 0.6, 0.35)}
N = [0]
def obj(me, m):
    N[0] += 1
    o = bpy.data.objects.new('optic_%d' % N[0], me); coll.objects.link(o); o.parent = root
    o['slot'] = 'optic'; me.materials.append(mat(m)); mat(m).diffuse_color = COL.get(m, (0.5, 0.5, 0.5, 1))
    return o

def prism(pts, axis, a0, a1):
    """A prism: the polygon pts (2D, anticlockwise or not) in the plane across `axis`, from a0 to a1 along it.
    axis 'x': pts are (forward, up); 'y': (right, up); 'z': (right, forward)."""
    bm = bmesh.new()
    def P(u, v, a):
        return {'x': (a, u, v), 'y': (u, a, v), 'z': (u, v, a)}[axis]
    lo = [bm.verts.new(P(u, v, a0)) for u, v in pts]; hi = [bm.verts.new(P(u, v, a1)) for u, v in pts]
    n = len(pts)
    bm.faces.new(lo); bm.faces.new(list(reversed(hi)))
    for i in range(n): bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp'); bm.to_mesh(me); bm.free(); return me

def box(x0, x1, y0, y1, z0, z1):
    return prism([(y0, z0), (y1, z0), (y1, z1), (y0, z1)], 'x', x0, x1)

def cyl(r, a0, a1, axis, c, seg=20):
    """A cylinder of radius r along `axis` from a0 to a1, its axis through c (the two other coordinates)."""
    pts = [(c[0] + r * math.cos(2 * math.pi * i / seg), c[1] + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    return prism(pts, axis, a0, a1)

def rounded(cx, cy, hw, hh, r, seg=4):
    """A rounded rectangle's outline (centre, half sizes, corner radius)."""
    out = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (hw - r), cy + qy * (hh - r)
        for j in range(seg + 1):
            a = math.radians(a0 + 90 * j / seg); out.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return out

def cut(o, me):
    """o minus the mesh me (a closed cutter), exact boolean, applied."""
    c = bpy.data.objects.new('cutter', me); coll.objects.link(c)
    md = o.modifiers.new('cut', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = c; md.solver = 'EXACT'
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me2 = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.remove(md); old = o.data; o.data = me2; me2.materials.clear(); me2.materials.append(old.materials[0])
    bpy.data.objects.remove(c, do_unlink=True); bpy.data.meshes.remove(me); bpy.data.meshes.remove(old)

def bevel(o, w, seg=2, angle=40):
    md = o.modifiers.new('bv', 'BEVEL'); md.width = w; md.segments = seg; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(angle)
    md.use_clamp_overlap = True; md.harden_normals = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me2 = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.remove(md); old = o.data; o.data = me2; me2.materials.clear(); me2.materials.append(old.materials[0]); bpy.data.meshes.remove(old)

def smooth(o, deg=35):
    """Flat faces stay flat, rounded ones shade smooth: split normals by angle (the glTF export writes them)."""
    me = o.data
    for p in me.polygons: p.use_smooth = True
    try: me.set_sharp_from_angle(angle=math.radians(deg))
    except AttributeError: pass

W = 12 * mm                      # half the footprint's width
R0, F0 = -32 * mm, 0.0           # the footprint's rear and front (forward)
SY = 16 * mm                     # the sight line over the mount surface
LEDGE = 6.5 * mm                 # the base's top in front of the housing (the lens and hood stand on it)
HF, HT = -21 * mm, 14 * mm       # the emitter housing's front face and top
WIN_W, WIN_H = 20 * mm, 16 * mm  # the window (the lens's clear opening), centred on the sight line

# ---- base + emitter housing: one side profile (forward, up), across the full width, its edges rounded ----
prof = [(R0, 0), (F0, 0), (F0, 3.2 * mm), (F0 - 1.2 * mm, LEDGE - 0.6 * mm), (F0 - 2.5 * mm, LEDGE),
        (HF + 1.5 * mm, LEDGE), (HF, 9 * mm), (HF - 1.2 * mm, HT), (R0 + 3.5 * mm, HT), (R0 + 0.8 * mm, HT - 2.2 * mm), (R0, 7 * mm)]
body = obj(prism(prof, 'x', -W, W), 'black')
# the housing is 0.8 mm narrower than the base (a step along each side, where the buttons sit), and the rear sight notch on its top
cut(body, box(-W - 1 * mm, -W + 0.8 * mm, R0 - 1 * mm, HF + 0.3 * mm, 9.6 * mm, HT + 1 * mm))
cut(body, box(W - 0.8 * mm, W + 1 * mm, R0 - 1 * mm, HF + 0.3 * mm, 9.6 * mm, HT + 1 * mm))
cut(body, box(-1.2 * mm, 1.2 * mm, R0 - 1 * mm, R0 + 4.5 * mm, HT - 1.4 * mm, HT + 1 * mm))
# the emitter's port: a shallow round recess in the housing's front face, on the centreline, below the sight line
cut(body, cyl(2.0 * mm, HF - 1.5 * mm, HF + 0.8 * mm, 'y', (0, 10.6 * mm), 20))
bevel(body, 0.6 * mm, 2); smooth(body)
# the LED's window in it
o = obj(cyl(1.3 * mm, HF - 1.0 * mm, HF - 0.6 * mm, 'y', (0, 10.6 * mm), 16), 'glass'); smooth(o)

# ---- the hood: a loop round the lens, sloped shoulders, a flat top, leaning back 12 degrees; on the ledge ----
HD = 9 * mm                      # its depth (forward) at the foot; the faces lean back by different amounts, so it tapers to 4.5 mm at the top
hb = LEDGE - 0.5 * mm            # its foot (into the ledge)
# (outer, anticlockwise from the foot's left: straight sides to 18.5 mm, a shoulder in to 10.5 mm half-width, rounded corners to a flat top at 27 mm)
TR, TC = 2.4 * mm, 27 * mm - 2.4 * mm
arc = lambda cx, a0, a1: [(cx + TR * math.cos(math.radians(a0 + (a1 - a0) * j / 4)), TC + TR * math.sin(math.radians(a0 + (a1 - a0) * j / 4))) for j in range(5)]
outer = [(-W, hb), (W, hb), (W, 18.5 * mm), (10.8 * mm, 23.6 * mm)] + arc(10.5 * mm - TR, 0, 90) + arc(-10.5 * mm + TR, 90, 180) + [(-10.8 * mm, 23.6 * mm), (-W, 18.5 * mm)]
hood = obj(prism(outer, 'y', -HD, 0.0), 'black')
cut(hood, prism(rounded(0, SY, WIN_W / 2, WIN_H / 2, 1.6 * mm, 4), 'y', -HD - 1 * mm, 1 * mm))
LEAN_F, LEAN_R, LEAN = math.radians(18), math.radians(6), math.radians(12)   # the front face's lean, the rear face's, the lens's
hood.data.transform(Matrix.Translation((0, -1.2 * mm, 0)))                    # its front just behind the footprint's front
for v in hood.data.vertices:                                                   # lean back: the higher, the further back
    v.co.y -= max(0.0, v.co.z - LEDGE) * math.tan(LEAN_F if v.co.y > -1.2 * mm - HD / 2 else LEAN_R)
bevel(hood, 0.5 * mm, 2); smooth(hood)

# ---- the lens: a plate filling the window, leaning 12 degrees, in the middle of the hood's depth (its centre 7 mm behind the front edge at the sight line) ----
LF = -7.0 * mm + (SY - LEDGE) * math.tan(LEAN)   # the lens's forward position at the ledge's height (it leans back from there)
ln = box(-WIN_W / 2 - 0.4 * mm, WIN_W / 2 + 0.4 * mm, LF - 0.6 * mm, LF + 0.6 * mm, SY - WIN_H / 2 - 0.4 * mm, SY + WIN_H / 2 + 0.4 * mm)
lens = obj(ln, 'reflexLens')
for v in lens.data.vertices: v.co.y -= max(0.0, v.co.z - LEDGE) * math.tan(LEAN)

# ---- the adjusters: windage on the housing's right side, elevation on its top; slotted steel screw heads in a recess ----
AF, WF, WU = -26.5 * mm, -29.0 * mm, 11.8 * mm   # the elevation screw's forward position; the windage screw's forward position and height
el = obj(cyl(2.4 * mm, HT - 0.9 * mm, HT + 0.25 * mm, 'z', (0, AF), 24), 'steel')
cut(el, box(-2.8 * mm, 2.8 * mm, AF - 0.35 * mm, AF + 0.35 * mm, HT - 0.3 * mm, HT + 1 * mm)); smooth(el)
wd = obj(cyl(1.9 * mm, W - 1.6 * mm, W - 0.3 * mm, 'x', (WF, WU), 24), 'steel')               # (on the step: the housing's side is at W - 0.8 mm)
cut(wd, box(W - 0.6 * mm, W, WF - 2.3 * mm, WF + 2.3 * mm, WU - 0.3 * mm, WU + 0.3 * mm)); smooth(wd)

# ---- brightness buttons, one each side of the housing, on the step ahead of the windage screw ----
for s in (-1, 1):
    b = obj(prism(rounded(-24.0 * mm, WU, 1.7 * mm, 1.5 * mm, 0.8 * mm, 3), 'x', s * (W - 1.2 * mm), s * (W - 0.15 * mm)), 'rubber')
    bevel(b, 0.25 * mm, 1); smooth(b)

# ---- the two mounting screws on the ledge between the hood and the housing ----
for s in (-1, 1):
    sc = obj(cyl(1.5 * mm, LEDGE - 0.3 * mm, LEDGE + 0.5 * mm, 'z', (s * 6.5 * mm, -14.5 * mm), 16), 'steel')
    cut(sc, cyl(0.55 * mm, LEDGE + 0.1 * mm, LEDGE + 1 * mm, 'z', (s * 6.5 * mm, -14.5 * mm), 6)); smooth(sc)

# ---- the mount point is the footprint's middle (as the minidot's): everything above was drawn from its front edge, so move it forward 16 mm ----
for o in root.children: o.data.transform(Matrix.Translation((0, 16 * mm, 0)))

# ---- check and export ----
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in root.children)
lo = min((o.matrix_world @ v.co).z for o in root.children for v in o.data.vertices)
bb = [[min((o.matrix_world @ v.co)[a] for o in root.children for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in root.children for v in o.data.vertices) for a in range(3)]]
out = {'meshes': len(root.children), 'tris': tris, 'lowest': lo, 'bounds_mm': [[round(x * 1000, 2) for x in b] for b in bb]}
if EXPORT:
    # ember.blend holds the sight only. A session holding nothing else is saved whole; one with other models in it (a FAL built in the same
    # Blender) writes just this collection (kept by a fake user: File > Append > Collection > ember, or the Blender File view).
    # (Never bpy.data.libraries.write a SCENE: Blender 5.2.3 crashes in BKE_view_layer_copy_data.)
    others = [c.name for c in bpy.data.collections if c != coll and (c.objects or c.children)] + [s.name for s in bpy.data.scenes if s != bpy.context.scene]
    if not others: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, ID + '.blend'), copy=True)
    else:
        bpy.data.libraries.write(os.path.join(HERE, ID + '.blend'), {coll}, fake_user=True, compress=True)
        print(ID + '.blend: the collection only (the session also holds %s)' % ', '.join(others))
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + list(root.children): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, ID + '.glb'), export_format='GLB', use_selection=True, export_extras=True, export_yup=True,
                              export_apply=True, export_texcoords=False, export_normals=True, export_materials='EXPORT', export_cameras=False,
                              export_lights=False, export_animations=False)
    out['glb'] = os.path.getsize(os.path.join(HERE, ID + '.glb'))
result = out
