# The Mosin-Nagant: the Model 1891/30 (the rifle of the Red Army, 7.62x54R, 5 rounds in a fixed box magazine charged from a stripper clip through the open action) with
# the bent bolt handle of the scoped 91/30 sniper version, in Blender.
#   blender -b -P models/mosin/build_mosin.py     (or exec it in Blender with GUN_DIR set to models/mosin)
# Which gun: the game's "Mosin-Nagant" is a 7.62x54R with a 28.7" (729 mm) barrel, five rounds loaded one round at a time (shell, reload 0.5) and scoped: the 91/30, with the
# sniper variant's bent bolt handle (a scope on the receiver needs the handle swept down). The 28.7" barrel is the 91/30's 730 mm; the stock fore-end 0.62 m long to the nose cap.
# Reference: no photograph was traced (the browser pane was at its tab cap): the figures are the published ones. Overall 1232 mm, barrel 730 mm, 4.0 kg, receiver 138 mm long
# and 33 mm across, a bolt stroke of about 105 mm, a tangent leaf rear sight on the barrel ahead of the receiver, a hooded post front sight on its base at the muzzle, two barrel
# bands and a nose cap, a stripper-clip guide on the receiver's rear bridge, a hinged floorplate with its guard, a steel butt plate.
# Frame: Blender X = right, Y = forward, Z = up, metres; ORIGIN = the back of the receiver on the bore line.
# Parts: base = receiver (clip guide, the open top, ring), trigger group, guard, rear sight base; stock = the butt and the receiver's bed; handguard = the fore-end, the upper
# handguard, the bands and nose cap; barrel (with its front sight base and hood); muzzle = the crown cap; optic = the tangent rear sight (the model's own irons);
# mag = the hinged floorplate (the internal magazine's: the detachable box replaces it); part_bolt = the bolt and its bent handle.
import bpy, json, math, os
HERE = globals().get('GUN_DIR') or os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.dirname(HERE)
exec(open(os.path.join(MODELS, 'blender_kit.py'), encoding='utf-8').read(), globals())
exec(open(os.path.join(MODELS, 'bolt_kit.py'), encoding='utf-8').read(), globals())
KIT_COL.update({'wood': (0.30, 0.15, 0.06, 1), 'woodDark': (0.2, 0.1, 0.05, 1), 'woodRed': (0.35, 0.12, 0.06, 1)})
ID = 'mosin'
EXPORT = os.environ.get('GUN_EXPORT', '1') == '1'
mm = 0.001
coll, root = kit_collection(ID)
K = Kit(coll, root)

RB = 16.5 * mm                     # the receiver's radius
BORE = 12.0 * mm                   # the bolt way
F_REAR = 0.1380                    # the receiver tube's front; the ring runs to F_RING
F_RING = 0.176
F_MOUTH = 0.1405                   # the chamber's mouth
RND = (0.0073, 0.0516)             # the game's 7.62x54R round (case head radius: the rim, length); its case is drawn 0.72 of it
CASE = 0.72 * RND[1]
FACE = F_MOUTH - 0.7 * mm - CASE   # the bolt face closed
MUZ = 0.870                        # the barrel's end
SY = 0.0295                        # the sight line over the bore
BUTT = -0.345

