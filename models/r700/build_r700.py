# The R700 Bolt: a Remington 700 short action (.308 Winchester, the game's 7.62x51) in a synthetic tactical stock, in Blender.
#   blender -b -P models/r700/build_r700.py     (or exec it in Blender with GUN_DIR set to models/r700)
# Which gun: the game's "R700 Bolt" is a .308 (7.62x51, 24" barrel, 5 rounds, an internal box magazine with a hinged floorplate, scope on a base), so the Remington 700
# short action (the 700 SPS Tactical / 700P pattern: a round receiver with an integral recoil lug, a blued 24" varmint-contour barrel, a bolt with a swept stem and an oval knob,
# a tang safety, a hinged floorplate in a trigger guard bow, a black synthetic stock with a high comb and a pistol grip).
# Reference: no photograph was traced (the browser pane was at its tab cap): the figures are Remington's published ones. Receiver 34.3 mm across (1.350"), the short action
# 7.4" long, bolt 0.70" across with a 90 degree lift, 24" barrel (610 mm from the bolt face), 1120 mm overall, length of pull 13.5" to the trigger, the comb 38-40 mm over the bore.
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the back of the receiver on the bore line.
# Parts: base = receiver, recoil lug, trigger group, guard and floorplate, the bolt's raceway, the screw holes, the safety; stock; handguard = the fore-end; barrel;
# muzzle = the thread cap; optic = the rear peep sight (the model's own irons: a front post is on the barrel); part_bolt = the bolt and its handle.
import bpy, json, math, os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
exec(open(os.path.join(MODELS, 'bolt_kit.py'), encoding='utf-8').read(), globals())
ID = 'r700'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
coll, root = kit_collection(ID)
K = Kit(coll, root)

RB = 17.15 * mm                    # the receiver's radius
BORE = 12.3 * mm                   # the bolt way
F_MOUTH = 0.2085                   # the receiver's front face: the chamber's mouth
RND = (0.0059, 0.0476)             # the game's .308 round (case head radius, length); its case is drawn 0.72 of it
CASE = 0.72 * RND[1]
FACE = F_MOUTH - 0.7 * mm - CASE   # the bolt face closed (a chambered round's case head)
MUZ = 0.790                        # the factory barrel's end
SY = 0.0300                        # the sight line over the bore
LUG_TOP = RB

# ================================================================================================ the receiver (base)
rc = K.tmp(lathe([(0, RB * 0.985), (0.0008, RB), (F_MOUTH, RB)], 40))
cut(rc, cyl(BORE, -0.002, F_MOUTH - 3.0 * mm, 'y', (0, 0), 32))                                  # the bolt way, open at the back
cut(rc, port_pocket(0.108, 0.186, -0.0075, RB + 0.003, 0.03, 3.0 * mm, -2.0 * mm))               # the ejection port: the upper right quarter of the tube
cut(rc, box(0.0085, 0.03, 0.058, 0.102, -0.0075, 0.0045))                                         # the handle's notch behind it, on the right
wnorm(rc, 30); K.adopt(rc, 'base', 'blued')
# a black lining in the port (the dark inside), the chamber's mouth and the feed ramp
port_inside(K, 0.108, 0.186, -0.0075, 0.012, RB, mouth_r=6.4 * mm, ramp=24 * mm, x_in=-2.0 * mm)
# the recoil lug (a washer, tall below) and the barrel shank
put(K, lathe([(F_MOUTH, RB * 1.18), (F_MOUTH + 4.6 * mm, RB * 1.18)], 36), 'base', 'gunmetal', bev=0.0008)
put(K, box(-0.0145, 0.0145, F_MOUTH, F_MOUTH + 4.6 * mm, -0.027, -0.012), 'base', 'gunmetal', bev=0.0008)
put(K, lathe([(F_MOUTH + 4.0 * mm, 0.0150), (0.262, 0.0148)], 28), 'base', 'blued')
# the tapped holes in the top (a row on the bridge and on the ring: the scope base's screws)
for f in (0.030, 0.058, 0.196):
    K.obj(cyl(2.2 * mm, RB - 0.5 * mm, RB + 0.3 * mm, 'z', (0, f), 14), 'base', 'black')
