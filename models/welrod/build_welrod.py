# The Welrod Mk II (integrally suppressed .32 ACP bolt-action pistol, 1943), in Blender.
#   Blender: exec(open(r'<repo>/models/welrod/build_welrod.py').read(), {'GUN_DIR': r'<repo>/models/welrod'})
#   or:      blender -b -P models/welrod/build_welrod.py
# Proportions measured off a side-on photo (muzzle left): "Welrod Mk II (6825681888).jpg", Wikimedia Commons, CC BY 2.0 (reference only:
# nothing traced into the repo). In the 800 px view of it the 32 mm tube is 69 px, so 0.4638 mm a pixel; f = (746 - x) px forward of the
# bolt knob's back, up = (253 - y) px over the bore. That gives 330 mm overall (published 310 to 370 mm), the receiver 29 mm across.
# Published: .32 ACP, 83 mm barrel inside the tube, 8 rounds in the magazine that is the grip; a rotating bolt worked by the knurled rear knob.
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the bolt knob's back face on the bore line.
# Parts (the authored-pistol interface, TASK 15; no slide): base = the receiver tube, the frame plate under it, trigger, wire trigger guard, grip safety; barrel = the suppressor tube (the front
# section: the integral suppressor is the factory barrel, with the front sight); optic = the rear sight; part_bolt = the knurled knob (twist and pull back to load); part_mag = the grip (the magazine:
# its sheet-metal top and the rubber cover over it, all of it drops out).
import bpy, json, math, os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
exec(open(os.path.join(REPO, 'models', 'blender_kit.py')).read(), globals())
ID = 'welrod'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
S = 0.4638
def F(x): return (746 - x) * S * mm
def U(y): return (253 - y) * S * mm
def PL(pts): return [(F(x), U(y)) for x, y in pts]

coll, root = kit_collection(ID)
K = Kit(coll, root)
RR, RM, RK = 14.6 * mm, 16.0 * mm, 17.6 * mm          # the receiver's radius, the suppressor tube's, the knob's
FW = F(515)                                           # where the receiver ends and the suppressor section begins (the waist)

# ---- RECEIVER (base): the rear tube, from the knob to the waist, a scallop dipping into it at the front top ----
rc = K.tmp(lathe([(F(718) - 1 * mm, RR), (FW + 1 * mm, RR)], 32))
cut(rc, xform(cyl(0.02, -0.03, 0.03, 'x', (0, 0), 32), Matrix.Translation((0, F(528), U(222) + 0.02 - 2.2 * mm))))   # (the scallop)
smooth(rc); K.adopt(rc, 'base', 'park')
# the frame plate under the tube (the trigger housing): two screws each side
fp = K.tmp(prism(PL([(528, 262), (620, 262), (620, 292), (528, 292)]), 'x', -10 * mm, 10 * mm))
bevel(fp, 0.8 * mm, 2); smooth(fp); K.adopt(fp, 'base', 'park')
for x in (543, 598):
    for s in (-1, 1):
        o = K.obj(cyl(2.2 * mm, s * 9.5 * mm, s * 10.9 * mm, 'x', (F(x), U(270)), 14), 'base', 'blued'); smooth(o)
        cut(o, box(s * 10.4 * mm, s * 11.5 * mm, F(x) - 0.4 * mm, F(x) + 0.4 * mm, U(270) - 3 * mm, U(270) + 3 * mm))
# the trigger: a short curved blade under the plate's front
o = K.obj(prism(PL([(512, 291), (524, 291), (527, 318), (520, 322), (513, 305)]), 'x', -2.5 * mm, 2.5 * mm), 'base', 'blued'); bevel(o, 0.5 * mm, 1); smooth(o)
# the wire trigger guard: forward from the plate, then a hook down
WR = 1.3 * mm
o = K.obj(cyl(WR, F(528), F(455), 'y', (0, U(296)), 10), 'base', 'steel'); smooth(o)
o = K.obj(cyl(WR, U(296) + WR, U(328), 'z', (0, F(455)), 10), 'base', 'steel'); smooth(o)
# the rear wire (the bolt's catch spring) along the tube's underside behind the plate
o = K.obj(cyl(0.9 * mm, F(662), F(615), 'y', (6 * mm, U(292)), 8), 'base', 'steel'); smooth(o)
# the grip safety: a plate at the grip's back, angled with it
o = K.obj(prism(PL([(604, 292), (614, 292), (628, 338), (620, 342)]), 'x', -5 * mm, 5 * mm), 'base', 'blued'); bevel(o, 0.5 * mm, 1); smooth(o)