# ================================================================================================ the receiver (base): tube, open top, clip guide, ring
rc = K.tmp(lathe([(0, RB * 0.985), (0.0008, RB), (F_REAR, RB), (F_REAR + 0.002, RB * 1.04), (F_RING, RB * 1.04)], 40))
cut(rc, cyl(BORE, -0.002, F_MOUTH - 2.0 * mm, 'y', (0, 0), 32))                                        # the bolt way
cut(rc, port_pocket(0.054, 0.1335, -0.0060, RB + 0.004, 0.03, 2.5 * mm, -0.0102))                      # the open top and right of the loading window
cut(rc, box(0.0075, 0.03, 0.040, 0.084, -0.0075, 0.0030))                                              # the handle's notch, on the right behind the window
wnorm(rc, 30); K.adopt(rc, 'base', 'blued')
port_inside(K, 0.054, 0.1335, -0.0060, 0.012, RB, mouth_r=7.6 * mm, ramp=24 * mm, x_in=-0.0102)
# the stripper clip guide: a raised bridge on the receiver's rear with the clip's slot in it, and the notch in the front bridge
g = K.tmp(prism([(0.012, RB - 0.003), (0.012, RB + 0.0035), (0.0255, RB + 0.0050), (0.046, RB + 0.0050), (0.050, RB + 0.0035), (0.050, RB - 0.003)], 'x', -0.0105, 0.0105))
cut(g, box(-0.0028, 0.0028, 0.008, 0.054, RB + 0.0009, RB + 0.0100)); bevel(g, 0.0007, 1, 40); wnorm(g); K.adopt(g, 'base', 'blued')
K.obj(box(-0.0024, 0.0024, 0.0145, 0.0515, RB + 0.0010, RB + 0.0014), 'base', 'black')                  # the slot's floor
put(K, box(-0.0105, 0.0105, 0.0125, 0.0165, RB + 0.0049, RB + 0.0057), 'base', 'steel')               # its rear lip
# the barrel shoulder and the rear sight's base (a block with a dovetail), the barrel's shank to the handguard
put(K, lathe([(F_RING, 0.0160), (0.2380, 0.0150)], 28), 'base', 'blued')
put(K, box(-0.0100, 0.0100, 0.1800, 0.2360, 0.0118, 0.0212), 'base', 'blued', bev=0.0008)
put(K, box(-0.0106, 0.0106, 0.1800, 0.1830, 0.0100, 0.0200), 'base', 'gunmetal', bev=0.0005)
# the trigger group, the guard bow with its trigger, the box magazine's walls
put(K, box(-0.0105, 0.0105, 0.020, 0.074, -0.0300, -0.0130), 'base', 'blued', bev=0.001)
g = K.tmp(prism([(0.026, -0.0130), (0.026, -0.0600), (0.040, -0.0665), (0.062, -0.0665), (0.078, -0.0600), (0.078, -0.0130)], 'x', -0.0042, 0.0042))
cut(g, prism([(0.0325, -0.0285), (0.0325, -0.0570), (0.0425, -0.0610), (0.0585, -0.0610), (0.0715, -0.0570), (0.0715, -0.0285)], 'x', -0.006, 0.006))
bevel(g, 0.0008, 1, 40); wnorm(g); K.adopt(g, 'base', 'blued')
put(K, prism([(0.0480, -0.0290), (0.0530, -0.0290), (0.0570, -0.0500), (0.0515, -0.0500)], 'x', -0.0030, 0.0030), 'base', 'gunmetal', bev=0.0006)   # the trigger
put(K, box(-0.0125, 0.0125, 0.0780, 0.1520, -0.0425, -0.0140), 'base', 'blued', bev=0.001)               # the box magazine under the receiver
# the safety: the cocking piece's tab turned (the Mosin has none on the receiver: its safety is the bolt's cocking piece, below). A sling-slot ring and the bolt-stop on the left rear
put(K, box(-0.0225, -0.0150, 0.0560, 0.0640, -0.0040, 0.0040), 'base', 'gunmetal', bev=0.0006)         # the bolt stop (the magazine cut-off's neighbour) on the left

# ================================================================================================ the stock (wood): butt, wrist, the receiver's bed, the lower fore-end's start
SIDE = [(BUTT + 0.006, 0.0345), (-0.250, 0.0300), (-0.150, 0.0225), (-0.090, 0.0150), (-0.055, 0.0105), (-0.030, 0.0085), (-0.010, 0.0020), (0.0, -0.0065), (F_RING, -0.0065),
        (F_RING, -0.0440), (0.150, -0.0485), (0.078, -0.0520), (0.040, -0.0620), (0.010, -0.0775), (-0.015, -0.0840), (-0.050, -0.0780), (-0.100, -0.0780), (-0.200, -0.0840),
        (-0.290, -0.0930), (BUTT + 0.006, -0.0980)]
PLAN = [(-0.35, 0.0190), (-0.25, 0.0195), (-0.12, 0.0180), (-0.05, 0.0190), (0.0, 0.0205), (F_RING + 0.01, 0.0210)]
cuts = [cyl(RB + 0.5 * mm, -0.06, F_RING + 0.02, 'y', (0, 0), 36),
        cyl(0.0125, -0.06, 0.0, 'y', (0, 0), 24),
        box(-0.0115, 0.0115, 0.026, 0.081, -0.075, -0.0130),
        box(-0.0135, 0.0135, 0.078, 0.1545, -0.075, -0.0130)]
body(K, SIDE, PLAN, 'stock', 'wood', bev=0.0035, cuts=cuts)
# the steel butt plate (a curved plate with its two screws) and the sling swivel loop
put(K, prism([(BUTT + 0.0055, 0.0350), (BUTT - 0.0045, 0.0325), (BUTT - 0.0090, -0.0990), (BUTT + 0.0055, -0.0985)], 'x', -0.0198, 0.0198), 'stock', 'steel', bev=0.0010)
for z in (0.014, -0.075):
    put(K, cyl(2.2 * mm, BUTT - 0.0072, BUTT - 0.0040, 'y', (0, z), 12), 'stock', 'gunmetal')