# the trigger group, the guard bow and the floorplate (the box magazine's bottom, hinged at the back, its catch in the guard's front)
put(K, box(-0.0105, 0.0105, 0.040, 0.108, -0.0300, -0.0140), 'base', 'blued', bev=0.001)
g = K.tmp(prism([(0.052, -0.0140), (0.052, -0.0615), (0.066, -0.0675), (0.098, -0.0675), (0.112, -0.0615), (0.112, -0.0140)], 'x', -0.0045, 0.0045))
cut(g, prism([(0.0585, -0.0295), (0.0585, -0.0575), (0.0685, -0.0615), (0.0955, -0.0615), (0.1055, -0.0575), (0.1055, -0.0295)], 'x', -0.006, 0.006))
bevel(g, 0.0008, 1, 40); wnorm(g); K.adopt(g, 'base', 'blued')
put(K, box(-0.0125, 0.0125, 0.1115, 0.190, -0.0457, -0.0417), 'mag', 'blued', bev=0.0008)               # the floorplate: the internal magazine's, slot mag (the detachable box replaces it)
put(K, box(-0.0035, 0.0035, 0.1015, 0.1115, -0.0575, -0.0425), 'mag', 'gunmetal', bev=0.0006)          # its catch, in the guard
put(K, prism([(0.0775, -0.0290), (0.0830, -0.0290), (0.0875, -0.0520), (0.0815, -0.0520)], 'x', -0.0032, 0.0032), 'base', 'gunmetal', bev=0.0006)   # the trigger
put(K, box(-0.0100, 0.0100, 0.0400, 0.0460, -0.0140, -0.0095), 'base', 'gunmetal')                      # the trigger's adjusting block
# the safety: a boss and a thumb lever on the right of the tang
put(K, cyl(5.0 * mm, 0.0160, 0.0195, 'x', (0.013, 0.0), 20), 'base', 'gunmetal', bev=0.0005)
put(K, box(0.0185, 0.0225, 0.004, 0.020, 0.0005, 0.0065), 'base', 'gunmetal', bev=0.0006)
put(K, box(0.0185, 0.0235, 0.004, 0.007, 0.0005, 0.0085), 'base', 'gunmetal', bev=0.0005)

# ================================================================================================ the stock (polymer): butt, comb, wrist, pistol grip, the action bed
SIDE = [(-0.298, 0.0455), (-0.250, 0.0510), (-0.200, 0.0545), (-0.150, 0.0560), (-0.100, 0.0545), (-0.072, 0.0470), (-0.052, 0.0310), (-0.036, 0.0120), (-0.024, 0.0030),
        (-0.010, -0.0085), (0.0, -0.0085), (F_MOUTH + 0.0135, -0.0085), (F_MOUTH + 0.0135, -0.0460), (0.062, -0.0490), (0.050, -0.0570), (0.040, -0.0800), (0.026, -0.1040), (0.008, -0.1185),
        (-0.012, -0.1250), (-0.034, -0.1220), (-0.050, -0.1040), (-0.058, -0.0820), (-0.075, -0.0710), (-0.150, -0.0725), (-0.230, -0.0825), (-0.298, -0.0925)]
PLAN = [(-0.30, 0.0185), (-0.25, 0.0195), (-0.12, 0.0190), (-0.07, 0.0200), (-0.04, 0.0215), (F_MOUTH + 0.0135, 0.0215)]
cuts = [cyl(RB + 0.6 * mm, -0.06, F_MOUTH + 0.02, 'y', (0, 0), 36),                                  # the action bed: the receiver lies in it
        cyl(0.0135, -0.06, 0.0, 'y', (0, 0), 24),                                                   # the recess round the bolt's sleeve behind the tang
        box(-0.0115, 0.0115, 0.045, 0.108, -0.075, -0.0140),                                        # the trigger guard's opening
        box(-0.0135, 0.0135, 0.108, 0.1925, -0.075, -0.0140)]                                       # the floorplate's
