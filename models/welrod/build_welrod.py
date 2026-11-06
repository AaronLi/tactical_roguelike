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
CH_F = F(575)                                         # the chamber: the case head of a chambered round (the bolt face, closed)
RB = 12.0 * mm                                        # the bolt's radius (its bore in the receiver: RB + 0.3 mm)

# ---- RECEIVER (base): the rear tube, from the knob to the waist, a scallop dipping into it at the front top ----
rc = K.tmp(lathe([(F(718) - 1 * mm, RR), (FW + 1 * mm, RR)], 32))
cut(rc, xform(cyl(0.02, -0.03, 0.03, 'x', (0, 0), 32), Matrix.Translation((0, F(528), U(222) + 0.02 - 2.2 * mm))))   # (the scallop)
cut(rc, cyl(RB + 0.3 * mm, F(718) - 3 * mm, CH_F, 'y', (0, 0), 32))                                   # the bolt's bore (open at the rear)
cut(rc, cyl(4.7 * mm, CH_F - 0.5 * mm, FW + 2 * mm, 'y', (0, 0), 20))                                  # the chamber
cut(rc, prism(rounded((CH_F - 4 * mm + FW - 2 * mm) / 2, 0.0, (FW - 2 * mm - CH_F + 4 * mm) / 2, 5.5 * mm, 2 * mm, 3), 'x', 0.0, 0.03))  # the port (right)
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
def optic_cut(Kx, fc, top):
    # a saddle pad on a tube of radius `top`: 26 mm wide, 48 mm long; its pocket (the pistol-dot footprint) 1.5 mm deep, two screw holes, two
    # recoil bosses; returns the pocket floor's centre (mount_optic: where a pistol dot sits)
    hl, flo = 24 * mm, top + 1.0 * mm
    pd = Kx.tmp(box(-13 * mm, 13 * mm, fc - hl, fc + hl, top - 8 * mm, flo + 1.5 * mm))
    cut(pd, box(-11.5 * mm, 11.5 * mm, fc - hl + 3 * mm, fc + hl - 3 * mm, flo, flo + 0.01))
    for df in (-13 * mm, 13 * mm): cut(pd, cyl(1.5 * mm, flo - 3 * mm, flo + 0.001, 'z', (0, fc + df), 12))
    bevel(pd, 0.5 * mm, 1); smooth(pd); Kx.adopt(pd, 'barrel', 'park')
    for df in (-6 * mm, 6 * mm): o = Kx.obj(cyl(2.0 * mm, flo - 0.2 * mm, flo + 1.2 * mm, 'z', (0, fc + df), 12), 'barrel', 'park'); smooth(o)
    return [round(fc, 4), round(flo, 4), 0]
def suppressor(Kx, fx, optic=False):
    sp = Kx.tmp(lathe([(FW - 1.5 * mm, RR), (FW + 2.5 * mm, RM), (F(fx + 2), RM), (F(fx), RM - 1.2 * mm)], 32))
    cut(sp, cyl(3.4 * mm, F(fx + 10), F(fx) + 0.002, 'y', (0, 0), 16))
    ring = lathe([(F(fx + 14) - 0.4 * mm, RM + 1 * mm), (F(fx + 14) + 0.4 * mm, RM + 1 * mm)], 32)
    g = Kx.tmp(ring); cut(g, lathe([(F(fx + 14) - 1 * mm, RM - 0.35 * mm), (F(fx + 14) + 1 * mm, RM - 0.35 * mm)], 32))
    cut(sp, g.data.copy()); bpy.data.objects.remove(g, do_unlink=True)                     # (the end cap's seam: a groove 0.35 mm deep)
    smooth(sp); Kx.adopt(sp, 'barrel', 'park')
    if optic:   # a pistol optic cut (the footprint the PPK's pistol dots take) in a pad on the tube's top, just ahead of the waist
        OC = optic_cut(Kx, FW + 30 * mm, RM)
    o = Kx.obj(prism(PL([(fx + 49, 219), (fx + 78, 219), (fx + 75, 208), (fx + 53, 208)]), 'x', -1.5 * mm, 1.5 * mm), 'barrel', 'park'); bevel(o, 0.3 * mm, 1); smooth(o)
    return (F(fx), OC) if optic else F(fx)
MUZ = suppressor(K, 35)
def bare_barrel(Kx, fx):
    # unsuppressed: a nose cap closing the receiver at the waist, the bare barrel out of it, a front sight post on a collar at the muzzle
    o = Kx.obj(lathe([(FW - 1.5 * mm, RR), (FW + 2.5 * mm, RR), (FW + 8 * mm, 8.5 * mm)], 32), 'barrel', 'park'); smooth(o)
    br = Kx.tmp(lathe([(FW + 6 * mm, 5.6 * mm), (F(fx + 2), 5.6 * mm), (F(fx), 4.8 * mm)], 20))
    cut(br, cyl(3.4 * mm, F(fx + 10), F(fx) + 0.002, 'y', (0, 0), 16)); smooth(br); Kx.adopt(br, 'barrel', 'blued')
    o = Kx.obj(lathe([(F(fx + 26), 7.2 * mm), (F(fx + 8), 7.2 * mm)], 20), 'barrel', 'park'); smooth(o)
    o = Kx.obj(prism(PL([(fx + 26, 239), (fx + 8, 239), (fx + 12, 208), (fx + 21, 208)]), 'x', -1.5 * mm, 1.5 * mm), 'barrel', 'park'); bevel(o, 0.3 * mm, 1); smooth(o)
    return F(fx)