put(K, box(-0.0060, 0.0060, -0.2900, -0.2800, -0.1040, -0.0920), 'stock', 'steel', bev=0.0006)         # the butt's sling swivel plate
# the stock's grip lines: the thin dark seams along the wrist
for sd in (-1, 1):
    put(K, prism([(-0.140, 0.010), (-0.030, 0.0050), (-0.030, 0.0030), (-0.140, 0.0070)], 'x', sd * 0.0180, sd * 0.0186), 'stock', 'woodDark')

# ================================================================================================ the fore-end and upper handguard (handguard slot), the bands, the nose cap
HG0, HG1 = F_RING, 0.796
HSIDE = [(HG0, 0.0050), (0.60, 0.0040), (HG1, 0.0025), (HG1, -0.0300), (0.60, -0.0310), (HG0, -0.0440)]
HPLAN = [(HG0 - 0.01, 0.0210), (0.30, 0.0185), (0.60, 0.0165), (HG1, 0.0155), (HG1 + 0.01, 0.0155)]
body(K, HSIDE, HPLAN, 'handguard', 'wood', bev=0.0030, cuts=[rod((0, HG0 - 0.02, 0), (0, HG1 + 0.02, 0), 0.0152, 0.0112, 28)])
UH = K.tmp(lathe([(0.2380, 0.0208), (0.5250, 0.0205)], 28)); cut(UH, rod((0, 0.2, 0), (0, 0.55, 0), 0.0152, 0.0145, 28))
cut(UH, box(-0.03, 0.03, 0.2, 0.55, -0.05, -0.0015)); bevel(UH, 0.0012, 1, 40); wnorm(UH); K.adopt(UH, 'handguard', 'wood')   # the upper handguard: a wood hood over the barrel
for fb, w in ((0.5160, 0.013), (0.7000, 0.012)):                                                          # the two barrel bands
    if True:
        o = K.tmp(prism(rounded(0, -0.0100 if fb > 0.6 else -0.0075, 0.0184 if fb > 0.6 else 0.0214, 0.0270 if fb > 0.6 else 0.0300, 0.006, 4), 'y', fb, fb + w))
        cut(o, prism(rounded(0, -0.0100 if fb > 0.6 else -0.0075, 0.0164 if fb > 0.6 else 0.0194, 0.0250 if fb > 0.6 else 0.0280, 0.005, 4), 'y', fb - 0.001, fb + w + 0.001))
        bevel(o, 0.0006, 1, 40); wnorm(o); K.adopt(o, 'handguard', 'gunmetal')
put(K, box(-0.0035, 0.0035, 0.7040, 0.7080, -0.0390, -0.0300), 'handguard', 'steel', bev=0.0004)         # the front band's sling swivel
nc = K.tmp(prism(rounded(0, -0.0125, 0.0165, 0.0225, 0.006, 4), 'y', HG1 - 0.012, HG1 + 0.012)); cut(nc, rod((0, HG1 - 0.03, 0), (0, HG1 + 0.03, 0), 0.0108, 0.0108, 24))
bevel(nc, 0.0008, 1, 40); wnorm(nc); K.adopt(nc, 'handguard', 'steel')                                    # the nose cap

# ================================================================================================ the barrel (slot barrel): the 91/30's 730 mm, the front sight base and hood, then the crown cap (slot muzzle)
bar = K.tmp(lathe([(0.2380, 0.0150), (0.30, 0.0146), (0.60, 0.0124), (0.80, 0.0112), (0.846, 0.0108)], 32)); wnorm(bar, 30); K.adopt(bar, 'barrel', 'blued')
FB = 0.846
put(K, lathe([(FB, 0.0131), (FB + 0.001, 0.0138), (MUZ - 0.0035, 0.0138), (MUZ - 0.0025, 0.0120), (MUZ, 0.0108)], 28), 'barrel', 'blued')       # the front sight's base
put(K, box(-0.0032, 0.0032, FB + 0.006, MUZ - 0.006, 0.0105, 0.0200), 'barrel', 'blued', bev=0.0005)                                          # its block
hood = K.tmp(prism([(math.cos(a / 14 * 2 * math.pi) * 0.0098, SY + math.sin(a / 14 * 2 * math.pi) * 0.0098) for a in range(14)], 'y', FB + 0.0060, FB + 0.0210))
cut(hood, cyl(0.0082, FB, FB + 0.04, 'y', (0, SY), 24)); wnorm(hood); K.adopt(hood, 'barrel', 'blued')                                         # the hood round the post
put(K, box(-0.0030, 0.0030, FB + 0.0105, FB + 0.0150, 0.0185, SY - 0.0095), 'barrel', 'blued', bev=0.0004)                                    # the web joining the hood to the block
put(K, prism([(FB + 0.0125, 0.0200), (FB + 0.0150, 0.0200), (FB + 0.0150, SY), (FB + 0.0125, SY)], 'x', -0.0008, 0.0008), 'barrel', 'black', bev=0.0002)   # the post (a thin blade)
cap = K.tmp(lathe([(MUZ, 0.0109), (MUZ + 0.0008, 0.0112), (MUZ + 0.0098, 0.0112), (MUZ + 0.0110, 0.0098), (MUZ + 0.0110, 0.0042), (MUZ + 0.0088, 0.0042)], 28)); wnorm(cap, 30); K.adopt(cap, 'muzzle', 'black')
MUZ_TIP = MUZ + 0.0110