body(K, SIDE, PLAN, 'stock', 'polymer', bev=0.0045, cuts=cuts)
# the recoil pad, the pistol grip's cap, a sling stud
put(K, prism([(-0.2975, 0.0455), (-0.3255, 0.0425), (-0.3310, -0.0985), (-0.2975, -0.0925)], 'x', -0.0197, 0.0197), 'stock', 'rubber', bev=0.0012)
put(K, prism([(-0.034, -0.1225), (-0.012, -0.1252), (0.008, -0.1190), (0.006, -0.1150), (-0.012, -0.1210), (-0.033, -0.1180)], 'x', -0.0195, 0.0195), 'stock', 'rubber', bev=0.0005)
put(K, cyl(3.0 * mm, -0.0925 - 0.0055, -0.0925 + 0.0005, 'z', (0, -0.080), 12), 'stock', 'steel')
# moulded finger-grooves (the dark panels each side of the grip and forend)
for sd in (-1, 1):
    put(K, prism([(-0.040, -0.058), (0.030, -0.066), (0.036, -0.088), (-0.032, -0.090)], 'x', sd * 0.0214, sd * 0.0222), 'stock', 'rubber')

# ================================================================================================ the fore-end (handguard slot)
HG0, HG1 = F_MOUTH + 0.0135, 0.582
HSIDE = [(HG0, 0.0060), (0.55, 0.0045), (HG1 - 0.004, 0.0030), (HG1, 0.0010), (HG1, -0.0345), (0.50, -0.0375), (HG0, -0.0460)]
HPLAN = [(HG0 - 0.01, 0.0215), (0.30, 0.0225), (0.45, 0.0215), (HG1 - 0.004, 0.0190), (HG1 + 0.01, 0.0190)]
hg = body(K, HSIDE, HPLAN, 'handguard', 'polymer', bev=0.0040,
          cuts=[rod((0, HG0 - 0.02, 0), (0, HG1 + 0.02, 0), 0.0166, 0.0128, 28)])                     # the barrel's channel: the barrel floats in it
put(K, cyl(3.0 * mm, -0.0375 - 0.0055, -0.0375 + 0.0005, 'z', (0, 0.43), 12), 'handguard', 'steel')     # the forward sling stud
put(K, prism([(HG0 + 0.01, -0.0100), (HG1 - 0.012, -0.0105), (HG1 - 0.012, -0.0290), (HG0 + 0.01, -0.0295)], 'x', 0.0213, 0.0221), 'handguard', 'rubber')
put(K, prism([(HG0 + 0.01, -0.0100), (HG1 - 0.012, -0.0105), (HG1 - 0.012, -0.0290), (HG0 + 0.01, -0.0295)], 'x', -0.0221, -0.0213), 'handguard', 'rubber')

# ================================================================================================ the barrel: a 24" varmint contour, the front sight, the crown cap
bar = K.tmp(lathe([(0.262, 0.0148), (0.300, 0.0143), (0.520, 0.0127), (0.700, 0.0118), (MUZ - 0.012, 0.0114), (MUZ, 0.0112)], 32)); wnorm(bar, 30); K.adopt(bar, 'barrel', 'blued')
# the front sight: a ramp with a post, clamped on the barrel 25 mm from the muzzle (the sight line: the post's tip at SY)
FS = MUZ - 0.030
put(K, lathe([(FS - 0.008, 0.0123), (FS - 0.007, 0.0132), (FS + 0.012, 0.0132), (FS + 0.013, 0.0123)], 24), 'barrel', 'blued')
put(K, prism([(FS - 0.006, 0.0105), (FS + 0.011, 0.0105), (FS + 0.011, 0.0185), (FS + 0.006, 0.0185)], 'x', -0.0030, 0.0030), 'barrel', 'blued', bev=0.0006)
put(K, prism([(FS + 0.0035, 0.0180), (FS + 0.0058, 0.0180), (FS + 0.0058, SY), (FS + 0.0035, SY)], 'x', -0.0011, 0.0011), 'barrel', 'black', bev=0.0002)
FPOST = FS + 0.0047
# the muzzle: the thread protector's cap, the factory muzzle device
cap = K.tmp(lathe([(MUZ, 0.0113), (MUZ + 0.0008, 0.0116), (MUZ + 0.0108, 0.0116), (MUZ + 0.0120, 0.0100), (MUZ + 0.0120, 0.0045), (MUZ + 0.0096, 0.0045)], 28)); wnorm(cap, 30); K.adopt(cap, 'muzzle', 'black')
MUZ_TIP = MUZ + 0.0120