# ---- SIGHTS (optic): the notched blade on the receiver (the front blade is on the suppressor) ----
rs = K.tmp(prism(PL([(650, 226), (675, 226), (672, 207), (655, 207)]), 'x', -4 * mm, 4 * mm))
cut(rs, box(-1.8 * mm, 1.8 * mm, F(690), F(640), U(211), U(200)))      # (the notch: 3.6 mm, wide enough to see light either side of the blade)
bevel(rs, 0.3 * mm, 1); smooth(rs); K.adopt(rs, 'optic', 'park')

# ---- BOLT KNOB (part_bolt): the knurled cap (chequered), turned and pulled back to work the bolt ----
pb = K.part('bolt', (0, F(732), 0))
kn = K.tmp(lathe([(0.0, RK - 1.2 * mm), (1.2 * mm, RK), (F(722), RK), (F(719), RK - 1.5 * mm), (F(717), RR - 0.5 * mm)], 40))
smooth(kn); K.adopt(kn, 'base', 'chequer', pb)
bd = K.tmp(cyl(RB, F(717) - 0.5 * mm, CH_F, 'y', (0, 0), 28))
cut(bd, cyl(4.5 * mm, CH_F - 1 * mm, CH_F + 0.001, 'y', (0, 0), 16))                                  # the bolt face's recess (the case head's)
for a in (0.0, math.pi):   # two locking lugs at the rear, turned out of their recesses with the knob
    g = box(-2.5 * mm, 2.5 * mm, F(712), F(700), RB - 1 * mm, RB + 1.6 * mm); g.transform(Matrix.Rotation(a + math.pi / 2, 4, 'Y')); boolean(bd, g, 'UNION')
smooth(bd); K.adopt(bd, 'base', 'steel', pb)
o = K.obj(box(3.2 * mm, 4.4 * mm, CH_F - 14 * mm, CH_F + 1.2 * mm, -1.4 * mm, 1.4 * mm), 'base', 'blued', pb)     # the extractor (right)

# ---- MAGAZINE = GRIP (part_mag): the sheet-metal top up into the frame, the rubber cover (ext px longer down its slope when extended);
# the pivot at its top front (magAt) ----
MAG_TOP = (F(531), U(276))
G_SLOPE = (646 - 622) / (462 - 340)
def magazine(Kx, ext=0):
    pm = Kx.part('mag', (0, MAG_TOP[0], MAG_TOP[1])); pm['check'] = {'w': 0.018}
    zc, h = MAG_TOP[1] + 1.0 * mm, F(598)                                        # the top round: its axis' height, its case head
    o = Kx.tmp(prism(PL([(531, 276), (604, 276), (612, 342), (538, 342)]), 'x', -9 * mm, 9 * mm))
    cut(o, cyl(4.5 * mm, F(606), F(529), 'y', (0, zc), 20))                     # (the round's channel)
    bevel(o, 0.6 * mm, 1); smooth(o); Kx.adopt(o, 'mag', 'park', pm)
    for sd in (-1, 1):
        o = Kx.obj(box(min(sd * 3.1 * mm, sd * 4.6 * mm), max(sd * 3.1 * mm, sd * 4.6 * mm), h + 2 * mm, h + 18 * mm, MAG_TOP[1] - 0.5 * mm, zc + 2.6 * mm), 'mag', 'park', pm)
        bevel(o, 0.3 * mm, 1); smooth(o)                                          # the feed lips
    o = Kx.obj(cyl(4.2 * mm, h, h + 17.3 * mm, 'y', (0, zc), 16), 'mag', 'brass', pm); smooth(o); o['chk'] = {'role': 'top', 'i': 0}
    o = Kx.obj(lathe([(h + 17.3 * mm, 3.85 * mm), (h + 20.5 * mm, 3.7 * mm), (h + 24.2 * mm, 1.9 * mm), (h + 25 * mm, 0.0005)], 16, (0, 0, zc)), 'mag', 'brass', pm)
    smooth(o); o['chk'] = {'role': 'top', 'i': 1}
    dx = ext * G_SLOPE
    low = [(646 + dx, 462 + ext), (644 + dx, 482 + ext), (634 + dx, 492 + ext), (580 + dx, 494 + ext), (566 + dx, 486 + ext)]
    gr = Kx.tmp(prism(PL([(538, 340), (622, 340)] + low), 'x', -13.5 * mm, 13.5 * mm))
    bevel(gr, 4 * mm, 3, 30)
    # the witness windows (the game's magazine check): four down the grip's back (toward the shooter), none on its front, slots in the rubber with the
    # brass of the stack showing; each window its own mesh, its node turned to the face's tilt there
    wins = []
    for side, (a0, a1) in ((1, ((622, 340), (646 + dx, 462 + ext))),):   # (the grip's back edge: f = 746 - x px, so the larger x is the back)
        q0, q1 = PL([a0])[0], PL([a1])[0]
        uF, uU = q0[0] - q1[0], q0[1] - q1[1]; n_ = math.hypot(uF, uU); uF, uU = uF / n_, uU / n_      # (up the face)
        ang = math.atan2(-uF, uU); nF, nU = math.cos(ang), math.sin(ang)                             # (rotation about X standing Z up the face; the face's normal forward)
        for i in range(1, 5):
            t = i / 5 * 0.94; k = 0.1 + 0.8 * i / 5
            q = (q0[0] + (q1[0] - q0[0]) * k, q0[1] + (q1[1] - q0[1]) * k)
            x = -side * 3.0 * mm
            g = box(x - 3 * mm, x + 3 * mm, -2.2 * mm, 2.2 * mm, -3.2 * mm, 3.2 * mm)
            g.transform(Matrix.Translation((0, q[0], q[1])) @ Matrix.Rotation(ang, 4, 'X')); cut(gr, g)
            wins.append((i - 1, t, side, q, ang, nF, nU))
    smooth(gr); Kx.adopt(gr, 'mag', 'rubber', pm)
    for i, t, side, q, ang, nF, nU in wins:
        x = -side * 3.0 * mm
        o = Kx.obj(box(x - 2.8 * mm, x + 2.8 * mm, -0.3 * mm, 0.3 * mm, -3.0 * mm, 3.0 * mm), 'mag', 'brass', pm)
        d = side * 1.6 * mm         # (the slot's floor, inward from its face)
        o.matrix_world = Matrix.Translation((0, q[0] + d * nF, q[1] + d * nU)) @ Matrix.Rotation(ang, 4, 'X')
        o['chk'] = {'role': 'hole', 'i': i, 't': round(t, 4), 'side': side}