# ================================================================================================ the tangent rear sight, folded down: the notch block at its rear is the battle sight (optic: the model's own irons)
RS = 0.1815
rsb = K.tmp(prism([(0.1790, 0.0212), (0.1840, 0.0212), (0.1865, 0.0350), (0.1790, 0.0350)], 'x', -0.0085, 0.0085))
cut(rsb, prism([(-0.0062, 0.0360), (0.0062, 0.0360), (0.0, 0.0245)], 'y', 0.170, 0.195)); bevel(rsb, 0.0005, 1, 40); wnorm(rsb); K.adopt(rsb, 'optic', 'gunmetal')   # (the V notch: 5.5 mm wide at the sight line)
put(K, box(-0.0080, 0.0080, 0.1840, 0.2330, 0.0212, 0.0236), 'optic', 'steel', bev=0.0005)                      # the leaf folded forward over the base
put(K, box(-0.0082, 0.0082, 0.1990, 0.2085, 0.0236, 0.0275), 'optic', 'gunmetal', bev=0.0005)                   # the slider
for i in range(5): put(K, box(-0.0075, 0.0075, 0.2100 + i * 0.0045, 0.2108 + i * 0.0045, 0.0236, 0.0242), 'optic', 'blued')   # the range graduations

# ================================================================================================ the floorplate (slot mag): the hinged plate and its catch
put(K, box(-0.0125, 0.0125, 0.0765, 0.1530, -0.0480, -0.0425), 'mag', 'blued', bev=0.0008)
put(K, box(-0.0035, 0.0035, 0.0710, 0.0780, -0.0570, -0.0440), 'mag', 'gunmetal', bev=0.0006)

# ================================================================================================ the bolt (part_bolt): body, bolt head, sleeve, cocking piece with its tab, bent handle, round knob
PIV = 0.0820
HANDLE = [(0.0110, PIV, -0.0020, 0.0052), (0.0440, PIV - 0.0040, -0.0040, 0.0048), (0.0650, PIV - 0.0120, -0.0260, 0.0044)]
KNOB = (0.0690, PIV - 0.0130, -0.0345, 0.0102, (0.82, 0.95, 1.0))
bolt_group(K, K, PIV, rear=-0.046, face=FACE, rb=0.0098, handle=HANDLE, knob=KNOB, sleeve=(-0.020, 0.046, 0.0108), cock=(0.0062, 0.026), lug_r=0.0106,
           knob_mat='blued', handle_mat='blued')

# ================================================================================================ info and anchors
info = {
    'sy': SY, 'fSight': RS, 'relief': 0.075,
    'muzzles': [[round(MUZ_TIP, 4), 0, 0]],
    'grip': [0.012, -0.060, 0], 'support': [0.42, -0.026, 0],
    'anim': {'bolt': 'part_bolt'},
    'port': [0.094, 0.0, round(RB, 4)],
    'bolt': [round(KNOB[1], 4), round(KNOB[2], 4), round(KNOB[0], 4)],
    'boltTravel': 0.105,
    'chamberAt': {'side': 'port', 'f': round(FACE, 4), 'y': RND[0], 'x': 0.0},
}
anchors = {
    'mount_optic': [0.0, round(RB + 0.005, 4), 0], 'mount_optic_end': [0.170, round(RB + 0.005, 4), 0],
    'mount_handguard': [round(HG0, 4), 0, 0], 'mount_handguard_end': [0.855, 0, 0],
    'mount_barrel': [0.856, 0, 0], 'mount_muzzle': [MUZ, 0, 0],
    'mount_stock': [0, -0.002, 0], 'mount_grip': [0.05, -0.0165, 0],
    'mount_mag': [0.1148, -0.0480, 0],
}
root['gun'] = ID; root['info_json'] = json.dumps(info); root['anchors_json'] = json.dumps(anchors)
bad = sweep_check(coll)
meshes = [o for o in coll.all_objects if o.type == 'MESH']
bb = [[min((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)],
      [max((o.matrix_world @ v.co)[a] for o in meshes for v in o.data.vertices) for a in range(3)]]
result = {'id': ID, 'meshes': len(meshes), 'tris': tris_of(meshes), 'bounds_mm': [[round(x * 1000, 1) for x in v] for v in bb], 'bad': bad,
          'glb': save_and_export(coll, root, HERE, ID, EXPORT)}
print('RESULT', json.dumps(result))