# ---- SUPPRESSOR = the factory BARREL (integral: no muzzle thread): the front tube from the waist to fx (its front, in pixels), its end
# cap chamfered with a seam behind it, the bore's exit; the front sight blade on it near the front (it goes with the tube) ----
def suppressor(Kx, fx):
    sp = Kx.tmp(lathe([(FW - 1.5 * mm, RR), (FW + 2.5 * mm, RM), (F(fx + 2), RM), (F(fx), RM - 1.2 * mm)], 32))
    cut(sp, cyl(3.4 * mm, F(fx + 10), F(fx) + 0.002, 'y', (0, 0), 16))
    ring = lathe([(F(fx + 14) - 0.4 * mm, RM + 1 * mm), (F(fx + 14) + 0.4 * mm, RM + 1 * mm)], 32)
    g = Kx.tmp(ring); cut(g, lathe([(F(fx + 14) - 1 * mm, RM - 0.35 * mm), (F(fx + 14) + 1 * mm, RM - 0.35 * mm)], 32))
    cut(sp, g.data.copy()); bpy.data.objects.remove(g, do_unlink=True)                     # (the end cap's seam: a groove 0.35 mm deep)
    smooth(sp); Kx.adopt(sp, 'barrel', 'park')
    o = Kx.obj(prism(PL([(fx + 49, 219), (fx + 78, 219), (fx + 75, 208), (fx + 53, 208)]), 'x', -1.5 * mm, 1.5 * mm), 'barrel', 'park'); bevel(o, 0.3 * mm, 1); smooth(o)
    return F(fx)
MUZ = suppressor(K, 35)

# ---- SIGHTS (optic): the notched blade on the receiver (the front blade is on the suppressor) ----
rs = K.tmp(prism(PL([(650, 226), (675, 226), (672, 207), (655, 207)]), 'x', -4 * mm, 4 * mm))
cut(rs, box(-1.1 * mm, 1.1 * mm, F(690), F(640), U(211), U(200)))
bevel(rs, 0.3 * mm, 1); smooth(rs); K.adopt(rs, 'optic', 'park')

# ---- BOLT KNOB (part_bolt): the knurled cap (chequered), turned and pulled back to work the bolt ----
pb = K.part('bolt', (0, F(732), 0))
kn = K.tmp(lathe([(0.0, RK - 1.2 * mm), (1.2 * mm, RK), (F(722), RK), (F(719), RK - 1.5 * mm), (F(717), RR - 0.5 * mm)], 40))
smooth(kn); K.adopt(kn, 'base', 'chequer', pb)

# ---- MAGAZINE = GRIP (part_mag): the sheet-metal top up into the frame, the rubber cover (ext px longer down its slope when extended);
# the pivot at its top front (magAt) ----
MAG_TOP = (F(531), U(276))
G_SLOPE = (646 - 622) / (462 - 340)
def magazine(Kx, ext=0):
    pm = Kx.part('mag', (0, MAG_TOP[0], MAG_TOP[1]))
    o = Kx.obj(prism(PL([(531, 276), (604, 276), (612, 342), (538, 342)]), 'x', -9 * mm, 9 * mm), 'mag', 'park', pm); bevel(o, 0.6 * mm, 1); smooth(o)
    dx = ext * G_SLOPE
    low = [(646 + dx, 462 + ext), (644 + dx, 482 + ext), (634 + dx, 492 + ext), (580 + dx, 494 + ext), (566 + dx, 486 + ext)]
    gr = Kx.tmp(prism(PL([(538, 340), (622, 340)] + low), 'x', -13.5 * mm, 13.5 * mm))
    bevel(gr, 4 * mm, 3, 30); smooth(gr); Kx.adopt(gr, 'mag', 'rubber', pm)
magazine(K)

# ---- the gun's info and the authored-pistol anchors (TASK 15's names) ----
SY = U(209)
info = {
    'sy': round(SY, 4), 'fSight': round(F(662), 4), 'relief': 0.36, 'pistol': True,
    'muzzles': [[round(MUZ, 4), 0, 0]],
    'grip': [round(F(592), 4), round(U(400), 4), 0], 'support': [round(F(590), 4), round(U(420), 4), -0.022],
    'anim': {'bolt': 'part_bolt', 'mag': 'part_mag'},
    'magAt': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4)],
}
anchors = {
    'mount_barrel': [round(FW, 4), 0, 0],                                       # the waist: the suppressor (the factory barrel) begins
    'mount_mag': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4), 0],               # the top of the magazine (the grip); no slide, no grip seat
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)

# ---- VARIANTS (game options, not historical ones): their own collections and files, same frame ----
VARS = []
c_, r_, K2 = kit_variant(ID, 'barrel_short', 'barrel', {})
MUZ2 = suppressor(K2, 185)
r_['variant_json'] = json.dumps({'gun': ID, 'slot': 'barrel', 'of': 'factory', 'info': {'muzzles': [[round(MUZ2, 4), 0, 0]]},
                                 'note': 'a cut-down suppressor tube: 70 mm shorter (260 mm overall), handier, louder'})
VARS.append(('barrel_short', c_))
c_, r_, K3 = kit_variant(ID, 'mag_ext', 'mag', {'note': 'extended magazine: the grip 30 mm longer, +4 rounds (12)', 'cap': 12})
magazine(K3, 65)
VARS.append(('mag_ext', c_))

meshes = [o for o in coll.all_objects if o.type == 'MESH']
vglb = {n: (export_glb(c, os.path.join(HERE, n + '.glb')) if EXPORT else None, tris_of(c.all_objects)) for n, c in VARS}
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in b] for b in bb], 'info': info,
          'glb': save_and_export(coll, root, HERE, ID, EXPORT, also=tuple(c for _, c in VARS)), 'variants': vglb, 'short_muzzle_mm': round(MUZ2 * 1000, 1)}