magazine(K)

# ---- the gun's info and the authored-pistol anchors (TASK 15's names) ----
SY = U(209)
info = {
    'sy': round(SY, 4), 'fSight': round(F(662), 4), 'relief': 0.36, 'pistol': True,
    'muzzles': [[round(MUZ, 4), 0, 0]],
    'grip': [round(F(592), 4), round(U(400), 4), 0], 'support': [round(F(590), 4), round(U(420), 4), -0.022],
    'anim': {'bolt': 'part_bolt', 'mag': 'part_mag'},
    'magAt': [round(MAG_TOP[0], 4), round(MAG_TOP[1], 4)],
    'port': [round((CH_F + FW) / 2, 4), 0.0, round(RR, 4)],
    'bolt': [round(F(725), 4), 0.0, 0.0],
    'chamberAt': {'side': 'port', 'f': round(CH_F, 4), 'y': 0.0045, 'x': 0.0},
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
for name, fx, note in (('barrel_optic', 35, 'the full-length suppressor tube with a pistol optic cut in a pad on its top, just ahead of the waist: takes a pistol dot'),
                       ('barrel_short_optic', 185, 'the cut-down suppressor tube (260 mm) with the pistol optic cut'),
                       ('barrel_bare', 370, 'unsuppressed: a nose cap and the bare barrel (174 mm overall), a post front sight; loud, handy'),
                       ('barrel_bare_long', 282, 'unsuppressed, a longer bare barrel (215 mm overall): a little more velocity and sight radius')):
    c_, r_, Kv = kit_variant(ID, name, 'barrel', {})
    vi = {}
    if name.startswith('barrel_bare'): m_ = bare_barrel(Kv, fx)
    else: m_, oc = suppressor(Kv, fx, True); vi['mounts'] = {'mount_optic': oc}
    r_['variant_json'] = json.dumps({'gun': ID, 'slot': 'barrel', 'of': 'factory', 'info': dict({'muzzles': [[round(m_, 4), 0, 0]]}, **vi), 'note': note})
    VARS.append((name, c_))
c_, r_, K3 = kit_variant(ID, 'mag_ext', 'mag', {'note': 'extended magazine: the grip 30 mm longer, +4 rounds (12)', 'cap': 12})
magazine(K3, 65)
VARS.append(('mag_ext', c_))

meshes = [o for o in coll.all_objects if o.type == 'MESH']
vglb = {n: (export_glb(c, os.path.join(HERE, n + '.glb')) if EXPORT else None, tris_of(c.all_objects)) for n, c in VARS}
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in b] for b in bb], 'info': info,
          'glb': save_and_export(coll, root, HERE, ID, EXPORT, also=tuple(c for _, c in VARS)), 'variants': vglb, 'short_muzzle_mm': round(MUZ2 * 1000, 1)}