# ================================================================================================ the rear peep sight on the receiver's rear bridge (optic: the model's own irons)
RS = 0.0450
put(K, box(-0.0065, 0.0065, 0.0345, 0.0560, RB - 0.0020, RB + 0.0020), 'optic', 'black', bev=0.0006)       # its base clamped on the two screws
put(K, box(-0.0036, 0.0036, 0.0418, 0.0482, RB, SY - 0.004), 'optic', 'black', bev=0.0005)                  # the stem
ring = K.tmp(cyl(6.6 * mm, RS - 0.0033, RS + 0.0033, 'y', (0, SY), 28)); cut(ring, cyl(3.4 * mm, RS - 0.01, RS + 0.01, 'y', (0, SY), 24))
bevel(ring, 0.0005, 1, 40); wnorm(ring); K.adopt(ring, 'optic', 'black')
put(K, cyl(3.0 * mm, 0.0066, 0.0112, 'x', (RS, SY - 0.0035), 16), 'optic', 'gunmetal', bev=0.0004)           # the windage screw's knob

# ================================================================================================ the bolt (part_bolt): body, lugs, extractor, sleeve, cocking piece, swept stem and oval knob
PIV = 0.082                                                                  # the handle's root
HANDLE = [(0.0100, PIV, -0.001, 0.0045), (0.0300, PIV - 0.0070, -0.004, 0.0040), (0.0560, PIV - 0.0230, -0.010, 0.0036)]   # (right, forward, up, radius)
KNOB = (0.0705, PIV - 0.0300, -0.0125, 0.0105, (0.95, 1.18, 0.95))
bolt_group(K, K, PIV, rear=-0.028, face=FACE, rb=0.0095, handle=HANDLE, knob=KNOB, sleeve=(-0.014, 0.038, 0.0122), cock=(0.0058, 0.014), lug_r=0.0103,
           knob_mat='blued', handle_mat='blued')

# ================================================================================================ info and anchors
info = {
    'sy': SY, 'fSight': RS, 'relief': 0.075,
    'muzzles': [[round(MUZ_TIP, 4), 0, 0]],
    'grip': [0.0, -0.088, 0], 'support': [0.33, -0.030, 0],
    'anim': {'bolt': 'part_bolt'},
    'port': [0.147, 0.0, round(RB, 4)],
    'bolt': [round(KNOB[1], 4), round(KNOB[2], 4), round(KNOB[0], 4)],
    'boltTravel': 0.090,
    'chamberAt': {'side': 'port', 'f': round(FACE, 4), 'y': RND[0], 'x': 0.0},
}
anchors = {
    'mount_optic': [0.012, round(RB, 4), 0], 'mount_optic_end': [0.200, round(RB, 4), 0],
    'mount_handguard': [round(HG0, 4), 0, 0], 'mount_handguard_end': [0.760, 0, 0],
    'mount_barrel': [0.761, 0, 0], 'mount_muzzle': [MUZ, 0, 0],
    'mount_stock': [0, -0.002, 0], 'mount_grip': [0.05, -0.0172, 0],
    'mount_mag': [0.150, -0.0417, 0],
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
bad = sweep_check(coll)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb], 'bad': bad,
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
